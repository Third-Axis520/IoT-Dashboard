namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// Discovery 階段回傳的單一資料點。
/// </summary>
public record DiscoveredPoint(
    string RawAddress,
    double CurrentValue,
    string DataType,
    string? SuggestedLabel = null);
