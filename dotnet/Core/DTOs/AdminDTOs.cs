namespace OneLineArt.Core.DTOs;

public record AdminUserDto(
    Guid Id, string Email, string Name, string Role,
    bool EmailConfirmed, DateTime CreatedAt,
    int ImageCredits, int VideoCredits, decimal Balance
);

public record AdminUpdateUserRequest(Guid UserId, AdminUserUpdates Updates);
public record AdminUserUpdates(AdminProfileUpdate? Profile, AdminCreditsUpdate? Credits);
public record AdminProfileUpdate(string? Name, string? Role);
public record AdminCreditsUpdate(int? ImageCredits, int? VideoCredits);

public record AdminDeleteUserRequest(Guid UserId);

public record AnalyticsResponse(
    bool Success,
    AnalyticsData? Data = null,
    string? Error = null
);

public record AnalyticsData(
    int TotalUsers,
    decimal TotalRevenue,
    int TotalImageGens,
    int TotalVideoGens,
    int TotalPurchases,
    Dictionary<string, decimal> RevenueByDay,
    Dictionary<string, UsageDay> UsageByDay
);

public record UsageDay(int Images, int Videos);

public record PricingUpdateRequest(
    decimal ImageCost,
    decimal VideoCost,
    int AnnualDiscount,
    List<PricingTierDto> Tiers
);

public record PricingTierDto(
    string Id, string Name, decimal MonthlyPrice,
    int ImageCredits, int VideoCredits, int Discount, string Description
);

public record PricingResponse(
    decimal ImageCost,
    decimal VideoCost,
    int AnnualDiscount,
    List<PricingTierDto> Tiers
);

public record TransactionDto(
    string Type, string? TierId, string? TierName, string? BillingCycle,
    decimal? Price, int? ImageCredits, int? VideoCredits, int? Cost,
    int? DiscountPct, string? StripeSessionId, string? Source, DateTime CreatedAt
);

public record DeductRequest(string Type);

public record AiImageRequest(string Prompt);
public record AiImageResponse(bool Success, string? B64Json = null, string? Error = null);
