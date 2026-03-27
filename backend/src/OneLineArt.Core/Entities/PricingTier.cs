namespace OneLineArt.Core.Entities;

public class PricingTier
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TierId { get; set; } = string.Empty;        // "starter" | "pro" | "enterprise"
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal MonthlyPrice { get; set; }
    public int ImageCredits { get; set; }
    public int VideoCredits { get; set; }
    public decimal DiscountPercent { get; set; }
    public string? StripePriceIdMonthly { get; set; }
    public string? StripePriceIdAnnual { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class PricingConfig
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public decimal ImageCost { get; set; } = 1;
    public decimal VideoCost { get; set; } = 5;
    public decimal AnnualDiscountPercent { get; set; } = 15;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
