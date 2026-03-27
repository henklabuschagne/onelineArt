namespace OneLineArt.Core.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = "user";
    public bool EmailConfirmed { get; set; }
    public string? EmailConfirmToken { get; set; }
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetExpiry { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class UserCredits
{
    public Guid UserId { get; set; }
    public int ImageCredits { get; set; }
    public int VideoCredits { get; set; }
    public decimal Balance { get; set; }
}

public class Subscription
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string TierId { get; set; } = string.Empty;
    public string TierName { get; set; } = string.Empty;
    public string BillingCycle { get; set; } = "monthly";
    public decimal Price { get; set; }
    public string Status { get; set; } = "active";
    public DateTime PurchasedAt { get; set; }
    public DateTime? NextBilling { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? StripeSessionId { get; set; }
}

public class Transaction
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Type { get; set; } = string.Empty;       // purchase | credit-purchase | image | video
    public string? TierId { get; set; }
    public string? TierName { get; set; }
    public string? BillingCycle { get; set; }
    public decimal? Price { get; set; }
    public int? ImageCredits { get; set; }
    public int? VideoCredits { get; set; }
    public int? Cost { get; set; }
    public int? DiscountPct { get; set; }
    public string? StripeSessionId { get; set; }
    public string? Source { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class StripeSession
{
    public string SessionId { get; set; } = string.Empty;
    public bool Fulfilled { get; set; }
    public Guid UserId { get; set; }
    public int ImageCredits { get; set; }
    public int VideoCredits { get; set; }
    public string? Source { get; set; }
    public DateTime FulfilledAt { get; set; }
}

public class PricingConfig
{
    public decimal ImageCost { get; set; } = 1;
    public decimal VideoCost { get; set; } = 5;
    public int AnnualDiscount { get; set; } = 15;
    public string TiersJson { get; set; } = "[]";
}

public class PricingTier
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal MonthlyPrice { get; set; }
    public int ImageCredits { get; set; }
    public int VideoCredits { get; set; }
    public int Discount { get; set; }
    public string Description { get; set; } = string.Empty;
}
