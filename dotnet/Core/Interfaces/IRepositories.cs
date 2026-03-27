using OneLineArt.Core.Entities;

namespace OneLineArt.Core.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id);
    Task<User?> GetByEmailAsync(string email);
    Task<User?> GetByRefreshTokenAsync(string refreshToken);
    Task<Guid> CreateAsync(string email, string passwordHash, string name, string role, string emailConfirmToken);
    Task SetRefreshTokenAsync(Guid userId, string refreshToken, DateTime expiry);
    Task ClearRefreshTokenAsync(Guid userId);
    Task<bool> ConfirmEmailAsync(string token);
    Task<bool> SetPasswordResetTokenAsync(string email, string token, DateTime expiry);
    Task<bool> ResetPasswordAsync(string token, string passwordHash);
    Task UpdatePasswordAsync(Guid userId, string passwordHash);
    Task<bool> SetNewEmailConfirmTokenAsync(string email, string token);
    Task<int> CountAdminsAsync();
    Task PromoteToAdminAsync(Guid userId);
    Task DeleteAsync(Guid userId);
}

public interface ICreditRepository
{
    Task<UserCredits?> GetAsync(Guid userId);
    Task<UserCredits> AddCreditsAsync(Guid userId, int imageCredits, int videoCredits);
    Task<(bool success, string? error, UserCredits? credits)> DeductAsync(Guid userId, string type);
}

public interface ISubscriptionRepository
{
    Task<Subscription?> GetActiveAsync(Guid userId);
    Task CreateAsync(Guid userId, string tierId, string tierName, string billingCycle, decimal price, DateTime nextBilling, string? stripeSessionId = null);
    Task<(bool success, string? error, Subscription? subscription)> CancelAsync(Guid userId);
}

public interface ITransactionRepository
{
    Task RecordAsync(Guid userId, string type, string? tierId = null, string? tierName = null,
        string? billingCycle = null, decimal? price = null, int? imageCredits = null,
        int? videoCredits = null, int? cost = null, int? discountPct = null,
        string? stripeSessionId = null, string? source = null);
    Task<List<Transaction>> GetUserHistoryAsync(Guid userId, int limit = 50);
}

public interface IStripeSessionRepository
{
    Task<StripeSession?> GetAsync(string sessionId);
    Task MarkFulfilledAsync(string sessionId, Guid userId, int imageCredits, int videoCredits, string source);
}

public interface IPricingRepository
{
    Task<PricingConfig> GetAsync();
    Task UpdateAsync(decimal imageCost, decimal videoCost, int annualDiscount, string tiersJson);
}

public interface IAdminRepository
{
    Task<List<(User User, UserCredits? Credits)>> GetAllUsersAsync();
    Task UpdateUserAsync(Guid userId, string? name, string? role, int? imageCredits, int? videoCredits);
    Task<(int totalUsers, decimal totalRevenue, int totalImageGens, int totalVideoGens, int totalPurchases,
        Dictionary<string, decimal> revenueByDay,
        Dictionary<string, (int images, int videos)> usageByDay)> GetAnalyticsAsync();
}

public interface IRateLimitRepository
{
    Task<bool> CheckAndUpdateAsync(Guid userId, string actionType, int windowMs = 5000);
}
