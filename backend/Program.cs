using IoT.CentralApi.Adapters;
using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Middleware;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using IoT.CentralApi.Services.Alerting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

// Serve the built frontend (SPA) as WebRoot so the same Kestrel hosts both
// API and frontend — keeps relative /api/* paths working without CORS.
//
// Two layouts are supported:
//  1. dotnet build / dotnet run  → bin/<cfg>/<tfm>/, sibling 4 levels up to
//     repo root: ../../../../frontend/dist
//  2. dotnet publish              → publish output ships its own wwwroot/ that
//     the .csproj copy target populates from frontend/dist
// We pick the first existing one with index.html.
static string? ResolveWebRoot()
{
    var candidates = new[]
    {
        Path.Combine(AppContext.BaseDirectory, "wwwroot"),
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "frontend", "dist")),
    };
    foreach (var c in candidates)
    {
        if (Directory.Exists(c) && File.Exists(Path.Combine(c, "index.html"))) return c;
    }
    return null;
}

var webRoot = ResolveWebRoot();
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = webRoot,
});
builder.Host.UseWindowsService(options => options.ServiceName = "IoT Dashboard");
if (webRoot is null)
{
    Console.Error.WriteLine("[startup] WARNING: no frontend/dist or wwwroot found — SPA will 404. Did you run `npm run build`?");
}

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

// ── Host shutdown timeout ────────────────────────────────────────────────
// Modbus polling has a 10s connect+read timeout, and FasApi HttpClient is 10s.
// Default 5s shutdown timeout was tripping OperationCanceledException on `sc
// stop` during deploy → failure-recovery cycle exhaustion. 30s lets in-flight
// polls finish gracefully.
builder.Services.Configure<HostOptions>(o =>
    o.ShutdownTimeout = TimeSpan.FromSeconds(30));

// ── Application Services ────────────────────────────────────────────────────
builder.Services.AddSingleton<SseHub>();
builder.Services.AddSingleton<FasApiService>();
builder.Services.AddSingleton<WeChatService>();
builder.Services.AddSingleton<DataIngestionService>();
builder.Services.AddSingleton<IIoTReceiverDataSource, SqlIoTReceiverDataSource>();

// ── Alerting Channels ───────────────────────────────────────────────────────
builder.Services.AddSingleton<IAlertChannel, IoT.CentralApi.Services.Alerting.Channels.SseAlertChannel>();
builder.Services.AddSingleton<IAlertChannel, IoT.CentralApi.Services.Alerting.Channels.WeChatAlertChannel>();
builder.Services.AddSingleton<IoT.CentralApi.Services.Alerting.AlertDispatcher>();

// ── HttpClient for WebApiAdapter ───────────────────────────────────────────
builder.Services.AddHttpClient("WebApiAdapter", client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});

// ── Protocol Adapters ─────────────────────────────────────────────────────
builder.Services.AddSingleton<IProtocolAdapter, PushIngestAdapter>();
builder.Services.AddSingleton<IProtocolAdapter, ModbusTcpAdapter>();
builder.Services.AddSingleton<IProtocolAdapter, WebApiAdapter>();
builder.Services.AddSingleton<IProtocolAdapter, IoTReceiverDbAdapter>();

// ── Polling Infrastructure ───────────────────────────────────────────────
builder.Services.AddSingleton<ConnectionStateRegistry>();
builder.Services.AddSingleton<ILatestReadingCache, LatestReadingCache>();
builder.Services.AddHostedService<PollingBackgroundService>();
builder.Services.AddHostedService<PollingWatchdogService>();

// ── Port ─────────────────────────────────────────────────────────────────
builder.WebHost.UseUrls("http://0.0.0.0:5200");

var app = builder.Build();

