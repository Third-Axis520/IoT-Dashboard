using IoT.CentralApi.Data;
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

// ── CORS（允許 React Dashboard 跨域）──────────────────────────────────────
builder.Services.AddCors(options =>
    options.AddPolicy("IoTDashboard", policy =>
        policy.WithOrigins(
                "http://localhost:3000",
                "http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()));

// ── Controllers ────────────────────────────────────────────────────────────
builder.Services.AddControllers();

// ── Rate Limiting（DataIngest，每 10 秒最多 20 次）─────────────────────────
builder.Services.AddRateLimiter(options =>
{
    options.AddSlidingWindowLimiter("ingest", limiterOptions =>
    {
        limiterOptions.PermitLimit = 20;
        limiterOptions.Window = TimeSpan.FromSeconds(10);
        limiterOptions.SegmentsPerWindow = 5;
        limiterOptions.QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst;
        limiterOptions.QueueLimit = 0;
    });
    options.RejectionStatusCode = 429;
});

// ── OpenTelemetry 監控（開發：Console；生產可換 OTLP exporter）─────────────
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation(opts =>
        {
            opts.RecordException = true;
            opts.Filter = ctx =>
                !ctx.Request.Path.StartsWithSegments("/openapi") &&
                !ctx.Request.Path.StartsWithSegments("/swagger");
        })
        .AddConsoleExporter())
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddConsoleExporter());

// ── OpenAPI / Swagger ───────────────────────────────────────────────────────
builder.Services.AddSwaggerGen();

// ── Entity Framework Core + SQL Server ────────────────────────────────────
var connStr = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

builder.Services.AddDbContextFactory<IoTDbContext>(options =>
    options.UseSqlServer(connStr));

// ── FAS API HttpClient ──────────────────────────────────────────────────────
builder.Services.AddHttpClient("FasApi", client =>
{
    var baseUrl = builder.Configuration["FasApi:BaseUrl"] ?? "https://portal.diamondgroup.com.tw/FAS/";
    var apiKey = builder.Configuration["FasApi:ApiKey"] ?? "";
    client.BaseAddress = new Uri(baseUrl);
    client.DefaultRequestHeaders.Add("X-Api-Key", apiKey);
    client.Timeout = TimeSpan.FromSeconds(10);
});

// ── Application Services ────────────────────────────────────────────────────
builder.Services.AddSingleton<SseHub>();
builder.Services.AddSingleton<FasApiService>();
builder.Services.AddSingleton<WeChatService>();
builder.Services.AddSingleton<DataIngestionService>();

// ── Port ─────────────────────────────────────────────────────────────────
builder.WebHost.UseUrls("http://0.0.0.0:5200");

var app = builder.Build();

// ── 自動建立 DB（開發模式用，Production 應改為 Migration）──────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
    await using var ctx = await db.CreateDbContextAsync();

    // 建立整個 DB（若不存在）
    await ctx.Database.EnsureCreatedAsync();

    // EnsureCreatedAsync 只建不存在的 DB，不 migrate 現有 DB。
    // 手動補建新增的 Devices 表（防止舊 DB 沒有此表）。
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Devices' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[Devices] (
                [Id]           INT           IDENTITY(1,1) NOT NULL,
                [SerialNumber] NVARCHAR(100) NOT NULL,
                [IpAddress]    NVARCHAR(50)  NULL,
                [AssetCode]    NVARCHAR(50)  NULL,
                [FriendlyName] NVARCHAR(200) NULL,
                [FirstSeen]    DATETIME2     NOT NULL,
                [LastSeen]     DATETIME2     NOT NULL,
                CONSTRAINT [PK_Devices] PRIMARY KEY ([Id])
            );
            CREATE UNIQUE INDEX [IX_Devices_SerialNumber] ON [dbo].[Devices] ([SerialNumber]);
        END
        """);

    // RegisterMapProfiles + RegisterMapEntries（AddRegisterMap migration 的 Up() 是空的，手動補建）
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RegisterMapProfiles' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[RegisterMapProfiles] (
                [Id]          INT           IDENTITY(1,1) NOT NULL,
                [LineId]      NVARCHAR(100) NOT NULL,
                [ProfileName] NVARCHAR(100) NOT NULL,
                [UpdatedAt]   DATETIME2     NOT NULL,
                CONSTRAINT [PK_RegisterMapProfiles] PRIMARY KEY ([Id])
            );
            CREATE UNIQUE INDEX [IX_RegisterMapProfiles_LineId] ON [dbo].[RegisterMapProfiles] ([LineId]);
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RegisterMapEntries' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[RegisterMapEntries] (
                [Id]              INT           IDENTITY(1,1) NOT NULL,
                [ProfileId]       INT           NOT NULL,
                [ZoneIndex]       INT           NOT NULL,
                [RegisterAddress] INT           NOT NULL,
                [EquipmentId]     NVARCHAR(100) NOT NULL,
                [PointId]         NVARCHAR(100) NOT NULL,
                [Label]           NVARCHAR(100) NOT NULL,
                [Unit]            NVARCHAR(10)  NOT NULL,
                CONSTRAINT [PK_RegisterMapEntries] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_RegisterMapEntries_RegisterMapProfiles_ProfileId]
                    FOREIGN KEY ([ProfileId]) REFERENCES [dbo].[RegisterMapProfiles]([Id]) ON DELETE CASCADE
            );
            CREATE INDEX [IX_RegisterMapEntries_ProfileId_RegisterAddress]
                ON [dbo].[RegisterMapEntries] ([ProfileId], [RegisterAddress]);
        END
        """);

    // ── PLC 型號範本（AddPlcTemplates migration 的實際 DDL）────────────────
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PlcTemplates' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[PlcTemplates] (
                [Id]          INT            IDENTITY(1,1) NOT NULL,
                [ModelName]   NVARCHAR(100)  NOT NULL,
                [Description] NVARCHAR(300)  NULL,
                [CreatedAt]   DATETIME2      NOT NULL,
                CONSTRAINT [PK_PlcTemplates] PRIMARY KEY ([Id])
            );
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PlcZoneDefinitions' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[PlcZoneDefinitions] (
                [Id]                INT           IDENTITY(1,1) NOT NULL,
                [TemplateId]        INT           NOT NULL,
                [ZoneIndex]         INT           NOT NULL,
                [ZoneName]          NVARCHAR(50)  NOT NULL,
                [AssetCodeRegStart] INT           NOT NULL,
                [AssetCodeRegCount] INT           NOT NULL,
                CONSTRAINT [PK_PlcZoneDefinitions] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_PlcZoneDefinitions_PlcTemplates_TemplateId]
                    FOREIGN KEY ([TemplateId]) REFERENCES [dbo].[PlcTemplates]([Id]) ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX [IX_PlcZoneDefinitions_TemplateId_ZoneIndex]
                ON [dbo].[PlcZoneDefinitions] ([TemplateId], [ZoneIndex]);
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PlcRegisterDefinitions' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[PlcRegisterDefinitions] (
                [Id]              INT           IDENTITY(1,1) NOT NULL,
                [TemplateId]      INT           NOT NULL,
                [RegisterAddress] INT           NOT NULL,
                [DefaultLabel]    NVARCHAR(100) NOT NULL,
                [DefaultUnit]     NVARCHAR(10)  NOT NULL,
                [DefaultZoneIndex] INT          NULL,
                CONSTRAINT [PK_PlcRegisterDefinitions] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_PlcRegisterDefinitions_PlcTemplates_TemplateId]
                    FOREIGN KEY ([TemplateId]) REFERENCES [dbo].[PlcTemplates]([Id]) ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX [IX_PlcRegisterDefinitions_TemplateId_RegisterAddress]
                ON [dbo].[PlcRegisterDefinitions] ([TemplateId], [RegisterAddress]);
        END
        """);

    // SensorReadings 加 HasMaterial 欄位（舊 DB 沒有時補上，預設 1 = 有料）
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.SensorReadings')
              AND name = 'HasMaterial'
        )
        BEGIN
            ALTER TABLE [dbo].[SensorReadings] ADD [HasMaterial] BIT NOT NULL DEFAULT 1;
        END
        """);

    // SensorReadings HasMaterial + AssetCode 複合索引（查詢有料歷史用）
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE object_id = OBJECT_ID('dbo.SensorReadings')
              AND name = 'IX_SensorReadings_AssetCode_HasMaterial_Timestamp'
        )
        BEGIN
            CREATE INDEX [IX_SensorReadings_AssetCode_HasMaterial_Timestamp]
                ON [dbo].[SensorReadings] ([AssetCode], [HasMaterial], [Timestamp] DESC);
        END
        """);

    // RegisterMapProfiles 加 PlcTemplateId 欄位（舊 DB 沒有時補上）
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.RegisterMapProfiles')
              AND name = 'PlcTemplateId'
        )
        BEGIN
            ALTER TABLE [dbo].[RegisterMapProfiles] ADD [PlcTemplateId] INT NULL;
            ALTER TABLE [dbo].[RegisterMapProfiles]
                ADD CONSTRAINT [FK_RegisterMapProfiles_PlcTemplates_PlcTemplateId]
                FOREIGN KEY ([PlcTemplateId]) REFERENCES [dbo].[PlcTemplates]([Id])
                ON DELETE SET NULL;
            CREATE INDEX [IX_RegisterMapProfiles_PlcTemplateId]
                ON [dbo].[RegisterMapProfiles] ([PlcTemplateId]);
        END
        """);

    // ── EquipmentTypes（Direction-C 動態設備系統）────────────────────────────
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EquipmentTypes' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[EquipmentTypes] (
                [Id]          INT            IDENTITY(1,1) NOT NULL,
                [Name]        NVARCHAR(100)  NOT NULL,
                [VisType]     NVARCHAR(50)   NOT NULL,
                [Description] NVARCHAR(300)  NULL,
                [CreatedAt]   DATETIME2      NOT NULL,
                CONSTRAINT [PK_EquipmentTypes] PRIMARY KEY ([Id])
            );
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EquipmentTypeSensors' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[EquipmentTypeSensors] (
                [Id]              INT           IDENTITY(1,1) NOT NULL,
                [EquipmentTypeId] INT           NOT NULL,
                [SensorId]        INT           NOT NULL,
                [PointId]         NVARCHAR(100) NOT NULL,
                [Label]           NVARCHAR(100) NOT NULL,
                [Unit]            NVARCHAR(10)  NOT NULL DEFAULT N'℃',
                [Role]            NVARCHAR(20)  NOT NULL DEFAULT N'normal',
                [SortOrder]       INT           NOT NULL DEFAULT 0,
                CONSTRAINT [PK_EquipmentTypeSensors] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_EquipmentTypeSensors_EquipmentTypes]
                    FOREIGN KEY ([EquipmentTypeId]) REFERENCES [dbo].[EquipmentTypes]([Id]) ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX [IX_EquipmentTypeSensors_TypeId_SensorId]
                ON [dbo].[EquipmentTypeSensors] ([EquipmentTypeId], [SensorId]);
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LineConfigs' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[LineConfigs] (
                [Id]        INT           IDENTITY(1,1) NOT NULL,
                [LineId]    NVARCHAR(100) NOT NULL,
                [Name]      NVARCHAR(200) NOT NULL,
                [UpdatedAt] DATETIME2     NOT NULL,
                CONSTRAINT [PK_LineConfigs] PRIMARY KEY ([Id])
            );
            CREATE UNIQUE INDEX [IX_LineConfigs_LineId] ON [dbo].[LineConfigs] ([LineId]);
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LineEquipments' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[LineEquipments] (
                [Id]              INT           IDENTITY(1,1) NOT NULL,
                [LineConfigId]    INT           NOT NULL,
                [EquipmentTypeId] INT           NOT NULL,
                [AssetCode]       NVARCHAR(50)  NULL,
                [DisplayName]     NVARCHAR(200) NULL,
                [SortOrder]       INT           NOT NULL DEFAULT 0,
                CONSTRAINT [PK_LineEquipments] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_LineEquipments_LineConfigs]
                    FOREIGN KEY ([LineConfigId]) REFERENCES [dbo].[LineConfigs]([Id]) ON DELETE CASCADE,
                CONSTRAINT [FK_LineEquipments_EquipmentTypes]
                    FOREIGN KEY ([EquipmentTypeId]) REFERENCES [dbo].[EquipmentTypes]([Id])
            );
            CREATE INDEX [IX_LineEquipments_LineConfigId]
                ON [dbo].[LineEquipments] ([LineConfigId]);
        END
        """);
}

// ── Swagger UI（開發環境）────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("IoTDashboard");
app.UseRateLimiter();
app.UseHttpsRedirection();
app.MapControllers();

app.Logger.LogInformation("IoT Central API started on http://0.0.0.0:5200");

app.Run();
