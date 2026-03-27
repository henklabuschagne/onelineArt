namespace OneLineArt.Core.DTOs;

// ── Auth ──
public record SignupRequest(string Email, string Password, string Name);
public record LoginRequest(string Email, string Password);
public record RefreshTokenRequest(string RefreshToken);
public record AuthResponse(string AccessToken, string RefreshToken, UserProfileDto Profile);

// ── User Profile ──
public record UserProfileDto(
    Guid Id,
    string Email,
    string Name,
    string Role,
    DateTime CreatedAt,
    DateTime? LastLoginAt
);

public record UserCreditsDto(
    int ImageCredits,
    int VideoCredits,
    decimal Balance
);

public record SubscriptionDto(
    string TierId,
    string TierName,
    string BillingCycle,
    decimal Price,
    string Status,
    DateTime StartedAt,
    DateTime NextBillingAt,
    DateTime? CanceledAt
);

public record UserDashboardDto(
    UserProfileDto Profile,
    UserCreditsDto Credits,
    SubscriptionDto? Subscription
);

// ── Credits ──
public record DeductCreditsRequest(string Type); // "image" | "video"
public record DeductCreditsResponse(bool Success, UserCreditsDto Credits);

// ── Purchase / Checkout ──
public record PurchaseRequest(string TierId, string BillingCycle);
public record CheckoutSessionRequest(string TierId, string BillingCycle, string SuccessUrl, string CancelUrl);
public record CheckoutSessionResponse(string SessionId, string Url);

// ── Pricing ──
public record PricingTierDto(
    string Id,
    string Name,
    string? Description,
    decimal MonthlyPrice,
    int ImageCredits,
    int VideoCredits,
    decimal DiscountPercent,
    string? StripePriceIdMonthly,
    string? StripePriceIdAnnual
);

public record PricingResponse(
    decimal ImageCost,
    decimal VideoCost,
    decimal AnnualDiscount,
    List<PricingTierDto> Tiers
);

// ── Admin ──
public record AdminUpdateUserRequest(Guid UserId, AdminUserUpdates Updates);
public record AdminUserUpdates(AdminProfileUpdate? Profile, UserCreditsDto? Credits);
public record AdminProfileUpdate(string? Name, string? Role, bool? IsActive);
public record AdminDeleteUserRequest(Guid UserId);

public record AdminAnalyticsDto(
    int TotalUsers,
    decimal TotalRevenue,
    int TotalImageGens,
    int TotalVideoGens,
    int TotalPurchases,
    Dictionary<string, decimal> RevenueByDay,
    Dictionary<string, UsageDayDto> UsageByDay
);

public record UsageDayDto(int Images, int Videos);

// ── Generic ──
public record ApiResponse<T>(bool Success, T? Data, string? Error = null);
public record ApiResponse(bool Success, string? Message = null, string? Error = null);
