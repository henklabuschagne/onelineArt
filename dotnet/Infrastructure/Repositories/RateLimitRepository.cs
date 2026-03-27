using System.Data;
using Dapper;
using OneLineArt.Core.Interfaces;
using OneLineArt.Infrastructure.Data;

namespace OneLineArt.Infrastructure.Repositories;

public class RateLimitRepository : IRateLimitRepository
{
    private readonly IDbConnectionFactory _db;
    public RateLimitRepository(IDbConnectionFactory db) => _db = db;

    public async Task<bool> CheckAndUpdateAsync(Guid userId, string actionType, int windowMs = 5000)
    {
        using var conn = _db.Create();
        var result = await conn.QueryFirstAsync<int>(
            "sp_CheckRateLimit",
            new { UserId = userId, ActionType = actionType, WindowMs = windowMs },
            commandType: CommandType.StoredProcedure);
        return result == 1;
    }
}
