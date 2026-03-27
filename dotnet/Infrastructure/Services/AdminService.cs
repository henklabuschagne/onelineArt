using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class AdminService : IAdminService
{
    private readonly IAdminRepository _admin;
    private readonly IUserRepository _users;

    public AdminService(IAdminRepository admin, IUserRepository users)
    {
        _admin = admin;
        _users = users;
    }

    public async Task<List<AdminUserDto>> GetAllUsersAsync()
    {
        var all = await _admin.GetAllUsersAsync();
        return all.Select(r => new AdminUserDto(
            r.User.Id, r.User.Email, r.User.Name, r.User.Role,
            r.User.EmailConfirmed, r.User.CreatedAt,
            r.Credits?.ImageCredits ?? 0, r.Credits?.VideoCredits ?? 0, r.Credits?.Balance ?? 0
        )).ToList();
    }

    public async Task<AnalyticsData> GetAnalyticsAsync()
    {
        var (totalUsers, totalRevenue, totalImageGens, totalVideoGens, totalPurchases,
            revenueByDay, usageByDay) = await _admin.GetAnalyticsAsync();

        return new AnalyticsData(
            totalUsers, totalRevenue, totalImageGens, totalVideoGens, totalPurchases,
            revenueByDay,
            usageByDay.ToDictionary(kv => kv.Key, kv => new UsageDay(kv.Value.images, kv.Value.videos))
        );
    }

    public async Task UpdateUserAsync(Guid userId, AdminUserUpdates updates)
    {
        await _admin.UpdateUserAsync(userId,
            updates.Profile?.Name, updates.Profile?.Role,
            updates.Credits?.ImageCredits, updates.Credits?.VideoCredits);
    }

    public async Task DeleteUserAsync(Guid userId)
    {
        await _users.DeleteAsync(userId);
    }

    public async Task<(bool success, string message)> PromoteToAdminAsync(Guid userId)
    {
        var adminCount = await _users.CountAdminsAsync();
        if (adminCount > 0)
        {
            var user = await _users.GetByIdAsync(userId);
            if (user?.Role == "admin")
                return (true, "Already admin");
            return (false, "An admin already exists. Contact them for access.");
        }

        await _users.PromoteToAdminAsync(userId);
        return (true, "You are now an admin!");
    }
}
