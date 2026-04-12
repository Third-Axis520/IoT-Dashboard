namespace IoT.CentralApi.Dtos;

/// <summary>
/// 統一錯誤回應格式。所有 controller 在錯誤時回傳這個結構。
/// </summary>
public record ErrorResponse(
    string Code,
    string Message,
    object? Details = null);
