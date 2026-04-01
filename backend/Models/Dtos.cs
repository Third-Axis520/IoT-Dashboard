namespace IoT.CentralApi.Models;

// ── Ingest（OvenDataReceive → Central API）─────────────────────────────────

public class IngestPayload
{
    public string SerialNumber { get; set; } = "";
    public long Timestamp { get; set; }
    public bool IsConnected { get; set; }
    public List<SensorReading_Dto> Sensors { get; set; } = [];
}

public class SensorReading_Dto
{
    public int Id { get; set; }
    public double Value { get; set; }
    public string? Error { get; set; }
}

// ── SSE 推送（Central API → Dashboard）────────────────────────────────────

public class SseDataUpdate
{
    public string AssetCode { get; set; } = "";
    public string? AssetName { get; set; }
    public long Timestamp { get; set; }
    public bool IsConnected { get; set; }
    public List<SseSensorItem> Sensors { get; set; } = [];
}

public class SseSensorItem
{
    public int Id { get; set; }
    public double Value { get; set; }
    public double Ucl { get; set; }
    public double Lcl { get; set; }
    public string? Error { get; set; }
}

// ── Limits API ──────────────────────────────────────────────────────────────

public class SensorLimitDto
{
    public int SensorId { get; set; }
    public string? SensorName { get; set; }
    public double UCL { get; set; }
    public double LCL { get; set; }
    public string Unit { get; set; } = "℃";
}

public class UpdateLimitsRequest
{
    public List<SensorLimitDto> Limits { get; set; } = [];
}

// ── History API ─────────────────────────────────────────────────────────────

public class HistoryPoint
{
    public long Time { get; set; }
    public double Value { get; set; }
}

// ── Alerts API ──────────────────────────────────────────────────────────────

public class AlertDto
{
    public long Id { get; set; }
    public string AssetCode { get; set; } = "";
    public int SensorId { get; set; }
    public string? SensorName { get; set; }
    public double Value { get; set; }
    public double LimitValue { get; set; }
    public string AlertType { get; set; } = "";
    public string Severity { get; set; } = "";
    public long Timestamp { get; set; }
    public bool IsAcknowledged { get; set; }
}

// ── Asset API ────────────────────────────────────────────────────────────────

public class AssetInfoDto
{
    public string AssetCode { get; set; } = "";
    public string? AssetName { get; set; }
    public string? NickName { get; set; }
    public string? DepartmentName { get; set; }
    public string? SupplierName { get; set; }
    public string? Spec { get; set; }
}

// ── Devices API ──────────────────────────────────────────────────────────────

public class DeviceDto
{
    public int Id { get; set; }
    public string SerialNumber { get; set; } = "";
    public string? IpAddress { get; set; }
    public string? AssetCode { get; set; }
    public string? FriendlyName { get; set; }
    public string? AssetName { get; set; }
    public string? DepartmentName { get; set; }
    public DateTime FirstSeen { get; set; }
    public DateTime LastSeen { get; set; }
    public bool IsBound => AssetCode != null;
}

public class BindDeviceRequest
{
    public string AssetCode { get; set; } = "";
    public string? FriendlyName { get; set; }
}

public class RegisterDeviceRequest
{
    public string SerialNumber { get; set; } = "";
    public string? FriendlyName { get; set; }
}
