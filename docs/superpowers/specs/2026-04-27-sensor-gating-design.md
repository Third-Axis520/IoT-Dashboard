# Sensor Gating 設計（條件式採樣 / Soft Trigger）

**日期：** 2026-04-27（v2 — 對齊真實 codebase 重寫）
**功能：** 讓溫度（或任何類比）感測器只在「工件到位訊號（DI）為 true」時才寫入讀值與評估告警。對應業界 photo-eye trigger / soft trigger / logical gating 模式，但在 SCADA 軟體層實作。

---

## 背景

### 業務情境

廠商在輸送帶式烘箱上加裝鞋面溫度感測器（PLC-A，Modbus FC03 Holding Register），同時另一台 PLC（PLC-B，Modbus FC02 Discrete Input）提供「鞋面到位偵測」訊號。鞋子通過時 DI=true，沒鞋子時 DI=false。

只有 DI=true 時的溫度讀值才有意義；DI=false 時的讀值是「空輸送帶 / 環境輻射」，混進歷史資料會污染 SPC 統計與誤觸 UCL/LCL 告警。

### 現有系統的相關機制

實際探勘後發現：系統內**部分 gating 概念已存在**，但有結構限制。

#### 已有的「material_detect」機制

`PropertyType.Behavior == "material_detect"` 是現有的單 DI gating：

- `DataIngestionService.GetMaterialDetectSensorIdAsync` 動態查每個 AssetCode 的 material_detect sensor
- 該 sensor value=0（無料）時 → `hasMaterial=false` → 跳過所有告警 ✓
- 但無料時的 reading **仍寫入 DB**（標記 `HasMaterial=false`）

#### 限制（這次新功能要解決的）

1. **一個 AssetCode 只能有一個 material_detect**（整個 asset 共用一個 DI）— 不滿足「每個溫度 sensor 各自綁定不同 DI」
2. **DI 必須在同一個 AssetCode**（同一個 DeviceConnection）— 不滿足「PLC-A 溫度綁 PLC-B 的 DI」的跨設備需求
3. **HasMaterial=false 的 reading 還是寫入** — Q1 決議「完全不存」
4. **`ModbusTcpAdapter` 只支援 FC03**（Holding Register），不支援 FC02（Discrete Input）

### 第一版策略：A1 + B1 最小破壞

新舊機制**並存**，避免 breaking change：

- **舊 `material_detect` 不動** — 既有 dashboard 仍讀 `HasMaterial` 欄位
- **新增 `SensorGatingRule` 表** — 服務「per-sensor / 跨 AssetCode / 完全不存」的新場景
- **同一 sensor 同時被兩種機制套到時 → 兩個都要 pass 才寫入**（AND 邏輯）

> ⚠️ **未來收斂為單一機制是 Tech Debt**（預計 3-5 天工作量）。詳見 memory `project_gating_tech_debt.md`。

### 業界 SOP 對應

| 業界術語 | 對應本系統 |
|---------|-----------|
| Photo-eye / Photoelectric trigger | DI sensor（PropertyType.Behavior=material_detect 或 sensor in DI 連線） |
| Trigger input / Gate input（pyrometer 硬體 pin） | `SensorGatingRule.GatingAssetCode + GatingSensorId` |
| In-process measurement | 整體應用情境 |
| Triggered acquisition / Gated sampling | 本功能名稱 |

---

## 設計決策摘要

| 決策點 | 結果 | 理由 |
|--------|------|------|
| 1. Gating false 時的儲存策略 | **完全不存**（新 SensorGatingRule 走此邏輯） | 業界 SOP，圖表斷線正確語義 |
| 2. Settling delay | **`DelayMs` 可調，預設 0** | 移動工件場景需要，預設保守 |
| 3. PLC A / PLC B 時間戳對齊 | **`MaxAgeMs` 容忍時間窗，預設 1000ms** | DI 過期視同未到位（fail-safe） |
| 4. Gating false 期間告警邏輯 | **跳過評估** | 防誤報 |
| 5. UI 揭露策略 | **擴充既有 `LimitsSettingsModal`** 加 gating 欄位 | 與現有 per-AssetCode-per-Sensor 設定流程一致 |
| 6. 列表 / 儀表板視覺差異化 | **icon + 卡片淡化 + 三態 badge + tooltip** | 採樣中／待機中／異常清楚分開 |
| 整體架構路線 | **DataIngestionService 擴充（不重構）** | 最小破壞 |
| 新舊機制相處 | **A1 並存（AND 邏輯）+ B1 既有 material_detect 行為不動** | 避免 breaking change |
| GatingPolarity（反邏輯） | **不做（YAGNI）** | 99% 場景 true=有工件 |

