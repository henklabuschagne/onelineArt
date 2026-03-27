using System.Data;
using Dapper;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;
using OneLineArt.Infrastructure.Data;

namespace OneLineArt.Infrastructure.Repositories;

public class SubscriptionRepository : ISubscriptionRepository
{
    private readonly IDbConnectionFactory _db;
    public SubscriptionRepository(IDbConnectionFactory db) => _db = db;

    public async Task<Subscription?> GetActiveAsync(Guid userId)
    {
        using var conn = _db.Create();
        return await conn.QueryFirstOrDefaultAsync<Subscription>(
            @"SELECT TOP 1 Id, TierId, TierName, BillingCycle, Price, Status, PurchasedAt, NextBilling, CancelledAt
              FROM Subscriptions WHERE UserId = @UserId ORDER BY PurchasedAt DESC",
            new { UserId = userId });
    }

    public async Task CreateAsync(Guid userId, string tierId, string tierName, string billingCycle,
        decimal price, DateTime nextBilling, string? stripeSessionId = null)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_CreateSubscription",
            new { UserId = userId, TierId = tierId, TierName = tierName, BillingCycle = billingCycle,
                  Price = price, NextBilling = nextBilling, StripeSessionId = stripeSessionId },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<(bool success, string? error, Subscription? subscription)> CancelAsync(Guid userId)
    {
        using var conn = _db.Create();
        using var multi = await conn.QueryMultipleAsync("sp_CancelSubscription",
            new { UserId = userId }, commandType: CommandType.StoredProcedure);

        var status = await multi.ReadFirstAsync<dynamic>();
        if ((int)status.Success == 0)
            return (false, (string)status.Error, null);

        var sub = await multi.ReadFirstOrDefaultAsync<Subscription>();
        return (true, null, sub);
    }
}
