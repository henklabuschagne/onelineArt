using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PricingController : ControllerBase
{
    private readonly IPricingService _pricing;
    private readonly ILogger<PricingController> _logger;

    public PricingController(IPricingService pricing, ILogger<PricingController> logger)
    {
        _pricing = pricing;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetPricing()
    {
        try
        {
            var result = await _pricing.GetPricingAsync();
            return Ok(new { success = true, data = result });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetPricing exception");
            return StatusCode(500, new { success = false, error = $"Pricing exception: {ex.Message}" });
        }
    }

    [Authorize(Roles = "admin")]
    [HttpPost]
    public async Task<IActionResult> UpdatePricing([FromBody] PricingUpdateRequest request)
    {
        try
        {
            await _pricing.UpdatePricingAsync(request);
            _logger.LogInformation("Pricing updated by admin {UserId}",
                User.FindFirstValue(ClaimTypes.NameIdentifier));
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "UpdatePricing exception");
            return StatusCode(500, new { success = false, error = $"Update pricing exception: {ex.Message}" });
        }
    }
}