---

## 架構

### 整體資料流

```
┌──────────────────────┐         ┌──────────────────────┐
│  PLC-B (DI)          │         │  PLC-A (Temp)        │
│  AssetCode: ASSET-B  │         │  AssetCode: ASSET-A  │
└──────────┬───────────┘         └──────────┬───────────┘
           │ Modbus TCP                     │ Modbus TCP
           │ FC02                           │ FC03
           ↓                                ↓
┌─────────────────────────────────────────────────────────────┐
│  ModbusTcpAdapter（既有，新增 function 欄位）                  │
│   ├─ function=holding   → FC03（溫度）                       │
│   └─ function=discrete  → FC02（DI，回 0.0/1.0）             │
└─────────────────┬───────────────────────────────────────────┘
                  ↓ Dictionary<address, double>
┌─────────────────────────────────────────────────────────────┐
│  PollingBackgroundService（既有，呼叫 PollAsync）             │
│   ConvertToPayload() → IngestPayload                         │
└─────────────────┬───────────────────────────────────────────┘
                  ↓ IngestPayload (含 SerialNumber → AssetCode)
┌─────────────────────────────────────────────────────────────┐
│  ★ DataIngestionService.ProcessAsync（既有，擴充）            │
│   ┌────────────────────────────────────────────────────┐   │
│   │ 0. 寫入 LatestReadingCache（每筆都更新）              │   │
│   │ 1. (既有) 取 material_detect sensor → hasMaterial    │   │
│   │ 2. ★ (新增) 對每個 sensor 查 SensorGatingRule        │   │
│   │      呼叫 GatingEvaluator.Evaluate()                  │   │
│   │      ├─ Pass + hasMaterial=true → 寫 reading + 告警  │   │
│   │      ├─ Pass + hasMaterial=false → 寫 reading 不告警 │   │
│   │      │   （既有 material_detect 行為，B1 保留）       │   │
│   │      └─ Block → 完全不寫、不告警、不推 SSE（A1 新行為）│   │
│   └────────────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────────────┘
                  ↓
            SensorReading 表（DB）
                  ↓
            SSE → 前端
```

### 為什麼是 Service 層 gating

- Adapter 應只懂協議、不懂業務（CLAUDE.md 規範）
- PLC-A、PLC-B 是兩個 DeviceConnection、兩個 AssetCode、各自獨立呼叫 ProcessAsync — 必須在 Service 層才能跨 AssetCode 查得到對方的 DI 值
- 跨協議都支援（DI 來源若改 Push / WebAPI 也通）

### 為什麼用 Singleton in-memory cache

跨 AssetCode 的 DI 查詢，靠的是 PLC-B 那筆 `ProcessAsync` 把 DI value 寫進 Singleton cache，PLC-A 的 `ProcessAsync` 從 cache 讀。DB 查太慢，不適合每筆 reading 都查。

---

## 後端設計

### Schema 變更

#### 新增 `SensorGatingRule` 實體（per-AssetCode-per-Sensor）

新檔：`backend/Models/Entities/SensorGatingRule.cs`

```csharp
using System.ComponentModel.DataAnnotations;

namespace IoT.CentralApi.Models;

public class SensorGatingRule
{
    public int Id { get; set; }

    /// <summary>被 gating 的 sensor 所屬 AssetCode（例：PLC-A 對應的資產）</summary>
    [Required, MaxLength(50)]
    public string GatedAssetCode { get; set; } = "";

    /// <summary>被 gating 的 sensor ID（同 SensorReading.SensorId）</summary>
    public int GatedSensorId { get; set; }

    /// <summary>gating 來源 sensor 所屬 AssetCode（例：PLC-B）；可與 GatedAssetCode 相同（同 asset 內 gating）</summary>
    [Required, MaxLength(50)]
    public string GatingAssetCode { get; set; } = "";

    /// <summary>gating 來源 sensor ID</summary>
    public int GatingSensorId { get; set; }

    /// <summary>上升沿後穩定期延遲（ms），0 = 立即採樣</summary>
    public int DelayMs { get; set; } = 0;

    /// <summary>DI 值最大允許過期時間（ms），超過視同未到位</summary>
    public int MaxAgeMs { get; set; } = 1000;

    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
```

#### Migration: `AddSensorGatingRule`

