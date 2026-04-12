// ─────────────────────────────────────────────────────────────────────────────
// IProtocolAdapter — 協議適配器契約
// ─────────────────────────────────────────────────────────────────────────────
// 每個協議實作此介面 (Modbus TCP / WebAPI / Push Ingest...)
//
// 規則:
//   1. 絕不 throw exception (除了 OperationCanceledException)
//   2. 所有失敗包進 Result<T>.Fail，含 ErrorKind 和訊息
//   3. ProtocolId 不可改 (已存進 DB 的 DeviceConnection.Protocol)
//   4. ConfigSchema 是給前端動態渲染表單用的契約
//
// 註冊方式 (Program.cs):
//   builder.Services.AddSingleton<IProtocolAdapter, YourAdapter>();
//
// PollingBackgroundService 透過 IEnumerable<IProtocolAdapter> 取得全部 adapter，
// 再用 ProtocolId 字串比對找對應的那個。
// ─────────────────────────────────────────────────────────────────────────────

namespace IoT.CentralApi.Adapters.Contracts;

public interface IProtocolAdapter
{
    string ProtocolId { get; }
    string DisplayName { get; }
    bool SupportsDiscovery { get; }
    bool SupportsLivePolling { get; }
    ConfigSchema GetConfigSchema();
    ValidationResult ValidateConfig(string configJson);
    Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct);
    Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct);
}
