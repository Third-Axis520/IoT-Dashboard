# Per-Host TCP Socket Pool Design (C-2)

**狀態**：📋 ready for impl（建議在 C-1 上線穩定 1-2 天後動工）
**識別日期**：2026-05-13（LeanA incident follow-up）
**估時**：2-3 天

---

## 1. 動機與 vs C-1 區別

C-1（commit `d0308fe`）已把同 host:port 的 poll 串行化。但**每次 poll 仍然新開一條 TCP 連線**（FluentModbus 的 `ModbusTcpClient.Connect()` 跟 `Disconnect()` 寫在 ModbusTcpAdapter line 199 / 244）。

對 gateway 而言：
- C-1 之前：N 個並發 TCP connect + N 個 read + N 個 close（per tick）
- C-1 之後：1 個 connect + 1 read + 1 close 序列重複 N 次 per tick

仍然有 N 次 TCP socket open/close cycle。某些 gateway 對 TCP session re-establishment 有冷卻期，造成偶發 IOException。

**C-2 目標**：每個 host:port 只開**一條長連線**，所有 read 共用，減少 socket churn。

## 2. 設計挑戰

**主要難題**：現行 `IProtocolAdapter.PollAsync(string configJson, CancellationToken)` 介面把連線生命週期完全藏在 adapter 內部。CLAUDE.md 明確禁止改這個介面。

兩條路：

### 路徑 A — Adapter 內部加 connection pool（介面不變）

在 `ModbusTcpAdapter` 內部維護 `ConcurrentDictionary<string, ModbusTcpClient>`，每次 PollAsync 重用既有 client。

- ✅ 介面不變、 backward compat 100%
- ⚠️ 只影響 Modbus adapter；WebApi 等其他 adapter 需各自實作
- ⚠️ client 失效（被 server 主動 close、被 firewall reset）時要偵測 + reconnect
- ⚠️ client 是 thread-unsafe？FluentModbus 的 ModbusTcpClient 並非 thread-safe，所以仍需要 lock。但 lock 已由 C-1 的 semaphore 提供 → **C-1 是 C-2 的前置條件**
- ⚠️ Disposal：service 停止時要關掉所有 socket

### 路徑 B — 新抽象層 `IGatewaySession` 包在 adapter 之上

`PollingBackgroundService` 跟 `IGatewaySession` 互動，session 管理 socket lifecycle。Adapter 變成「給定一個 connected client，做 read」的純函數。

- ⚠️ 重大重構，會動 IProtocolAdapter（除非用裝飾器 / 雙介面並存）
- ✅ 跨 protocol 統一 socket 管理
- ❌ CLAUDE.md 限制 → 推遲

**推薦路徑 A**：實作 Modbus-specific 的 reusable client，介面不變。

## 3. 路徑 A 詳細設計

### 3.1 ModbusTcpAdapter 內部 client cache

```csharp
private readonly ConcurrentDictionary<string, ModbusTcpClient> _clients = new();

private ModbusTcpClient GetOrConnectClient(ModbusTcpConfig config)
{
    var key = $"{config.Host}:{config.Port}";
    var client = _clients.GetOrAdd(key, _ => new ModbusTcpClient { ... });
    if (!client.IsConnected)
    {
        client.Connect(new IPEndPoint(IPAddress.Parse(config.Host), config.Port));
    }
    return client;
}
```

每次 PollAsync 不再 `using var client = new ModbusTcpClient()` + Connect + Disconnect，改成 `GetOrConnectClient` + read（不 Disconnect）。

### 3.2 失效偵測

Read 報 IOException / SocketException → 從 dict 移除 + dispose 該 client → 下次 PollAsync 重新 Connect。失效偵測寫在 ReadAsync 的 catch 區塊。

### 3.3 註冊為 Singleton

`ModbusTcpAdapter` 已是 Singleton (in `Program.cs`)，狀態 fits adapter lifetime。Service 結束時走 `IDisposable.Dispose()` 釋放所有 client。

### 3.4 Thread safety

C-1 的 host-level semaphore 仍生效：同 host 一次只有一個 thread 進 ReadAsync。所以 ModbusTcpClient 不會被多執行緒並發呼叫 → 不需要再加 client-level lock。**C-2 假設 C-1 已在生產**。

### 3.5 Disposal

`ModbusTcpAdapter` 加 `IDisposable`：
```csharp
public void Dispose()
{
    foreach (var client in _clients.Values)
        try { client.Disconnect(); } catch { }
    _clients.Clear();
}
```

DI container 會在 application shutdown 時自動呼叫。

## 4. 風險

- **長連線被 gateway 中途 close**：第一次 read 會丟 exception，失效偵測重連即可。但會偶發抖動。
- **Connection leak**：若 Connect 成功但 dispose 失敗（罕見），會 leak socket。Try-catch wrap 即可。
- **Discovery 流程**：DiscoverAsync 也走 ReadAsync，要決定要不要走 pool。建議**不走 pool**（DiscoverAsync 是一次性 + 在 wizard / test 觸發），保留現行 short-lived client 模式。也就是 pool 只給 polling 用。
- **Multi-instance**：若 service 是多 replica（目前 prod 是單例 Windows service，不影響），不同 instance 各自 pool 不會共用。

## 5. 驗收

- 單元測試：reuse path（first call connect、第 2 個 call 不重連）、failure path（IOException 後重連）、dispose path（service shutdown 關所有 client）
- Prod smoke：deploy 後看 LeanA 5 連線 errs 是否歸 0 並保持低位（C-1 + C-2 共同效果）。對比 prod log 中 socket connect 次數是否明顯降低（每 host 從 ~每 5s 變成 ~每天）。

## 6. Roll-out

1. **不要直接上 prod** — 先在本機跑 1-2 小時驗證 reuse + reconnect 行為
2. 改成 dev → prod 階段部署（先夜間時段）
3. 部署後盯 24h，重點看 connection errors 趨勢

## 7. 相關

- 前置：`2026-05-14-host-level-poll-serialization.md`（C-1）
- 後續：true read coalescing（C-3 / 留作未來 spec）
