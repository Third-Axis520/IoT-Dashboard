using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Tests._Shared;

namespace IoT.CentralApi.Tests.Controllers;

public class GlobalErrorHandlerTests : IntegrationTestBase
{
    [Fact]
    public async Task UnhandledException_Returns500_WithErrorResponse()
    {
        var resp = await Client.GetAsync("/api/diagnostics/throw-test");

        resp.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        var body = await resp.Content.ReadFromJsonAsync<ErrorResponse>();
        body.Should().NotBeNull();
        body!.Code.Should().Be("internal_error");
    }

    [Fact]
    public async Task UnhandledException_DoesNotLeakStackTrace()
    {
        var resp = await Client.GetAsync("/api/diagnostics/throw-test");
        var raw = await resp.Content.ReadAsStringAsync();

        raw.Should().NotContain("at IoT.");
        raw.Should().NotContain("StackTrace");
    }
}
