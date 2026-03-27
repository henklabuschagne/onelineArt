using System.Data;
using Dapper;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;
using OneLineArt.Infrastructure.Data;

namespace OneLineArt.Infrastructure.Repositories;

public class PricingRepository : IPricingRepository
{
    private readonly IDbConnectionFactory _db;
    public PricingRepository(IDbConnectionFactory db) => _db = db;

    public async Task<PricingConfig> GetAsync()
    {
        using var conn = _db.Create();
        var result = await conn.QueryFirstOrDefaultAsync<PricingConfig>(
            "sp_GetPricing", commandType: CommandType.StoredProcedure);
        return result ?? new PricingConfig();
    }

    public async Task UpdateAsync(decimal imageCost, decimal videoCost, int annualDiscount, string tiersJson)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_UpdatePricing",
            new { ImageCost = imageCost, VideoCost = videoCost,
                  AnnualDiscount = annualDiscount, TiersJson = tiersJson },
            commandType: CommandType.StoredProcedure);
    }
}
