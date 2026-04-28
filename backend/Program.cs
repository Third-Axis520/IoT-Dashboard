using IoT.CentralApi.Adapters;
using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Middleware;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

// Serve the built frontend (frontend/dist) as the WebRoot so the same Kestrel
// instance hosts both API and SPA — keeps relative /api/* paths working without CORS.
var distPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "frontend", "dist"));
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = Directory.Exists(distPath) ? distPath : null,
});

// ── CORS（允許 React Dashboard 跨域）──────────────────────────────────────
var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
    ?? ["http://localhost:3000", "http://localhost:5173"];
builder.Services.AddCors(options =>
    options.AddPolicy("IoTDashboard", policy =>
        policy.WithOrigins(corsOrigins)
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
// In Test environment, IntegrationTestBase replaces this with SQLite via ConfigureServices.
// We skip the SqlServer registration here to avoid EF Core's "multiple providers" error.
if (!builder.Environment.IsEnvironment("Test"))
{
    var connStr = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

    builder.Services.AddDbContextFactory<IoTDbContext>(options =>
        options.UseSqlServer(connStr));
}

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

// ── HttpClient for WebApiAdapter ───────────────────────────────────────────
builder.Services.AddHttpClient("WebApiAdapter", client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});

// ── Protocol Adapters ─────────────────────────────────────────────────────
builder.Services.AddSingleton<IProtocolAdapter, PushIngestAdapter>();
builder.Services.AddSingleton<IProtocolAdapter, ModbusTcpAdapter>();
builder.Services.AddSingleton<IProtocolAdapter, WebApiAdapter>();

// ── Polling Infrastructure ───────────────────────────────────────────────
builder.Services.AddSingleton<ConnectionStateRegistry>();
builder.Services.AddSingleton<ILatestReadingCache, LatestReadingCache>();
builder.Services.AddSingleton<GatingEvaluator>();
builder.Services.AddHostedService<PollingBackgroundService>();
builder.Services.AddScoped<ImpactAnalyzer>();

// ── Port ─────────────────────────────────────────────────────────────────
builder.WebHost.UseUrls("http://0.0.0.0:5200");

var app = builder.Build();

// ── 自動建立 DB / Seed (works in both prod and test) ────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
    await using var ctx = await db.CreateDbContextAsync();

    // EnsureCreatedAsync works on SQLite (test) AND SQL Server (production)
    await ctx.Database.EnsureCreatedAsync();

    // SQL Server-specific T-SQL DDL migrations (production only)
    if (!app.Environment.IsEnvironment("Test"))
    {
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

    // ── PropertyTypes (Device Integration Wizard 用) ─────────────────────────
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PropertyTypes' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[PropertyTypes] (
                [Id]          INT            IDENTITY(1,1) NOT NULL,
                [Key]         NVARCHAR(50)   NOT NULL,
                [Name]        NVARCHAR(100)  NOT NULL,
                [Icon]        NVARCHAR(50)   NOT NULL,
                [DefaultUnit] NVARCHAR(20)   NOT NULL DEFAULT N'',
                [DefaultUcl]  FLOAT          NULL,
                [DefaultLcl]  FLOAT          NULL,
                [Behavior]    NVARCHAR(20)   NOT NULL DEFAULT N'normal',
                [IsBuiltIn]   BIT            NOT NULL DEFAULT 0,
                [SortOrder]   INT            NOT NULL DEFAULT 0,
                [CreatedAt]   DATETIME2      NOT NULL,
                CONSTRAINT [PK_PropertyTypes] PRIMARY KEY ([Id])
            );
            CREATE UNIQUE INDEX [IX_PropertyTypes_Key] ON [dbo].[PropertyTypes] ([Key]);
        END
        """);

    // Seed 8 內建屬性 (must run BEFORE backfill so PropertyTypes has data for FK references)
    await SeedPropertyTypesAsync(ctx);

    // Migration: EquipmentTypeSensors.Role → PropertyTypeId + RawAddress
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND name = 'PropertyTypeId'
        )
        BEGIN
            ALTER TABLE [dbo].[EquipmentTypeSensors] ADD [PropertyTypeId] INT NULL;
            ALTER TABLE [dbo].[EquipmentTypeSensors] ADD [RawAddress] NVARCHAR(100) NULL;
        END
        """);

    // Backfill existing sensors: material_detect → PropertyType key='material_detect', normal → 'temperature'
    // Must use EXEC() so SQL Server doesn't validate 'Role' column reference at parse time when Role is already gone
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND name = 'Role'
        )
        BEGIN
            EXEC(N'
                UPDATE ets
                SET ets.PropertyTypeId = pt.Id
                FROM [dbo].[EquipmentTypeSensors] ets
                INNER JOIN [dbo].[PropertyTypes] pt ON pt.[Key] = ''material_detect''
                WHERE ets.Role = ''material_detect'' AND ets.PropertyTypeId IS NULL;

                UPDATE ets
                SET ets.PropertyTypeId = pt.Id
                FROM [dbo].[EquipmentTypeSensors] ets
                INNER JOIN [dbo].[PropertyTypes] pt ON pt.[Key] = ''temperature''
                WHERE ets.Role = ''normal'' AND ets.PropertyTypeId IS NULL;
            ');
        END
        """);

    // Catch-all: any remaining NULL → temperature
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (
            SELECT 1 FROM [dbo].[EquipmentTypeSensors] WHERE PropertyTypeId IS NULL
        )
        BEGIN
            UPDATE [dbo].[EquipmentTypeSensors]
            SET PropertyTypeId = (SELECT Id FROM [dbo].[PropertyTypes] WHERE [Key] = 'temperature')
            WHERE PropertyTypeId IS NULL;
        END
        """);

    // Add FK constraint + NOT NULL + index — each statement idempotent so a
    // fresh DB (EnsureCreatedAsync already made the index from the EF model)
    // and an upgraded older DB both converge to the same shape.
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND name = 'PropertyTypeId'
        )
        BEGIN
            IF EXISTS (
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND name = 'PropertyTypeId' AND is_nullable = 1
            )
                ALTER TABLE [dbo].[EquipmentTypeSensors] ALTER COLUMN [PropertyTypeId] INT NOT NULL;

            IF NOT EXISTS (
                SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_EquipmentTypeSensors_PropertyTypes'
            )
                ALTER TABLE [dbo].[EquipmentTypeSensors]
                    ADD CONSTRAINT FK_EquipmentTypeSensors_PropertyTypes
                    FOREIGN KEY (PropertyTypeId) REFERENCES [dbo].[PropertyTypes](Id);

            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = 'IX_EquipmentTypeSensors_PropertyTypeId'
                  AND object_id = OBJECT_ID('dbo.EquipmentTypeSensors')
            )
                CREATE INDEX IX_EquipmentTypeSensors_PropertyTypeId
                    ON [dbo].[EquipmentTypeSensors] (PropertyTypeId);
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND name = 'Role'
        )
        BEGIN
            -- Drop any DEFAULT constraint on Role before dropping the column
            DECLARE @df NVARCHAR(256);
            SELECT @df = d.name
            FROM sys.default_constraints d
            JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
            WHERE c.object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND c.name = 'Role';
            IF @df IS NOT NULL
                EXEC('ALTER TABLE [dbo].[EquipmentTypeSensors] DROP CONSTRAINT ' + @df);

            ALTER TABLE [dbo].[EquipmentTypeSensors] DROP COLUMN Role;
        END
        """);

    // ── DeviceConnection (設備連線設定) ──────────────────��───────────────────
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DeviceConnections' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[DeviceConnections] (
                [Id]               INT            IDENTITY(1,1) NOT NULL,
                [Name]             NVARCHAR(200)  NOT NULL,
                [Protocol]         NVARCHAR(50)   NOT NULL,
                [ConfigJson]       NVARCHAR(MAX)  NOT NULL DEFAULT '{{}}',
                [PollIntervalMs]   INT            NULL,
                [IsEnabled]        BIT            NOT NULL DEFAULT 1,
                [LastPollAt]       DATETIME2      NULL,
                [LastPollError]    NVARCHAR(500)  NULL,
                [ConsecutiveErrors] INT           NOT NULL DEFAULT 0,
                [EquipmentTypeId]  INT            NULL,
                [CreatedAt]        DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
                CONSTRAINT [PK_DeviceConnections] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_DeviceConnections_EquipmentTypes]
                    FOREIGN KEY ([EquipmentTypeId]) REFERENCES [dbo].[EquipmentTypes]([Id])
                    ON DELETE SET NULL
            );
        END
        """);

    } // end if (!IsEnvironment("Test"))

    // Seed for test environment (DDL block above already seeds for production)
    await SeedPropertyTypesAsync(ctx);
} // end using scope

