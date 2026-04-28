using IoT.CentralApi.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Net;

namespace IoT.CentralApi.Tests.Integration;

/// <summary>
/// Regression tests for the startup bootstrap path.
///
/// History: a bug in Program.cs gated CREATE INDEX
/// IX_EquipmentTypeSensors_PropertyTypeId on whether the FK existed, but on a
/// fresh SQL Server DB EF EnsureCreatedAsync had already created the index
/// from the model — the second app start crashed with "index already exists".
/// These tests assert the full startup path can be run twice on the same
/// underlying database without crashing.
///
/// Note: The SQL Server-specific T-SQL bootstrap inside Program.cs is gated
/// by Environment != "Test", so on SQLite (test env) we exercise EF
/// EnsureCreatedAsync's own idempotency rather than the raw T-SQL guards.
/// The T-SQL guards themselves are exercised when deploying to a real SQL
/// Server (covered by manual deploy verification).
/// </summary>
public class BootstrapIdempotencyTests
{
    [Fact]
    public async Task Startup_Twice_OnSameDatabase_DoesNotCrash()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"bootstrap_idempotency_{Guid.NewGuid():N}.db");

        try
        {
            // First startup — creates schema
            await using (var f1 = BuildFactory(dbPath))
            using (var c1 = f1.CreateClient())
            {
                c1.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");
                var r1 = await c1.GetAsync("/api/protocols");
                r1.StatusCode.Should().Be(HttpStatusCode.OK,
                    "first startup must succeed and serve API");
            }

            // Second startup — schema already exists, must not throw
            await using (var f2 = BuildFactory(dbPath))
            using (var c2 = f2.CreateClient())
            {
                c2.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");
                var r2 = await c2.GetAsync("/api/protocols");
                r2.StatusCode.Should().Be(HttpStatusCode.OK,
                    "second startup on the same DB must not crash on duplicate schema");
            }
        }
        finally
        {
            if (File.Exists(dbPath))
            {
                try { File.Delete(dbPath); } catch { /* file lock OK */ }
            }
        }
    }

    [Fact]
    public async Task EnsureCreated_RunMultipleTimes_DoesNotThrow()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"ensurecreated_{Guid.NewGuid():N}.db");

        try
        {
            await using var factory = BuildFactory(dbPath);
            using var scope = factory.Services.CreateScope();
            var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();

            for (int i = 0; i < 3; i++)
            {
                await using var ctx = await dbFactory.CreateDbContextAsync();
                Func<Task> act = () => ctx.Database.EnsureCreatedAsync();
                await act.Should().NotThrowAsync(
                    $"iteration {i} of EnsureCreatedAsync must be a no-op when schema already exists");
            }
        }
        finally
        {
            if (File.Exists(dbPath))
            {
                try { File.Delete(dbPath); } catch { /* file lock OK */ }
            }
        }
    }

    private static WebApplicationFactory<Program> BuildFactory(string dbPath)
    {
        return new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    services.AddDbContextFactory<IoTDbContext>(opts =>
                        opts.UseSqlite($"Data Source={dbPath}"));
                });
                builder.ConfigureAppConfiguration(c =>
                {
                    c.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["WeChat:Enabled"] = "false",
                        ["FasApi:BaseUrl"] = "http://localhost:1",
                        ["FasApi:ApiKey"] = "test-key",
                        ["ConnectionStrings:DefaultConnection"] = $"Data Source={dbPath}",
                        ["Authentication:ApiKey"] = "test-api-key-123"
                    });
                });
                builder.UseEnvironment("Test");
            });
    }
}
