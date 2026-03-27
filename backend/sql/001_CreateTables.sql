-- ============================================================
-- OneLineArt Database Schema
-- SQL Server / Azure SQL
-- Run this script to create all tables from scratch
-- ============================================================

-- ── Users ──
CREATE TABLE [dbo].[Users] (
    [Id]           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Email]        NVARCHAR(256)    NOT NULL,
    [Name]         NVARCHAR(256)    NOT NULL,
    [PasswordHash] NVARCHAR(512)    NOT NULL,
    [Role]         NVARCHAR(20)     NOT NULL DEFAULT 'user',
    [IsActive]     BIT              NOT NULL DEFAULT 1,
    [CreatedAt]    DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    [LastLoginAt]  DATETIME2(7)     NULL,
    CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED ([Id]),
    CONSTRAINT [UQ_Users_Email] UNIQUE ([Email])
);
CREATE INDEX [IX_Users_Email] ON [dbo].[Users] ([Email]);
CREATE INDEX [IX_Users_Role] ON [dbo].[Users] ([Role]);
CREATE INDEX [IX_Users_CreatedAt] ON [dbo].[Users] ([CreatedAt] DESC);
GO

-- ── User Credits ──
CREATE TABLE [dbo].[UserCredits] (
    [Id]           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [UserId]       UNIQUEIDENTIFIER NOT NULL,
    [ImageCredits] INT              NOT NULL DEFAULT 5,
    [VideoCredits] INT              NOT NULL DEFAULT 1,
    [Balance]      DECIMAL(18,2)    NOT NULL DEFAULT 0,
    [UpdatedAt]    DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_UserCredits] PRIMARY KEY CLUSTERED ([Id]),
    CONSTRAINT [UQ_UserCredits_UserId] UNIQUE ([UserId]),
    CONSTRAINT [FK_UserCredits_Users] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE
);
GO

-- ── Subscriptions ──
CREATE TABLE [dbo].[Subscriptions] (
    [Id]                     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [UserId]                 UNIQUEIDENTIFIER NOT NULL,
    [TierId]                 NVARCHAR(50)     NOT NULL,
    [TierName]               NVARCHAR(100)    NOT NULL,
    [BillingCycle]           NVARCHAR(20)     NOT NULL DEFAULT 'monthly',
    [Price]                  DECIMAL(18,2)    NOT NULL,
    [Status]                 NVARCHAR(20)     NOT NULL DEFAULT 'active',
    [StripeSubscriptionId]   NVARCHAR(256)    NULL,
    [StripeCustomerId]       NVARCHAR(256)    NULL,
    [StripePriceId]          NVARCHAR(256)    NULL,
    [StartedAt]              DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    [NextBillingAt]          DATETIME2(7)     NOT NULL,
    [CanceledAt]             DATETIME2(7)     NULL,
    [CreatedAt]              DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    [UpdatedAt]              DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_Subscriptions] PRIMARY KEY CLUSTERED ([Id]),
    CONSTRAINT [FK_Subscriptions_Users] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE
);
CREATE INDEX [IX_Subscriptions_UserId] ON [dbo].[Subscriptions] ([UserId]);
CREATE UNIQUE INDEX [IX_Subscriptions_StripeSubId] ON [dbo].[Subscriptions] ([StripeSubscriptionId]) WHERE [StripeSubscriptionId] IS NOT NULL;
CREATE INDEX [IX_Subscriptions_Status] ON [dbo].[Subscriptions] ([Status]);
GO

-- ── Transactions ──
CREATE TABLE [dbo].[Transactions] (
    [Id]                    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [UserId]                UNIQUEIDENTIFIER NOT NULL,
    [Type]                  NVARCHAR(50)     NOT NULL,
    [Amount]                DECIMAL(18,2)    NOT NULL DEFAULT 0,
    [ImageCreditsChanged]   INT              NOT NULL DEFAULT 0,
    [VideoCreditsChanged]   INT              NOT NULL DEFAULT 0,
    [StripePaymentIntentId] NVARCHAR(256)    NULL,
    [StripeInvoiceId]       NVARCHAR(256)    NULL,
    [Description]           NVARCHAR(500)    NULL,
    [Status]                NVARCHAR(20)     NOT NULL DEFAULT 'completed',
    [CreatedAt]             DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_Transactions] PRIMARY KEY CLUSTERED ([Id]),
    CONSTRAINT [FK_Transactions_Users] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE
);
CREATE INDEX [IX_Transactions_UserId] ON [dbo].[Transactions] ([UserId]);
CREATE INDEX [IX_Transactions_Type] ON [dbo].[Transactions] ([Type]);
CREATE INDEX [IX_Transactions_CreatedAt] ON [dbo].[Transactions] ([CreatedAt] DESC);
CREATE INDEX [IX_Transactions_Status] ON [dbo].[Transactions] ([Status]);
GO

-- ── Pricing Tiers ──
CREATE TABLE [dbo].[PricingTiers] (
    [Id]                    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TierId]                NVARCHAR(50)     NOT NULL,
    [Name]                  NVARCHAR(100)    NOT NULL,
    [Description]           NVARCHAR(500)    NULL,
    [MonthlyPrice]          DECIMAL(18,2)    NOT NULL,
    [ImageCredits]          INT              NOT NULL,
    [VideoCredits]          INT              NOT NULL,
    [DiscountPercent]       DECIMAL(5,2)     NOT NULL DEFAULT 0,
    [StripePriceIdMonthly]  NVARCHAR(256)    NULL,
    [StripePriceIdAnnual]   NVARCHAR(256)    NULL,
    [IsActive]              BIT              NOT NULL DEFAULT 1,
    [SortOrder]             INT              NOT NULL DEFAULT 0,
    [CreatedAt]             DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    [UpdatedAt]             DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_PricingTiers] PRIMARY KEY CLUSTERED ([Id]),
    CONSTRAINT [UQ_PricingTiers_TierId] UNIQUE ([TierId])
);
GO

-- ── Pricing Config (singleton row) ──
CREATE TABLE [dbo].[PricingConfig] (
    [Id]                    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ImageCost]             DECIMAL(18,2)    NOT NULL DEFAULT 1,
    [VideoCost]             DECIMAL(18,2)    NOT NULL DEFAULT 5,
    [AnnualDiscountPercent] DECIMAL(5,2)     NOT NULL DEFAULT 15,
    [UpdatedAt]             DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_PricingConfig] PRIMARY KEY CLUSTERED ([Id])
);
GO

-- ── Refresh Tokens ──
CREATE TABLE [dbo].[RefreshTokens] (
    [Id]        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [UserId]    UNIQUEIDENTIFIER NOT NULL,
    [Token]     NVARCHAR(512)    NOT NULL,
    [ExpiresAt] DATETIME2(7)     NOT NULL,
    [CreatedAt] DATETIME2(7)     NOT NULL DEFAULT SYSUTCDATETIME(),
    [IsRevoked] BIT              NOT NULL DEFAULT 0,
    CONSTRAINT [PK_RefreshTokens] PRIMARY KEY CLUSTERED ([Id]),
    CONSTRAINT [FK_RefreshTokens_Users] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE
);
CREATE UNIQUE INDEX [IX_RefreshTokens_Token] ON [dbo].[RefreshTokens] ([Token]);
CREATE INDEX [IX_RefreshTokens_UserId] ON [dbo].[RefreshTokens] ([UserId]);
GO
