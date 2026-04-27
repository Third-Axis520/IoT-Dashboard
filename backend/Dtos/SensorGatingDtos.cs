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
    int MaxAgeMs = 1000
);

public record GatingCandidateDto(
    string AssetCode,
    string AssetName,
    int SensorId,
    string SensorLabel,
    double? CurrentValue,
    DateTime? LastUpdate
);
