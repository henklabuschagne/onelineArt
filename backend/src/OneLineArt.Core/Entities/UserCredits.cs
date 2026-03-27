namespace OneLineArt.Core.Entities;

public class UserCredits
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public int ImageCredits { get; set; } = 5;
    public int VideoCredits { get; set; } = 1;
    public decimal Balance { get; set; } = 0;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
