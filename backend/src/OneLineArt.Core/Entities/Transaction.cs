namespace OneLineArt.Core.Entities;

public class Transaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Type { get; set; } = string.Empty;           // "image_gen" | "video_gen" | "purchase" | "refund" | "credit_topup"
    public decimal Amount { get; set; }                         // Dollar amount
    public int ImageCreditsChanged { get; set; }
    public int VideoCreditsChanged { get; set; }
    public string? StripePaymentIntentId { get; set; }
    public string? StripeInvoiceId { get; set; }
    public string? Description { get; set; }
    public string Status { get; set; } = "completed";          // "pending" | "completed" | "failed" | "refunded"
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
