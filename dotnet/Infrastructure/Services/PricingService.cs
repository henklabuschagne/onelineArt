using System.Text.Json;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class PricingService : IPricingService
{
    private readonly IPricingRepository _pricing;
    public PricingService(IPricingRepository pricing) => _pricing = pricing;

    public async Task<PricingResponse> GetPricingAsync()
    {
        var config = await _pricing.GetAsync();
        var tiers = JsonSerializer.Deserialize<List<PricingTierDto>>(config.TiersJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();

        return new PricingResponse(config.ImageCost, config.VideoCost, config.AnnualDiscount, tiers);
    }

    public async Task UpdatePricingAsync(PricingUpdateRequest request)
    {
        var tiersJson = JsonSerializer.Serialize(request.Tiers,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        await _pricing.UpdateAsync(request.ImageCost, request.VideoCost, request.AnnualDiscount, tiersJson);
    }
}
