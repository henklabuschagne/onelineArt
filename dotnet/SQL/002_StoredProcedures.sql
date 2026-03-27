-- ══════════════════════════════════════════════════════════════
-- OneLineArt — Stored Procedures
-- ══════════════════════════════════════════════════════════════

-- ──────────────── AUTH ────────────────

CREATE OR ALTER PROCEDURE sp_CreateUser
    @Email          NVARCHAR(256),
    @PasswordHash   NVARCHAR(512),
    @Name           NVARCHAR(200),
    @Role           NVARCHAR(20),
    @EmailConfirmToken NVARCHAR(256),
    @UserId         UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @UserId = NEWID();

    INSERT INTO Users (Id, Email, PasswordHash, Name, Role, EmailConfirmed, EmailConfirmToken, CreatedAt)
    VALUES (@UserId, @Email, @PasswordHash, @Name, @Role, 0, @EmailConfirmToken, GETUTCDATE());

    INSERT INTO Credits (UserId, ImageCredits, VideoCredits, Balance)
    VALUES (@UserId, 5, 1, 0);
END;
GO

CREATE OR ALTER PROCEDURE sp_GetUserByEmail
    @Email NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Email, PasswordHash, Name, Role, EmailConfirmed, EmailConfirmToken,
           PasswordResetToken, PasswordResetExpiry, RefreshToken, RefreshTokenExpiry, CreatedAt
    FROM Users WHERE Email = @Email;
END;
GO

CREATE OR ALTER PROCEDURE sp_GetUserById
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Email, PasswordHash, Name, Role, EmailConfirmed, CreatedAt
    FROM Users WHERE Id = @UserId;
END;
GO

CREATE OR ALTER PROCEDURE sp_ConfirmEmail
    @Token NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET EmailConfirmed = 1, EmailConfirmToken = NULL
    WHERE EmailConfirmToken = @Token AND EmailConfirmed = 0;
    SELECT @@ROWCOUNT AS AffectedRows;
END;
GO

CREATE OR ALTER PROCEDURE sp_SetRefreshToken
    @UserId         UNIQUEIDENTIFIER,
    @RefreshToken   NVARCHAR(512),
    @Expiry         DATETIME2
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET RefreshToken = @RefreshToken, RefreshTokenExpiry = @Expiry
    WHERE Id = @UserId;
END;
GO

CREATE OR ALTER PROCEDURE sp_GetUserByRefreshToken
    @RefreshToken NVARCHAR(512)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Email, Name, Role, EmailConfirmed, RefreshToken, RefreshTokenExpiry
    FROM Users WHERE RefreshToken = @RefreshToken AND RefreshTokenExpiry > GETUTCDATE();
END;
GO

CREATE OR ALTER PROCEDURE sp_ClearRefreshToken
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET RefreshToken = NULL, RefreshTokenExpiry = NULL WHERE Id = @UserId;
END;
GO

CREATE OR ALTER PROCEDURE sp_SetPasswordResetToken
    @Email  NVARCHAR(256),
    @Token  NVARCHAR(256),
    @Expiry DATETIME2
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET PasswordResetToken = @Token, PasswordResetExpiry = @Expiry
    WHERE Email = @Email;
    SELECT @@ROWCOUNT AS AffectedRows;
END;
GO

CREATE OR ALTER PROCEDURE sp_ResetPassword
    @Token        NVARCHAR(256),
    @PasswordHash NVARCHAR(512)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET PasswordHash = @PasswordHash, PasswordResetToken = NULL, PasswordResetExpiry = NULL
    WHERE PasswordResetToken = @Token AND PasswordResetExpiry > GETUTCDATE();
    SELECT @@ROWCOUNT AS AffectedRows;
END;
GO

CREATE OR ALTER PROCEDURE sp_UpdatePassword
    @UserId       UNIQUEIDENTIFIER,
    @PasswordHash NVARCHAR(512)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET PasswordHash = @PasswordHash WHERE Id = @UserId;
END;
GO

CREATE OR ALTER PROCEDURE sp_SetNewEmailConfirmToken
    @Email NVARCHAR(256),
    @Token NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET EmailConfirmToken = @Token WHERE Email = @Email AND EmailConfirmed = 0;
    SELECT @@ROWCOUNT AS AffectedRows;
