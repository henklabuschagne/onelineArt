namespace OneLineArt.Core.DTOs;

// ── Requests ──

public record SignupRequest(string Email, string Password, string Name);
public record LoginRequest(string Email, string Password);
public record RefreshRequest(string RefreshToken);
public record LogoutRequest(string RefreshToken);
public record ForgotPasswordRequest(string Email, string? RedirectTo);
public record ResendVerificationRequest(string Email);
public record UpdatePasswordRequest(string NewPassword);

// ── Responses ──

public record AuthResponse(bool Success, AuthData? Data = null, string? Error = null);

public record AuthData(
    string AccessToken,
    string RefreshToken,
    ProfileDto Profile
);

public record ProfileDto(
    Guid Id,
    string Email,
    string Name,
    string Role,
    DateTime CreatedAt
);

public record CreditsDto(int ImageCredits, int VideoCredits, decimal Balance);

public record SubscriptionDto(
    string TierId,
    string TierName,
    string BillingCycle,
    decimal Price,
    string Status,
    DateTime PurchasedAt,
    DateTime? NextBilling,
    DateTime? CancelledAt
);

public record UserProfileResponse(
    bool Success,
    UserProfileData? Data = null,
    string? Error = null
);

public record UserProfileData(
    ProfileDto Profile,
    CreditsDto Credits,
    SubscriptionDto? Subscription
);
