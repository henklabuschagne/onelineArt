using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _users;
    private readonly ICreditRepository _credits;
    private readonly ISubscriptionRepository _subscriptions;
    private readonly ITransactionRepository _transactions;

    public UserService(IUserRepository users, ICreditRepository credits,
        ISubscriptionRepository subscriptions, ITransactionRepository transactions)
    {
        _users = users;
        _credits = credits;
        _subscriptions = subscriptions;
        _transactions = transactions;
    }

    public async Task<UserProfileResponse> GetProfileAsync(Guid userId)
    {
        var user = await _users.GetByIdAsync(userId);
        if (user == null)
            return new UserProfileResponse(false, Error: "User not found");

        var credits = await _credits.GetAsync(userId);
        var sub = await _subscriptions.GetActiveAsync(userId);

        return new UserProfileResponse(true, new UserProfileData(
            new ProfileDto(user.Id, user.Email, user.Name, user.Role, user.CreatedAt),
            new CreditsDto(credits?.ImageCredits ?? 0, credits?.VideoCredits ?? 0, credits?.Balance ?? 0),
            sub != null ? new SubscriptionDto(sub.TierId, sub.TierName, sub.BillingCycle, sub.Price,
                sub.Status, sub.PurchasedAt, sub.NextBilling, sub.CancelledAt) : null
        ));
    }

    public async Task<(bool success, string? error, CreditsDto? credits)> DeductCreditsAsync(Guid userId, string type)
    {
        var (success, error, result) = await _credits.DeductAsync(userId, type);
        if (!success)
            return (false, error, null);

        return (true, null, new CreditsDto(result!.ImageCredits, result.VideoCredits, result.Balance));
    }

    public async Task<List<TransactionDto>> GetHistoryAsync(Guid userId)
    {
        var txs = await _transactions.GetUserHistoryAsync(userId);
        return txs.Select(t => new TransactionDto(
            t.Type, t.TierId, t.TierName, t.BillingCycle, t.Price,
            t.ImageCredits, t.VideoCredits, t.Cost, t.DiscountPct,
            t.StripeSessionId, t.Source, t.CreatedAt
        )).ToList();
    }

    public async Task<(bool success, string? error, SubscriptionDto? subscription)> CancelSubscriptionAsync(Guid userId)
    {
        var (success, error, sub) = await _subscriptions.CancelAsync(userId);
        if (!success)
            return (false, error, null);

        return (true, null, sub != null ? new SubscriptionDto(
            sub.TierId, sub.TierName, sub.BillingCycle, sub.Price,
            sub.Status, sub.PurchasedAt, sub.NextBilling, sub.CancelledAt) : null);
    }
}
