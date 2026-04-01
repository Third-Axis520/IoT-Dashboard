using IoT.CentralApi.Data;
using IoT.CentralApi.Services;
using Microsoft.EntityFrameworkCore;

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
}

app.UseCors("IoTDashboard");
app.UseHttpsRedirection();
app.MapControllers();

app.Logger.LogInformation("IoT Central API started on http://0.0.0.0:5200");

app.Run();
