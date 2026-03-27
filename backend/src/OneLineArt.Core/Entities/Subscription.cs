namespace OneLineArt.Core.Entities;

public class Subscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string TierId { get; set; } = string.Empty;       // "starter" | "pro" | "enterprise"
    public string TierName { get; set; } = string.Empty;
    public string BillingCycle { get; set; } = "monthly";     // "monthly" | "annual"
    public decimal Price { get; set; }
    public string Status { get; set; } = "active";            // "active" | "canceled" | "past_due" | "trialing"
    public string? StripeSubscriptionId { get; set; }
    public string? StripeCustomerId { get; set; }
    public string? StripePriceId { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime NextBillingAt { get; set; }
    public DateTime? CanceledAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
