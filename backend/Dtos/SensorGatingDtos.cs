namespace IoT.CentralApi.Dtos;

public record SensorGatingRuleDto(
    int Id,
    string GatedAssetCode,
    int GatedSensorId,
    string GatingAssetCode,
    int GatingSensorId,
    string? GatingSensorLabel,
    int DelayMs,
    int MaxAgeMs
);

public record UpdateGatingRulesRequest(
    List<SaveGatingRuleItem> Rules
);

public record SaveGatingRuleItem(
    int GatedSensorId,
    string GatingAssetCode,
    int GatingSensorId,
    int DelayMs = 0,
    // Default 10000ms — must be >= DI source pollIntervalMs (typically 5000ms),
    // otherwise the cache is treated as Stale and gated sensors get filtered out.
    int MaxAgeMs = 10000
);

public record GatingCandidateDto(
    string AssetCode,
    string AssetName,
    int SensorId,
    string SensorLabel,
    double? CurrentValue,
    DateTime? LastUpdate
);