```csharp
public partial class AddSensorGatingRule : Migration
{
    protected override void Up(MigrationBuilder mb)
    {
        mb.CreateTable(
            name: "SensorGatingRules",
            columns: table => new
            {
                Id = table.Column<int>(nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                GatedAssetCode = table.Column<string>(maxLength: 50, nullable: false),
                GatedSensorId = table.Column<int>(nullable: false),
                GatingAssetCode = table.Column<string>(maxLength: 50, nullable: false),
                GatingSensorId = table.Column<int>(nullable: false),
                DelayMs = table.Column<int>(nullable: false, defaultValue: 0),
                MaxAgeMs = table.Column<int>(nullable: false, defaultValue: 1000),
                CreatedAt = table.Column<DateTime>(nullable: false),
                UpdatedAt = table.Column<DateTime>(nullable: true)
            },
            constraints: table => table.PrimaryKey("PK_SensorGatingRules", x => x.Id));

        // 一個 (gated asset, gated sensor) 只能有一條規則
        mb.CreateIndex(
            "IX_SensorGatingRules_GatedAssetCode_GatedSensorId",
            "SensorGatingRules",
            new[] { "GatedAssetCode", "GatedSensorId" },
            unique: true);

        // 加速「DI 來源被誰用」的反查
        mb.CreateIndex(
            "IX_SensorGatingRules_GatingAssetCode_GatingSensorId",
            "SensorGatingRules",
            new[] { "GatingAssetCode", "GatingSensorId" });
    }
}
```

註冊到 `IoTDbContext`：`public DbSet<SensorGatingRule> SensorGatingRules { get; set; }`

#### `SensorReading` 表 — 不動

新機制 gated 時完全不寫入；既有 `HasMaterial` 欄位保留給舊機制。

#### Validation 規則

| 規則 | 處理位置 |
|------|---------|
| `GatedAssetCode == GatingAssetCode && GatedSensorId == GatingSensorId` | Controller 拒絕（自我循環） |
| `DelayMs < 0` 或 `> 10000` | Controller 拒絕（上限 10 秒） |
| `MaxAgeMs < 100` 或 `> 60000` | Controller 拒絕（100ms ~ 60s） |
| **第一版禁止鏈式 gating** — 若 (GatingAssetCode, GatingSensorId) 本身又是某 rule 的 gated → 拒絕 | Controller 在 upsert 時做查詢檢查 |
| **不檢查** gating 來源是否為 boolean | 寬鬆 — `value >= 0.5` 即視為 true |

### 服務元件

#### `ILatestReadingCache`（新增 Singleton）

新檔：`backend/Services/LatestReadingCache.cs`

```csharp
using System.Collections.Concurrent;

namespace IoT.CentralApi.Services;

public interface ILatestReadingCache
{
    void Update(string assetCode, int sensorId, double value, DateTime timestamp);
    LatestReading? Get(string assetCode, int sensorId);
}

public record LatestReading(double Value, DateTime Timestamp);

public class LatestReadingCache : ILatestReadingCache
{
    private readonly ConcurrentDictionary<(string, int), LatestReading> _cache = new();

    public void Update(string assetCode, int sensorId, double value, DateTime ts)
        => _cache[(assetCode, sensorId)] = new LatestReading(value, ts);

    public LatestReading? Get(string assetCode, int sensorId)
        => _cache.TryGetValue((assetCode, sensorId), out var r) ? r : null;
}
```

DI 註冊（Program.cs）：`services.AddSingleton<ILatestReadingCache, LatestReadingCache>();`

**Key 用 (AssetCode, SensorId)** — 因為 SensorId 在不同 AssetCode 可能重複，必須複合 key。

#### `GatingEvaluator`（新增 Singleton）

新檔：`backend/Services/GatingEvaluator.cs`

```csharp
using System.Collections.Concurrent;
using IoT.CentralApi.Models;

namespace IoT.CentralApi.Services;

public class GatingEvaluator(ILatestReadingCache cache)
{
    private readonly ConcurrentDictionary<(string, int), DateTime> _settlingStartedAt = new();

    public GatingDecision Evaluate(SensorGatingRule? rule, DateTime now)
    {
        if (rule is null)
            return GatingDecision.Pass;

        var di = cache.Get(rule.GatingAssetCode, rule.GatingSensorId);
        if (di is null)
            return GatingDecision.NoData;

        var ageMs = (now - di.Timestamp).TotalMilliseconds;
        if (ageMs > rule.MaxAgeMs)
            return GatingDecision.Stale;

        var key = (rule.GatingAssetCode, rule.GatingSensorId);
        if (di.Value < 0.5)
        {
            _settlingStartedAt.TryRemove(key, out _);
            return GatingDecision.NotPresent;
        }

        if (rule.DelayMs > 0)
        {
            var startedAt = _settlingStartedAt.GetOrAdd(key, _ => now);
            var settledMs = (now - startedAt).TotalMilliseconds;
            if (settledMs < rule.DelayMs)
                return GatingDecision.Settling;
        }

        return GatingDecision.Pass;
    }
}

public enum GatingDecision { Pass, NoData, Stale, NotPresent, Settling }
```

