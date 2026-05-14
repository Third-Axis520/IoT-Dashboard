using IoT.CentralApi.Models;
using IoT.CentralApi.Services;

namespace IoT.CentralApi.Tests.Services;

/// <summary>
/// Direct unit tests for DataIngestionService.BuildSseSensors. The SSE path
/// in ProcessAsync is gated on SseHub.ConnectionCount > 0, which makes it
/// impractical to exercise in integration tests (the in-memory factory has
/// zero subscribers). Testing the helper directly verifies the per-sensor
/// gating predicate stays in lockstep with the DB readings filter.
/// </summary>
public class DataIngestionServiceSseSensorsTests
{
    private static readonly Dictionary<int, SensorLimit> EmptyLimits = new();

    private static List<SensorReading_Dto> Payload(params (int id, double value)[] sensors)
        => sensors.Select(s => new SensorReading_Dto { Id = s.id, Value = s.value }).ToList();

    [Fact]
    public void BuildSseSensors_NoGating_IncludesAllSensors()
    {
        var result = DataIngestionService.BuildSseSensors(
            Payload((101, 72.1), (102, 33.0)),
            EmptyLimits,
            isBlockedByNewGating: _ => false);

        Assert.Equal(2, result.Count);
        Assert.Contains(result, s => s.Id == 101 && s.Value == 72.1);
        Assert.Contains(result, s => s.Id == 102 && s.Value == 33.0);
    }

    [Fact]
    public void BuildSseSensors_FiltersOutGatedSensors()
    {
        // SensorGatingRule path: 102 is blocked → drops from SSE just like it
        // drops from the DB write.
        var result = DataIngestionService.BuildSseSensors(
            Payload((101, 72.1), (102, 33.0), (103, 50.0)),
            EmptyLimits,
            isBlockedByNewGating: id => id == 102);

        Assert.Equal(2, result.Count);
        Assert.DoesNotContain(result, s => s.Id == 102);
        Assert.Contains(result, s => s.Id == 101);
        Assert.Contains(result, s => s.Id == 103);
    }

    [Fact]
    public void BuildSseSensors_AppliesLimitsWhenPresent()
    {
        var limits = new Dictionary<int, SensorLimit>
        {
            [101] = new() { AssetCode = "A", SensorId = 101, UCL = 100.0, LCL = 0.0 },
        };

        var result = DataIngestionService.BuildSseSensors(
            Payload((101, 72.1), (102, 33.0)),
            limits,
            isBlockedByNewGating: _ => false);

        var s101 = result.Single(s => s.Id == 101);
        Assert.Equal(100.0, s101.Ucl);
        Assert.Equal(0.0, s101.Lcl);

        var s102 = result.Single(s => s.Id == 102);
        // No limit for 102 → defaults to 0/0
        Assert.Equal(0, s102.Ucl);
        Assert.Equal(0, s102.Lcl);
    }

    [Fact]
    public void BuildSseSensors_EmptyPayload_ReturnsEmpty()
    {
        var result = DataIngestionService.BuildSseSensors(
            Payload(),
            EmptyLimits,
            isBlockedByNewGating: _ => false);

        Assert.Empty(result);
    }
}
