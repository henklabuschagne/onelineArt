-- ============================================================
-- Stored Procedures for OneLineArt
-- ============================================================

-- ── sp_DeductCredits: Atomic credit deduction with transaction logging ──
CREATE OR ALTER PROCEDURE [dbo].[sp_DeductCredits]
    @UserId        UNIQUEIDENTIFIER,
    @CreditType    NVARCHAR(20),       -- 'image' or 'video'
    @Success       BIT OUTPUT,
    @ErrorMessage  NVARCHAR(256) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Success = 0;
    SET @ErrorMessage = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ImageCredits INT, @VideoCredits INT, @Cost DECIMAL(18,2);

        SELECT @ImageCredits = [ImageCredits], @VideoCredits = [VideoCredits]
        FROM [dbo].[UserCredits] WITH (UPDLOCK, ROWLOCK)
        WHERE [UserId] = @UserId;

        IF @ImageCredits IS NULL
        BEGIN
            SET @ErrorMessage = 'User credits not found';
            ROLLBACK;
            RETURN;
        END

        IF @CreditType = 'image'
        BEGIN
            IF @ImageCredits < 1
            BEGIN
                SET @ErrorMessage = 'Insufficient image credits';
                ROLLBACK;
                RETURN;
            END
            UPDATE [dbo].[UserCredits]
            SET [ImageCredits] = [ImageCredits] - 1, [UpdatedAt] = SYSUTCDATETIME()
            WHERE [UserId] = @UserId;
            SET @Cost = 1.00;
        END
        ELSE IF @CreditType = 'video'
        BEGIN
            IF @VideoCredits < 1
            BEGIN
                SET @ErrorMessage = 'Insufficient video credits';
                ROLLBACK;
                RETURN;
            END
            UPDATE [dbo].[UserCredits]
            SET [VideoCredits] = [VideoCredits] - 1, [UpdatedAt] = SYSUTCDATETIME()
            WHERE [UserId] = @UserId;
            SET @Cost = 5.00;
        END
        ELSE
        BEGIN
            SET @ErrorMessage = 'Invalid credit type';
            ROLLBACK;
            RETURN;
        END

        -- Log transaction
        INSERT INTO [dbo].[Transactions] ([UserId], [Type], [Amount], [ImageCreditsChanged], [VideoCreditsChanged], [Description], [Status])
        VALUES (
            @UserId,
            CASE @CreditType WHEN 'image' THEN 'image_gen' ELSE 'video_gen' END,
            @Cost,
            CASE @CreditType WHEN 'image' THEN -1 ELSE 0 END,
            CASE @CreditType WHEN 'video' THEN -1 ELSE 0 END,
            @CreditType + ' generation',
            'completed'
        );

        COMMIT;
        SET @Success = 1;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SET @ErrorMessage = ERROR_MESSAGE();
    END CATCH
END
GO

-- ── sp_AddSubscriptionCredits: Add credits when subscription renews ──
CREATE OR ALTER PROCEDURE [dbo].[sp_AddSubscriptionCredits]
    @UserId       UNIQUEIDENTIFIER,
    @TierId       NVARCHAR(50),
    @Amount       DECIMAL(18,2),
    @StripeInvId  NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ImageCredits INT, @VideoCredits INT;

        SELECT @ImageCredits = [ImageCredits], @VideoCredits = [VideoCredits]
        FROM [dbo].[PricingTiers]
        WHERE [TierId] = @TierId AND [IsActive] = 1;

        IF @ImageCredits IS NULL
        BEGIN
            RAISERROR('Pricing tier not found', 16, 1);
            RETURN;
        END

        -- Add credits
        UPDATE [dbo].[UserCredits]
        SET [ImageCredits] = [ImageCredits] + @ImageCredits,
            [VideoCredits] = [VideoCredits] + @VideoCredits,
            [UpdatedAt] = SYSUTCDATETIME()
        WHERE [UserId] = @UserId;

        -- Log purchase transaction
        INSERT INTO [dbo].[Transactions] ([UserId], [Type], [Amount], [ImageCreditsChanged], [VideoCreditsChanged], [StripeInvoiceId], [Description], [Status])
        VALUES (@UserId, 'purchase', @Amount, @ImageCredits, @VideoCredits, @StripeInvId,
                'Subscription renewal: ' + @TierId, 'completed');

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO

-- ── sp_GetAdminAnalytics: Aggregated analytics for admin dashboard ──
CREATE OR ALTER PROCEDURE [dbo].[sp_GetAdminAnalytics]
    @DaysBack INT = 30
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Since DATETIME2(7) = DATEADD(DAY, -@DaysBack, SYSUTCDATETIME());

    -- Summary
    SELECT
        (SELECT COUNT(*) FROM [dbo].[Users]) AS TotalUsers,
        (SELECT ISNULL(SUM([Amount]), 0) FROM [dbo].[Transactions] WHERE [Type] = 'purchase' AND [Status] = 'completed') AS TotalRevenue,
        (SELECT COUNT(*) FROM [dbo].[Transactions] WHERE [Type] = 'image_gen') AS TotalImageGens,
        (SELECT COUNT(*) FROM [dbo].[Transactions] WHERE [Type] = 'video_gen') AS TotalVideoGens,
        (SELECT COUNT(*) FROM [dbo].[Transactions] WHERE [Type] = 'purchase') AS TotalPurchases;

    -- Revenue by day
    SELECT
        CONVERT(DATE, [CreatedAt]) AS [Day],
        SUM([Amount]) AS Revenue
    FROM [dbo].[Transactions]
    WHERE [Type] = 'purchase' AND [Status] = 'completed' AND [CreatedAt] >= @Since
    GROUP BY CONVERT(DATE, [CreatedAt])
    ORDER BY [Day];

    -- Usage by day
    SELECT
        CONVERT(DATE, [CreatedAt]) AS [Day],
        SUM(CASE WHEN [Type] = 'image_gen' THEN 1 ELSE 0 END) AS Images,
        SUM(CASE WHEN [Type] = 'video_gen' THEN 1 ELSE 0 END) AS Videos
    FROM [dbo].[Transactions]
    WHERE [Type] IN ('image_gen', 'video_gen') AND [CreatedAt] >= @Since
    GROUP BY CONVERT(DATE, [CreatedAt])
    ORDER BY [Day];
END
GO

-- ── sp_CleanupExpiredTokens: Maintenance job for refresh tokens ──
CREATE OR ALTER PROCEDURE [dbo].[sp_CleanupExpiredTokens]
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [dbo].[RefreshTokens]
    WHERE [ExpiresAt] < SYSUTCDATETIME() OR [IsRevoked] = 1;
END
GO

-- ── sp_GetUserDashboard: Single call for user profile + credits + subscription ──
CREATE OR ALTER PROCEDURE [dbo].[sp_GetUserDashboard]
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- Profile
    SELECT [Id], [Email], [Name], [Role], [IsActive], [CreatedAt], [LastLoginAt]
    FROM [dbo].[Users]
    WHERE [Id] = @UserId;

    -- Credits
    SELECT [ImageCredits], [VideoCredits], [Balance]
    FROM [dbo].[UserCredits]
    WHERE [UserId] = @UserId;

    -- Active subscription
    SELECT [TierId], [TierName], [BillingCycle], [Price], [Status], [StartedAt], [NextBillingAt], [CanceledAt]
    FROM [dbo].[Subscriptions]
    WHERE [UserId] = @UserId AND [Status] = 'active';
END
GO