DI 註冊：`services.AddSingleton<GatingEvaluator>();`

關鍵點：
- Settling delay 的時間原點是 DI 從 false 變 true 那一刻（rising edge）
- DI 變 false 時清掉 settling 計時器
- 5 種 decision 分開 enum，未來 UI 顯示 diagnostic 用

#### `DataIngestionService` 擴充（既有檔，擴充而非重建）

修改 `backend/Services/DataIngestionService.cs`：

1. **建構函式**注入 `ILatestReadingCache` 和 `GatingEvaluator`
2. **加入 gating rule 快取** — `ConcurrentDictionary<(string, int), SensorGatingRule?>`，每個 AssetCode 第一次處理時載入該 asset 所有 rules
3. **`ProcessAsync` 流程改寫**：

```csharp
// 先寫 LatestReadingCache（每筆都寫，無條件）
foreach (var s in payload.Sensors)
    cache.Update(assetCode, s.Id, s.Value, now);

// 既有 material_detect 邏輯保留（B1）
var matSensorId = await GetMaterialDetectSensorIdAsync(assetCode, db);
bool hasMaterial = ...; // 現有邏輯不動

// 新增：載入此 asset 的所有 SensorGatingRule
var rules = await GetGatingRulesAsync(assetCode, db);
// rules: Dictionary<int sensorId, SensorGatingRule>

// 對每個 sensor reading 個別判斷
var readingsToWrite = new List<SensorReading>();
foreach (var s in payload.Sensors)
{
    if (matSensorId.HasValue && s.Id == matSensorId.Value) continue; // 狀態位元

    // 新機制 gating
    rules.TryGetValue(s.Id, out var rule);
    var decision = gatingEvaluator.Evaluate(rule, now);
    if (decision != GatingDecision.Pass)
    {
        logger.LogTrace("Asset {Asset} Sensor {Id} gated: {Decision}", assetCode, s.Id, decision);
        continue; // A1 新行為：完全不寫
    }

    // 通過新機制 gating，依舊機制 hasMaterial 決定是否寫入
    readingsToWrite.Add(new SensorReading {
        AssetCode = assetCode,
        SensorId = s.Id,
        Value = s.Value,
        HasError = s.Error != null,
        HasMaterial = hasMaterial,    // B1 既有行為保留
        Timestamp = now
    });
}

db.SensorReadings.AddRange(readingsToWrite);

// 告警評估：通過新 gating + hasMaterial 才告警（既有邏輯外加新 gating 過濾）
foreach (var s in payload.Sensors)
{
    if (matSensorId.HasValue && s.Id == matSensorId.Value) continue;
    if (!hasMaterial) continue;                     // B1 既有
    if (rules.TryGetValue(s.Id, out var rule) &&
        gatingEvaluator.Evaluate(rule, now) != GatingDecision.Pass) continue; // A1 新增
    // ... 既有 UCL/LCL 評估邏輯（不動）
}

// SSE：只推通過 gating 的 sensor reading
```

`GetGatingRulesAsync` 加上快取（pattern 同既有 `_materialDetectCache`）：
```csharp
private readonly ConcurrentDictionary<string, Dictionary<int, SensorGatingRule>> _gatingRulesCache = new();

private async Task<Dictionary<int, SensorGatingRule>> GetGatingRulesAsync(string assetCode, IoTDbContext db)
{
    if (_gatingRulesCache.TryGetValue(assetCode, out var cached))
        return cached;

    var rules = await db.SensorGatingRules
        .Where(r => r.GatedAssetCode == assetCode)
        .ToDictionaryAsync(r => r.GatedSensorId);

    _gatingRulesCache[assetCode] = rules;
    return rules;
}

// 修改 SensorGatingRule 時要 invalidate（在 Controller 端呼叫 InvalidateGatingRulesCache(assetCode)）
public void InvalidateGatingRulesCache(string assetCode)
    => _gatingRulesCache.TryRemove(assetCode, out _);
```

### Adapter 變更

#### `ModbusTcpConfig` 加 `Function` 欄位

`backend/Adapters/ModbusTcpConfig.cs`：

```csharp
internal record ModbusTcpConfig(
    string Host, int Port, int UnitId,
    int StartAddress, int Count, string DataType,
    bool ByteSwap = false, double Scale = 1.0,
    string Function = "holding"  // ← 新增："holding" | "discrete"
);
```

