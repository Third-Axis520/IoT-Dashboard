namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// Adapter 操作失敗的分類。決定 PollingBackgroundService 的重試策略：
///   - Transient: 自動退避重試
///   - InvalidConfig/Unauthorized/UnknownProtocol: 進入斷路器，30 秒慢重試
///   - DeviceError: 視訊息處理（通常 transient）
///   - Bug: 記 log，不影響其他 connection
/// </summary>
public enum ErrorKind
{
    None = 0,
    Transient,
    InvalidConfig,
    DeviceError,
    Unauthorized,
    UnknownProtocol,
    Bug,
}
