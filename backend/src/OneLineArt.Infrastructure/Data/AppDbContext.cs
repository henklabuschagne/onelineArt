using Microsoft.EntityFrameworkCore;
using OneLineArt.Core.Entities;

namespace OneLineArt.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<UserCredits> UserCredits => Set<UserCredits>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<PricingTier> PricingTiers => Set<PricingTier>();
    public DbSet<PricingConfig> PricingConfigs => Set<PricingConfig>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        // ── User ──
        mb.Entity<User>(e =>
        {
            e.ToTable("Users");
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).HasMaxLength(256).IsRequired();
            e.Property(u => u.Name).HasMaxLength(256).IsRequired();
            e.Property(u => u.PasswordHash).HasMaxLength(512).IsRequired();
            e.Property(u => u.Role).HasMaxLength(20).HasDefaultValue("user");
        });

        // ── UserCredits ──
        mb.Entity<UserCredits>(e =>
        {
            e.ToTable("UserCredits");
            e.HasKey(c => c.Id);
            e.HasIndex(c => c.UserId).IsUnique();
            e.Property(c => c.Balance).HasPrecision(18, 2);
            e.HasOne(c => c.User).WithOne(u => u.Credits)
                .HasForeignKey<UserCredits>(c => c.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── Subscription ──
        mb.Entity<Subscription>(e =>
        {
            e.ToTable("Subscriptions");
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.UserId);
            e.HasIndex(s => s.StripeSubscriptionId).IsUnique().HasFilter("[StripeSubscriptionId] IS NOT NULL");
            e.Property(s => s.Price).HasPrecision(18, 2);
            e.Property(s => s.TierId).HasMaxLength(50);
            e.Property(s => s.TierName).HasMaxLength(100);
            e.Property(s => s.Status).HasMaxLength(20);
            e.HasOne(s => s.User).WithOne(u => u.Subscription)
                .HasForeignKey<Subscription>(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── Transaction ──
        mb.Entity<Transaction>(e =>
        {
            e.ToTable("Transactions");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.UserId);
            e.HasIndex(t => t.CreatedAt);
            e.HasIndex(t => t.Type);
            e.Property(t => t.Amount).HasPrecision(18, 2);
            e.Property(t => t.Type).HasMaxLength(50);
            e.Property(t => t.Status).HasMaxLength(20);
            e.HasOne(t => t.User).WithMany(u => u.Transactions)
                .HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── PricingTier ──
        mb.Entity<PricingTier>(e =>
        {
            e.ToTable("PricingTiers");
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.TierId).IsUnique();
            e.Property(p => p.MonthlyPrice).HasPrecision(18, 2);
            e.Property(p => p.DiscountPercent).HasPrecision(5, 2);
        });

        // ── PricingConfig ──
        mb.Entity<PricingConfig>(e =>
        {
            e.ToTable("PricingConfig");
            e.HasKey(p => p.Id);
            e.Property(p => p.ImageCost).HasPrecision(18, 2);
            e.Property(p => p.VideoCost).HasPrecision(18, 2);
            e.Property(p => p.AnnualDiscountPercent).HasPrecision(5, 2);
        });

        // ── RefreshToken ──
        mb.Entity<RefreshToken>(e =>
        {
            e.ToTable("RefreshTokens");
            e.HasKey(r => r.Id);
            e.HasIndex(r => r.Token).IsUnique();
            e.HasIndex(r => r.UserId);
            e.HasOne(r => r.User).WithMany(u => u.RefreshTokens)
                .HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── Seed default pricing ──
        var configId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        mb.Entity<PricingConfig>().HasData(new PricingConfig
        {
            Id = configId, ImageCost = 1, VideoCost = 5, AnnualDiscountPercent = 15
        });

        mb.Entity<PricingTier>().HasData(
            new PricingTier { Id = Guid.Parse("22222222-0001-0001-0001-000000000001"), TierId = "starter", Name = "Starter", Description = "Perfect for trying out one-line art", MonthlyPrice = 25, ImageCredits = 30, VideoCredits = 5, DiscountPercent = 0, SortOrder = 1 },
            new PricingTier { Id = Guid.Parse("22222222-0001-0001-0001-000000000002"), TierId = "pro", Name = "Pro", Description = "For creators who need more power", MonthlyPrice = 40, ImageCredits = 60, VideoCredits = 12, DiscountPercent = 20, SortOrder = 2 },
            new PricingTier { Id = Guid.Parse("22222222-0001-0001-0001-000000000003"), TierId = "enterprise", Name = "Enterprise", Description = "Unlimited creativity for teams", MonthlyPrice = 60, ImageCredits = 120, VideoCredits = 30, DiscountPercent = 40, SortOrder = 3 }
        );
    }
}