預設 `holding` → 既有設定零改動。

#### `ConfigSchema` 多一個下拉

`backend/Adapters/ModbusTcpAdapter.cs` — `GetConfigSchema()` 加：

```csharp
new ConfigField(
    Name: "function", Type: "enum",
    Label: "Modbus 功能碼",
    Required: false, DefaultValue: "holding",
    Options: ["holding", "discrete"],
    HelpText: "讀取的暫存器類型。\n• holding：FC03 Holding Register\n• discrete：FC02 Discrete Input（光電開關、限位、到位訊號）\n\n選 discrete 時 dataType / scale / byteSwap 會被忽略，回值固定 0.0 或 1.0。"
)
```

#### `ReadAsync` 分支處理

```csharp
// ReadAsync 內部根據 config.Function 分流
return config.Function == "discrete"
    ? ReadDiscreteInputs(client, config)
    : ReadHoldingRegistersImpl(client, config); // 抽出現有邏輯為私有方法

private Result<Dictionary<string, double>> ReadDiscreteInputs(
    ModbusTcpClient client, ModbusTcpConfig config)
{
    var offset = config.StartAddress >= 10001
        ? config.StartAddress - 10001  // 10001-based DI 位址轉 0-based
        : config.StartAddress;

    var raw = client.ReadDiscreteInputs((byte)config.UnitId, offset, config.Count);
    var bits = ExpandBits(raw, config.Count);

    var values = new Dictionary<string, double>();
    for (int i = 0; i < config.Count; i++)
        values[(offset + i).ToString()] = bits[i] ? 1.0 : 0.0;
    return Result<Dictionary<string, double>>.Ok(values);
}

private static bool[] ExpandBits(byte[] bytes, int count)
{
    var result = new bool[count];
    for (int i = 0; i < count; i++)
        result[i] = (bytes[i / 8] & (1 << (i % 8))) != 0;
    return result;
}
```

#### Validation 補強

`ValidateConfig` 加：

```csharp
if (config.Function != "holding" && config.Function != "discrete")
    return ValidationResult.Invalid($"function 必須是 'holding' 或 'discrete'，目前: {config.Function}");

if (config.Function == "discrete" && config.Count > 2000)
    return ValidationResult.Invalid("Discrete Input 一次最多讀 2000 個 bit");
```

### API / Controller 變更

新增 `backend/Controllers/SensorGatingController.cs`，pattern 同 `LimitsController`：

```csharp
[ApiController]
[Route("api/sensor-gating")]
public class SensorGatingController(
    IDbContextFactory<IoTDbContext> dbFactory,
    DataIngestionService ingestionService) : ControllerBase
{
    /// <summary>取得指定 AssetCode 的所有 gating rule。</summary>
    [HttpGet("{assetCode}")]
    public async Task<IActionResult> Get(string assetCode) { /* ... */ }

    /// <summary>批次 Upsert 指定 AssetCode 的 gating rules（含刪除被移除的）。</summary>
    [HttpPut("{assetCode}")]
    public async Task<IActionResult> Update(
        string assetCode, [FromBody] UpdateGatingRulesRequest request)
    {
        // 1. Validation（自我循環、範圍、鏈式 gating）
        // 2. Upsert / 刪除
        // 3. ingestionService.InvalidateGatingRulesCache(assetCode)
    }

    /// <summary>列出可作為 gating 來源的 sensor 候選。</summary>
    [HttpGet("candidates")]
    public async Task<IActionResult> GetCandidates() { /* ... */ }
}
```

#### DTO

新增 `backend/Dtos/SensorGatingDtos.cs`：

```csharp
public record SensorGatingRuleDto(
    int Id,
    string GatedAssetCode, int GatedSensorId,
    string GatingAssetCode, int GatingSensorId,
    string? GatingSensorLabel,  // 顯示用
    int DelayMs, int MaxAgeMs
);

public record UpdateGatingRulesRequest(
    List<SaveGatingRuleItem> Rules
);

public record SaveGatingRuleItem(
    int GatedSensorId,
    string GatingAssetCode, int GatingSensorId,
    int DelayMs, int MaxAgeMs
);

public record GatingCandidateDto(
    string AssetCode, string AssetName,
    int SensorId, string SensorLabel,
    double? CurrentValue
);
```

#### Candidates 篩選邏輯

第一版**寬鬆 — 列出所有有讀值的 sensor**（除自己 asset+sensor），實作：

```csharp
// 從 EquipmentTypeSensors 找全部 sensor 定義
// 從 LineEquipments 找對應 AssetCode
// 排除 PropertyType.Behavior=asset_code / counter（無 gating 意義）
// 從 LatestReadingCache 補 currentValue
```

