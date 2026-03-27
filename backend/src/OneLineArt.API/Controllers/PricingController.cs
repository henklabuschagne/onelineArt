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

    public PricingController(IPricingService pricing) => _pricing = pricing;

    [HttpGet]
    public async Task<IActionResult> GetPricing()
    {
        var result = await _pricing.GetPricingAsync();
        return Ok(new ApiResponse<PricingResponse>(true, result));
    }

    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdatePricing([FromBody] PricingResponse pricing)
    {
        await _pricing.UpdatePricingAsync(pricing);
        return Ok(new ApiResponse(true, "Pricing updated"));
    }
}
