# Host-Level Poll Serialization Design (C-1)

**狀態**：📋 ready for impl
**識別日期**：2026-05-13（LeanA incident）
**估時**：1-2 hr

---

## 1. 問題

`PollingBackgroundService.PollAllAsync` 用 `Task.WhenAll(tasks)` 把所有 enabled 連線的 poll **並行**送出。同一個 Modbus gateway 收到 N 個並發 TCP 連線就 reset socket，造成：

```
IOException: 遠端主機強迫關閉了一個現有的連接
```

2026-05-13 事件：5 個 LeanA 連線（id 8/9/10/11/15）並發打 192.168.62.74:502，gateway 並發 limit 1-4，每 tick 都有 1-4 個失敗。短期 hot-fix 把 PollIntervalMs 從 5000 拉到 10000（cb52e97 後 + API PATCH），但不能根治。

## 2. 三個漸進方案（per memory `project_progress_20260514.md`）

| 階段 | 做法 | 複雜度 |
|---|---|---|
| 短期 | 拉長 PollIntervalMs（已做） | 0 (純資料) |
| **本 spec** | 同 host:port 序列化 poll（semaphore） | 低 |
| 中期 | TCP socket pool（C-2，可重用連線）| 中 |
| 長期 | 真 read coalescing（一次大段 read 再 dispatch） | 高 |

本 spec 只做「序列化」這一步。後續 spec / 工作會處理更進階的優化。

## 3. 設計

### 3.1 群組鍵

每次 poll 從 `DeviceConnection.ConfigJson` 解析 `host` + `port`，組成 `"{host}:{port}"` 當作 semaphore 群組鍵。

- 若 host 缺失（不該發生於 polling protocol，但防呆）→ 用 `$"conn-{dc.Id}"` 當鍵 → 不和其他連線分組，行為等同舊版獨立。
- 若 port 缺失 → 預設 `"default"`，仍可分組。

JSON 解析失敗 → 視同無 host，獨立群組。

### 3.2 Semaphore 注入

`PollingBackgroundService` 內持有 `ConcurrentDictionary<string, SemaphoreSlim>`。

每次 PollOneAsync：
```
key = getHostKey(dc)
sem = dict.GetOrAdd(key, _ => new SemaphoreSlim(1, 1))
await sem.WaitAsync(ct)
try { await adapter.PollAsync(...) }
finally { sem.Release() }
```

Semaphore 容量 1 → 嚴格序列化。將來若需要每個 gateway 同時跑 N 個（例如 gateway 並發限制是 4），可調整建立邏輯。

### 3.3 範圍

- **不改 IProtocolAdapter** — adapter 介面 unchanged，符合 CLAUDE.md 警告
- **不改 ConfigJson 結構** — 解析時用 host/port 兩個 key
- **不改 polling 排程** — 每連線仍照自己 PollIntervalMs 排
- **無 DB 變動**

### 3.4 風險

- **每 tick 序列化延遲**：5 個連線同一 host，PollAsync 各約 100-300ms → 序列總共 500-1500ms。Tick interval 1s，可能讓部分連線跨 tick。但 `ShouldPoll()` + `ScheduleNext` 已處理「下次 poll 時間」邏輯，落後一個 tick 不會錯過。
- **新 connection 建立後第一個 tick**：semaphore 首次建立有微 race，但 ConcurrentDictionary.GetOrAdd 是 thread-safe，OK。
- **Connection 刪除後 semaphore 殘留**：可以接受（記憶體小、不影響邏輯）。如果要清理，可以在 `PollAllAsync` 起始處過濾沒在用的鍵 — but YAGNI，留 follow-up。

## 4. 驗收

- 單元測試：mock adapter 用 `Task.Delay(200)` 模擬慢 poll；2 個連線同 host:port → 觀察是序列化（總時 ~400ms）而非並發（總時 ~200ms）
- 不同 host 兩連線 → 仍並發（總時 ~200ms）
- Build + frontend tests 不受影響
- Prod smoke：deploy 後看 5 個 LeanA 連線 errs 是否歸 0 並持續穩定

## 5. 相關

- 根因事件記錄：`project_progress_20260513.md`
- 短期 hot-fix：`project_progress_20260514.md`（PollIntervalMs PATCH）
- 後續 spec：本 spec 收尾後寫 C-2（socket pool）+ true coalescing 兩個 follow-up
