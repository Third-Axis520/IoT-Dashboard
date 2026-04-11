// ─────────────────────────────────────────────────────────────────────────────
// IntegrationTestBase — 共用基礎類別給所有 controller / integration tests
// ─────────────────────────────────────────────────────────────────────────────
// 提供:
//   - WebApplicationFactory 啟動完整後端 (in-memory)
//   - HttpClient 直接打 API
//   - SQLite 測試 DB (取代 SQL Server)
//   - WaitForConditionAsync 用於等待背景服務行為
//
// 使用方式:
//   public class MyControllerTests : IntegrationTestBase
//   {
//       [Fact]
//       public async Task SomeEndpoint_DoesSomething()
//       {
//           var resp = await Client.GetAsync("/api/whatever");
//           resp.StatusCode.Should().Be(HttpStatusCode.OK);
//       }
//   }
// ─────────────────────────────────────────────────────────────────────────────

using IoT.CentralApi.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace IoT.CentralApi.Tests._Shared;

public abstract class IntegrationTestBase : IAsyncLifetime
{
    protected WebApplicationFactory<Program> Factory = null!;
    protected HttpClient Client = null!;
    protected string DbPath = null!;

    public virtual async Task InitializeAsync()
    {
        DbPath = Path.Combine(Path.GetTempPath(), $"iottest_{Guid.NewGuid():N}.db");

        Factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    // 取代生產 DbContext 為 SQLite
                    var descriptor = services.FirstOrDefault(d =>
                        d.ServiceType == typeof(DbContextOptions<IoTDbContext>));
                    if (descriptor != null) services.Remove(descriptor);

                    var factoryDescriptor = services.FirstOrDefault(d =>
                        d.ServiceType == typeof(IDbContextFactory<IoTDbContext>));
                    if (factoryDescriptor != null) services.Remove(factoryDescriptor);

                    services.AddDbContextFactory<IoTDbContext>(opts =>
                        opts.UseSqlite($"Data Source={DbPath}"));
                });

                builder.ConfigureAppConfiguration(c =>
                {
                    c.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["WeChat:Enabled"] = "false",
                        ["FasApi:BaseUrl"] = "http://localhost:1",
                        ["FasApi:ApiKey"] = "test-key",
                        ["ConnectionStrings:DefaultConnection"] = $"Data Source={DbPath}"
                    });
                });

                builder.UseEnvironment("Test");
            });

        Client = Factory.CreateClient();

        // 確保 DB schema 存在
        using var scope = Factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();
    }

    public virtual async Task DisposeAsync()
    {
        Client.Dispose();
        await Factory.DisposeAsync();
        if (File.Exists(DbPath))
        {
            try { File.Delete(DbPath); } catch { /* file lock OK */ }
        }
    }

    /// <summary>從 DI 容器拿一個獨立 DbContext (test 內部驗證 DB state 時用)</summary>
    protected async Task<IoTDbContext> CreateDbContextAsync()
    {
        var factory = Factory.Services.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        return await factory.CreateDbContextAsync();
    }

    /// <summary>等待非同步條件成立 (給背景服務測試用)</summary>
    protected static async Task WaitForConditionAsync(
        Func<Task<bool>> predicate,
        TimeSpan timeout,
        TimeSpan? pollInterval = null)
    {
        var interval = pollInterval ?? TimeSpan.FromMilliseconds(100);
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (await predicate()) return;
            await Task.Delay(interval);
        }
        throw new TimeoutException($"Condition not met within {timeout.TotalSeconds:F1}s");
    }
}
