namespace OneLineArt.Core.DTOs;

public record CheckoutRequest(
    string TierId,
    string BillingCycle,
    string SuccessUrl,
    string CancelUrl
);

public record BuyCreditsRequest(
    int ImageCredits,
    int VideoCredits,
    string SuccessUrl,
    string CancelUrl
);

public record VerifySessionRequest(string SessionId);

public record CheckoutResponse(
    bool Success,
    string? SessionId = null,
    string? Url = null,
    string? Error = null
);

public record VerifySessionResponse(
    bool Success,
    bool AlreadyFulfilled = false,
    CreditsDto? Credits = null,
    decimal? Price = null,
    string? Error = null
);
