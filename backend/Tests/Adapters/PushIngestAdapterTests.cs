using System.Text.Json;
using IoT.CentralApi.Adapters;
using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Tests.Adapters;

public class PushIngestAdapterTests
{
    private readonly PushIngestAdapter _sut = new();

    [Fact]
    public void ProtocolId_IsPushIngest()
    {
        _sut.ProtocolId.Should().Be("push_ingest");
    }

    [Fact]
    public void DisplayName_IsHumanReadable()
    {
        _sut.DisplayName.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void SupportsDiscovery_IsFalse()
    {
        _sut.SupportsDiscovery.Should().BeFalse();
    }

    [Fact]
    public void SupportsLivePolling_IsFalse()
    {
        _sut.SupportsLivePolling.Should().BeFalse();
    }

    [Fact]
    public void GetConfigSchema_ContainsSerialNumberField()
    {
        var schema = _sut.GetConfigSchema();
        schema.Fields.Should().Contain(f => f.Name == "serialNumber" && f.Required);
    }

    [Fact]
    public void ValidateConfig_AcceptsValidJson()
    {
        var json = JsonSerializer.Serialize(new { serialNumber = "OVEN-42" });
        var result = _sut.ValidateConfig(json);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ValidateConfig_RejectsMissingSerialNumber()
    {
        var json = JsonSerializer.Serialize(new { });
        var result = _sut.ValidateConfig(json);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateConfig_RejectsEmptySerialNumber()
    {
        var json = JsonSerializer.Serialize(new { serialNumber = "" });
        var result = _sut.ValidateConfig(json);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateConfig_RejectsInvalidJson()
    {
        var result = _sut.ValidateConfig("not a json");
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task DiscoverAsync_ReturnsUnknownProtocol()
    {
        var json = JsonSerializer.Serialize(new { serialNumber = "OVEN-42" });
        var result = await _sut.DiscoverAsync(json, CancellationToken.None);
        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.UnknownProtocol);
    }

    [Fact]
    public async Task PollAsync_ReturnsUnknownProtocol()
    {
        var json = JsonSerializer.Serialize(new { serialNumber = "OVEN-42" });
        var result = await _sut.PollAsync(json, CancellationToken.None);
        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.UnknownProtocol);
    }
}
