using Microsoft.EntityFrameworkCore;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;
using OneLineArt.Infrastructure.Data;

namespace OneLineArt.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
    private readonly AppDbContext _db;
    public UserRepository(AppDbContext db) => _db = db;

    public async Task<User?> GetByIdAsync(Guid id) =>
        await _db.Users.Include(u => u.Credits).Include(u => u.Subscription).FirstOrDefaultAsync(u => u.Id == id);

    public async Task<User?> GetByEmailAsync(string email) =>
        await _db.Users.Include(u => u.Credits).FirstOrDefaultAsync(u => u.Email == email);

    public async Task<List<User>> GetAllAsync(int page = 1, int pageSize = 50) =>
        await _db.Users.Include(u => u.Credits).Include(u => u.Subscription)
            .OrderByDescending(u => u.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

    public async Task<int> GetTotalCountAsync() => await _db.Users.CountAsync();

    public async Task<User> CreateAsync(User user)
    {
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    public async Task UpdateAsync(User user)
    {
        _db.Users.Update(user);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteAsync(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user != null) { _db.Users.Remove(user); await _db.SaveChangesAsync(); }
    }

    public async Task<bool> AnyAdminExistsAsync() =>
        await _db.Users.AnyAsync(u => u.Role == "admin");
}

public class UserCreditsRepository : IUserCreditsRepository
{
    private readonly AppDbContext _db;
    public UserCreditsRepository(AppDbContext db) => _db = db;

    public async Task<UserCredits?> GetByUserIdAsync(Guid userId) =>
        await _db.UserCredits.FirstOrDefaultAsync(c => c.UserId == userId);

    public async Task<UserCredits> CreateAsync(UserCredits credits)
    {
        _db.UserCredits.Add(credits);
        await _db.SaveChangesAsync();
        return credits;
    }

    public async Task UpdateAsync(UserCredits credits)
    {
        credits.UpdatedAt = DateTime.UtcNow;
        _db.UserCredits.Update(credits);
        await _db.SaveChangesAsync();
    }
}

public class SubscriptionRepository : ISubscriptionRepository
{
    private readonly AppDbContext _db;
    public SubscriptionRepository(AppDbContext db) => _db = db;

    public async Task<Subscription?> GetByUserIdAsync(Guid userId) =>
        await _db.Subscriptions.FirstOrDefaultAsync(s => s.UserId == userId && s.Status == "active");

    public async Task<Subscription?> GetByStripeSubscriptionIdAsync(string stripeSubId) =>
        await _db.Subscriptions.FirstOrDefaultAsync(s => s.StripeSubscriptionId == stripeSubId);

    public async Task<List<Subscription>> GetActiveSubscriptionsAsync() =>
        await _db.Subscriptions.Where(s => s.Status == "active").ToListAsync();

    public async Task<Subscription> CreateAsync(Subscription subscription)
    {
        _db.Subscriptions.Add(subscription);
        await _db.SaveChangesAsync();
        return subscription;
    }

    public async Task UpdateAsync(Subscription subscription)
    {
        subscription.UpdatedAt = DateTime.UtcNow;
        _db.Subscriptions.Update(subscription);
        await _db.SaveChangesAsync();
    }
}

public class TransactionRepository : ITransactionRepository
{
    private readonly AppDbContext _db;
    public TransactionRepository(AppDbContext db) => _db = db;

    public async Task<List<Transaction>> GetByUserIdAsync(Guid userId, int page = 1, int pageSize = 50) =>
        await _db.Transactions.Where(t => t.UserId == userId)
            .OrderByDescending(t => t.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

    public async Task<List<Transaction>> GetAllAsync(int page = 1, int pageSize = 100) =>
        await _db.Transactions.OrderByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

    public async Task<Transaction> CreateAsync(Transaction transaction)
    {
        _db.Transactions.Add(transaction);
        await _db.SaveChangesAsync();
        return transaction;
    }

    public async Task<(decimal TotalRevenue, int ImageGens, int VideoGens, int Purchases)> GetAggregatesAsync()
    {
        var revenue = await _db.Transactions.Where(t => t.Type == "purchase" && t.Status == "completed").SumAsync(t => t.Amount);
        var images = await _db.Transactions.CountAsync(t => t.Type == "image_gen");
        var videos = await _db.Transactions.CountAsync(t => t.Type == "video_gen");
        var purchases = await _db.Transactions.CountAsync(t => t.Type == "purchase");
        return (revenue, images, videos, purchases);
    }

    public async Task<Dictionary<string, decimal>> GetRevenueByDayAsync(int days = 30)
    {
        var since = DateTime.UtcNow.AddDays(-days);
        return await _db.Transactions
            .Where(t => t.Type == "purchase" && t.Status == "completed" && t.CreatedAt >= since)
            .GroupBy(t => t.CreatedAt.Date)
            .ToDictionaryAsync(g => g.Key.ToString("yyyy-MM-dd"), g => g.Sum(t => t.Amount));
    }

    public async Task<Dictionary<string, (int Images, int Videos)>> GetUsageByDayAsync(int days = 30)
    {
        var since = DateTime.UtcNow.AddDays(-days);
        var data = await _db.Transactions
            .Where(t => (t.Type == "image_gen" || t.Type == "video_gen") && t.CreatedAt >= since)
            .GroupBy(t => t.CreatedAt.Date)
            .Select(g => new
            {
                Day = g.Key.ToString("yyyy-MM-dd"),
                Images = g.Count(t => t.Type == "image_gen"),
                Videos = g.Count(t => t.Type == "video_gen")
            }).ToListAsync();
        return data.ToDictionary(d => d.Day, d => (d.Images, d.Videos));
    }
}

public class PricingRepository : IPricingRepository
{
    private readonly AppDbContext _db;
    public PricingRepository(AppDbContext db) => _db = db;

    public async Task<PricingConfig?> GetConfigAsync() => await _db.PricingConfigs.FirstOrDefaultAsync();
    public async Task<List<PricingTier>> GetTiersAsync() => await _db.PricingTiers.Where(t => t.IsActive).OrderBy(t => t.SortOrder).ToListAsync();
    public async Task<PricingTier?> GetTierByIdAsync(string tierId) => await _db.PricingTiers.FirstOrDefaultAsync(t => t.TierId == tierId);

    public async Task UpdateConfigAsync(PricingConfig config)
    {
        config.UpdatedAt = DateTime.UtcNow;
        _db.PricingConfigs.Update(config);
        await _db.SaveChangesAsync();
    }

    public async Task UpdateTierAsync(PricingTier tier)
    {
        tier.UpdatedAt = DateTime.UtcNow;
        _db.PricingTiers.Update(tier);
        await _db.SaveChangesAsync();
    }

    public async Task SeedDefaultsAsync()
    {
        if (!await _db.PricingConfigs.AnyAsync())
        {
            _db.PricingConfigs.Add(new PricingConfig());
            await _db.SaveChangesAsync();
        }
    }
}
