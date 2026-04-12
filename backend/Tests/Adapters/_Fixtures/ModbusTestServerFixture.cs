using System.Net;
using System.Net.Sockets;
using FluentModbus;

namespace IoT.CentralApi.Tests.Adapters._Fixtures;

public sealed class ModbusTestServerFixture : IAsyncDisposable
{
    public int Port { get; private set; }
    public ModbusTcpServer Server { get; private set; } = null!;

    public static async Task<ModbusTestServerFixture> StartAsync()
    {
        var fixture = new ModbusTestServerFixture { Port = GetFreePort() };
        // isAsynchronous=true: each client request is processed immediately
        fixture.Server = new ModbusTcpServer(isAsynchronous: true);
        fixture.Server.Start(new IPEndPoint(IPAddress.Loopback, fixture.Port));
        await Task.Delay(200);  // give server time to start
        return fixture;
    }

    public void SetRegister(int offset, short value)
    {
        // unitId=0 means "use default unit identifier" (single-unit mode)
        var registers = Server.GetHoldingRegisters(unitIdentifier: 0);
        registers[offset] = value;
    }

    public ValueTask DisposeAsync()
    {
        try { Server?.Stop(); } catch { }
        return ValueTask.CompletedTask;
    }

    private static int GetFreePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}
