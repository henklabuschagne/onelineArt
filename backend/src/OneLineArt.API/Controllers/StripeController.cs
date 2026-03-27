using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class StripeController : ControllerBase
{
    private readonly IStripeService _stripe;
    private readonly ISubscriptionService _subs;
    private readonly ILogger<StripeController> _logger;

    public StripeController(IStripeService stripe, ISubscriptionService subs, ILogger<StripeController> logger)
    {
        _stripe = stripe;
        _subs = subs;
        _logger = logger;
    }

    [HttpPost("checkout")]
    [Authorize]
    public async Task<IActionResult> CreateCheckoutSession([FromBody] CheckoutSessionRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var result = await _subs.CreateCheckoutSessionAsync(userId, request);
            return Ok(new ApiResponse<CheckoutSessionResponse>(true, result));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Checkout session creation failed");
            return BadRequest(new ApiResponse(false, Error: ex.Message));
        }
    }

    [HttpPost("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Webhook()
    {
        try
        {
            var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
            var signature = Request.Headers["Stripe-Signature"].FirstOrDefault() ?? "";
            await _stripe.HandleWebhookEventAsync(json, signature);
            return Ok();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Stripe webhook error");
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("portal")]
    [Authorize]
    public async Task<IActionResult> CreatePortalSession([FromBody] PortalRequest request)
    {
        try
        {
            var url = await _stripe.CreatePortalSessionAsync(request.CustomerId, request.ReturnUrl);
            return Ok(new { url });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Portal session creation failed");
            return BadRequest(new ApiResponse(false, Error: ex.Message));
        }
    }
}

public record PortalRequest(string CustomerId, string ReturnUrl);
