namespace IoT.CentralApi.Models;

// ── Ingest（OvenDataReceive → Central API）─────────────────────────────────

public class IngestPayload
{
    /// <summary>
    /// AssetCode to write readings under. Required.
    /// Previously callers sent SerialNumber and the backend looked up AssetCode
    /// via the now-removed Devices table. New callers should set AssetCode directly.
    /// </summary>
    public string AssetCode { get; set; } = "";
    /// <summary>Legacy field — kept for wire compatibility but no longer used.</summary>
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

public class SensorLimitDto : System.ComponentModel.DataAnnotations.IValidatableObject
{
    public int SensorId { get; set; }
    public string? SensorName { get; set; }

    [System.ComponentModel.DataAnnotations.Range(0, 9999, ErrorMessage = "UCL 必須在 0~9999 之間")]
    public double UCL { get; set; }

    [System.ComponentModel.DataAnnotations.Range(0, 9999, ErrorMessage = "LCL 必須在 0~9999 之間")]
    public double LCL { get; set; }

    [System.ComponentModel.DataAnnotations.MaxLength(10)]
    public string Unit { get; set; } = "℃";

    public IEnumerable<System.ComponentModel.DataAnnotations.ValidationResult> Validate(
        System.ComponentModel.DataAnnotations.ValidationContext validationContext)
    {
        if (UCL < LCL)
            yield return new System.ComponentModel.DataAnnotations.ValidationResult(
                "UCL 必須大於或等於 LCL",
                [nameof(UCL), nameof(LCL)]);
    }
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

// ── (Devices / RegisterMap / PlcTemplate DTOs removed — entities dropped in Task 4.2) ──
