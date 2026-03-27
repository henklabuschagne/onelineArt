-- ============================================================
-- Seed default pricing configuration and tiers
-- ============================================================

-- Pricing Config (singleton)
IF NOT EXISTS (SELECT 1 FROM [dbo].[PricingConfig])
BEGIN
    INSERT INTO [dbo].[PricingConfig] ([Id], [ImageCost], [VideoCost], [AnnualDiscountPercent])
    VALUES ('11111111-1111-1111-1111-111111111111', 1.00, 5.00, 15.00);
END
GO

-- Pricing Tiers
IF NOT EXISTS (SELECT 1 FROM [dbo].[PricingTiers] WHERE [TierId] = 'starter')
BEGIN
    INSERT INTO [dbo].[PricingTiers] ([TierId], [Name], [Description], [MonthlyPrice], [ImageCredits], [VideoCredits], [DiscountPercent], [SortOrder])
    VALUES ('starter', 'Starter', 'Perfect for trying out one-line art', 25.00, 30, 5, 0, 1);
END

IF NOT EXISTS (SELECT 1 FROM [dbo].[PricingTiers] WHERE [TierId] = 'pro')
BEGIN
    INSERT INTO [dbo].[PricingTiers] ([TierId], [Name], [Description], [MonthlyPrice], [ImageCredits], [VideoCredits], [DiscountPercent], [SortOrder])
    VALUES ('pro', 'Pro', 'For creators who need more power', 40.00, 60, 12, 20, 2);
END

IF NOT EXISTS (SELECT 1 FROM [dbo].[PricingTiers] WHERE [TierId] = 'enterprise')
BEGIN
    INSERT INTO [dbo].[PricingTiers] ([TierId], [Name], [Description], [MonthlyPrice], [ImageCredits], [VideoCredits], [DiscountPercent], [SortOrder])
    VALUES ('enterprise', 'Enterprise', 'Unlimited creativity for teams', 60.00, 120, 30, 40, 3);
END
GO