// CLI mode: dotnet run -- seed-pressing-machine <assetCode> <displayName> [lineConfigId=1]
if (args.Length > 0 && args[0].StartsWith("seed-"))
{
    using var cliScope = app.Services.CreateScope();
    var dbFactory = cliScope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
    await using var cliDb = await dbFactory.CreateDbContextAsync();
    await cliDb.Database.EnsureCreatedAsync();

    var asset = args.Length > 1 ? args[1] : throw new ArgumentException("AssetCode required");
    var name = args.Length > 2 ? args[2] : asset;
    var lineId = args.Length > 3 ? int.Parse(args[3]) : 1;

    switch (args[0])
    {
        case "seed-pressing-machine":
            await IoT.CentralApi.Tools.DeviceSeeder.SeedPressingMachineAsync(cliDb, asset, name, lineId);
            return;
        case "seed-marking-machine":
            await IoT.CentralApi.Tools.DeviceSeeder.SeedVisualMarkingMachineAsync(cliDb, asset, name, lineId);
            return;
        default:
            Console.Error.WriteLine($"Unknown command: {args[0]}");
            Environment.Exit(1);
            return;
    }
}

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

    // ── Phase 4: drop self-service tables that no longer have entity classes.
    // Order matters: child tables (with FKs) before parents. All IF EXISTS so
    // a fresh DB (where EnsureCreated never created these) is a no-op, and a
    // re-run after cleanup is also a no-op.
    //
    // CRITICAL: This block must NEVER touch tables owned by IoTReceiverAPI:
    //   PressingMachineRealTimeData, VisualMarkingMachineRealTimeData,
    //   AssetCodeAndPlantView, AssetSyncLog, IoTErrorLog.
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SensorGatingRules' AND schema_id = SCHEMA_ID('dbo'))
            DROP TABLE [dbo].[SensorGatingRules];
        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RegisterMapEntries' AND schema_id = SCHEMA_ID('dbo'))
            DROP TABLE [dbo].[RegisterMapEntries];
        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PlcRegisterDefinitions' AND schema_id = SCHEMA_ID('dbo'))
            DROP TABLE [dbo].[PlcRegisterDefinitions];
        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PlcZoneDefinitions' AND schema_id = SCHEMA_ID('dbo'))
            DROP TABLE [dbo].[PlcZoneDefinitions];
        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RegisterMapProfiles' AND schema_id = SCHEMA_ID('dbo'))
            DROP TABLE [dbo].[RegisterMapProfiles];
        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PlcTemplates' AND schema_id = SCHEMA_ID('dbo'))
            DROP TABLE [dbo].[PlcTemplates];
        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Devices' AND schema_id = SCHEMA_ID('dbo'))
            DROP TABLE [dbo].[Devices];
        """);

    // #7 Phase C cleanup: drop the obsolete HasMaterial column + its index.
    // Idempotent (IF EXISTS) so it's safe to re-run on already-cleaned DBs.
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE object_id = OBJECT_ID('dbo.SensorReadings')
              AND name = 'IX_SensorReadings_AssetCode_HasMaterial_Timestamp'
        )
        BEGIN
            DROP INDEX [IX_SensorReadings_AssetCode_HasMaterial_Timestamp]
                ON [dbo].[SensorReadings];
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.SensorReadings')
              AND name = 'HasMaterial'
        )
        BEGIN
            -- The HasMaterial column had a NOT NULL default(1) constraint
            -- created with the original ADD COLUMN. SQL Server auto-names that
            -- default constraint, so drop it dynamically by name before
            -- dropping the column.
            DECLARE @df nvarchar(128);
            SELECT @df = dc.name
            FROM sys.default_constraints dc
            JOIN sys.columns c ON c.default_object_id = dc.object_id
            WHERE c.object_id = OBJECT_ID('dbo.SensorReadings')
              AND c.name = 'HasMaterial';
            IF @df IS NOT NULL
                EXEC('ALTER TABLE [dbo].[SensorReadings] DROP CONSTRAINT [' + @df + ']');

            ALTER TABLE [dbo].[SensorReadings] DROP COLUMN [HasMaterial];
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

    // Idempotent: add IsHidden column to LineEquipments if upgrading
    // (true = backend-only entity used as gating source, won't render on dashboard)
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LineEquipments' AND schema_id = SCHEMA_ID('dbo'))
           AND NOT EXISTS (
               SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.LineEquipments') AND name = 'IsHidden'
           )
            ALTER TABLE [dbo].[LineEquipments]
                ADD [IsHidden] BIT NOT NULL CONSTRAINT DF_LineEquipments_IsHidden DEFAULT 0;
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

    // Connection health alert settings — added 2026-05-13
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DeviceConnections' AND schema_id = SCHEMA_ID('dbo'))
           AND NOT EXISTS (
               SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.DeviceConnections') AND name = 'AlertOnConsecutiveErrors'
           )
        BEGIN
            ALTER TABLE [dbo].[DeviceConnections]
                ADD [AlertOnConsecutiveErrors] INT NOT NULL CONSTRAINT DF_DeviceConnections_AlertOnConsecutiveErrors DEFAULT 5,
                    [AlertCooldownSec]         INT NOT NULL CONSTRAINT DF_DeviceConnections_AlertCooldownSec DEFAULT 300,
                    [IsAlertEnabled]           BIT NOT NULL CONSTRAINT DF_DeviceConnections_IsAlertEnabled DEFAULT 1;
        END
        """);

    // ── Asset code migration (one-shot idempotent UPDATE) ────────────────
    // Prod's 4 Modbus LineEquipments were initially registered with placeholder
    // codes (dc_8..dc_11) before FAS issued the real asset codes. Updating
    // LineEquipments + SensorLimits in place preserves UCL/LCL config; historical
    // SensorReadings / SensorAlerts stay tagged with original code.
    await ctx.Database.ExecuteSqlRawAsync("""
        UPDATE [dbo].[LineEquipments] SET AssetCode = '0000020086' WHERE AssetCode = 'dc_8';  -- 高速加熱定型
        UPDATE [dbo].[LineEquipments] SET AssetCode = '0000002134' WHERE AssetCode = 'dc_9';  -- 烘箱
        UPDATE [dbo].[LineEquipments] SET AssetCode = '0000005990' WHERE AssetCode = 'dc_10'; -- 冷凍機
        UPDATE [dbo].[LineEquipments] SET AssetCode = '0000020889' WHERE AssetCode = 'dc_11'; -- 冷熱定型機
        UPDATE [dbo].[SensorLimits] SET AssetCode = '0000020086' WHERE AssetCode = 'dc_8';
        UPDATE [dbo].[SensorLimits] SET AssetCode = '0000002134' WHERE AssetCode = 'dc_9';
        UPDATE [dbo].[SensorLimits] SET AssetCode = '0000005990' WHERE AssetCode = 'dc_10';
        UPDATE [dbo].[SensorLimits] SET AssetCode = '0000020889' WHERE AssetCode = 'dc_11';
        """);

    // ── Display-name cleanup (idempotent) ──────────────────────────────────
    // Strip "C 棟 LeanA " prefix and "連線" suffix from the 4 Modbus equipments
    // so the tile header isn't visually cluttered. Rename pressing/marking
    // machines to the shoe-industry conventional Chinese (強勢壓底機 / 畫線機).
    await ctx.Database.ExecuteSqlRawAsync("""
        -- Strip prefix "C 棟 LeanA " and suffix "連線" from the 4 modbus LineEquipments.
        UPDATE [dbo].[LineEquipments]
        SET DisplayName = LTRIM(RTRIM(REPLACE(REPLACE(DisplayName, 'C 棟 LeanA', ''), '連線', '')))
        WHERE AssetCode IN ('0000020086', '0000002134', '0000005990', '0000020889')
          AND DisplayName LIKE 'C %';

        -- Rename pressing machine → 強勢壓底機 (DisplayName + EquipmentType.Name).
        UPDATE [dbo].[LineEquipments] SET DisplayName = '強勢壓底機'
          WHERE AssetCode = '0000020881' AND DisplayName <> '強勢壓底機';
        UPDATE et SET et.[Name] = '強勢壓底機'
          FROM [dbo].[EquipmentTypes] et
          INNER JOIN [dbo].[DeviceConnections] dc ON dc.EquipmentTypeId = et.Id
          WHERE dc.ConfigJson LIKE '%0000020881%' AND et.[Name] <> '強勢壓底機';

        -- Rename visual marking machine → 畫線機 (Traditional 畫, not 劃).
        UPDATE [dbo].[LineEquipments] SET DisplayName = '畫線機'
          WHERE AssetCode = '0000005971' AND DisplayName <> '畫線機';
        UPDATE et SET et.[Name] = '畫線機'
          FROM [dbo].[EquipmentTypes] et
          INNER JOIN [dbo].[DeviceConnections] dc ON dc.EquipmentTypeId = et.Id
          WHERE dc.ConfigJson LIKE '%0000005971%' AND et.[Name] <> '畫線機';
        """);

    } // end if (!IsEnvironment("Test"))

    // Seed for test environment (DDL block above already seeds for production)
    await SeedPropertyTypesAsync(ctx);

    // ── Factory auto-seed: IoTReceiverAPI devices (pressing + visual marking) ──
    // Idempotent — DeviceSeeder.SeedXxxAsync skips if a DeviceConnection already
    // exists for the given AssetCode. LineConfigId=2 is prod's "C棟 LeanA" line;
    // in dev/test where it doesn't exist, we skip rather than error.
    //
    // Off-switch: set `Factory:AutoSeed:Enabled = false` in appsettings (or env var
    // `Factory__AutoSeed__Enabled=false`) when ops needs to disable a connection
    // permanently — otherwise the seeder would resurrect it on next restart.
    var autoSeedEnabled = app.Configuration.GetValue("Factory:AutoSeed:Enabled", true);
    if (autoSeedEnabled)
    {
        var prodLineId = await ctx.LineConfigs
            .Where(lc => lc.Id == 2)
            .Select(lc => (int?)lc.Id)
            .FirstOrDefaultAsync();
        if (prodLineId == 2)
        {
            await IoT.CentralApi.Tools.DeviceSeeder.SeedPressingMachineAsync(
                ctx, assetCode: "0000020881", displayName: "強勢壓底機", lineConfigId: 2);
            await IoT.CentralApi.Tools.DeviceSeeder.SeedVisualMarkingMachineAsync(
                ctx, assetCode: "0000005971", displayName: "畫線機", lineConfigId: 2);
        }
    }
} // end using scope

