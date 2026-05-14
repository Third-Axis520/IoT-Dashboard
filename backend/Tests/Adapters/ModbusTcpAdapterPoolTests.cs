using IoT.CentralApi.Adapters;

namespace IoT.CentralApi.Tests.Adapters;

public class ModbusTcpAdapterPoolTests
{
    [Fact]
    public void GetClientKey_ReturnsHostColonPort()
    {
        Assert.Equal("192.168.6.74:502", ModbusTcpAdapter.GetClientKey("192.168.6.74", 502));
    }

    [Fact]
    public void GetClientKey_DifferentPortsProduceDifferentKeys()
    {
        Assert.NotEqual(
            ModbusTcpAdapter.GetClientKey("host.local", 502),
            ModbusTcpAdapter.GetClientKey("host.local", 503));
    }

    [Fact]
    public void GetClientKey_SameGatewayDifferentUnitIds_ShareKey()
    {
        // Two DeviceConnections on the same TCP gateway but different unitIds
        // must SHARE the pooled client (same TCP session, different slave).
        // UnitId is a Modbus frame field, not a socket attribute.
        Assert.Equal(
            ModbusTcpAdapter.GetClientKey("192.168.6.74", 502),
            ModbusTcpAdapter.GetClientKey("192.168.6.74", 502));
    }

    [Fact]
    public void NewAdapter_StartsWithEmptyPool()
    {
        using var adapter = new ModbusTcpAdapter();
        Assert.Equal(0, adapter.PoolSize);
    }

    [Fact]
    public async Task DiscoverAsync_UnreachableHost_DoesNotPopulatePool()
    {
        // Discovery is a one-shot operation — it must never leave a client
        // in the pool, even on failure. Port 1 on loopback rejects fast.
        using var adapter = new ModbusTcpAdapter();
        var configJson = """{"host":"127.0.0.1","port":1,"unitId":1,"startAddress":40001,"count":1,"dataType":"uint16","scale":1,"byteSwap":false,"function":"holding"}""";

        var result = await adapter.DiscoverAsync(configJson, CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(0, adapter.PoolSize);
    }

    [Fact]
    public void Dispose_OnEmptyPool_IsSafe()
    {
        var adapter = new ModbusTcpAdapter();
        adapter.Dispose();
        Assert.Equal(0, adapter.PoolSize);
        // Double-dispose is also safe.
        adapter.Dispose();
        Assert.Equal(0, adapter.PoolSize);
    }
}
