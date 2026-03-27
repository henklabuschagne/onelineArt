using System.Data;
using Dapper;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;
using OneLineArt.Infrastructure.Data;

namespace OneLineArt.Infrastructure.Repositories;

public class TransactionRepository : ITransactionRepository
{
    private readonly IDbConnectionFactory _db;
    public TransactionRepository(IDbConnectionFactory db) => _db = db;

    public async Task RecordAsync(Guid userId, string type, string? tierId = null, string? tierName = null,
        string? billingCycle = null, decimal? price = null, int? imageCredits = null,
        int? videoCredits = null, int? cost = null, int? discountPct = null,
        string? stripeSessionId = null, string? source = null)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_RecordTransaction",
            new { UserId = userId, Type = type, TierId = tierId, TierName = tierName,
                  BillingCycle = billingCycle, Price = price, ImageCredits = imageCredits,
                  VideoCredits = videoCredits, Cost = cost, DiscountPct = discountPct,
                  StripeSessionId = stripeSessionId, Source = source },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<List<Transaction>> GetUserHistoryAsync(Guid userId, int limit = 50)
    {
        using var conn = _db.Create();
        var result = await conn.QueryAsync<Transaction>(
            "sp_GetUserHistory",
            new { UserId = userId, Limit = limit },
            commandType: CommandType.StoredProcedure);
        return result.ToList();
    }
}
