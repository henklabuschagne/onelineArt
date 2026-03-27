using OneLineArt.Core.DTOs;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _users;
    private readonly IUserCreditsRepository _credits;
    private readonly ISubscriptionRepository _subs;
    private readonly ITransactionRepository _transactions;

    public UserService(IUserRepository users, IUserCreditsRepository credits,
        ISubscriptionRepository subs, ITransactionRepository transactions)
    {
        _users = users;
        _credits = credits;
        _subs = subs;
        _transactions = transactions;
    }

    public async Task<UserDashboardDto> GetDashboardAsync(Guid userId)
    {
        var user = await _users.GetByIdAsync(userId)
            ?? throw new KeyNotFoundException("User not found");

        var credits = await _credits.GetByUserIdAsync(userId);
        var sub = await _subs.GetByUserIdAsync(userId);

        return new UserDashboardDto(
            new UserProfileDto(user.Id, user.Email, user.Name, user.Role, user.CreatedAt, user.LastLoginAt),
            new UserCreditsDto(credits?.ImageCredits ?? 0, credits?.VideoCredits ?? 0, credits?.Balance ?? 0),
            sub == null ? null : new SubscriptionDto(sub.TierId, sub.TierName, sub.BillingCycle, sub.Price, sub.Status, sub.StartedAt, sub.NextBillingAt, sub.CanceledAt)
        );
    }

    public async Task<DeductCreditsResponse> DeductCreditsAsync(Guid userId, string type)
    {
        var credits = await _credits.GetByUserIdAsync(userId)
            ?? throw new KeyNotFoundException("No credits found");

        if (type == "image")
        {
            if (credits.ImageCredits < 1) throw new InvalidOperationException("Insufficient image credits");
            credits.ImageCredits -= 1;
        }
        else if (type == "video")
        {
            if (credits.VideoCredits < 1) throw new InvalidOperationException("Insufficient video credits");
            credits.VideoCredits -= 1;
        }
        else throw new ArgumentException("Invalid type");

        await _credits.UpdateAsync(credits);

        await _transactions.CreateAsync(new Transaction
        {
            UserId = userId,
            Type = type == "image" ? "image_gen" : "video_gen",
            Amount = type == "image" ? 1 : 5,
            ImageCreditsChanged = type == "image" ? -1 : 0,
            VideoCreditsChanged = type == "video" ? -1 : 0,
            Description = $"{type} generation",
        });

        return new DeductCreditsResponse(true, new UserCreditsDto(credits.ImageCredits, credits.VideoCredits, credits.Balance));
    }

    public async Task<UserCreditsDto> AddCreditsAsync(Guid userId, int imageCredits, int videoCredits)
    {
        var credits = await _credits.GetByUserIdAsync(userId)
            ?? throw new KeyNotFoundException("No credits found");

        credits.ImageCredits += imageCredits;
        credits.VideoCredits += videoCredits;
        await _credits.UpdateAsync(credits);

        return new UserCreditsDto(credits.ImageCredits, credits.VideoCredits, credits.Balance);
    }
}
