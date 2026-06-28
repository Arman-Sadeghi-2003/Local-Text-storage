USE master
GO

CREATE DATABASE TextStorage
ON
(
    NAME = TextStorage,
    FILENAME = 'L:\Local text storage\Database\TextStorage',
    SIZE = 10,
    MAXSIZE = 100,
    FILEGROWTH = 5
)
GO

USE TextStorage
GO

CREATE SCHEMA [CONTENT]
GO
CREATE SCHEMA [ACCOUNT]
GO

-- ============================================================
-- ACCOUNT SCHEMA
-- ============================================================

CREATE TABLE [ACCOUNT].[Users]
(
    [ID]                INT             NOT NULL PRIMARY KEY IDENTITY(1,1),
    [Username]          VARCHAR(50)     NOT NULL,
    [Email]             VARCHAR(200)    NULL,
    [PasswordHash]      VARBINARY(256)  NOT NULL,   -- enlarged: supports bcrypt/PBKDF2/Argon2
    [PasswordSalt]      VARBINARY(64)   NOT NULL,   -- 32-byte salt minimum
    [HashAlgorithm]     TINYINT         NOT NULL DEFAULT(1),  -- 1=PBKDF2-SHA512, 2=bcrypt, etc.
    [PrivateKey]        VARBINARY(2048) NULL,        -- NULL if not used; RSA-2048 = ~1200 bytes
    [IsActive]          BIT             NOT NULL DEFAULT(1),
    [CreatedOn]         DATETIME2       NOT NULL DEFAULT(SYSUTCDATETIME()),
    [LastLoginOn]       DATETIME2       NULL,

    CONSTRAINT UQ_Users_Username UNIQUE (Username),
    CONSTRAINT CK_Users_Username CHECK (LEN(Username) >= 3),

    -- Filtered unique index: allows multiple NULL emails but enforces uniqueness when set
    INDEX IX_Users_Email (Email)
)
GO

-- Filtered unique constraint for non-null emails
CREATE UNIQUE INDEX UQ_Users_Email
    ON [ACCOUNT].[Users] (Email)
    WHERE Email IS NOT NULL
GO

CREATE TABLE [ACCOUNT].[Profiles]
(
    [ID]            INT             NOT NULL PRIMARY KEY IDENTITY(1,1),
    [FirstName]     NVARCHAR(50)    NULL,
    [LastName]      NVARCHAR(50)    NULL,
    [Avatar]        NVARCHAR(500)   NULL,   -- store file path/URL only, not raw bytes
    [CreatedOn]     DATETIME2       NOT NULL DEFAULT(SYSUTCDATETIME()),  -- was missing
    [EditedOn]      DATETIME2       NULL,

    [UserID]        INT             NOT NULL,

    CONSTRAINT UQ_Profiles_UserID UNIQUE (UserID),
    CONSTRAINT FK_Profiles_Users
        FOREIGN KEY (UserID) REFERENCES [ACCOUNT].[Users](ID)
        ON DELETE CASCADE   -- was missing, caused orphan risk
)
GO

CREATE TABLE [ACCOUNT].[AccountSettings]
(
    [ID]        INT NOT NULL PRIMARY KEY IDENTITY(1,1),
    [UserID]    INT NOT NULL,

    -- Add future setting columns here, e.g.:
    -- [Theme]          NVARCHAR(20)  NOT NULL DEFAULT('system'),
    -- [Language]       NVARCHAR(10)  NOT NULL DEFAULT('en'),
    -- [Notifications]  BIT           NOT NULL DEFAULT(1),

    CONSTRAINT UQ_AccountSettings_UserID UNIQUE (UserID),
    CONSTRAINT FK_AccountSettings_Users
        FOREIGN KEY (UserID) REFERENCES [ACCOUNT].[Users](ID)
        ON DELETE CASCADE
)
GO

-- Sessions table (was planned but missing)
CREATE TABLE [ACCOUNT].[UserSessions]
(
    [ID]            BIGINT          NOT NULL PRIMARY KEY IDENTITY(1,1),
    [UserID]        INT             NOT NULL,
    [Token]         VARCHAR(512)    NOT NULL,   -- hashed refresh token
    [IPAddress]     VARCHAR(45)     NULL,        -- supports IPv6 (max 39 chars + brackets)
    [UserAgent]     NVARCHAR(500)   NULL,
    [CreatedOn]     DATETIME2       NOT NULL DEFAULT(SYSUTCDATETIME()),
    [ExpiresOn]     DATETIME2       NOT NULL,
    [RevokedOn]     DATETIME2       NULL,
    [IsRevoked]     BIT             NOT NULL DEFAULT(0),

    CONSTRAINT FK_UserSessions_Users
        FOREIGN KEY (UserID) REFERENCES [ACCOUNT].[Users](ID)
        ON DELETE CASCADE,

    INDEX IX_UserSessions_UserID (UserID),
    INDEX IX_UserSessions_Token (Token)         -- fast token lookup
)
GO

-- ============================================================
-- CONTENT SCHEMA
-- ============================================================

CREATE TABLE [CONTENT].[DocumentTypes]
(
    [ID]            INT             NOT NULL PRIMARY KEY IDENTITY(1,1),
    [Name]          NVARCHAR(50)    NOT NULL,   -- widened: 20 chars is tight for type names
    [Extension]     NVARCHAR(15)    NOT NULL,
    [MimeType]      NVARCHAR(100)   NULL,        -- useful for web/API serving

    CONSTRAINT UQ_DocumentTypes_Name       UNIQUE (Name),       -- was missing
    CONSTRAINT UQ_DocumentTypes_Extension  UNIQUE (Extension)   -- was missing
)
GO

CREATE TABLE [CONTENT].[Documents]
(
    [ID]                INT             NOT NULL PRIMARY KEY IDENTITY(1,1),
    [Name]              NVARCHAR(100)   NOT NULL,
    [Description]       NVARCHAR(2000)  NULL,       -- widened from 700
    [FilePath]          NVARCHAR(1000)  NOT NULL,   -- NVARCHAR to support Unicode paths
    [CreatedOn]         DATETIME2       NOT NULL DEFAULT(SYSUTCDATETIME()),
    [EditedOn]          DATETIME2       NULL,
    [DeletedOn]         DATETIME2       NULL,
    [IsDeleted]         BIT             NOT NULL DEFAULT(0),

    [DocumentTypeID]    INT             NOT NULL,
    [BelongsTo]         INT             NOT NULL,

    CONSTRAINT FK_Documents_DocumentTypes
        FOREIGN KEY (DocumentTypeID) REFERENCES [CONTENT].[DocumentTypes](ID),
    CONSTRAINT FK_Documents_Users
        FOREIGN KEY (BelongsTo) REFERENCES [ACCOUNT].[Users](ID)
        ON DELETE CASCADE,

    CONSTRAINT CK_Documents_Name CHECK (LEN(Name) > 0),

    -- Index for the most common query: "get documents for user X that are not deleted"
    INDEX IX_Documents_BelongsTo_Active (BelongsTo, DocumentTypeID) WHERE IsDeleted = 0,

    -- Index for admin/recovery: soft-deleted documents by user
    INDEX IX_Documents_BelongsTo (BelongsTo),
    INDEX IX_Documents_DocumentTypeID (DocumentTypeID)
)
GO