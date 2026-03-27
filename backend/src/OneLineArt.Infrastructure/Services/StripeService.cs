using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;
using Stripe;
using Stripe.Checkout;

namespace OneLineArt.Infrastructure.Services;

public class StripeService : IStripeService
{
    private readonly IConfiguration _config;
    private readonly ILogger<StripeService> _logger;
    private readonly ISubscriptionRepository _subs;
    private readonly IUserCreditsRepository _credits;
    private readonly ITransactionRepository _transactions;
    private readonly IPricingRepository _pricing;

    public StripeService(IConfiguration config, ILogger<StripeService> logger,
        ISubscriptionRepository subs, IUserCreditsRepository credits,
        ITransactionRepository transactions, IPricingRepository pricing)
    {
        _config = config;
        _logger = logger;
        _subs = subs;
        _credits = credits;
        _transactions = transactions;
        _pricing = pricing;

        StripeConfiguration.ApiKey = _config["Stripe:SecretKey"];
    }

    public async Task<string> CreateCustomerAsync(string email, string name)
    {
        var service = new CustomerService();
        var customer = await service.CreateAsync(new CustomerCreateOptions
        {
            Email = email,
            Name = name,
            Metadata = new Dictionary<string, string> { { "source", "onelineart" } }
        });
        return customer.Id;
    }

    public async Task<(string SessionId, string Url)> CreateCheckoutSessionAsync(
        string customerId, string priceId, string successUrl, string cancelUrl)
    {
        var service = new SessionService();
        var session = await service.CreateAsync(new SessionCreateOptions
        {
            Customer = customerId,
            PaymentMethodTypes = new List<string> { "card" },
            Mode = "subscription",
            LineItems = new List<SessionLineItemOptions>
            {
                new() { Price = priceId, Quantity = 1 }
            },
            SuccessUrl = successUrl + "?session_id={CHECKOUT_SESSION_ID}",
            CancelUrl = cancelUrl,
            Metadata = new Dictionary<string, string> { { "source", "onelineart" } }
        });
        return (session.Id, session.Url);
    }

    public async Task<string> CreatePortalSessionAsync(string customerId, string returnUrl)
    {
        var service = new Stripe.BillingPortal.SessionService();
        var session = await service.CreateAsync(new Stripe.BillingPortal.SessionCreateOptions
        {
            Customer = customerId,
            ReturnUrl = returnUrl,
        });
        return session.Url;
    }

    public async Task HandleWebhookEventAsync(string json, string signature)
    {
        var webhookSecret = _config["Stripe:WebhookSecret"]!;
        var stripeEvent = EventUtility.ConstructEvent(json, signature, webhookSecret);

        _logger.LogInformation("Stripe webhook: {Type}", stripeEvent.Type);

        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
                await HandleCheckoutCompleted(stripeEvent);
                break;

            case "invoice.paid":
                await HandleInvoicePaid(stripeEvent);
                break;

            case "customer.subscription.updated":
                await HandleSubscriptionUpdated(stripeEvent);
                break;

            case "customer.subscription.deleted":
                await HandleSubscriptionDeleted(stripeEvent);
                break;

            default:
                _logger.LogInformation("Unhandled Stripe event: {Type}", stripeEvent.Type);
                break;
        }
    }

    private async Task HandleCheckoutCompleted(Event stripeEvent)
    {
        var session = stripeEvent.Data.Object as Session;
        if (session == null) return;

        _logger.LogInformation("Checkout completed: {SessionId}, Customer: {CustomerId}",
            session.Id, session.CustomerId);

        // The subscription is created via invoice.paid, so we mainly log here
    }

    private async Task HandleInvoicePaid(Event stripeEvent)
    {
        var invoice = stripeEvent.Data.Object as Invoice;
        if (invoice?.SubscriptionId == null) return;

        var sub = await _subs.GetByStripeSubscriptionIdAsync(invoice.SubscriptionId);
        if (sub == null)
        {
            _logger.LogWarning("Subscription not found for Stripe sub: {SubId}", invoice.SubscriptionId);
            return;
        }

        // Find the tier to add credits
        var tier = await _pricing.GetTierByIdAsync(sub.TierId);
        if (tier != null)
        {
            var credits = await _credits.GetByUserIdAsync(sub.UserId);
            if (credits != null)
            {
                credits.ImageCredits += tier.ImageCredits;
                credits.VideoCredits += tier.VideoCredits;
                await _credits.UpdateAsync(credits);
            }
        }

        await _transactions.CreateAsync(new Transaction
        {
            UserId = sub.UserId,
            Type = "purchase",
            Amount = invoice.AmountPaid / 100m, // Stripe amounts are in cents
            ImageCreditsChanged = tier?.ImageCredits ?? 0,
            VideoCreditsChanged = tier?.VideoCredits ?? 0,
            StripeInvoiceId = invoice.Id,
            Description = $"Subscription renewal: {sub.TierName}",
        });

        _logger.LogInformation("Invoice paid for user {UserId}, amount: {Amount}",
            sub.UserId, invoice.AmountPaid / 100m);
    }

    private async Task HandleSubscriptionUpdated(Event stripeEvent)
    {
        var stripeSub = stripeEvent.Data.Object as Stripe.Subscription;
        if (stripeSub == null) return;

        var sub = await _subs.GetByStripeSubscriptionIdAsync(stripeSub.Id);
        if (sub == null) return;

        sub.Status = stripeSub.Status switch
        {
            "active" => "active",
            "past_due" => "past_due",
            "canceled" => "canceled",
            "trialing" => "trialing",
            _ => stripeSub.Status
        };
        sub.NextBillingAt = stripeSub.CurrentPeriodEnd;

        await _subs.UpdateAsync(sub);
        _logger.LogInformation("Subscription updated: {SubId}, Status: {Status}", stripeSub.Id, sub.Status);
    }

    private async Task HandleSubscriptionDeleted(Event stripeEvent)
    {
        var stripeSub = stripeEvent.Data.Object as Stripe.Subscription;
        if (stripeSub == null) return;

        var sub = await _subs.GetByStripeSubscriptionIdAsync(stripeSub.Id);
        if (sub == null) return;

        sub.Status = "canceled";
        sub.CanceledAt = DateTime.UtcNow;
        await _subs.UpdateAsync(sub);

        _logger.LogInformation("Subscription canceled: {SubId}", stripeSub.Id);
    }
}
