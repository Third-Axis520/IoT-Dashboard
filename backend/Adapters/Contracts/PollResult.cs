namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// Poll 階段回傳的當前讀值集合。Key = RawAddress，Value = 讀到的數值。
/// </summary>
public record PollResult(
    Dictionary<string, double> Values,
    DateTime Timestamp);
