using System.Text.Json;
using IoT.CentralApi.Adapters;
using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Services;

namespace IoT.CentralApi.Tests.Adapters;

public class IoTReceiverDbAdapterTests
{
    private sealed class StubDataSource : IIoTReceiverDataSource
    {
        public IReadOnlyDictionary<string, object>? NextRow { get; set; }
        public Exception? NextException { get; set; }
        public (string Table, string Asset)? LastCall { get; private set; }

        public Task<IReadOnlyDictionary<string, object>?> ReadLatestRowAsync(
            string tableName, string assetCode, CancellationToken ct)
        {
            LastCall = (tableName, assetCode);
            if (NextException != null) throw NextException;
            return Task.FromResult(NextRow);
        }
    }

    private static (IoTReceiverDbAdapter Adapter, StubDataSource Ds) CreateSut()
    {
        var ds = new StubDataSource();
        return (new IoTReceiverDbAdapter(ds), ds);
    }

    private static string Cfg(string table, string asset, int maxAgeMs = 30000) =>
        JsonSerializer.Serialize(new { tableName = table, assetCode = asset, maxAgeMs });

    // ── Identity ───────────────────────────────────────────────────────────────

    [Fact]
    public void ProtocolId_IsIoTReceiverDb()
    {
        var (sut, _) = CreateSut();
        sut.ProtocolId.Should().Be("iot_receiver_db");
    }

    [Fact]
    public void SupportsDiscovery_IsFalse()
    {
        var (sut, _) = CreateSut();
        sut.SupportsDiscovery.Should().BeFalse();
    }

    // ── ValidateConfig ─────────────────────────────────────────────────────────

    [Fact]
    public void ValidateConfig_AcceptsKnownTable()
    {
        var (sut, _) = CreateSut();
        sut.ValidateConfig(Cfg("PressingMachineRealTimeData", "0000020881"))
           .IsValid.Should().BeTrue();
    }

    [Fact]
    public void ValidateConfig_RejectsUnknownTable()
    {
        var (sut, _) = CreateSut();
        var r = sut.ValidateConfig(Cfg("Other", "x"));
        r.IsValid.Should().BeFalse();
        r.Error.Should().Contain("白名單");
    }

    [Fact]
    public void ValidateConfig_RejectsEmptyAssetCode()
    {
        var (sut, _) = CreateSut();
        var r = sut.ValidateConfig(Cfg("PressingMachineRealTimeData", ""));
        r.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateConfig_RejectsTooSmallMaxAge()
    {
        var (sut, _) = CreateSut();
        var r = sut.ValidateConfig(Cfg("PressingMachineRealTimeData", "x", maxAgeMs: 1000));
        r.IsValid.Should().BeFalse();
    }

    // ── PollAsync happy path ───────────────────────────────────────────────────

    [Fact]
    public async Task PollAsync_PressingMachine_ReturnsAllNumericFields()
    {
        var (sut, ds) = CreateSut();
        ds.NextRow = new Dictionary<string, object>
        {
            ["RecordTime"] = DateTime.UtcNow.AddSeconds(-5),
            ["RunTimeSeconds"] = 3600,
            ["OperateTimeSeconds"] = 3500,
            ["LeftPressCount"] = 100,
            ["LeftCycleTime"] = 30.5m,
            ["LeftPressDuration"] = 5.2m,
            ["RightPressCount"] = 98,
            ["RightCycleTime"] = 30.8m,
            ["RightPressDuration"] = 5.3m,
            ["LeftTighteningPressure"] = 12.5m,
            ["LeftSecondaryPressure"] = 8.3m,
            ["LeftEdgePressure"] = 6.1m,
            ["RightTighteningPressure"] = 12.6m,
            ["RightSecondaryPressure"] = 8.4m,
            ["RightEdgePressure"] = 6.2m,
            // 字串欄位應該被過濾掉
            ["AssetCode"] = "0000020881",
            ["AssetName"] = "test",
        };

        var r = await sut.PollAsync(
            Cfg("PressingMachineRealTimeData", "0000020881"), CancellationToken.None);

        r.IsSuccess.Should().BeTrue();
        r.Value!.Values.Should().HaveCount(14);
        r.Value.Values["LeftTighteningPressure"].Should().Be(12.5);
        r.Value.Values.Should().NotContainKey("AssetCode");
    }

    [Fact]
    public async Task PollAsync_VisualMarking_OnlyPressure()
    {
        var (sut, ds) = CreateSut();
        ds.NextRow = new Dictionary<string, object>
        {
            ["RecordTime"] = DateTime.UtcNow,
            ["Pressure"] = 12,
            ["AssetCode"] = "0000020882",
        };

        var r = await sut.PollAsync(
            Cfg("VisualMarkingMachineRealTimeData", "0000020882"), CancellationToken.None);

        r.IsSuccess.Should().BeTrue();
        r.Value!.Values.Keys.Should().BeEquivalentTo(["Pressure"]);
        r.Value.Values["Pressure"].Should().Be(12);
    }

    // ── PollAsync error paths ──────────────────────────────────────────────────

    [Fact]
    public async Task PollAsync_RowNotFound_ReturnsDeviceError()
    {
        var (sut, ds) = CreateSut();
        ds.NextRow = null;

        var r = await sut.PollAsync(
            Cfg("PressingMachineRealTimeData", "missing"), CancellationToken.None);

        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.DeviceError);
    }

    [Fact]
    public async Task PollAsync_DataTooOld_ReturnsTransient()
    {
        var (sut, ds) = CreateSut();
        ds.NextRow = new Dictionary<string, object>
        {
            ["RecordTime"] = DateTime.UtcNow.AddMinutes(-5),  // 300s > default 30s maxAge
            ["Pressure"] = 12,
        };

        var r = await sut.PollAsync(
            Cfg("VisualMarkingMachineRealTimeData", "x"), CancellationToken.None);

        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.Transient);
        r.ErrorMessage.Should().Contain("過舊");
    }

    [Fact]
    public async Task PollAsync_DataSourceThrows_ReturnsTransient()
    {
        var (sut, ds) = CreateSut();
        ds.NextException = new InvalidOperationException("DB down");

        var r = await sut.PollAsync(
            Cfg("PressingMachineRealTimeData", "x"), CancellationToken.None);

        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.Transient);
    }

    [Fact]
    public async Task PollAsync_InvalidJson_ReturnsInvalidConfig()
    {
        var (sut, _) = CreateSut();
        var r = await sut.PollAsync("not json", CancellationToken.None);
        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.InvalidConfig);
    }

    // ── Discovery ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task DiscoverAsync_AlwaysFails()
    {
        var (sut, _) = CreateSut();
        var r = await sut.DiscoverAsync(
            Cfg("PressingMachineRealTimeData", "x"), CancellationToken.None);
        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.UnknownProtocol);
    }
}
