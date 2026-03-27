using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class AdminService : IAdminService
{
    private readonly IUserRepository _users;
    private readonly IUserCreditsRepository _credits;
    private readonly ITransactionRepository _transactions;

    public AdminService(IUserRepository users, IUserCreditsRepository credits, ITransactionRepository transactions)
    {
        _users = users;
        _credits = credits;
        _transactions = transactions;
    }

    public async Task<List<UserProfileDto>> GetAllUsersAsync(int page, int pageSize)
    {
        var users = await _users.GetAllAsync(page, pageSize);
        return users.Select(u => new UserProfileDto(u.Id, u.Email, u.Name, u.Role, u.CreatedAt, u.LastLoginAt)).ToList();
    }

    public async Task<AdminAnalyticsDto> GetAnalyticsAsync()
    {
        var totalUsers = await _users.GetTotalCountAsync();
        var (totalRevenue, imageGens, videoGens, purchases) = await _transactions.GetAggregatesAsync();
        var revenueByDay = await _transactions.GetRevenueByDayAsync(30);
        var usageByDay = await _transactions.GetUsageByDayAsync(30);

        return new AdminAnalyticsDto(
            totalUsers, totalRevenue, imageGens, videoGens, purchases,
            revenueByDay,
            usageByDay.ToDictionary(k => k.Key, k => new UsageDayDto(k.Value.Images, k.Value.Videos))
        );
    }

    public async Task UpdateUserAsync(AdminUpdateUserRequest request)
    {
        var user = await _users.GetByIdAsync(request.UserId)
            ?? throw new KeyNotFoundException("User not found");

        if (request.Updates.Profile != null)
        {
            if (request.Updates.Profile.Name != null) user.Name = request.Updates.Profile.Name;
            if (request.Updates.Profile.Role != null) user.Role = request.Updates.Profile.Role;
            if (request.Updates.Profile.IsActive.HasValue) user.IsActive = request.Updates.Profile.IsActive.Value;
            await _users.UpdateAsync(user);
        }

        if (request.Updates.Credits != null)
        {
            var credits = await _credits.GetByUserIdAsync(request.UserId);
            if (credits != null)
            {
                credits.ImageCredits = request.Updates.Credits.ImageCredits;
                credits.VideoCredits = request.Updates.Credits.VideoCredits;
                credits.Balance = request.Updates.Credits.Balance;
                await _credits.UpdateAsync(credits);
            }
        }
    }

    public async Task DeleteUserAsync(Guid userId)
    {
        await _users.DeleteAsync(userId);
    }

    public async Task<ApiResponse> PromoteToAdminAsync(Guid userId)
    {
        var adminExists = await _users.AnyAdminExistsAsync();
        var user = await _users.GetByIdAsync(userId)
            ?? throw new KeyNotFoundException("User not found");

        if (user.Role == "admin")
            return new ApiResponse(true, "Already admin");

        if (adminExists)
            return new ApiResponse(false, Error: "An admin already exists. Contact them for access.");

        user.Role = "admin";
        await _users.UpdateAsync(user);
        return new ApiResponse(true, "You are now an admin!");
    }
}