END;
GO

-- ──────────────── USER / CREDITS ────────────────

CREATE OR ALTER PROCEDURE sp_GetUserProfile
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    -- Profile
    SELECT Id, Email, Name, Role, CreatedAt FROM Users WHERE Id = @UserId;
    -- Credits
    SELECT ImageCredits, VideoCredits, Balance FROM Credits WHERE UserId = @UserId;
    -- Active subscription (most recent)
    SELECT TOP 1 Id, TierId, TierName, BillingCycle, Price, Status, PurchasedAt, NextBilling, CancelledAt
    FROM Subscriptions WHERE UserId = @UserId ORDER BY PurchasedAt DESC;
END;
GO

CREATE OR ALTER PROCEDURE sp_DeductCredits
    @UserId UNIQUEIDENTIFIER,
    @Type   NVARCHAR(10)  -- 'image' | 'video'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    DECLARE @ImageCredits INT, @VideoCredits INT;
    SELECT @ImageCredits = ImageCredits, @VideoCredits = VideoCredits
    FROM Credits WITH (UPDLOCK) WHERE UserId = @UserId;

    IF @ImageCredits IS NULL
    BEGIN
        ROLLBACK; SELECT 0 AS Success, 'No credits found' AS Error; RETURN;
    END;

    IF @Type = 'image'
    BEGIN
        IF @ImageCredits < 1
        BEGIN
            ROLLBACK; SELECT 0 AS Success, 'Insufficient image credits' AS Error, @ImageCredits AS ImageCredits, @VideoCredits AS VideoCredits; RETURN;
        END;
        UPDATE Credits SET ImageCredits = ImageCredits - 1 WHERE UserId = @UserId;
    END
    ELSE IF @Type = 'video'
    BEGIN
        IF @VideoCredits < 1
        BEGIN
            ROLLBACK; SELECT 0 AS Success, 'Insufficient video credits' AS Error, @ImageCredits AS ImageCredits, @VideoCredits AS VideoCredits; RETURN;
        END;
        UPDATE Credits SET VideoCredits = VideoCredits - 1 WHERE UserId = @UserId;
    END
    ELSE
    BEGIN
        ROLLBACK; SELECT 0 AS Success, 'Invalid type' AS Error; RETURN;
    END;

    -- Record transaction
    INSERT INTO Transactions (UserId, Type, Cost, CreatedAt)
    VALUES (@UserId, @Type, CASE WHEN @Type = 'image' THEN 1 ELSE 5 END, GETUTCDATE());

    COMMIT;

    SELECT 1 AS Success, ImageCredits, VideoCredits, Balance
    FROM Credits WHERE UserId = @UserId;
END;
GO

CREATE OR ALTER PROCEDURE sp_AddCredits
    @UserId       UNIQUEIDENTIFIER,
    @ImageCredits INT,
    @VideoCredits INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Credits
    SET ImageCredits = ImageCredits + @ImageCredits,
        VideoCredits = VideoCredits + @VideoCredits
    WHERE UserId = @UserId;

    IF @@ROWCOUNT = 0
        INSERT INTO Credits (UserId, ImageCredits, VideoCredits, Balance)
        VALUES (@UserId, @ImageCredits, @VideoCredits, 0);

    SELECT ImageCredits, VideoCredits, Balance FROM Credits WHERE UserId = @UserId;
END;
GO

-- ──────────────── SUBSCRIPTIONS ────────────────

CREATE OR ALTER PROCEDURE sp_CreateSubscription
    @UserId       UNIQUEIDENTIFIER,
    @TierId       NVARCHAR(50),
    @TierName     NVARCHAR(100),
    @BillingCycle NVARCHAR(20),
    @Price        DECIMAL(18,2),
    @NextBilling  DATETIME2,
    @StripeSessionId NVARCHAR(256) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    -- Deactivate any existing active subscription
    UPDATE Subscriptions SET Status = 'superseded', CancelledAt = GETUTCDATE()
    WHERE UserId = @UserId AND Status = 'active';

    INSERT INTO Subscriptions (UserId, TierId, TierName, BillingCycle, Price, Status, PurchasedAt, NextBilling, StripeSessionId)
    VALUES (@UserId, @TierId, @TierName, @BillingCycle, @Price, 'active', GETUTCDATE(), @NextBilling, @StripeSessionId);