### 告警互動

第一版：**新 gating block 期間不評估告警**（已包在 ProcessAsync 中）。

「正在告警中」的 sensor 變成 gated → **保留 alarm 狀態**，不主動 clear。下次 gating Pass + UCL/LCL 評估時依規則 clear。

---

## 前端設計

### 新增/修改檔案

| 檔案 | 類型 | 說明 |
|------|------|------|
| `lib/apiSensorGating.ts` | 新 | gating rules CRUD + candidates |
| `components/sensors/GatingSelector.tsx` | 新 | 下拉選 gating 來源 sensor |
| `components/modals/LimitsSettingsModal.tsx` | 改 | 既有表格每列加「條件採樣」設定按鈕，點開展開 gating 設定 |
| `components/sensors/GatingRow.tsx` | 新 | LimitsSettingsModal 內展開的 gating 設定列 |
| `components/devices/SensorCard.tsx` | 改 | sampling/standby/unhealthy 三態（找實際元件名稱：對應 ` SensorMappingRows` 或 dashboard 顯示元件） |
| `hooks/useGatingState.ts` | 新 | 前端計算 sensor gating 狀態 |
| `hooks/useGatingCandidates.ts` | 新 | 拉 `/api/sensor-gating/candidates` |
| `i18n/locales/zh-TW.ts` / `zh-CN.ts` / `en.ts` | 改 | 加 gating keys（注意：是 `.ts` 不是 `.json`） |

> **Implementation note**: 「SensorCard」是 spec 概念，實際對應的儀表板顯示元件路徑需在 implementation plan 階段確認（可能是 `SensorMappingRows` / dashboard 內的 sensor 顯示元件）。

### `LimitsSettingsModal` 整合（不另開新 Modal）

擴充既有 modal，每個 sensor row 加一個「⚙ 條件採樣」摺疊區：

```tsx
// 既有 row 之下加一個展開區
<tr>
  <td colspan="N">
    <details>
      <summary className="cursor-pointer text-xs text-[var(--text-muted)]">
        ⚙ {t('gating.advanced')}: {row.gatingEnabled ? t('gating.enabled') : t('gating.disabled')}
      </summary>
      <GatingRow
        assetCode={assetCode}
        sensorId={row.sensorId}
        rule={row.gatingRule}
        onChange={(rule) => updateGatingRule(row.sensorId, rule)}
      />
    </details>
  </td>
</tr>
```

`<GatingRow>` 內部：

```tsx
<div className="flex flex-col gap-2 py-2">
  <label>
    <input type="checkbox" checked={enabled} onChange={...} />
    {t('sensor.gating.enable')}
  </label>

  {enabled && (
    <>
      <Field label={t('sensor.gating.source')}>
        <GatingSelector
          value={rule}
          excludeAssetCode={assetCode}
          excludeSensorId={sensorId}
          onChange={...}
        />
      </Field>
      <Field label={t('sensor.gating.delay_label')}>
        <input type="number" min={0} max={10000} value={rule.delayMs} ... />
      </Field>
      <Field label={t('sensor.gating.maxage_label')}>
        <input type="number" min={100} max={60000} value={rule.maxAgeMs} ... />
      </Field>
    </>
  )}
</div>
```

### `<GatingSelector>` 元件

```tsx
interface GatingSelectorProps {
  value: { assetCode: string; sensorId: number } | null;
  excludeAssetCode?: string;
  excludeSensorId?: number;
  onChange: (v: { assetCode: string; sensorId: number } | null) => void;
}

// 內部呼叫 useGatingCandidates()，渲染下拉：
//   <option value="">（不啟用）</option>
//   <option value="ASSET-A:5">ASSET-A 烘箱 / DI#5 鞋面到位</option>
//   ...
```

### `useGatingState` hook（前端三態判斷）

```tsx
function useGatingState(rule: SensorGatingRuleDto | null): 'sampling' | 'standby' | 'unhealthy' | null {
  const allReadings = useLatestReadings(); // 既有 SSE store（需確認既有 store 是否含跨 asset 資料）
  if (!rule) return null;

  const di = allReadings[`${rule.gatingAssetCode}:${rule.gatingSensorId}`];
  if (!di) return 'unhealthy';

  const ageMs = Date.now() - new Date(di.timestamp).getTime();
  if (ageMs > rule.maxAgeMs) return 'unhealthy';
  if (di.value < 0.5) return 'standby';
  return 'sampling';
}
```