static async Task SeedPropertyTypesAsync(IoTDbContext ctx)
{
    if (await ctx.PropertyTypes.AnyAsync()) return;
    var now = DateTime.UtcNow;
    ctx.PropertyTypes.AddRange(
        new PropertyType { Key = "temperature",     Name = "溫度",     Icon = "thermometer",  DefaultUnit = "℃",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 1, CreatedAt = now },
        new PropertyType { Key = "pressure",        Name = "壓力",     Icon = "gauge",        DefaultUnit = "kPa",  Behavior = "normal",          IsBuiltIn = true, SortOrder = 2, CreatedAt = now },
        new PropertyType { Key = "humidity",        Name = "濕度",     Icon = "droplets",     DefaultUnit = "%",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 3, CreatedAt = now },
        new PropertyType { Key = "flow",            Name = "流量",     Icon = "waves",        DefaultUnit = "L/min",Behavior = "normal",          IsBuiltIn = true, SortOrder = 4, CreatedAt = now },
        new PropertyType { Key = "counter",         Name = "計數器",   Icon = "hash",         DefaultUnit = "count",Behavior = "counter",         IsBuiltIn = true, SortOrder = 5, CreatedAt = now },
        new PropertyType { Key = "state",           Name = "狀態",     Icon = "activity",     DefaultUnit = "",     Behavior = "state",           IsBuiltIn = true, SortOrder = 6, CreatedAt = now },
        new PropertyType { Key = "asset_code",      Name = "資產編號", Icon = "tag",          DefaultUnit = "",     Behavior = "asset_code",      IsBuiltIn = true, SortOrder = 7, CreatedAt = now },
        new PropertyType { Key = "material_detect", Name = "在位",     Icon = "check-circle", DefaultUnit = "",     Behavior = "material_detect", IsBuiltIn = true, SortOrder = 8, CreatedAt = now }
    );
    await ctx.SaveChangesAsync();
}

// ── Swagger UI（開發環境）────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// ── Global error handler（非開發環境攔截未處理例外）────────────────────────────
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(err => err.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(
            new ErrorResponse("internal_error", "An unexpected error occurred."));
    }));
}

app.UseMiddleware<ApiKeyMiddleware>();

app.UseCors("IoTDashboard");
app.UseRateLimiter();

// Serve SPA — order matters: defaults before static, fallback after MapControllers
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();
app.MapFallbackToFile("index.html");

app.Logger.LogInformation("IoT Central API started on http://0.0.0.0:5200");

app.Run();

// Expose Program to WebApplicationFactory in tests
public partial class Program { }
