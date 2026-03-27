using OneLineArt.Core.DTOs;

namespace OneLineArt.Core.Interfaces;

public interface IAuthService
{
    Task<AuthResponse> SignupAsync(SignupRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<AuthResponse> RefreshAsync(string refreshToken);
    Task LogoutAsync(string refreshToken);
    Task<(bool success, string? error)> ForgotPasswordAsync(string email, string? redirectTo);
    Task<(bool success, string? error)> ResendVerificationAsync(string email);
    Task<(bool success, string? error)> UpdatePasswordAsync(Guid userId, string newPassword);
    Task<(bool success, string? error)> ConfirmEmailAsync(string token);
}

public interface IUserService
{
    Task<UserProfileResponse> GetProfileAsync(Guid userId);
    Task<(bool success, string? error, CreditsDto? credits)> DeductCreditsAsync(Guid userId, string type);
    Task<List<TransactionDto>> GetHistoryAsync(Guid userId);
    Task<(bool success, string? error, SubscriptionDto? subscription)> CancelSubscriptionAsync(Guid userId);
}

public interface IStripeService
{
    Task<CheckoutResponse> CreateCheckoutAsync(Guid userId, string email, CheckoutRequest request);
    Task<VerifySessionResponse> VerifySessionAsync(Guid userId, string sessionId);
    Task<CheckoutResponse> BuyCreditsAsync(Guid userId, string email, BuyCreditsRequest request);
    Task HandleWebhookAsync(string body, string? signature);
}

public interface IAiService
{
    Task<AiImageResponse> GenerateImageAsync(Guid userId, string prompt);
}

public interface IAdminService
{
    Task<List<AdminUserDto>> GetAllUsersAsync();
    Task<AnalyticsData> GetAnalyticsAsync();
    Task UpdateUserAsync(Guid userId, AdminUserUpdates updates);
    Task DeleteUserAsync(Guid userId);
    Task<(bool success, string message)> PromoteToAdminAsync(Guid userId);
}

public interface IPricingService
{
    Task<PricingResponse> GetPricingAsync();
    Task UpdatePricingAsync(PricingUpdateRequest request);
}
