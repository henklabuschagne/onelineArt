using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly IUserRepository _users;
    private readonly IConfiguration _config;
    private readonly string[] _adminEmails;

    public AuthService(IUserRepository users, IConfiguration config)
    {
        _users = users;
        _config = config;
        _adminEmails = config.GetSection("AdminEmails").Get<string[]>() ?? Array.Empty<string>();
    }

    public async Task<AuthResponse> SignupAsync(SignupRequest request)
    {
        var existing = await _users.GetByEmailAsync(request.Email);
        if (existing != null)
            return new AuthResponse(false, Error: "Email already registered");

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        var confirmToken = GenerateToken();
        var adminCount = await _users.CountAdminsAsync();
        var role = _adminEmails.Contains(request.Email, StringComparer.OrdinalIgnoreCase) || adminCount == 0
            ? "admin" : "user";

        var userId = await _users.CreateAsync(request.Email, passwordHash, request.Name, role, confirmToken);

        // TODO: Send verification email with confirmToken link
        // For dev: auto-confirm. In production, remove this line.
        // await _users.ConfirmEmailAsync(confirmToken);

        var (accessToken, refreshToken) = await GenerateTokens(userId, request.Email, request.Name, role);

        return new AuthResponse(true, new AuthData(accessToken, refreshToken,
            new ProfileDto(userId, request.Email, request.Name, role, DateTime.UtcNow)));
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var user = await _users.GetByEmailAsync(request.Email);
        if (user == null)
            return new AuthResponse(false, Error: "Invalid email or password");

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return new AuthResponse(false, Error: "Invalid email or password");

        if (!user.EmailConfirmed)
            return new AuthResponse(false, Error: "Please verify your email before logging in");

        var (accessToken, refreshToken) = await GenerateTokens(user.Id, user.Email, user.Name, user.Role);

        return new AuthResponse(true, new AuthData(accessToken, refreshToken,
            new ProfileDto(user.Id, user.Email, user.Name, user.Role, user.CreatedAt)));
    }

    public async Task<AuthResponse> RefreshAsync(string refreshToken)
    {
        var user = await _users.GetByRefreshTokenAsync(refreshToken);
        if (user == null)
            return new AuthResponse(false, Error: "Invalid or expired refresh token");

        var (newAccessToken, newRefreshToken) = await GenerateTokens(user.Id, user.Email, user.Name, user.Role);

        return new AuthResponse(true, new AuthData(newAccessToken, newRefreshToken,
            new ProfileDto(user.Id, user.Email, user.Name, user.Role, user.CreatedAt)));
    }

    public async Task LogoutAsync(string refreshToken)
    {
        var user = await _users.GetByRefreshTokenAsync(refreshToken);
        if (user != null)
            await _users.ClearRefreshTokenAsync(user.Id);
    }

    public async Task<(bool success, string? error)> ForgotPasswordAsync(string email, string? redirectTo)
    {
        var token = GenerateToken();
        var expiry = DateTime.UtcNow.AddHours(1);
        var updated = await _users.SetPasswordResetTokenAsync(email, token, expiry);
        if (!updated)
            return (true, null); // Don't reveal if email doesn't exist

        // TODO: Send password reset email with token/redirectTo
        // For dev/testing purposes, the token is stored in DB
        return (true, null);
    }

    public async Task<(bool success, string? error)> ResendVerificationAsync(string email)
    {
        var token = GenerateToken();
        var updated = await _users.SetNewEmailConfirmTokenAsync(email, token);
        if (!updated)
            return (true, null); // Don't reveal

        // TODO: Send verification email with new token
        return (true, null);
    }

    public async Task<(bool success, string? error)> UpdatePasswordAsync(Guid userId, string newPassword)
    {
        var hash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        await _users.UpdatePasswordAsync(userId, hash);
        return (true, null);
    }

    public async Task<(bool success, string? error)> ConfirmEmailAsync(string token)
    {
        var confirmed = await _users.ConfirmEmailAsync(token);
        return confirmed ? (true, null) : (false, "Invalid or expired confirmation token");
    }

    // ── Private helpers ──

    private async Task<(string accessToken, string refreshToken)> GenerateTokens(
        Guid userId, string email, string name, string role)
    {
        var jwtKey = _config["Jwt:Key"]!;
        var jwtIssuer = _config["Jwt:Issuer"]!;
        var jwtAudience = _config["Jwt:Audience"]!;
        var expiryMinutes = int.Parse(_config["Jwt:ExpiryMinutes"] ?? "60");

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Email, email),
            new Claim(ClaimTypes.Name, name),
            new Claim(ClaimTypes.Role, role),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(jwtIssuer, jwtAudience, claims,
            expires: DateTime.UtcNow.AddMinutes(expiryMinutes), signingCredentials: creds);

        var accessToken = new JwtSecurityTokenHandler().WriteToken(token);
        var refreshToken = GenerateToken();

        await _users.SetRefreshTokenAsync(userId, refreshToken, DateTime.UtcNow.AddDays(30));

        return (accessToken, refreshToken);
    }

    private static string GenerateToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(64))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }
}