> ⚠️ **既有 SSE 是否跨 AssetCode 推送**：implementation plan 階段需確認 `SseHub` 是否會推全部 asset 的更新，還是只推當前訂閱的 asset。若不跨 asset，需擴充 SSE payload 或讓前端訂閱多個 channel。

### i18n keys（zh-TW / zh-CN / EN，加在既有 `.ts` 檔案）

```typescript
// frontend/src/i18n/locales/zh-TW.ts (extension)
{
  sensor: {
    gating: {
      section_title: '進階：條件式採樣（Gating）',
      enable: '此感測器需要工件到位訊號才採樣',
      enable_hint: '適用於輸送帶、烘箱、線上量測。沒有工件時自動停止記錄與告警。',
      source: '訊號來源',
      delay_label: '穩定期延遲 (ms)',
      delay_hint: 'DI 從 false→true 後等待的時間，建議 0–500ms',
      maxage_label: '訊號最大允許延遲 (ms)',
      maxage_hint: 'DI 多久沒更新就視為斷線',
      sampling: '採樣中',
      standby: '待機中',
      unhealthy: 'Gating 訊號未更新',
      waiting: '等待工件到位...',
      enabled: '已啟用',
      disabled: '未啟用',
      advanced: '條件採樣',
    }
  }
}
```

zh-CN / EN 提供對應翻譯。

---

## UX 三態行為

| 狀態 | 觸發 | 視覺 |
|------|------|------|
| **採樣中** (sampling) | DI 新鮮 + value=true + 過完 settling delay | 正常顯示數值 + 綠色「採樣中 ●」 |
| **待機中** (standby) | DI 新鮮 + value=false | 卡片淡化 + 數值改 ──.─ + 灰色「待機中 ◌」+ 副標「等待工件到位...」 |
| **異常** (unhealthy) | DI 不存在 / 過期 | 卡片淡化 + 琥珀色「⚠ Gating 訊號未更新」（提示，不告警） |
| **無 gating** (null) | 沒對應 SensorGatingRule | 跟現在一樣 |

對應 Keith 全域規則：
- ✓ **引導性**：每個狀態有副標題說明
- ✓ **回饋性**：勾選展開、狀態切換有視覺差異
- ✓ **防呆性**：自我循環、超範圍、鏈式 gating 都拒絕
- ✓ **一致性**：用既有 LimitsSettingsModal 流程；i18n 三語齊全
- ✓ **主動性**：unhealthy 提早提示

---

## 測試策略

### 後端 xUnit + FluentAssertions

| 測試對象 | 覆蓋 case |
|---------|----------|
| `GatingEvaluator` | 5 種 GatingDecision、邊界值、rising-edge tracking、DI 變 false 清計時器 |
| `LatestReadingCache` | concurrent update 不 race、複合 key 正確 |
| `DataIngestionService` 整測 | new gating block → 不寫 DB；舊 hasMaterial=false → 寫 DB 帶 HasMaterial=false（B1 不變）；兩者並存（AND） |
| `ModbusTcpAdapter` | function=discrete 路徑、bit expansion、Validation、count 上限 |
| `SensorGatingController` | upsert / get / candidates / 各種 validation |
| Validation | 自我循環 / 超範圍 / 鏈式 gating |
| Migration | 套用後既有資料零影響 |

### 前端 Vitest + RTL

| 測試對象 | 覆蓋 case |
|---------|----------|
| `<GatingSelector>` | 排除自己、選空值送 null、列表正確 |
| `<GatingRow>` | enable/disable 切換、欄位驗證 |
| `LimitsSettingsModal` | 加入 gating 後 save 攜帶 rules、原有 limit save 不受影響 |
| `useGatingState` hook | 各種 DI 狀態對應正確 |
| `<SensorCard>`（或對應元件） | 三態 + null 四態 render |

### E2E（手動）

1. 建 PLC-A、PLC-B 兩個 Modbus DeviceConnection（可用 ModbusPal / PyModbus mock）
2. 在 PLC-B 底下建 N 個 DI sensor（function=discrete）
3. 在 PLC-A 底下建 N 個溫度 sensor
4. 開 PLC-A 的 LimitsSettingsModal，每個 sensor 設 gating 來源到 PLC-B 對應 DI
5. 手動 toggle DI
6. 驗證：DI=true → 溫度寫 DB；DI=false → 完全不寫；切換時 dashboard 即時切 sampling↔standby

---

## Rollout 計畫

單一 PR、commit 順序如下，每個 commit 跑 `dotnet test` 和 `npm test`。任一失敗不往下走。

