using IoT.CentralApi.Models;
using IoT.CentralApi.Services;

namespace IoT.CentralApi.Tests.Services;

public class PollingBackgroundServiceTests
{
    [Fact]
    public void GetHostKey_ParsesHostAndPort_FromValidConfigJson()
    {
        var dc = new DeviceConnection
        {
            Id = 1,
            Protocol = "modbus_tcp",
            ConfigJson = """{"host":"192.168.6.74","port":502,"unitId":1}""",
        };

        var key = PollingBackgroundService.GetHostKey(dc);

        Assert.Equal("192.168.6.74:502", key);
    }

    [Fact]
    public void GetHostKey_PortMissing_UsesDefaultLiteral()
    {
        var dc = new DeviceConnection
        {
            Id = 2,
            Protocol = "modbus_tcp",
            ConfigJson = """{"host":"plc-a.local"}""",
        };

        var key = PollingBackgroundService.GetHostKey(dc);

        Assert.Equal("plc-a.local:default", key);
    }

    [Fact]
    public void GetHostKey_HostMissing_FallsBackToConnIdKey()
    {
        var dc = new DeviceConnection
        {
            Id = 42,
            Protocol = "modbus_tcp",
            ConfigJson = """{"someOtherField":"value"}""",
        };

        var key = PollingBackgroundService.GetHostKey(dc);

        Assert.Equal("conn-42", key);
    }

    [Fact]
    public void GetHostKey_NullHost_FallsBackToConnIdKey()
    {
        var dc = new DeviceConnection
        {
            Id = 7,
            Protocol = "modbus_tcp",
            ConfigJson = """{"host":null,"port":502}""",
        };

        var key = PollingBackgroundService.GetHostKey(dc);

        Assert.Equal("conn-7", key);
    }

    [Fact]
    public void GetHostKey_InvalidJson_FallsBackToConnIdKey()
    {
        var dc = new DeviceConnection
        {
            Id = 99,
            Protocol = "modbus_tcp",
            ConfigJson = "not json at all",
        };

        var key = PollingBackgroundService.GetHostKey(dc);

        Assert.Equal("conn-99", key);
    }

    [Fact]
    public void GetHostKey_TwoConnectionsSameGateway_ShareKey()
    {
        var a = new DeviceConnection
        {
            Id = 8,
            Protocol = "modbus_tcp",
            ConfigJson = """{"host":"192.168.62.74","port":502,"unitId":1}""",
        };
        var b = new DeviceConnection
        {
            Id = 9,
            Protocol = "modbus_tcp",
            ConfigJson = """{"host":"192.168.62.74","port":502,"unitId":2}""",
        };

        Assert.Equal(PollingBackgroundService.GetHostKey(a), PollingBackgroundService.GetHostKey(b));
    }

    [Fact]
    public void GetHostKey_DifferentHosts_GetDistinctKeys()
    {
        var a = new DeviceConnection
        {
            Id = 1,
            Protocol = "modbus_tcp",
            ConfigJson = """{"host":"192.168.1.10","port":502}""",
        };
        var b = new DeviceConnection
        {
            Id = 2,
            Protocol = "modbus_tcp",
            ConfigJson = """{"host":"192.168.1.11","port":502}""",
        };

        Assert.NotEqual(PollingBackgroundService.GetHostKey(a), PollingBackgroundService.GetHostKey(b));
    }
}
