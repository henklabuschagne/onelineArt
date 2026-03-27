using System.Data;
using Dapper;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;
using OneLineArt.Infrastructure.Data;

namespace OneLineArt.Infrastructure.Repositories;

public class AdminRepository : IAdminRepository
{
    private readonly IDbConnectionFactory _db;
    public AdminRepository(IDbConnectionFactory db) => _db = db;

    public async Task<List<(User User, UserCredits? Credits)>> GetAllUsersAsync()
    {
        using var conn = _db.Create();
        var rows = await conn.QueryAsync<dynamic>("sp_GetAllUsers", commandType: CommandType.StoredProcedure);

        return rows.Select(r => (
            new User
            {
                Id = r.Id, Email = r.Email, Name = r.Name, Role = r.Role,
                EmailConfirmed = r.EmailConfirmed, CreatedAt = r.CreatedAt
            },
            (UserCredits?)new UserCredits
            {
                UserId = r.Id,
                ImageCredits = r.ImageCredits ?? 0,
                VideoCredits = r.VideoCredits ?? 0,
                Balance = r.Balance ?? 0m
            }
        )).ToList();
    }

    public async Task UpdateUserAsync(Guid userId, string? name, string? role, int? imageCredits, int? videoCredits)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_AdminUpdateUser",
            new { UserId = userId, Name = name, Role = role,
                  ImageCredits = imageCredits, VideoCredits = videoCredits },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<(int totalUsers, decimal totalRevenue, int totalImageGens, int totalVideoGens, int totalPurchases,
        Dictionary<string, decimal> revenueByDay,
        Dictionary<string, (int images, int videos)> usageByDay)> GetAnalyticsAsync()
    {
        using var conn = _db.Create();
        using var multi = await conn.QueryMultipleAsync("sp_GetAdminAnalytics", commandType: CommandType.StoredProcedure);

        var summary = await multi.ReadFirstAsync<dynamic>();
        var revDays = (await multi.ReadAsync<dynamic>()).ToDictionary(
            r => (string)r.Day, r => (decimal)r.Revenue);
        var useDays = (await multi.ReadAsync<dynamic>()).ToDictionary(
            r => (string)r.Day, r => ((int)r.Images, (int)r.Videos));

        return (
            (int)summary.TotalUsers,
            (decimal)summary.TotalRevenue,
            (int)summary.TotalImageGens,
            (int)summary.TotalVideoGens,
            (int)summary.TotalPurchases,
            revDays, useDays
        );
    }
}
