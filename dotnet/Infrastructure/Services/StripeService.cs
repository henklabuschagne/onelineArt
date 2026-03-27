using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class StripeService : IStripeService
{
    private readonly ICreditRepository _credits;
    private readonly ISubscriptionRepository _subscriptions;
    private readonly ITransactionRepository _transactions;
    private readonly IStripeSessionRepository _stripeSessions;
    private readonly IPricingRepository _pricing;
    private readonly IConfiguration _config;
    private readonly HttpClient _http;

    public StripeService(
        ICreditRepository credits, ISubscriptionRepository subscriptions,
        ITransactionRepository transactions, IStripeSessionRepository stripeSessions,
        IPricingRepository pricing, IConfiguration config, IHttpClientFactory httpFactory)
    {
        _credits = credits;
        _subscriptions = subscriptions;
        _transactions = transactions;
        _stripeSessions = stripeSessions;
        _pricing = pricing;
        _config = config;
        _http = httpFactory.CreateClient("Stripe");
    }

    public async Task<CheckoutResponse> CreateCheckoutAsync(Guid userId, string email, CheckoutRequest request)
    {
        var stripeKey = _config["Stripe:SecretKey"];
        if (string.IsNullOrEmpty(stripeKey))
            return new CheckoutResponse(false, Error: "Stripe is not configured on the server");

        var pricingConfig = await _pricing.GetAsync();
        var tiers = JsonSerializer.Deserialize<List<PricingTierDto>>(pricingConfig.TiersJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();

        var tier = tiers.FirstOrDefault(t => t.Id == request.TierId);
        if (tier == null)
            return new CheckoutResponse(false, Error: "Invalid tier");

        var unitPrice = request.BillingCycle == "annual"
            ? (int)Math.Round(tier.MonthlyPrice * 12 * (1 - pricingConfig.AnnualDiscount / 100m) * 100)
            : (int)(tier.MonthlyPrice * 100);

        var description = $"{tier.Name} Plan ({request.BillingCycle}) — {tier.ImageCredits} image + {tier.VideoCredits} video credits";

        var formData = new Dictionary<string, string>
        {
            ["mode"] = "payment",
            ["success_url"] = $"{request.SuccessUrl}?session_id={{CHECKOUT_SESSION_ID}}",
            ["cancel_url"] = request.CancelUrl,
            ["line_items[0][price_data][currency]"] = "usd",
            ["line_items[0][price_data][product_data][name]"] = $"{tier.Name} Plan",
            ["line_items[0][price_data][product_data][description]"] = description,
            ["line_items[0][price_data][unit_amount]"] = unitPrice.ToString(),
            ["line_items[0][quantity]"] = "1",
            ["metadata[userId]"] = userId.ToString(),
            ["metadata[tierId]"] = tier.Id,
            ["metadata[billingCycle]"] = request.BillingCycle,
            ["metadata[imageCredits]"] = tier.ImageCredits.ToString(),
            ["metadata[videoCredits]"] = tier.VideoCredits.ToString(),
            ["metadata[tierName]"] = tier.Name,
            ["customer_email"] = email,
        };

        var httpReq = new HttpRequestMessage(HttpMethod.Post, "https://api.stripe.com/v1/checkout/sessions")
        {
            Content = new FormUrlEncodedContent(formData),
            Headers = { { "Authorization", $"Bearer {stripeKey}" } }
        };

        var res = await _http.SendAsync(httpReq);
        var json = await res.Content.ReadAsStringAsync();
        var session = JsonSerializer.Deserialize<JsonElement>(json);

        if (session.TryGetProperty("error", out var err))
            return new CheckoutResponse(false, Error: $"Stripe error: {err.GetProperty("message").GetString()}");

        return new CheckoutResponse(true,
            SessionId: session.GetProperty("id").GetString(),
            Url: session.GetProperty("url").GetString());
    }

    public async Task<VerifySessionResponse> VerifySessionAsync(Guid userId, string sessionId)
    {
        var stripeKey = _config["Stripe:SecretKey"];
        if (string.IsNullOrEmpty(stripeKey))
            return new VerifySessionResponse(false, Error: "Stripe not configured");

        // Idempotency check
        var existing = await _stripeSessions.GetAsync(sessionId);
        if (existing != null)
        {
            var existingCredits = await _credits.GetAsync(userId);
            return new VerifySessionResponse(true, AlreadyFulfilled: true,
                Credits: existingCredits != null ? new CreditsDto(existingCredits.ImageCredits, existingCredits.VideoCredits, existingCredits.Balance) : null);
        }

        var httpReq = new HttpRequestMessage(HttpMethod.Get,
            $"https://api.stripe.com/v1/checkout/sessions/{sessionId}")
        {
            Headers = { { "Authorization", $"Bearer {stripeKey}" } }
        };

        var res = await _http.SendAsync(httpReq);
        var json = await res.Content.ReadAsStringAsync();
        var session = JsonSerializer.Deserialize<JsonElement>(json);

        if (session.TryGetProperty("error", out _))
            return new VerifySessionResponse(false, Error: "Invalid Stripe session");

        if (session.GetProperty("payment_status").GetString() != "paid")
            return new VerifySessionResponse(false, Error: "Payment not completed");

        var meta = session.GetProperty("metadata");
        var metaUserId = meta.GetProperty("userId").GetString();
        if (metaUserId != userId.ToString())
            return new VerifySessionResponse(false, Error: "Session does not belong to this user");

        var imageCredits = int.Parse(meta.TryGetProperty("imageCredits", out var ic) ? ic.GetString()! : "0");
        var videoCredits = int.Parse(meta.TryGetProperty("videoCredits", out var vc) ? vc.GetString()! : "0");
        var purchaseType = meta.TryGetProperty("purchaseType", out var pt) ? pt.GetString() : null;
        var tierId = meta.TryGetProperty("tierId", out var ti) ? ti.GetString() : null;
        var tierName = meta.TryGetProperty("tierName", out var tn) ? tn.GetString() : null;
        var billingCycle = meta.TryGetProperty("billingCycle", out var bc) ? bc.GetString() : null;

        // Fulfill credits
        var credits = await _credits.AddCreditsAsync(userId, imageCredits, videoCredits);
        var price = session.GetProperty("amount_total").GetInt64() / 100m;

        // Create subscription only for tier purchases
        if (purchaseType != "credits" && tierId != null)
        {
            var nextBilling = billingCycle == "annual"
                ? DateTime.UtcNow.AddDays(365)
                : DateTime.UtcNow.AddDays(30);
            await _subscriptions.CreateAsync(userId, tierId, tierName ?? "", billingCycle ?? "monthly",
                price, nextBilling, sessionId);
        }

        // Record transaction
        await _transactions.RecordAsync(userId,
            purchaseType == "credits" ? "credit-purchase" : "purchase",
            tierId, tierName, billingCycle, price, imageCredits, videoCredits,
            stripeSessionId: sessionId, source: "checkout");

        // Mark fulfilled
        await _stripeSessions.MarkFulfilledAsync(sessionId, userId, imageCredits, videoCredits, "checkout");

        return new VerifySessionResponse(true,
            Credits: new CreditsDto(credits.ImageCredits, credits.VideoCredits, credits.Balance),
            Price: price);
    }

    public async Task<CheckoutResponse> BuyCreditsAsync(Guid userId, string email, BuyCreditsRequest request)
    {
        var stripeKey = _config["Stripe:SecretKey"];
        if (string.IsNullOrEmpty(stripeKey))
            return new CheckoutResponse(false, Error: "Stripe is not configured");

        if (request.ImageCredits <= 0 && request.VideoCredits <= 0)
            return new CheckoutResponse(false, Error: "Must purchase at least some credits");

        var pricingConfig = await _pricing.GetAsync();
        var subtotal = request.ImageCredits * pricingConfig.ImageCost + request.VideoCredits * pricingConfig.VideoCost;

        // Bulk discounts
        int discountPct = subtotal switch
        {
            >= 500 => 20,
            >= 200 => 15,
            >= 100 => 10,
            >= 50 => 5,
            _ => 0
        };

        var totalCents = (int)Math.Round(subtotal * (1 - discountPct / 100m) * 100);
        if (totalCents <= 0)
            return new CheckoutResponse(false, Error: "Total must be greater than zero");

        var parts = new List<string>();
        if (request.ImageCredits > 0) parts.Add($"{request.ImageCredits} image");
        if (request.VideoCredits > 0) parts.Add($"{request.VideoCredits} video");
        var description = $"One-time credit purchase: {string.Join(" + ", parts)} credits";
        if (discountPct > 0) description += $" ({discountPct}% bulk discount)";

        var formData = new Dictionary<string, string>
        {
            ["mode"] = "payment",
            ["success_url"] = $"{request.SuccessUrl}?session_id={{CHECKOUT_SESSION_ID}}",
            ["cancel_url"] = request.CancelUrl,
            ["line_items[0][price_data][currency]"] = "usd",
            ["line_items[0][price_data][product_data][name]"] = "Additional Credits",
            ["line_items[0][price_data][product_data][description]"] = description,
            ["line_items[0][price_data][unit_amount]"] = totalCents.ToString(),
            ["line_items[0][quantity]"] = "1",
            ["metadata[userId]"] = userId.ToString(),
            ["metadata[purchaseType]"] = "credits",
            ["metadata[imageCredits]"] = request.ImageCredits.ToString(),
            ["metadata[videoCredits]"] = request.VideoCredits.ToString(),
            ["metadata[discountPct]"] = discountPct.ToString(),
            ["customer_email"] = email,
        };

        var httpReq = new HttpRequestMessage(HttpMethod.Post, "https://api.stripe.com/v1/checkout/sessions")
        {
            Content = new FormUrlEncodedContent(formData),
            Headers = { { "Authorization", $"Bearer {stripeKey}" } }
        };

        var res = await _http.SendAsync(httpReq);
        var json = await res.Content.ReadAsStringAsync();
        var session = JsonSerializer.Deserialize<JsonElement>(json);

        if (session.TryGetProperty("error", out var err))
            return new CheckoutResponse(false, Error: $"Stripe error: {err.GetProperty("message").GetString()}");

        return new CheckoutResponse(true,
            SessionId: session.GetProperty("id").GetString(),
            Url: session.GetProperty("url").GetString());
    }

    public async Task HandleWebhookAsync(string body, string? signature)
    {
        var stripeKey = _config["Stripe:SecretKey"];
        var webhookSecret = _config["Stripe:WebhookSecret"];

        if (!string.IsNullOrEmpty(webhookSecret) && !string.IsNullOrEmpty(signature))
        {
            // Verify signature
            var parts = signature.Split(',').Select(p => p.Split('=')).ToDictionary(p => p[0], p => p[1]);
            var timestamp = parts.GetValueOrDefault("t", "");
            var expectedSig = parts.GetValueOrDefault("v1", "");

            if (string.IsNullOrEmpty(timestamp) || string.IsNullOrEmpty(expectedSig))
                throw new UnauthorizedAccessException("Invalid Stripe signature format");

            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (Math.Abs(now - long.Parse(timestamp)) > 300)
                throw new UnauthorizedAccessException("Webhook timestamp too old");

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(webhookSecret));
            var computed = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{timestamp}.{body}"))).ToLower();
            if (computed != expectedSig)
                throw new UnauthorizedAccessException("Invalid Stripe signature");
        }

        var evt = JsonSerializer.Deserialize<JsonElement>(body);
        var eventType = evt.GetProperty("type").GetString();

        if (eventType == "checkout.session.completed")
        {
            var session = evt.GetProperty("data").GetProperty("object");
            if (session.GetProperty("payment_status").GetString() != "paid") return;

            var sessionId = session.GetProperty("id").GetString()!;

            // Idempotency
            var existing = await _stripeSessions.GetAsync(sessionId);
            if (existing != null) return;

            var meta = session.GetProperty("metadata");
            var userIdStr = meta.TryGetProperty("userId", out var uid) ? uid.GetString() : null;
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId)) return;

            var imageCredits = int.Parse(meta.TryGetProperty("imageCredits", out var ic) ? ic.GetString()! : "0");
            var videoCredits = int.Parse(meta.TryGetProperty("videoCredits", out var vc) ? vc.GetString()! : "0");
            var purchaseType = meta.TryGetProperty("purchaseType", out var pt) ? pt.GetString() : null;
            var tierId = meta.TryGetProperty("tierId", out var ti) ? ti.GetString() : null;
            var tierName = meta.TryGetProperty("tierName", out var tn) ? tn.GetString() : null;
            var billingCycle = meta.TryGetProperty("billingCycle", out var bc) ? bc.GetString() : null;
            var discountPct = meta.TryGetProperty("discountPct", out var dp) ? int.Parse(dp.GetString()!) : (int?)null;
            var price = session.GetProperty("amount_total").GetInt64() / 100m;

            await _credits.AddCreditsAsync(userId, imageCredits, videoCredits);

            if (purchaseType != "credits" && tierId != null)
            {
                var nextBilling = billingCycle == "annual"
                    ? DateTime.UtcNow.AddDays(365) : DateTime.UtcNow.AddDays(30);
                await _subscriptions.CreateAsync(userId, tierId, tierName ?? "", billingCycle ?? "monthly",
                    price, nextBilling, sessionId);
            }

            await _transactions.RecordAsync(userId,
                purchaseType == "credits" ? "credit-purchase" : "purchase",
                tierId, tierName, billingCycle, price, imageCredits, videoCredits,
                discountPct: discountPct, stripeSessionId: sessionId, source: "webhook");

            await _stripeSessions.MarkFulfilledAsync(sessionId, userId, imageCredits, videoCredits, "webhook");
        }
    }
}