static async Task SeedPropertyTypesAsync(IoTDbContext ctx)
{
    var now = DateTime.UtcNow;
    var builtIn = new[]
    {
        new PropertyType { Key = "temperature",     Name = "溫度",     Icon = "thermometer",  DefaultUnit = "℃",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 1, CreatedAt = now },
        new PropertyType { Key = "pressure",        Name = "壓力",     Icon = "gauge",        DefaultUnit = "kPa",  Behavior = "normal",          IsBuiltIn = true, SortOrder = 2, CreatedAt = now },
        new PropertyType { Key = "humidity",        Name = "濕度",     Icon = "droplets",     DefaultUnit = "%",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 3, CreatedAt = now },
        new PropertyType { Key = "flow",            Name = "流量",     Icon = "waves",        DefaultUnit = "L/min",Behavior = "normal",          IsBuiltIn = true, SortOrder = 4, CreatedAt = now },
        new PropertyType { Key = "counter",         Name = "計數器",   Icon = "hash",         DefaultUnit = "count",Behavior = "counter",         IsBuiltIn = true, SortOrder = 5, CreatedAt = now },
        new PropertyType { Key = "state",           Name = "狀態",     Icon = "activity",     DefaultUnit = "",     Behavior = "state",           IsBuiltIn = true, SortOrder = 6, CreatedAt = now },
        new PropertyType { Key = "asset_code",      Name = "資產編號", Icon = "tag",          DefaultUnit = "",     Behavior = "asset_code",      IsBuiltIn = true, SortOrder = 7, CreatedAt = now },
        new PropertyType { Key = "material_detect", Name = "在位",     Icon = "check-circle", DefaultUnit = "",     Behavior = "material_detect", IsBuiltIn = true, SortOrder = 8, CreatedAt = now },
        new PropertyType { Key = "duration",        Name = "時間長度", Icon = "clock",        DefaultUnit = "s",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 9, CreatedAt = now },
    };

    var existingKeys = await ctx.PropertyTypes.Select(p => p.Key).ToListAsync();
    foreach (var pt in builtIn)
    {
        if (!existingKeys.Contains(pt.Key))
            ctx.PropertyTypes.Add(pt);
    }
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

// Health endpoint for CI/CD verify + Windows Service liveness probe.
// Mapped BEFORE MapFallbackToFile so it doesn't get caught by SPA fallback.
app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "IoTDashboard",
    timestamp = DateTime.UtcNow,
}));

app.MapControllers();
app.MapFallbackToFile("index.html");

app.Logger.LogInformation("IoT Central API started on http://0.0.0.0:5200");

app.Run();

// Expose Program to WebApplicationFactory in tests
public partial class Program { }
