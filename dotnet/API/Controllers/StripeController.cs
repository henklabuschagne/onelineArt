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
    private readonly ILogger<StripeController> _logger;

    public StripeController(IStripeService stripe, ILogger<StripeController> logger)
    {
        _stripe = stripe;
        _logger = logger;
    }

    private Guid GetUserId() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string GetEmail() => User.FindFirstValue(ClaimTypes.Email) ?? "";

    [Authorize]
    [HttpPost("checkout")]
    public async Task<IActionResult> CreateCheckout([FromBody] CheckoutRequest request)
    {
        try
        {
            var result = await _stripe.CreateCheckoutAsync(GetUserId(), GetEmail(), request);
            if (!result.Success) return BadRequest(result);
            _logger.LogInformation("Stripe checkout created for user {UserId}, tier {TierId}", GetUserId(), request.TierId);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Stripe checkout exception");
            return StatusCode(500, new CheckoutResponse(false, Error: $"Checkout exception: {ex.Message}"));
        }
    }

    [Authorize]
    [HttpPost("verify-session")]
    public async Task<IActionResult> VerifySession([FromBody] VerifySessionRequest request)
    {
        try
        {
            var result = await _stripe.VerifySessionAsync(GetUserId(), request.SessionId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Stripe verify exception");
            return StatusCode(500, new VerifySessionResponse(false, Error: $"Verify exception: {ex.Message}"));
        }
    }

    [Authorize]
    [HttpPost("buy-credits")]
    public async Task<IActionResult> BuyCredits([FromBody] BuyCreditsRequest request)
    {
        try
        {
            var result = await _stripe.BuyCreditsAsync(GetUserId(), GetEmail(), request);
            if (!result.Success) return BadRequest(result);
            _logger.LogInformation("Buy-credits checkout for user {UserId}: {Img} img + {Vid} vid",
                GetUserId(), request.ImageCredits, request.VideoCredits);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Buy-credits exception");
            return StatusCode(500, new CheckoutResponse(false, Error: $"Buy-credits exception: {ex.Message}"));
        }
    }

    [HttpPost("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Webhook()
    {
        try
        {
            var body = await new StreamReader(Request.Body).ReadToEndAsync();
            var signature = Request.Headers["stripe-signature"].FirstOrDefault();
            await _stripe.HandleWebhookAsync(body, signature);
            return Ok(new { received = true });
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogWarning("Stripe webhook auth failure: {Message}", ex.Message);
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Stripe webhook exception");
            return StatusCode(500, new { error = $"Webhook exception: {ex.Message}" });
        }
    }
}
