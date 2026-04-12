using System.Text.Json;
using IoT.CentralApi.Adapters;
using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Tests.Adapters._Fixtures;
using Microsoft.Extensions.DependencyInjection;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;

namespace IoT.CentralApi.Tests.Adapters;

public class WebApiAdapterTests : IAsyncDisposable
{
    private readonly HttpMockFixture _fixture = new();

    private static WebApiAdapter CreateAdapter()
    {
        var services = new ServiceCollection();
        services.AddHttpClient("WebApiAdapter");
        var sp = services.BuildServiceProvider();
        return new WebApiAdapter(sp.GetRequiredService<IHttpClientFactory>());
    }

    private const string SensorArrayJson = """
        {
            "data": {
                "sensors": [
                    {"name": "temp1",   "value": 155.3},
                    {"name": "humid1",  "value": 60.1}
                ]
            }
        }
        """;

    // ── Identity ───────────────────────────────────────────────────────────────

    [Fact]
    public void ProtocolId_IsWebApi()
    {
        var sut = CreateAdapter();
        sut.ProtocolId.Should().Be("web_api");
    }

    // ── Schema ─────────────────────────────────────────────────────────────────

    [Fact]
    public void GetConfigSchema_ContainsRequiredFields()
    {
        var sut = CreateAdapter();
        var schema = sut.GetConfigSchema();
        var names = schema.Fields.Select(f => f.Name).ToList();

        names.Should().Contain("url");
        names.Should().Contain("method");
        names.Should().Contain("headers");
        names.Should().Contain("jsonPathRoot");
        names.Should().Contain("keyField");
        names.Should().Contain("valueField");
        schema.Fields.Should().HaveCount(6);
    }

    // ── ValidateConfig ─────────────────────────────────────────────────────────

    [Fact]
    public void ValidateConfig_AcceptsValidConfig()
    {
        var sut = CreateAdapter();
        var json = JsonSerializer.Serialize(new
        {
            url = "https://api.example.com/sensors",
            method = "GET",
            jsonPathRoot = "$.data.sensors",
            keyField = "name",
            valueField = "value"
        });

        var result = sut.ValidateConfig(json);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ValidateConfig_RejectsInvalidUrl()
    {
        var sut = CreateAdapter();
        var json = JsonSerializer.Serialize(new
        {
            url = "not-a-valid-url",
            method = "GET",
            jsonPathRoot = "$"
        });

        var result = sut.ValidateConfig(json);
        result.IsValid.Should().BeFalse();
        result.Error.Should().Contain("url");
    }

    [Fact]
    public void ValidateConfig_RejectsInvalidJson()
    {
        var sut = CreateAdapter();
        var result = sut.ValidateConfig("not a json");
        result.IsValid.Should().BeFalse();
    }

    // ── Discover (happy path) ──────────────────────────────────────────────────

    [Fact]
    public async Task Discover_ReadsJsonArrayAndExtractsPoints()
    {
        _fixture.Server
            .Given(Request.Create().WithPath("/api/sensors").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody(SensorArrayJson));

        var sut = CreateAdapter();
        var json = JsonSerializer.Serialize(new
        {
            url = $"{_fixture.BaseUrl}/api/sensors",
            method = "GET",
            jsonPathRoot = "$.data.sensors",
            keyField = "name",
            valueField = "value"
        });

        var result = await sut.DiscoverAsync(json, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Points.Should().HaveCount(2);

        var byName = result.Value.Points.ToDictionary(p => p.RawAddress, p => p.CurrentValue);
        byName["temp1"].Should().Be(155.3);
        byName["humid1"].Should().Be(60.1);
    }

    // ── Discover (401) ────────────────────────────────────────────────────────

    [Fact]
    public async Task Discover_ReturnsUnauthorized_When401()
    {
        _fixture.Server
            .Given(Request.Create().WithPath("/api/protected").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(401));

        var sut = CreateAdapter();
        var json = JsonSerializer.Serialize(new
        {
            url = $"{_fixture.BaseUrl}/api/protected",
            method = "GET",
            jsonPathRoot = "$"
        });

        var result = await sut.DiscoverAsync(json, CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.Unauthorized);
    }

    // ── Discover (path not found) ──────────────────────────────────────────────

    [Fact]
    public async Task Discover_ReturnsDeviceError_WhenJsonPathNotFound()
    {
        _fixture.Server
            .Given(Request.Create().WithPath("/api/other").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""{"result": "ok"}"""));

        var sut = CreateAdapter();
        var json = JsonSerializer.Serialize(new
        {
            url = $"{_fixture.BaseUrl}/api/other",
            method = "GET",
            jsonPathRoot = "$.data.sensors",  // path doesn't exist
            keyField = "name",
            valueField = "value"
        });

        var result = await sut.DiscoverAsync(json, CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.DeviceError);
    }

    // ── Poll (happy path) ──────────────────────────────────────────────────────

    [Fact]
    public async Task Poll_ReturnsValuesKeyedByName()
    {
        _fixture.Server
            .Given(Request.Create().WithPath("/api/poll").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody(SensorArrayJson));

        var sut = CreateAdapter();
        var json = JsonSerializer.Serialize(new
        {
            url = $"{_fixture.BaseUrl}/api/poll",
            method = "GET",
            jsonPathRoot = "$.data.sensors",
            keyField = "name",
            valueField = "value"
        });

        var result = await sut.PollAsync(json, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Values.Should().ContainKey("temp1").WhoseValue.Should().Be(155.3);
        result.Value.Values.Should().ContainKey("humid1").WhoseValue.Should().Be(60.1);
        result.Value.Timestamp.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    // ── Discover (JObject root) ────────────────────────────────────────────────

    [Fact]
    public async Task Discover_ReadsJObjectAndExtractsProperties()
    {
        _fixture.Server
            .Given(Request.Create().WithPath("/api/flat").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""{"temperature": 72.5, "humidity": 45.0}"""));

        var sut = CreateAdapter();
        var json = JsonSerializer.Serialize(new
        {
            url = $"{_fixture.BaseUrl}/api/flat",
            method = "GET",
            jsonPathRoot = "$",   // root is already the object
            keyField = "name",
            valueField = "value"
        });

        var result = await sut.DiscoverAsync(json, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Points.Should().HaveCount(2);
        var byName = result.Value.Points.ToDictionary(p => p.RawAddress, p => p.CurrentValue);
        byName["temperature"].Should().Be(72.5);
        byName["humidity"].Should().Be(45.0);
    }

    // ── Discover (non-success HTTP status) ────────────────────────────────────

    [Fact]
    public async Task Discover_ReturnsDeviceError_WhenServerReturns500()
    {
        _fixture.Server
            .Given(Request.Create().WithPath("/api/broken").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(500));

        var sut = CreateAdapter();
        var json = JsonSerializer.Serialize(new
        {
            url = $"{_fixture.BaseUrl}/api/broken",
            method = "GET",
            jsonPathRoot = "$"
        });

        var result = await sut.DiscoverAsync(json, CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.DeviceError);
    }

    public ValueTask DisposeAsync() => _fixture.DisposeAsync();
}
