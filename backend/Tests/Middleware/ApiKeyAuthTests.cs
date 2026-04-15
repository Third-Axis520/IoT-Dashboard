using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Tests._Shared;

namespace IoT.CentralApi.Tests.Middleware;

public class ApiKeyAuthTests : IntegrationTestBase
{
    [Fact]
    public async Task Request_WithoutApiKey_Returns401()
    {
        var client = Factory.CreateClient();
        // No X-Api-Key header

        var resp = await client.GetAsync("/api/diagnostics/polling");

        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var body = await resp.Content.ReadFromJsonAsync<ErrorResponse>();
        body!.Code.Should().Be("unauthorized");
    }

    [Fact]
    public async Task Request_WithWrongApiKey_Returns401()
    {
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", "wrong-key");

        var resp = await client.GetAsync("/api/diagnostics/polling");

        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Request_WithCorrectApiKey_Succeeds()
    {
        // Client from base class already has correct key
        var resp = await Client.GetAsync("/api/diagnostics/polling");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