END;
GO

CREATE OR ALTER PROCEDURE sp_CancelSubscription
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Subscriptions SET Status = 'cancelled', CancelledAt = GETUTCDATE()
    WHERE UserId = @UserId AND Status = 'active';

    IF @@ROWCOUNT = 0
    BEGIN
        SELECT 0 AS Success, 'No active subscription' AS Error; RETURN;
    END;

    SELECT 1 AS Success;
    SELECT TOP 1 TierId, TierName, BillingCycle, Price, Status, PurchasedAt, NextBilling, CancelledAt
    FROM Subscriptions WHERE UserId = @UserId ORDER BY PurchasedAt DESC;
END;
GO

-- ──────────────── TRANSACTIONS ────────────────

CREATE OR ALTER PROCEDURE sp_RecordTransaction
    @UserId       UNIQUEIDENTIFIER,
    @Type         NVARCHAR(30),
    @TierId       NVARCHAR(50) = NULL,
    @TierName     NVARCHAR(100) = NULL,
    @BillingCycle NVARCHAR(20) = NULL,
    @Price        DECIMAL(18,2) = NULL,
    @ImageCredits INT = NULL,
    @VideoCredits INT = NULL,
    @Cost         INT = NULL,
    @DiscountPct  INT = NULL,
    @StripeSessionId NVARCHAR(256) = NULL,
    @Source       NVARCHAR(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO Transactions (UserId, Type, TierId, TierName, BillingCycle, Price,
        ImageCredits, VideoCredits, Cost, DiscountPct, StripeSessionId, Source, CreatedAt)
    VALUES (@UserId, @Type, @TierId, @TierName, @BillingCycle, @Price,
        @ImageCredits, @VideoCredits, @Cost, @DiscountPct, @StripeSessionId, @Source, GETUTCDATE());
END;
GO

CREATE OR ALTER PROCEDURE sp_GetUserHistory
    @UserId UNIQUEIDENTIFIER,
    @Limit  INT = 50
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@Limit)
        Id, Type, TierId, TierName, BillingCycle, Price, ImageCredits, VideoCredits,
        Cost, DiscountPct, StripeSessionId, Source, CreatedAt
    FROM Transactions
    WHERE UserId = @UserId
    ORDER BY CreatedAt DESC;
END;
GO

-- ──────────────── STRIPE SESSIONS ────────────────

CREATE OR ALTER PROCEDURE sp_CheckStripeFulfilled
    @SessionId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SessionId, Fulfilled, UserId, ImageCredits, VideoCredits, Source, FulfilledAt
    FROM StripeSessions WHERE SessionId = @SessionId;
END;
GO

CREATE OR ALTER PROCEDURE sp_MarkStripeFulfilled
    @SessionId    NVARCHAR(256),
    @UserId       UNIQUEIDENTIFIER,
    @ImageCredits INT,
    @VideoCredits INT,
    @Source       NVARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM StripeSessions WHERE SessionId = @SessionId)
        INSERT INTO StripeSessions (SessionId, Fulfilled, UserId, ImageCredits, VideoCredits, Source)
        VALUES (@SessionId, 1, @UserId, @ImageCredits, @VideoCredits, @Source);
END;
GO

-- ──────────────── PRICING ────────────────

CREATE OR ALTER PROCEDURE sp_GetPricing
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ImageCost, VideoCost, AnnualDiscount, TiersJson FROM PricingConfig WHERE Id = 1;
END;
GO

CREATE OR ALTER PROCEDURE sp_UpdatePricing
    @ImageCost       DECIMAL(18,2),
    @VideoCost       DECIMAL(18,2),
    @AnnualDiscount  INT,
    @TiersJson       NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE PricingConfig
    SET ImageCost = @ImageCost, VideoCost = @VideoCost,
        AnnualDiscount = @AnnualDiscount, TiersJson = @TiersJson,
        UpdatedAt = GETUTCDATE()
    WHERE Id = 1;
END;
GO

-- ──────────────── ADMIN ────────────────

CREATE OR ALTER PROCEDURE sp_GetAllUsers
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.Id, u.Email, u.Name, u.Role, u.EmailConfirmed, u.CreatedAt,
           c.ImageCredits, c.VideoCredits, c.Balance
    FROM Users u
    LEFT JOIN Credits c ON c.UserId = u.Id
    ORDER BY u.CreatedAt DESC;
