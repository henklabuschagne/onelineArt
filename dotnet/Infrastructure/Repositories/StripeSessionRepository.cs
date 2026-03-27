using System.Data;
using Dapper;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;
using OneLineArt.Infrastructure.Data;

namespace OneLineArt.Infrastructure.Repositories;

public class StripeSessionRepository : IStripeSessionRepository
{
    private readonly IDbConnectionFactory _db;
    public StripeSessionRepository(IDbConnectionFactory db) => _db = db;

    public async Task<StripeSession?> GetAsync(string sessionId)
    {
        using var conn = _db.Create();
        return await conn.QueryFirstOrDefaultAsync<StripeSession>(
            "sp_CheckStripeFulfilled", new { SessionId = sessionId },
            commandType: CommandType.StoredProcedure);
    }

    public async Task MarkFulfilledAsync(string sessionId, Guid userId, int imageCredits, int videoCredits, string source)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_MarkStripeFulfilled",
            new { SessionId = sessionId, UserId = userId, ImageCredits = imageCredits,
                  VideoCredits = videoCredits, Source = source },
            commandType: CommandType.StoredProcedure);
    }
}
