using System.Data;
using Dapper;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;
using OneLineArt.Infrastructure.Data;

namespace OneLineArt.Infrastructure.Repositories;

public class CreditRepository : ICreditRepository
{
    private readonly IDbConnectionFactory _db;
    public CreditRepository(IDbConnectionFactory db) => _db = db;

    public async Task<UserCredits?> GetAsync(Guid userId)
    {
        using var conn = _db.Create();
        return await conn.QueryFirstOrDefaultAsync<UserCredits>(
            "SELECT ImageCredits, VideoCredits, Balance FROM Credits WHERE UserId = @UserId",
            new { UserId = userId });
    }

    public async Task<UserCredits> AddCreditsAsync(Guid userId, int imageCredits, int videoCredits)
    {
        using var conn = _db.Create();
        return await conn.QueryFirstAsync<UserCredits>(
            "sp_AddCredits",
            new { UserId = userId, ImageCredits = imageCredits, VideoCredits = videoCredits },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<(bool success, string? error, UserCredits? credits)> DeductAsync(Guid userId, string type)
    {
        using var conn = _db.Create();
        var result = await conn.QueryFirstAsync<dynamic>(
            "sp_DeductCredits",
            new { UserId = userId, Type = type },
            commandType: CommandType.StoredProcedure);

        if ((int)result.Success == 0)
        {
            return (false, (string)result.Error, null);
        }

        return (true, null, new UserCredits
        {
            UserId = userId,
            ImageCredits = (int)result.ImageCredits,
            VideoCredits = (int)result.VideoCredits,
            Balance = (decimal)result.Balance
        });
    }
}
