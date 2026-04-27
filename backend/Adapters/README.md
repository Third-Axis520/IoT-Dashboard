# Adapters

## 用途
協議插件 (Protocol Adapter)。每個 adapter 負責跟一種設備協議溝通，
把「掃描」和「讀取」抽象成統一介面 `IProtocolAdapter`。

## 關鍵檔案
- `Contracts/IProtocolAdapter.cs` — 介面契約 (不要動)
- `Contracts/Result.cs` — 統一錯誤回傳 (不要動)
- `_Template.cs` — 加新 adapter 的範本
- `PushIngestAdapter.cs` — 既有 push 流程的 adapter wrapper
- `ModbusTcpAdapter.cs` — Modbus TCP 實作
- `WebApiAdapter.cs` — HTTP REST 實作

## 如何新增一個 Adapter
1. 複製 `_Template.cs` 為 `<YourProtocol>Adapter.cs`
2. 改 class 名稱、`ProtocolId`、`DisplayName`
3. 設定 `SupportsDiscovery` / `SupportsLivePolling`
4. 在 `GetConfigSchema()` 宣告連線參數欄位
5. 實作 `ValidateConfig` / `DiscoverAsync` / `PollAsync`
6. 在 `Program.cs` 註冊：
   ```csharp
   builder.Services.AddSingleton<IProtocolAdapter, YourProtocolAdapter>();
   ```
7. 寫測試: `backend/Tests/Adapters/YourProtocolAdapterTests.cs`
8. 跑測試: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~YourProtocol"`

## 依賴
- `Models/Entities/DeviceConnection.cs` — 連線設定來自這裡
- `Services/DataIngestionService.cs` — Polling 後資料送進這裡處理
- `Services/PollingBackgroundService.cs` — 呼叫 PollAsync 的呼叫者

## ModbusTcpAdapter — FC02 離散輸入 (Discrete Input)

`ModbusTcpAdapter` 除了預設的 FC03 (Holding Register) 之外，支援 FC02 讀取離散輸入 (1-bit DI，例如光電感應器)。

在 `DeviceConnection.ConfigJson` 加入 `"function": "discrete"` 即可：

```json
{
  "host": "192.168.1.10",
  "port": 502,
  "slaveId": 1,
  "function": "discrete"
}
```

- 省略 `function` 或設為 `"holding"` → FC03 (預設)
- `"discrete"` → FC02，回傳值為 `0` 或`1`

離散輸入感測器通常作為「條件採樣」閘門來源；見下方 "Configure sensor gating"。

## 不要改動
- `Contracts/IProtocolAdapter.cs` — 改介面會影響所有 adapter，需要全部更新
- `Contracts/Result.cs` — 共用錯誤協定
- 各 adapter 的 `ProtocolId` 字串值 — 已存進 DB 的 DeviceConnection.Protocol