```
1. baseline check：跑 dotnet test + npm test 確認當前全綠
2. SensorGatingRule entity + IoTDbContext.DbSet + Migration（不影響既有運作）
3. LatestReadingCache + 單測
4. GatingEvaluator + 單測
5. DataIngestionService 擴充：注入 cache+evaluator、ProcessAsync 加 gating 分支 + 整測（含 A1+B1 並存驗證）
6. ModbusTcpAdapter 加 FC02 支援 + 測試
7. SensorGatingController + DTOs + Validation + 測試
8. /api/sensor-gating/candidates endpoint + 測試
9. apiSensorGating.ts + useGatingCandidates / useGatingState hooks
10. GatingSelector + GatingRow 元件 + Vitest
11. LimitsSettingsModal 整合 + Vitest
12. SensorCard / 對應 dashboard 元件 三態顯示 + Vitest
13. i18n 三語系補齊（zh-TW / zh-CN / EN .ts 檔）
14. README 更新（adapters/、modals/、CLAUDE.md「Common tasks」記錄 gating 設定流程）
```

---

## 風險與緩解

| 風險 | 緩解 |
|------|------|
| `LatestReadingCache` 重啟後空白 → 第一個輪詢週期 gating 全擋 | Acceptable（< 1 秒） |
| 自我 / 鏈式 gating 誤用 | UI 排除 + Controller validation 雙重防 |
| 跨 AssetCode 時序對不齊 | `MaxAgeMs` 預設 1000ms 可調 |
| `_gatingRulesCache` 失效（rule 更新後）| Controller upsert 後呼叫 `InvalidateGatingRulesCache` |
| 既有 SSE 不跨 AssetCode 推送 | implementation plan 階段確認；如需擴充列為 risk-buffer task |
| material_detect 與 SensorGatingRule 同時設定造成混淆 | UI 在 LimitsSettingsModal 展示時加註提示「此 asset 已啟用整體 material_detect」 |

---

## Future Work（第一版不做）

| 項目 | 觸發條件 |
|------|---------|
| **新舊機制收斂統一**（material_detect → SensorGatingRule） | tech debt 還清的那一天，預計 3-5 天 |
| **Wizard 整合** — DeviceIntegrationWizard 加 gating 設定 step | 第一版 LimitsSettingsModal 流程順暢後 |
| **DI watchdog 告警** — gating sensor 長時間不變動升告警 | 真的遇到「DI 卡死」case |
| **批次新增 DI sensors** — 範本套用 | 使用者反映手動加太煩 |
| **工件批次追溯** — `WorkpieceEvent`，DI 上升→下降一個批次 | 現場品管要做 SPC |
| **Gating diagnostic UI** — 顯示 5 種 GatingDecision | 現場 debug 需要時 |

---

## Out of Scope（明確不做）

- ❌ FC01 (Coils) / FC04 (Input Register)
- ❌ Adapter 層 gating
- ❌ Stream pipeline
- ❌ 改既有 material_detect 行為（保留 HasMaterial=false 仍寫入）
- ❌ GatingPolarity 反邏輯
- ❌ Gated false 期間清告警
- ❌ 鏈式 gating

---

## 附錄：對應現實情境的範例（示意，非規範）

> ⚠️ **本附錄只是幫讀者理解情境的示意配置**，不代表實際現場接線或位址。
> 系統本身完全彈性 — DI 與溫度的對應、是否啟用 gating、Modbus 位址等，全部由使用者在 UI 設定。
> 工位名稱與分類來自 `OvenDataReceive` 程式碼；HR 位址、DI 編號、是否啟用為示意值，現場以實際情況為準。

| 工位 | 溫度 Sensor (PLC-A) | Gating 設定 |
|------|-------------------|-----------|
| 高速加熱定型機（設備溫度） | HR 40001 | 不啟用（持續監測設備本身） |
| 藥水箱上（大底溫度） | HR 40002 | 依現場決定 |
| 藥水箱下（鞋面溫度） | HR 40003 | **啟用**（移動鞋面 / 跨 PLC 綁 PLC-B 的 DI） |
| 一次膠上（大底溫度） | HR 40004 | 依現場決定 |
| 一次膠下（鞋面溫度） | HR 40005 | **啟用** |
| 二次膠上（大底溫度） | HR 40006 | 依現場決定 |
| 二次膠下（鞋面溫度） | HR 40007 | **啟用** |
| 冷凍機（設備溫度） | HR 40008 | 不啟用 |
| 後跟熱定型 / 冷定型 | HR 40009-40012 | 依工位是固定夾具還是輸送帶通過決定 |

混合模式：「設備溫度」不啟用 gating，「鞋面溫度」啟用，由 LimitsSettingsModal 逐 sensor 設定。
