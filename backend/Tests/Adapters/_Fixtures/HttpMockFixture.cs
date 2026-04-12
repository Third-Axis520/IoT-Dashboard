using WireMock.Server;

namespace IoT.CentralApi.Tests.Adapters._Fixtures;

public sealed class HttpMockFixture : IAsyncDisposable
{
    public WireMockServer Server { get; }
    public string BaseUrl => Server.Url!;

    public HttpMockFixture()
    {
        Server = WireMockServer.Start();
    }

    public ValueTask DisposeAsync()
    {
        Server.Stop();
        Server.Dispose();
        return ValueTask.CompletedTask;
    }
}
