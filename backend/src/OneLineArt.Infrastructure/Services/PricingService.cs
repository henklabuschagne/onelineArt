using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class PricingService : IPricingService
{
    private readonly IPricingRepository _pricing;
    public PricingService(IPricingRepository pricing) => _pricing = pricing;

    public async Task<PricingResponse> GetPricingAsync()
    {
        var config = await _pricing.GetConfigAsync();
        var tiers = await _pricing.GetTiersAsync();

        return new PricingResponse(
            config?.ImageCost ?? 1,
            config?.VideoCost ?? 5,
            config?.AnnualDiscountPercent ?? 15,
            tiers.Select(t => new PricingTierDto(
                t.TierId, t.Name, t.Description, t.MonthlyPrice,
                t.ImageCredits, t.VideoCredits, t.DiscountPercent,
                t.StripePriceIdMonthly, t.StripePriceIdAnnual
            )).ToList()
        );
    }

    public async Task UpdatePricingAsync(PricingResponse pricing)
    {
        var config = await _pricing.GetConfigAsync();
        if (config != null)
        {
            config.ImageCost = pricing.ImageCost;
            config.VideoCost = pricing.VideoCost;
            config.AnnualDiscountPercent = pricing.AnnualDiscount;
            await _pricing.UpdateConfigAsync(config);
        }

        foreach (var tierDto in pricing.Tiers)
        {
            var tier = await _pricing.GetTierByIdAsync(tierDto.Id);
            if (tier != null)
            {
                tier.Name = tierDto.Name;
                tier.Description = tierDto.Description;
                tier.MonthlyPrice = tierDto.MonthlyPrice;
                tier.ImageCredits = tierDto.ImageCredits;
                tier.VideoCredits = tierDto.VideoCredits;
                tier.DiscountPercent = tierDto.DiscountPercent;
                tier.StripePriceIdMonthly = tierDto.StripePriceIdMonthly;
                tier.StripePriceIdAnnual = tierDto.StripePriceIdAnnual;
                await _pricing.UpdateTierAsync(tier);
            }
        }
    }
}
