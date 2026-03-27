using OneLineArt.Core.DTOs;

namespace OneLineArt.Core.Interfaces;

public interface IAuthService
{
    Task<AuthResponse> SignupAsync(SignupRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<AuthResponse> RefreshTokenAsync(string refreshToken);
    Task RevokeTokenAsync(string refreshToken);
}

public interface IUserService
{
    Task<UserDashboardDto> GetDashboardAsync(Guid userId);
    Task<DeductCreditsResponse> DeductCreditsAsync(Guid userId, string type);
    Task<UserCreditsDto> AddCreditsAsync(Guid userId, int imageCredits, int videoCredits);
}

public interface ISubscriptionService
{
    Task<CheckoutSessionResponse> CreateCheckoutSessionAsync(Guid userId, CheckoutSessionRequest request);
    Task<SubscriptionDto?> GetSubscriptionAsync(Guid userId);
    Task CancelSubscriptionAsync(Guid userId);
    Task HandleWebhookAsync(string json, string signature);
}

public interface IPricingService
{
    Task<PricingResponse> GetPricingAsync();
    Task UpdatePricingAsync(PricingResponse pricing);
}

public interface IAdminService
{
    Task<List<UserProfileDto>> GetAllUsersAsync(int page, int pageSize);
    Task<AdminAnalyticsDto> GetAnalyticsAsync();
    Task UpdateUserAsync(AdminUpdateUserRequest request);
    Task DeleteUserAsync(Guid userId);
    Task<ApiResponse> PromoteToAdminAsync(Guid userId);
}

public interface IStripeService
{
    Task<string> CreateCustomerAsync(string email, string name);
    Task<(string SessionId, string Url)> CreateCheckoutSessionAsync(
        string customerId, string priceId, string successUrl, string cancelUrl);
    Task<string> CreatePortalSessionAsync(string customerId, string returnUrl);
    Task HandleWebhookEventAsync(string json, string signature);
}