END;
GO

CREATE OR ALTER PROCEDURE sp_AdminUpdateUser
    @UserId      UNIQUEIDENTIFIER,
    @Name        NVARCHAR(200) = NULL,
    @Role        NVARCHAR(20) = NULL,
    @ImageCredits INT = NULL,
    @VideoCredits INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @Name IS NOT NULL OR @Role IS NOT NULL
        UPDATE Users
        SET Name = ISNULL(@Name, Name), Role = ISNULL(@Role, Role)
        WHERE Id = @UserId;

    IF @ImageCredits IS NOT NULL OR @VideoCredits IS NOT NULL
        UPDATE Credits
        SET ImageCredits = ISNULL(@ImageCredits, ImageCredits),
            VideoCredits = ISNULL(@VideoCredits, VideoCredits)
        WHERE UserId = @UserId;
END;
GO

CREATE OR ALTER PROCEDURE sp_AdminDeleteUser
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascading deletes handle Credits, Subscriptions, Transactions
    DELETE FROM Users WHERE Id = @UserId;
END;
GO

CREATE OR ALTER PROCEDURE sp_GetAdminAnalytics
AS
BEGIN
    SET NOCOUNT ON;
    -- Summary
    SELECT
        (SELECT COUNT(*) FROM Users) AS TotalUsers,
        (SELECT ISNULL(SUM(Price), 0) FROM Transactions WHERE Type IN ('purchase','credit-purchase')) AS TotalRevenue,
        (SELECT COUNT(*) FROM Transactions WHERE Type = 'image') AS TotalImageGens,
        (SELECT COUNT(*) FROM Transactions WHERE Type = 'video') AS TotalVideoGens,
        (SELECT COUNT(*) FROM Transactions WHERE Type IN ('purchase','credit-purchase')) AS TotalPurchases;

    -- Revenue by day
    SELECT CONVERT(VARCHAR(10), CreatedAt, 23) AS Day, SUM(Price) AS Revenue
    FROM Transactions WHERE Type IN ('purchase','credit-purchase')
    GROUP BY CONVERT(VARCHAR(10), CreatedAt, 23) ORDER BY Day;

    -- Usage by day
    SELECT CONVERT(VARCHAR(10), CreatedAt, 23) AS Day,
           SUM(CASE WHEN Type='image' THEN 1 ELSE 0 END) AS Images,
           SUM(CASE WHEN Type='video' THEN 1 ELSE 0 END) AS Videos
    FROM Transactions WHERE Type IN ('image','video')
    GROUP BY CONVERT(VARCHAR(10), CreatedAt, 23) ORDER BY Day;
END;
GO

CREATE OR ALTER PROCEDURE sp_CountAdmins
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT(*) AS AdminCount FROM Users WHERE Role = 'admin';
END;
GO

CREATE OR ALTER PROCEDURE sp_PromoteToAdmin
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET Role = 'admin' WHERE Id = @UserId;
END;
GO

-- ──────────────── RATE LIMITING ────────────────

CREATE OR ALTER PROCEDURE sp_CheckRateLimit
    @UserId     UNIQUEIDENTIFIER,
    @ActionType NVARCHAR(50),
    @WindowMs   INT = 5000
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @LastRequest DATETIME2;
    SELECT @LastRequest = LastRequestAt FROM RateLimits WHERE UserId = @UserId AND ActionType = @ActionType;

    IF @LastRequest IS NOT NULL AND DATEDIFF(MILLISECOND, @LastRequest, GETUTCDATE()) < @WindowMs
    BEGIN
        SELECT 0 AS Allowed; RETURN;
    END;

    MERGE RateLimits AS target
    USING (SELECT @UserId AS UserId, @ActionType AS ActionType) AS source
    ON target.UserId = source.UserId AND target.ActionType = source.ActionType
    WHEN MATCHED THEN UPDATE SET LastRequestAt = GETUTCDATE()
    WHEN NOT MATCHED THEN INSERT (UserId, ActionType, LastRequestAt) VALUES (@UserId, @ActionType, GETUTCDATE());

    SELECT 1 AS Allowed;
END;
GO
