using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly IUserRepository _users;
    private readonly IUserCreditsRepository _credits;
    private readonly IConfiguration _config;
    private readonly IStripeService _stripe;

    public AuthService(IUserRepository users, IUserCreditsRepository credits,
        IConfiguration config, IStripeService stripe)
    {
        _users = users;
        _credits = credits;
        _config = config;
        _stripe = stripe;
    }

    public async Task<AuthResponse> SignupAsync(SignupRequest request)
    {
        var existing = await _users.GetByEmailAsync(request.Email);
        if (existing != null) throw new InvalidOperationException("Email already registered");

        var isFirstUser = !await _users.AnyAdminExistsAsync();

        var user = new User
        {
            Email = request.Email,
            Name = request.Name,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = isFirstUser ? "admin" : "user",
        };

        await _users.CreateAsync(user);
        await _credits.CreateAsync(new UserCredits { UserId = user.Id, ImageCredits = 5, VideoCredits = 1 });

        // Create Stripe customer
        try
        {
            var customerId = await _stripe.CreateCustomerAsync(user.Email, user.Name);
            // Store customerId — in production you'd save this on the user record
        }
        catch { /* Non-fatal if Stripe isn't configured */ }

        var tokens = GenerateTokens(user);
        var profile = MapProfile(user);
        return new AuthResponse(tokens.AccessToken, tokens.RefreshToken, profile);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var user = await _users.GetByEmailAsync(request.Email)
            ?? throw new UnauthorizedAccessException("Invalid credentials");

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials");

        if (!user.IsActive)
            throw new UnauthorizedAccessException("Account is deactivated");

        user.LastLoginAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);

        var tokens = GenerateTokens(user);
        var profile = MapProfile(user);
        return new AuthResponse(tokens.AccessToken, tokens.RefreshToken, profile);
    }

    public async Task<AuthResponse> RefreshTokenAsync(string refreshToken)
    {
        // In production, validate refresh token from DB
        // For now, decode and reissue
        var principal = GetPrincipalFromExpiredToken(refreshToken);
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _users.GetByIdAsync(userId)
            ?? throw new UnauthorizedAccessException("User not found");

        var tokens = GenerateTokens(user);
        return new AuthResponse(tokens.AccessToken, tokens.RefreshToken, MapProfile(user));
    }

    public Task RevokeTokenAsync(string refreshToken)
    {
        // In production: mark token as revoked in DB
        return Task.CompletedTask;
    }

    private (string AccessToken, string RefreshToken) GenerateTokens(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
            _config["Jwt:Secret"] ?? "YourSuperSecretKeyThatIsAtLeast32Characters!"));

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Role, user.Role),
        };

        var accessToken = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"] ?? "OneLineArt",
            audience: _config["Jwt:Audience"] ?? "OneLineArt",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(2),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
        ));

        var refreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));

        return (accessToken, refreshToken);
    }

    private ClaimsPrincipal GetPrincipalFromExpiredToken(string token)
    {
        var key = Encoding.UTF8.GetBytes(_config["Jwt:Secret"] ?? "YourSuperSecretKeyThatIsAtLeast32Characters!");
        var validation = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = false,
            IssuerSigningKey = new SymmetricSecurityKey(key),
        };
        return new JwtSecurityTokenHandler().ValidateToken(token, validation, out _);
    }

    private static UserProfileDto MapProfile(User u) =>
        new(u.Id, u.Email, u.Name, u.Role, u.CreatedAt, u.LastLoginAt);
}
