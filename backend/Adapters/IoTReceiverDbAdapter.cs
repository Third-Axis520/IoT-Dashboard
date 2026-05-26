// ─────────────────────────────────────────────────────────────────────────────
// IoTReceiverDbAdapter — 從共用 DB 讀 IoTReceiverAPI 寫入的寬表
// ─────────────────────────────────────────────────────────────────────────────
// 兩張支援的表：
//   - PressingMachineRealTimeData    (壓合機，14 個數值欄位)
//   - VisualMarkingMachineRealTimeData (劃線機，Pressure 1 個欄位)
// 兩張表都由 IoTReceiverAPI 寫入（共用 IoTControlChart DB）。
// 本 adapter 不引入對應 entity，避免雙向 schema 耦合。
// ─────────────────────────────────────────────────────────────────────────────

using System.Text.Json;
using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Services;

namespace IoT.CentralApi.Adapters;

public class IoTReceiverDbAdapter(IIoTReceiverDataSource dataSource) : IProtocolAdapter
{
    public string ProtocolId => "iot_receiver_db";
    public string DisplayName => "IoT Receiver Shared DB";
    public bool SupportsDiscovery => false;
    public bool SupportsLivePolling => true;

    private static readonly IReadOnlyDictionary<string, string[]> TableNumericFields =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["PressingMachineRealTimeData"] =
            [
                "RunTimeSeconds", "OperateTimeSeconds",
                "LeftPressCount", "LeftCycleTime", "LeftPressDuration",
                "RightPressCount", "RightCycleTime", "RightPressDuration",
                "LeftTighteningPressure", "LeftSecondaryPressure", "LeftEdgePressure",
                "RightTighteningPressure", "RightSecondaryPressure", "RightEdgePressure",
            ],
            ["VisualMarkingMachineRealTimeData"] = ["Pressure"],
        };

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField(
                Name: "tableName",
                Type: "enum",
                Label: "資料表",
                Required: true,
                Options: [..TableNumericFields.Keys]),
            new ConfigField(
                Name: "assetCode",
                Type: "string",
                Label: "AssetCode",
                Required: true,
                Placeholder: "0000020881"),
            new ConfigField(
                Name: "maxAgeMs",
                Type: "number",
                Label: "最大資料年齡 (ms)",
                Required: false,
                DefaultValue: "30000"),
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        if (!TryParse(configJson, out var cfg, out var err))
            return ValidationResult.Invalid(err!);
        if (!TableNumericFields.ContainsKey(cfg!.TableName))
            return ValidationResult.Invalid($"tableName '{cfg.TableName}' 不在白名單");
        if (string.IsNullOrWhiteSpace(cfg.AssetCode))
            return ValidationResult.Invalid("assetCode 不可為空");
        if (cfg.MaxAgeMs < 5000)
            return ValidationResult.Invalid("maxAgeMs 必須 ≥ 5000");
        return ValidationResult.Valid();
    }

    public Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct) =>
        Task.FromResult(Result<DiscoveryResult>.Fail(
            ErrorKind.UnknownProtocol, "iot_receiver_db 不支援 discovery（欄位固定）"));

    public async Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        if (!TryParse(configJson, out var cfg, out var err))
            return Result<PollResult>.Fail(ErrorKind.InvalidConfig, err!);

        if (!TableNumericFields.TryGetValue(cfg!.TableName, out var allowedFields))
            return Result<PollResult>.Fail(ErrorKind.InvalidConfig,
                $"tableName '{cfg.TableName}' 不在白名單");

        IReadOnlyDictionary<string, object>? row;
        try
        {
            row = await dataSource.ReadLatestRowAsync(cfg.TableName, cfg.AssetCode, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Result<PollResult>.Fail(ErrorKind.Transient,
                $"讀 DB 失敗: {ex.GetType().Name}: {ex.Message}");
        }

        if (row == null)
            return Result<PollResult>.Fail(ErrorKind.DeviceError,
                $"找不到 AssetCode '{cfg.AssetCode}' 的資料");

        if (!row.TryGetValue("RecordTime", out var rtObj) || rtObj is not DateTime rt)
            return Result<PollResult>.Fail(ErrorKind.DeviceError,
                "row 缺少 RecordTime 欄位");

        var ageMs = (DateTime.UtcNow - DateTime.SpecifyKind(rt, DateTimeKind.Utc)).TotalMilliseconds;
        if (ageMs > cfg.MaxAgeMs)
            return Result<PollResult>.Fail(ErrorKind.Transient,
                $"資料過舊 ({ageMs:F0}ms > {cfg.MaxAgeMs}ms)");

        var values = new Dictionary<string, double>(allowedFields.Length, StringComparer.Ordinal);
        foreach (var field in allowedFields)
        {
            if (row.TryGetValue(field, out var val) && val is not DBNull && TryToDouble(val, out var d))
                values[field] = d;
        }

        if (values.Count == 0)
            return Result<PollResult>.Fail(ErrorKind.DeviceError,
                $"row 沒有任何可解析的數值欄位");

        return Result<PollResult>.Ok(new PollResult(values, DateTime.UtcNow));
    }

    private static bool TryParse(string json, out IoTReceiverDbConfig? cfg, out string? err)
    {
        cfg = null;
        try
        {
            cfg = JsonSerializer.Deserialize<IoTReceiverDbConfig>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (cfg == null) { err = "Config 不可為空"; return false; }
            err = null;
            return true;
        }
        catch (JsonException ex)
        {
            err = $"Config JSON 格式錯誤: {ex.Message}";
            return false;
        }
    }

    private static bool TryToDouble(object val, out double result)
    {
        switch (val)
        {
            case double d:  result = d; return true;
            case decimal m: result = (double)m; return true;
            case int i:     result = i; return true;
            case long l:    result = l; return true;
            case float f:   result = f; return true;
            case short s:   result = s; return true;
            default:        result = 0; return false;
        }
    }
}
