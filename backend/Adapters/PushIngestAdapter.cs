// ─────────────────────────────────────────────────────────────────────────────
// PushIngestAdapter — 外部推送協議的 adapter
// ─────────────────────────────────────────────────────────────────────────────
// 此 adapter 不主動連線、不輪詢。資料由外部 POST /api/data/ingest 推送。
// PollingBackgroundService 會跳過 protocol="push_ingest" 的 connection。
// Discovery 在前端透過 SSE 監聽 /api/stream 過濾 SN 來實現。
// ─────────────────────────────────────────────────────────────────────────────

using System.Text.Json;
using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Adapters;

public class PushIngestAdapter : IProtocolAdapter
{
    public string ProtocolId => "push_ingest";
    public string DisplayName => "外部推送";
    public bool SupportsDiscovery => false;
    public bool SupportsLivePolling => false;

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField(
                Name: "serialNumber",
                Type: "string",
                Label: "設備序號 (SN)",
                Required: true,
                Placeholder: "OVEN-42")
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        try
        {
            var config = JsonSerializer.Deserialize<PushIngestConfig>(configJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (config == null || string.IsNullOrWhiteSpace(config.SerialNumber))
                return ValidationResult.Invalid("serialNumber 不能為空");

            return ValidationResult.Valid();
        }
        catch (JsonException ex)
        {
            return ValidationResult.Invalid($"Config JSON 格式錯誤: {ex.Message}");
        }
    }

    public Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct)
    {
        return Task.FromResult(Result<DiscoveryResult>.Fail(
            ErrorKind.UnknownProtocol,
            "Push 模式不支援後端 discovery；請用前端 SSE 監聯即時樣本"));
    }

    public Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        return Task.FromResult(Result<PollResult>.Fail(
            ErrorKind.UnknownProtocol,
            "Push 模式不支援後端 polling；資料由外部 POST /api/data/ingest 推進來"));
    }
}
