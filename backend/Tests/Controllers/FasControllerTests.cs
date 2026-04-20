using System.Net;
using System.Net.Http.Json;
using IoT.CentralApi.Dtos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using IoT.CentralApi.Data;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace IoT.CentralApi.Tests.Controllers;

public class FasControllerTests : IAsyncDisposable
{
    private readonly WireMockServer _fas = WireMockServer.Start();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;
    private string _dbPath = null!;

    private WebApplicationFactory<Program> BuildFactory(string? apiKey = "test-key")
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"iottest_{Guid.NewGuid():N}.db");

        return new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Test");
                builder.ConfigureServices(services =>
                {
                    services.AddDbContextFactory<IoTDbContext>(opts =>
                        opts.UseSqlite($"Data Source={_dbPath}"));
                });
                builder.ConfigureAppConfiguration(c =>
                {
                    c.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["FasApi:BaseUrl"] = _fas.Url + "/",
                        ["FasApi:ApiKey"] = apiKey ?? "",
                        ["WeChat:Enabled"] = "false",
                        ["Authentication:ApiKey"] = "test-api-key-123",
                        ["ConnectionStrings:DefaultConnection"] = $"Data Source={_dbPath}",
                    });
                });
            });
    }

    private static readonly string CategoriesJson = """
        [
            {"id":1,"parentID":0,"categoryCode":"A001","categoryName":"烘箱","description":"工業用烘箱"},
            {"id":2,"parentID":0,"categoryCode":"B002","categoryName":"壓縮機","description":null}
        ]
        """;

    [Fact]
    public async Task GetCategories_Returns200_WithCategoryList()
    {
        _fas.Given(Request.Create().WithPath("/api/external/categories").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody(CategoriesJson)
                .WithHeader("Content-Type", "application/json"));

        _factory = BuildFactory();
        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");

        using var scope = _factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();

        var response = await _client.GetAsync("/api/fas/categories");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var categories = await response.Content.ReadFromJsonAsync<FasCategoryDto[]>();
        categories.Should().HaveCount(2);
        categories![0].CategoryCode.Should().Be("A001");
        categories[0].CategoryName.Should().Be("烘箱");
        categories[0].Description.Should().Be("工業用烘箱");
        categories[1].CategoryCode.Should().Be("B002");
        categories[1].Description.Should().BeNull();
    }

    [Fact]
    public async Task GetCategories_Returns503_WhenFasUnreachable()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"iottest_{Guid.NewGuid():N}.db");
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Test");
                builder.ConfigureServices(services =>
                {
                    services.AddDbContextFactory<IoTDbContext>(opts =>
                        opts.UseSqlite($"Data Source={_dbPath}"));
                });
                builder.ConfigureAppConfiguration(c =>
                {
                    c.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["FasApi:BaseUrl"] = "http://localhost:1/",  // nothing listens here
                        ["FasApi:ApiKey"] = "test-key",
                        ["WeChat:Enabled"] = "false",
                        ["Authentication:ApiKey"] = "test-api-key-123",
                        ["ConnectionStrings:DefaultConnection"] = $"Data Source={_dbPath}",
                    });
                });
            });

        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");

        using var scope = _factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();

        var response = await _client.GetAsync("/api/fas/categories");

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task GetCategories_Returns503_WhenApiKeyEmpty()
    {
        _factory = BuildFactory(apiKey: "");
        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");

        using var scope = _factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();

        var response = await _client.GetAsync("/api/fas/categories");

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task GetCategories_Returns502_WhenFasReturns401()
    {
        _fas.Given(Request.Create().WithPath("/api/external/categories").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(401));

        _factory = BuildFactory();
        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");

        using var scope = _factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();

        var response = await _client.GetAsync("/api/fas/categories");

        response.StatusCode.Should().Be(HttpStatusCode.BadGateway);
    }

    public async ValueTask DisposeAsync()
    {
        _client?.Dispose();
        if (_factory != null) await _factory.DisposeAsync();
        _fas.Stop();
        _fas.Dispose();
        if (_dbPath != null && File.Exists(_dbPath))
        {
            try { File.Delete(_dbPath); } catch { /* file lock OK */ }
        }
    }
}
