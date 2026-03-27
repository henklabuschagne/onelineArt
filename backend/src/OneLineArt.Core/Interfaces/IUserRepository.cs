using OneLineArt.Core.Entities;

namespace OneLineArt.Core.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id);
    Task<User?> GetByEmailAsync(string email);
    Task<List<User>> GetAllAsync(int page = 1, int pageSize = 50);
    Task<int> GetTotalCountAsync();
    Task<User> CreateAsync(User user);
    Task UpdateAsync(User user);
    Task DeleteAsync(Guid id);
    Task<bool> AnyAdminExistsAsync();
}

public interface IUserCreditsRepository
{
    Task<UserCredits?> GetByUserIdAsync(Guid userId);
    Task<UserCredits> CreateAsync(UserCredits credits);
    Task UpdateAsync(UserCredits credits);
}

public interface ISubscriptionRepository
{
    Task<Subscription?> GetByUserIdAsync(Guid userId);
    Task<Subscription?> GetByStripeSubscriptionIdAsync(string stripeSubId);
    Task<List<Subscription>> GetActiveSubscriptionsAsync();
    Task<Subscription> CreateAsync(Subscription subscription);
    Task UpdateAsync(Subscription subscription);
}

public interface ITransactionRepository
{
    Task<List<Transaction>> GetByUserIdAsync(Guid userId, int page = 1, int pageSize = 50);
    Task<List<Transaction>> GetAllAsync(int page = 1, int pageSize = 100);
    Task<Transaction> CreateAsync(Transaction transaction);
    Task<(decimal TotalRevenue, int ImageGens, int VideoGens, int Purchases)> GetAggregatesAsync();
    Task<Dictionary<string, decimal>> GetRevenueByDayAsync(int days = 30);
    Task<Dictionary<string, (int Images, int Videos)>> GetUsageByDayAsync(int days = 30);
}

public interface IPricingRepository
{
    Task<PricingConfig?> GetConfigAsync();
    Task<List<PricingTier>> GetTiersAsync();
    Task<PricingTier?> GetTierByIdAsync(string tierId);
    Task UpdateConfigAsync(PricingConfig config);
    Task UpdateTierAsync(PricingTier tier);
    Task SeedDefaultsAsync();
}
