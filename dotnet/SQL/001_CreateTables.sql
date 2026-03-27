-- ══════════════════════════════════════════════════════════════
-- OneLineArt — Database Schema (SQL Server / PostgreSQL compatible)
-- Run this script once to create all tables.
-- ══════════════════════════════════════════════════════════════

-- 1. Users
CREATE TABLE Users (
    Id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    Email           NVARCHAR(256)    NOT NULL UNIQUE,
    PasswordHash    NVARCHAR(512)    NOT NULL,
    Name            NVARCHAR(200)    NOT NULL,
    Role            NVARCHAR(20)     NOT NULL DEFAULT 'user',       -- 'user' | 'admin'
    EmailConfirmed  BIT              NOT NULL DEFAULT 0,
    EmailConfirmToken NVARCHAR(256)  NULL,
    PasswordResetToken NVARCHAR(256) NULL,
    PasswordResetExpiry DATETIME2    NULL,
    RefreshToken    NVARCHAR(512)    NULL,
    RefreshTokenExpiry DATETIME2     NULL,
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IX_Users_Email ON Users(Email);
CREATE INDEX IX_Users_RefreshToken ON Users(RefreshToken);

-- 2. Credits
CREATE TABLE Credits (
    UserId          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY
                        REFERENCES Users(Id) ON DELETE CASCADE,
    ImageCredits    INT              NOT NULL DEFAULT 0,
    VideoCredits    INT              NOT NULL DEFAULT 0,
    Balance         DECIMAL(18,2)    NOT NULL DEFAULT 0
);

-- 3. Subscriptions
CREATE TABLE Subscriptions (
    Id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    UserId          UNIQUEIDENTIFIER NOT NULL
                        REFERENCES Users(Id) ON DELETE CASCADE,
    TierId          NVARCHAR(50)     NOT NULL,
    TierName        NVARCHAR(100)    NOT NULL,
    BillingCycle    NVARCHAR(20)     NOT NULL,  -- 'monthly' | 'annual'
    Price           DECIMAL(18,2)    NOT NULL,
    Status          NVARCHAR(20)     NOT NULL DEFAULT 'active',  -- 'active' | 'cancelled'
    PurchasedAt     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    NextBilling     DATETIME2        NULL,
    CancelledAt     DATETIME2        NULL,
    StripeSessionId NVARCHAR(256)    NULL
);

CREATE INDEX IX_Subscriptions_UserId ON Subscriptions(UserId);

-- 4. Transactions (unified — purchases + usage)
CREATE TABLE Transactions (
    Id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    UserId          UNIQUEIDENTIFIER NOT NULL
                        REFERENCES Users(Id) ON DELETE CASCADE,
    Type            NVARCHAR(30)     NOT NULL,  -- 'purchase' | 'credit-purchase' | 'image' | 'video'
    TierId          NVARCHAR(50)     NULL,
    TierName        NVARCHAR(100)    NULL,
    BillingCycle    NVARCHAR(20)     NULL,
    Price           DECIMAL(18,2)    NULL,       -- amount charged (purchases)
    ImageCredits    INT              NULL,        -- credits granted (purchases)
    VideoCredits    INT              NULL,
    Cost            INT              NULL,        -- credits consumed (usage)
    DiscountPct     INT              NULL,        -- bulk discount applied
    StripeSessionId NVARCHAR(256)    NULL,
    Source          NVARCHAR(30)     NULL,        -- 'checkout' | 'webhook' | 'direct'
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IX_Transactions_UserId ON Transactions(UserId);
CREATE INDEX IX_Transactions_Type ON Transactions(Type);
CREATE INDEX IX_Transactions_CreatedAt ON Transactions(CreatedAt DESC);

-- 5. StripeSessions (idempotency)
CREATE TABLE StripeSessions (
    SessionId       NVARCHAR(256)    NOT NULL PRIMARY KEY,
    Fulfilled       BIT              NOT NULL DEFAULT 1,
    UserId          UNIQUEIDENTIFIER NOT NULL,
    ImageCredits    INT              NOT NULL DEFAULT 0,
    VideoCredits    INT              NOT NULL DEFAULT 0,
    Source          NVARCHAR(30)     NULL,
    FulfilledAt     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);

-- 6. PricingConfig (single-row config)
CREATE TABLE PricingConfig (
    Id              INT              NOT NULL DEFAULT 1 PRIMARY KEY,
    ImageCost       DECIMAL(18,2)    NOT NULL DEFAULT 1,
    VideoCost       DECIMAL(18,2)    NOT NULL DEFAULT 5,
    AnnualDiscount  INT              NOT NULL DEFAULT 15,
    TiersJson       NVARCHAR(MAX)    NOT NULL,  -- JSON array of tier objects
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);

-- Seed default pricing
INSERT INTO PricingConfig (Id, ImageCost, VideoCost, AnnualDiscount, TiersJson)
VALUES (1, 1, 5, 15, N'[
  {"id":"starter","name":"Starter","monthlyPrice":25,"imageCredits":30,"videoCredits":5,"discount":0,"description":"Perfect for trying out one-line art"},
  {"id":"pro","name":"Pro","monthlyPrice":40,"imageCredits":60,"videoCredits":12,"discount":20,"description":"For creators who need more power"},
  {"id":"enterprise","name":"Enterprise","monthlyPrice":60,"imageCredits":120,"videoCredits":30,"discount":40,"description":"Unlimited creativity for teams"}
]');

-- 7. RateLimits (for AI image generation)
CREATE TABLE RateLimits (
    UserId          UNIQUEIDENTIFIER NOT NULL,
    ActionType      NVARCHAR(50)     NOT NULL,
    LastRequestAt   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    PRIMARY KEY (UserId, ActionType)
);
