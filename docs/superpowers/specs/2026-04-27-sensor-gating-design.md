# Sensor Gating 設計（條件式採樣 / Soft Trigger）

**日期：** 2026-04-27
**功能：** 讓溫度（或任何類比）感測器只在「工件到位訊號（DI）為 true」時才寫入讀值與評估告警。對應業界 photo-eye trigger / soft trigger / logical gating 模式，但在 SCADA 軟體層實作。

---

## 背景

### 業務情境

廠商在輸送帶式烘箱上加裝鞋面溫度感測器（PLC-A，Modbus FC03 Holding Register），同時另一台 PLC（PLC-B，Modbus FC02 Discrete Input）提供「鞋面到位偵測」訊號。鞋子通過時 DI=true，沒鞋子時 DI=false。

只有 DI=true 時的溫度讀值才有意義（量到的是鞋面溫度）；DI=false 時的讀值是「空輸送帶 / 環境輻射」，混進歷史資料會污染 SPC 統計與誤觸 UCL/LCL 告警。

### 現有系統與此需求的差距

1. **`ModbusTcpAdapter` 只支援 FC03**（Holding Register），不支援 FC02（Discrete Input）
2. **`Sensor` 沒有 gating 概念** — 所有讀值都會無條件寫入 `SensorReading`
3. **沒有跨 Sensor 的條件依賴機制** — Service 層沒有「另一個 sensor 是 true 時才採用」這條路徑
4. **告警評估無條件執行** — 沒有「這個 sensor 此刻不該被告警」的能力

### 業界 SOP 對應

| 業界術語 | 對應本系統 |
|---------|-----------|
| Photo-eye / Photoelectric trigger | DI sensor |
| Trigger input / Gate input（pyrometer 硬體 pin） | `Sensor.GatingSensorId` |
| In-process measurement | 整體應用情境 |
| Triggered acquisition / Gated sampling | 本功能名稱 |

業界做法分兩派：
- **硬體層 gating**：photo-eye 直接接 IR pyrometer 的 trigger pin
- **軟體層 gating（本系統採用）**：兩邊各走 PLC + Modbus，SCADA 在 Service 層做 logical gating

軟體層的優勢：同一個 DI 可餵多個下游、可加軟體 debounce / 延遲 / 穩定期、改條件不用動現場接線。

---

## 設計決策摘要

| 決策點 | 結果 | 理由 |
|--------|------|------|
| 1. Gating false 時的儲存策略 | **完全不存** | 業界 SOP（hardware trigger 一致），圖表斷線正確語義，省 50–95% 容量 |
| 2. Settling delay（穩定期延遲） | **可調欄位 `GatingDelayMs`，預設 0** | 移動工件場景需要，但預設 0 保守、向下相容 |
| 3. PLC A / PLC B 時間戳對齊 | **容忍時間窗 `GatingMaxAgeMs`，預設 1000ms** | 平衡實時性與穩健性，DI 過期視同未到位（fail-safe） |
| 4. Gating false 期間告警邏輯 | **跳過評估（A）；DI watchdog 留 future work（C）** | 防誤報，watchdog 等真的需要再加 |
| 5. UI 揭露策略 | **Modal 用 checkbox 觸發展開（A）；Wizard 整合留 future work（C）** | 80% 使用者不需 gating，不能干擾正常流程 |
| 6. 列表 / 儀表板視覺差異化 | **icon (1B) + 卡片淡化 + 待機文字 (2C) + tooltip (3B)** | 三態（採樣中／待機中／異常）清楚分開 |
| 整體架構路線 | **Service 層 gating（B）** | Adapter 不放業務邏輯、跨協議自動支援、in-memory 查詢效能可忽略 |
| GatingPolarity（反邏輯） | **不做（YAGNI）** | 99% 場景 true=有工件，反邏輯由現場改 PLC 解決 |

---

## 架構

### 整體資料流

```
┌──────────────┐         ┌──────────────┐
│  PLC-B (DI)  │         │  PLC-A (Temp)│
└──────┬───────┘         └──────┬───────┘
       │ Modbus TCP             │ Modbus TCP
       │ FC02                   │ FC03
       ↓                        ↓
┌─────────────────────────────────────────────────────┐
│  ModbusTcpAdapter（現有，新增 function 設定）         │
│   ├─ function=holding   → 讀 FC03（溫度）            │
│   └─ function=discrete  → 讀 FC02（DI，回 0.0/1.0）  │
└─────────────────┬───────────────────────────────────┘
                  ↓ Dictionary<address, double>
┌─────────────────────────────────────────────────────┐
│  PollingService（現有，呼叫 PollAsync）              │
└─────────────────┬───────────────────────────────────┘
                  ↓ (sensorId, value, timestamp)
┌─────────────────────────────────────────────────────┐
│  ★ ReadingIngestionService（新建 / 重構）            │
│   1. 更新 LatestReadingCache                         │
│   2. 呼叫 GatingEvaluator.Evaluate()                 │
│   3. decision != Pass → return（不寫 / 不告警 / 不推）│
│   4. 寫 SensorReading                                │
│   5. 評估告警                                        │
│   6. 推 SSE                                          │
└─────────────────┬───────────────────────────────────┘
                  ↓
            SensorReading 表（DB）
            （只存通過 gating 的）
                  ↓
            SSE → 前端
```

### 為什麼是 Service 層 gating

- Adapter 應只懂協議、不懂業務（CLAUDE.md 規範）
- 兩台 PLC 是兩個 Device、各自獨立輪詢，Service 層才有跨 Device 視野
- 跨協議都支援（DI 來源若改 Push / WebAPI 也通）

---

## 後端設計

### Schema 變更

#### `Sensor` 實體新增 3 欄位

```csharp
public class Sensor {
    // ── 既有欄位（不動） ────────────────────────────
    public int Id { get; set; }
    public int DeviceId { get; set; }
    public string Name { get; set; }
    public double? Ucl { get; set; }
    public double? Lcl { get; set; }
    // ... 其他既有欄位

    // ── 新增 gating 欄位 ───────────────────────────
    public int? GatingSensorId { get; set; }       // null = 不啟用 gating
    public int GatingDelayMs { get; set; } = 0;     // 上升沿後穩定期，預設 0
    public int GatingMaxAgeMs { get; set; } = 1000; // DI 值最大允許過期時間

    // ── 導覽屬性 ───────────────────────────────────
    public Sensor? GatingSensor { get; set; }
}
```

#### Migration: `AddSensorGating`

```csharp
public partial class AddSensorGating : Migration
{
    protected override void Up(MigrationBuilder mb)
    {
        mb.AddColumn<int>("GatingSensorId", "Sensors", nullable: true);
        mb.AddColumn<int>("GatingDelayMs", "Sensors", nullable: false, defaultValue: 0);
        mb.AddColumn<int>("GatingMaxAgeMs", "Sensors", nullable: false, defaultValue: 1000);

        mb.CreateIndex("IX_Sensors_GatingSensorId", "Sensors", "GatingSensorId");

        mb.AddForeignKey(
            "FK_Sensors_Sensors_GatingSensorId", "Sensors", "GatingSensorId",
            principalTable: "Sensors", principalColumn: "Id",
            onDelete: ReferentialAction.SetNull);
    }
}
```

**OnDelete=SetNull**：gating 來源被刪除時，溫度 sensor 自動回到「不啟用 gating」狀態（不擋刪除、不孤兒指向）。

#### `SensorReading` 表 — 不動

Q1 決議「gated false 完全不存」，因此既有 schema、index、查詢全部不影響。

#### Validation 規則

| 規則 | 處理 |
|------|------|
| `GatingSensorId == 自己 Id` | 拒絕（自我循環） |
| `GatingSensorId` 指向不存在 sensor | FK 已擋 |
| `GatingDelayMs < 0` 或 `> 10000` | 拒絕（上限 10 秒） |
| `GatingMaxAgeMs < 100` 或 `> 60000` | 拒絕（100ms ~ 60s） |
| **第一版禁止鏈式 gating** — gating 來源本身不可有 `GatingSensorId` | 拒絕（保留未來開放空間） |
| **不檢查** gating 來源是否為 boolean | 寬鬆 — `value >= 0.5` 即視為 true |

### 服務元件

#### `ILatestReadingCache`（新增 Singleton）

```csharp
public interface ILatestReadingCache
{
    void Update(int sensorId, double value, DateTime timestamp);
    LatestReading? Get(int sensorId);
}

public record LatestReading(double Value, DateTime Timestamp);

public class LatestReadingCache : ILatestReadingCache
{
    private readonly ConcurrentDictionary<int, LatestReading> _cache = new();

    public void Update(int sensorId, double value, DateTime ts)
        => _cache[sensorId] = new LatestReading(value, ts);

    public LatestReading? Get(int sensorId)
        => _cache.TryGetValue(sensorId, out var r) ? r : null;
}
```

DI 註冊：`services.AddSingleton<ILatestReadingCache, LatestReadingCache>();`

**重啟風險可接受**：cache 空白後第一個輪詢週期內補回。若日後成為瓶頸，可在啟動時從 DB 載最新一筆。

#### `GatingEvaluator`（新增）

```csharp
public class GatingEvaluator
{
    private readonly ILatestReadingCache _cache;
    private readonly ConcurrentDictionary<int, DateTime> _settlingStartedAt = new();

    public GatingDecision Evaluate(Sensor sensor, DateTime now)
    {
        if (sensor.GatingSensorId is null)
            return GatingDecision.Pass;

        var di = _cache.Get(sensor.GatingSensorId.Value);
        if (di is null)
            return GatingDecision.NoData;

        var ageMs = (now - di.Timestamp).TotalMilliseconds;
        if (ageMs > sensor.GatingMaxAgeMs)
            return GatingDecision.Stale;

        if (di.Value < 0.5)
        {
            _settlingStartedAt.TryRemove(sensor.GatingSensorId.Value, out _);
            return GatingDecision.NotPresent;
        }

        if (sensor.GatingDelayMs > 0)
        {
            var startedAt = _settlingStartedAt.GetOrAdd(
                sensor.GatingSensorId.Value, _ => now);
            var settledMs = (now - startedAt).TotalMilliseconds;
            if (settledMs < sensor.GatingDelayMs)
                return GatingDecision.Settling;
        }

        return GatingDecision.Pass;
    }
}

public enum GatingDecision { Pass, NoData, Stale, NotPresent, Settling }
```

關鍵點：
- Settling delay 的時間原點是 DI 從 false 變 true 那一刻（rising edge），不是溫度讀值的時間
- DI 變 false 時清掉 settling 計時器，下次重新計
- 5 種 decision 分開 enum，未來 UI 顯示 diagnostic 用

#### `ReadingIngestionService`（新建 / 重構）

把現在散在 PollingService 裡的「寫入 + 告警 + SSE」邏輯抽出來，加上 gating 判斷。

```csharp
public class ReadingIngestionService
{
    private readonly IDbContextFactory<IoTDbContext> _dbFactory;
    private readonly ILatestReadingCache _cache;
    private readonly GatingEvaluator _gating;
    private readonly IAlarmEvaluator _alarm;
    private readonly ISseNotifier _sse;
    private readonly ILogger<ReadingIngestionService> _logger;

    public async Task IngestAsync(int sensorId, double value, DateTime ts)
    {
        // 1. 永遠先更新 cache（即使會被 gating 擋）
        //    若這筆是 DI sensor 自己的讀值，必須更新讓別人查得到
        _cache.Update(sensorId, value, ts);

        await using var db = await _dbFactory.CreateDbContextAsync();
        var sensor = await db.Sensors.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == sensorId);
        if (sensor is null) return;

        var decision = _gating.Evaluate(sensor, ts);
        if (decision != GatingDecision.Pass)
        {
            _logger.LogTrace("Sensor {Id} gated: {Decision}", sensorId, decision);
            return;
        }

        db.SensorReadings.Add(new SensorReading {
            SensorId = sensorId, Value = value, Timestamp = ts
        });
        await db.SaveChangesAsync();

        await _alarm.EvaluateAsync(sensor, value);
        await _sse.PushAsync(sensorId, value, ts);
    }
}
```

DI 註冊：`services.AddSingleton<ReadingIngestionService>();`（CLAUDE.md 規範：所有 Service 都是 Singleton）

### Adapter 變更

#### `ModbusTcpConfig` 加 `Function` 欄位

```csharp
internal record ModbusTcpConfig(
    string Host,
    int Port,
    int UnitId,
    int StartAddress,
    int Count,
    string DataType,
    bool ByteSwap = false,
    double Scale = 1.0,
    string Function = "holding"  // ← 新增："holding" | "discrete"
);
```

預設 `holding` → 既有設定零改動。

#### `ConfigSchema` 多一個下拉

```csharp
new ConfigField(
    Name: "function",
    Type: "enum",
    Label: "Modbus 功能碼",
    Required: false,
    DefaultValue: "holding",
    Options: ["holding", "discrete"],
    HelpText: "讀取的暫存器類型。\n• holding：FC03 Holding Register（溫度、流量、壓力等類比值）\n• discrete：FC02 Discrete Input（光電開關、限位、到位訊號等 0/1 值）\n\n選 discrete 時，「資料型別」「縮放係數」「Byte Swap」會被忽略，回值固定 0.0 或 1.0。"
)
```

#### `ReadAsync` 分支處理

```csharp
private async Task<Result<Dictionary<string, double>>> ReadAsync(
    ModbusTcpConfig config, CancellationToken ct)
{
    return await Task.Run(() =>
    {
        var client = new ModbusTcpClient();
        try {
            // 連線（同現有）
            ...
            return config.Function == "discrete"
                ? ReadDiscreteInputs(client, config)
                : ReadHoldingRegisters(client, config);
        }
        // catch / finally 同現有
    });
}

private Result<Dictionary<string, double>> ReadDiscreteInputs(
    ModbusTcpClient client, ModbusTcpConfig config)
{
    var offset = config.StartAddress;
    var raw = client.ReadDiscreteInputs(
        (byte)config.UnitId, offset, config.Count);

    var values = new Dictionary<string, double>();
    var bits = ExpandBits(raw, config.Count);
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

```csharp
if (config.Function != "holding" && config.Function != "discrete")
    return ValidationResult.Invalid($"function 必須是 'holding' 或 'discrete'，目前: {config.Function}");

if (config.Function == "discrete" && config.Count > 2000)
    return ValidationResult.Invalid("Discrete Input 一次最多讀 2000 個 bit");
```

### API / DTO 變更

#### `SensorDto` 新增欄位

```csharp
public record SensorDto(
    int Id, int DeviceId, string Name,
    double? Ucl, double? Lcl,
    // 既有 ...
    int? GatingSensorId,
    string? GatingSensorLabel,  // 顯示用，例如 "PLC-B / DI#3 一次膠下"
    int GatingDelayMs,
    int GatingMaxAgeMs
);

public record SaveSensorRequest(
    string Name, /* ... */ ,
    int? GatingSensorId = null,
    int GatingDelayMs = 0,
    int GatingMaxAgeMs = 1000
);
```

#### 新增 endpoint

```
GET /api/sensors/gating-candidates
  → [{ id, deviceName, name, currentValue }]
```

回傳「可當 gating 來源」的 sensor 列表。第一版**寬鬆 — 列出全部 sensor**（除自己）；後續可篩 function=discrete。

### 告警互動

第一版：**gated false 期間不評估告警**（已包在 `IngestAsync` 中早退）。
- 「正在告警中」的 sensor 變成 gated false → **保留 alarm 狀態**，不主動 clear。理由：告警是歷史事實，不能因「沒鞋」就抹掉
- 下次 gating=true 的讀值進來時，依規則 clear / 維持

---

## 前端設計

### 新增/修改檔案

| 檔案 | 類型 | 說明 |
|------|------|------|
| `lib/apiSensors.ts` | 改 | DTO 加 4 欄位 |
| `components/sensors/GatingSelector.tsx` | 新 | 下拉選 DI sensor |
| `components/modals/AddSensorModal.tsx` | 改 | checkbox 觸發展開 gating 區塊 |
| `components/modals/EditSensorModal.tsx` | 改 | 同上 |
| `components/devices/SensorCard.tsx` | 改 | sampling/standby/unhealthy 三態顯示 |
| `hooks/useGatingState.ts` | 新 | 前端計算 sensor gating 狀態 |
| `hooks/useGatingCandidates.ts` | 新 | 拉 `/api/sensors/gating-candidates` |
| `i18n/zh-TW/sensor.json`、`zh-CN/sensor.json`、`en/sensor.json` | 改 | 加 gating keys |

### `<GatingSelector>` 元件

```tsx
interface GatingSelectorProps {
  value: number | null;
  excludeSensorId?: number;
  onChange: (sensorId: number | null) => void;
}

export function GatingSelector({ value, excludeSensorId, onChange }: GatingSelectorProps) {
  const { data: sensors } = useGatingCandidates();
  return (
    <select value={value ?? ""} onChange={e =>
      onChange(e.target.value ? Number(e.target.value) : null)
    }>
      <option value="">（不啟用）</option>
      <option disabled>──────────</option>
      {sensors
        ?.filter(s => s.id !== excludeSensorId)
        .map(s => (
          <option key={s.id} value={s.id}>
            {s.deviceName} / {s.name}
          </option>
        ))}
    </select>
  );
}
```

### Modal — checkbox 觸發展開

```tsx
const [gatingEnabled, setGatingEnabled] = useState(initial?.gatingSensorId != null);

return (
  <Modal>
    {/* 既有欄位 */}

    <hr className="my-4 border-slate-200" />
    <h3 className="text-sm font-semibold">{t('sensor.gating.section_title')}</h3>

    <label className="flex items-start gap-2 mt-2">
      <input
        type="checkbox"
        checked={gatingEnabled}
        onChange={e => {
          setGatingEnabled(e.target.checked);
          if (!e.target.checked)
            setForm({ ...form, gatingSensorId: null });
        }}
      />
      <div>
        <div>{t('sensor.gating.enable')}</div>
        <div className="text-xs text-slate-500">{t('sensor.gating.enable_hint')}</div>
      </div>
    </label>

    {gatingEnabled && (
      <div className="ml-6 mt-3 space-y-3 border-l-2 border-blue-200 pl-4">
        <Field label={t('sensor.gating.source')} required>
          <GatingSelector
            value={form.gatingSensorId}
            excludeSensorId={initial?.id}
            onChange={id => setForm({ ...form, gatingSensorId: id })}
          />
        </Field>
        <Field label={t('sensor.gating.delay_label')} hint={t('sensor.gating.delay_hint')}>
          <NumberInput value={form.gatingDelayMs} min={0} max={10000}
            onChange={v => setForm({ ...form, gatingDelayMs: v })} />
        </Field>
        <Field label={t('sensor.gating.maxage_label')} hint={t('sensor.gating.maxage_hint')}>
          <NumberInput value={form.gatingMaxAgeMs} min={100} max={60000}
            onChange={v => setForm({ ...form, gatingMaxAgeMs: v })} />
        </Field>
      </div>
    )}
  </Modal>
);
```

### `<SensorCard>` 三態顯示

```tsx
const gatingState = useGatingState(sensor); // 'sampling' | 'standby' | 'unhealthy' | null
const hasGating = sensor.gatingSensorId != null;

return (
  <div className={cn("card", gatingState === 'standby' && "opacity-60")}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        {hasGating && <GateIcon className="text-blue-500" title={gatingTooltip(sensor)} />}
        <span>{sensor.name}</span>
      </div>
      {hasGating && <GatingBadge state={gatingState} />}
    </div>

    <div className="value">
      {gatingState === 'standby'
        ? <span className="text-slate-400">──.─ {sensor.unit}</span>
        : <span>{latestReading?.value.toFixed(1)} {sensor.unit}</span>}
    </div>

    {gatingState === 'standby' && (
      <div className="text-xs text-slate-500 mt-1">{t('sensor.gating.waiting')}</div>
    )}
    {gatingState === 'unhealthy' && (
      <div className="text-xs text-amber-600 mt-1">⚠ {t('sensor.gating.unhealthy')}</div>
    )}
  </div>
);
```

### `useGatingState` hook

```tsx
function useGatingState(sensor: SensorDto): 'sampling' | 'standby' | 'unhealthy' | null {
  const allReadings = useLatestReadings(); // 既有 SSE store
  if (sensor.gatingSensorId == null) return null;

  const di = allReadings[sensor.gatingSensorId];
  if (!di) return 'unhealthy';

  const ageMs = Date.now() - new Date(di.timestamp).getTime();
  if (ageMs > sensor.gatingMaxAgeMs) return 'unhealthy';
  if (di.value < 0.5) return 'standby';
  return 'sampling';
}
```

前端自己算狀態，不需後端推送 — DI 也是 sensor，SSE 已把最新值送到前端 store。

### i18n keys（zh-TW / zh-CN / EN 三語齊全）

```
sensor.gating.section_title    = 進階：條件式採樣（Gating）
sensor.gating.enable           = 此感測器需要工件到位訊號才採樣
sensor.gating.enable_hint      = 適用於輸送帶、烘箱、線上量測。沒有工件時自動停止記錄與告警。
sensor.gating.source           = 訊號來源
sensor.gating.delay_label      = 穩定期延遲 (ms)
sensor.gating.delay_hint       = DI 從 false→true 後等待的時間，建議 0–500ms
sensor.gating.maxage_label     = 訊號最大允許延遲 (ms)
sensor.gating.maxage_hint      = DI 多久沒更新就視為斷線
sensor.gating.sampling         = 採樣中
sensor.gating.standby          = 待機中
sensor.gating.unhealthy        = Gating 訊號未更新
sensor.gating.waiting          = 等待工件到位...
```

---

## UX 三態行為（人性化檢查）

| 狀態 | 觸發 | 視覺 |
|------|------|------|
| **採樣中** (sampling) | DI 新鮮 + value=true + 過完 settling delay | 正常顯示數值 + 綠色 「採樣中 ●」 |
| **待機中** (standby) | DI 新鮮 + value=false | 卡片淡化 + 數值改 ──.─ + 灰色「待機中 ◌」+ 副標「等待工件到位...」 |
| **異常** (unhealthy) | DI 不存在 / 過期 | 卡片淡化 + 數值改 ──.─ + 琥珀色「⚠ Gating 訊號未更新」（不告警，僅提示） |
| **無 gating** (null) | `GatingSensorId == null` | 跟現在一樣，無任何 gating UI |

對應 Keith 全域規則：
- ✓ **引導性**：每個狀態都有副標題說明「為什麼是這樣」
- ✓ **回饋性**：勾選 checkbox 才展開、狀態切換有視覺差異
- ✓ **防呆性**：自我循環、超出範圍、鏈式 gating 都拒絕
- ✓ **一致性**：用既有 `<Field>`、`<NumberInput>`、SSE store；i18n 三語齊全
- ✓ **主動性**：unhealthy 狀態提早提示而非等使用者發現

---

## 測試策略

### 後端 xUnit + FluentAssertions

| 測試對象 | 覆蓋 case |
|---------|----------|
| `GatingEvaluator` 單測 | 5 種 GatingDecision、邊界值（value=0.5、age=MaxAge、settling=DelayMs）、rising-edge tracking、DI 變 false 清計時器 |
| `LatestReadingCache` 單測 | concurrent update 不 race、Get 不存在 sensor 回 null |
| `ReadingIngestionService` 整測 | gated false 不寫 DB、不告警、不推 SSE；gated true 三件都做 |
| `ModbusTcpAdapter` 單測 | function=discrete 路徑、bit expansion 正確、Validation 拒絕無效 function、Discrete count 上限 2000 |
| Validation 測試 | 自我循環 / 超範圍 / 鏈式 gating 全部拒絕 |
| Migration 測試 | 套用後既有 sensor `GatingSensorId=null`、預設值正確 |

### 前端 Vitest + RTL

| 測試對象 | 覆蓋 case |
|---------|----------|
| `<GatingSelector>` | 排除自己、選空值送 null、列表正確 |
| `<SensorCard>` | sampling / standby / unhealthy / null 四態 render |
| `<AddSensorModal>` | checkbox 勾才顯示 fields、取消勾把值清成 null、required 驗證 |
| `<EditSensorModal>` | 載入既有 gating 設定、修改後送對欄位 |
| `useGatingState` hook | 各種 DI 狀態對應正確 enum、邊界 ageMs |

### E2E（手動）

1. 建 PLC-A、PLC-B 兩個 Modbus Device（可用 ModbusPal / PyModbus mock）
2. 在 PLC-B 底下建 12 個 DI sensor
3. 在 PLC-A 底下建 12 個溫度 sensor，一一綁定 DI
4. 手動 toggle DI
5. 驗證：DI=true → 溫度寫 DB；DI=false → 完全不寫；切換時 dashboard 即時切 sampling↔standby

---

## Rollout 計畫

單一 PR、9 個 commit 漸進落地，每個 commit 跑 `dotnet test` 和 `npm test`。任一失敗不往下走。

```
1. Schema migration + Entity（不影響任何運作）
2. LatestReadingCache + GatingEvaluator + 單測
3. ReadingIngestionService 重構（抽出寫入邏輯）+ 整測
4. ModbusTcpAdapter 加 FC02 支援 + 測試
5. API DTO + endpoint /sensors/gating-candidates + 測試
6. AddSensorModal / EditSensorModal UI + Vitest
7. SensorCard standby 狀態 + Vitest
8. i18n 三語系補齊
9. README 更新（adapters/、modals/、CLAUDE.md「Common tasks」）
```

---

## 風險與緩解

| 風險 | 緩解 |
|------|------|
| `LatestReadingCache` 重啟後空白 → 第一個輪詢週期 gating 全擋 | Acceptable（< 1 秒） |
| 自我循環 (Sensor.GatingSensorId 指自己) | UI 排除 + 後端 Validation 雙重防 |
| 鏈式 gating 誤用 | 第一版禁止，Validation 拒絕 |
| DI sensor 被刪 | FK OnDelete=SetNull，溫度 sensor 自動回到無 gating |
| DI 通訊延遲偶發過長 | `GatingMaxAgeMs` 預設 1000ms 可調，使用者按現場條件調整 |
| `ReadingIngestionService` DB 查 sensor metadata 成為瓶頸 | 第一版可接受；若成瓶頸加 metadata 快取 |

---

## Future Work（第一版不做）

| 項目 | 觸發條件 |
|------|---------|
| **Wizard 整合** — DeviceIntegrationWizard 加一步「Gating 設定（選填）」 | 第一版 Modal 跑順了 |
| **DI watchdog 告警** — gating sensor 長時間不變動升告警 | 真的遇到「DI 卡死」case |
| **批次新增 DI sensors** — 範本套用一次建 N 個 | 使用者反映手動加 12 個太煩 |
| **工件批次追溯** — 引入 `WorkpieceEvent`，DI 上升→下降一個批次 | 現場品管要做 SPC |
| **時間戳精準對齊** — 嚴格時間窗模式 | 1000ms 容忍被證實不夠 |
| **跨 Project gating** | 真的需要時 |
| **Gating diagnostic UI** — 顯示 5 種 GatingDecision 給工程師看 | 現場 debug 需要時 |

---

## Out of Scope（明確不做）

- ❌ FC01 (Coils) / FC04 (Input Register) — 等真的需要再加
- ❌ Adapter 層的 gating（路線 A）
- ❌ Stream pipeline（路線 C）
- ❌ Raw reading 表（gated false 也存）
- ❌ GatingPolarity 反邏輯
- ❌ Gated false 期間清告警
- ❌ 鏈式 gating（A gate B gate C）

---

## 附錄：對應現實情境的範例

以參考專案 `OvenDataReceive` 的 12 站感測器配置為例：

| 工位 | 溫度 Sensor (PLC-A) | Gating 設定 |
|------|-------------------|-----------|
| 高速加熱定型機（設備溫度） | HR 40001 | 不啟用（持續監測設備本身） |
| 藥水箱上（大底溫度） | HR 40002 | DI#1（依現場決定是否啟用） |
| 藥水箱下（鞋面溫度） | HR 40003 | **DI#2 啟用**（移動鞋面） |
| 一次膠上（大底溫度） | HR 40004 | DI#3（依現場決定是否啟用） |
| 一次膠下（鞋面溫度） | HR 40005 | **DI#4 啟用**（移動鞋面） |
| 二次膠上（大底溫度） | HR 40006 | DI#5（依現場決定是否啟用） |
| 二次膠下（鞋面溫度） | HR 40007 | **DI#6 啟用**（移動鞋面） |
| 冷凍機（設備溫度） | HR 40008 | 不啟用（持續監測設備本身） |
| 後跟熱定型右 | HR 40009 | **DI#8 啟用** |
| 後跟冷定型右 | HR 40010 | **DI#9 啟用** |
| 後跟熱定型左 | HR 40011 | **DI#10 啟用** |
| 後跟冷定型左 | HR 40012 | **DI#11 啟用** |

混合模式：「設備溫度」（高速加熱定型機、冷凍機）不啟用 gating，持續監測機台本身；「鞋面溫度」與「定型工位」啟用 gating，只在工件到位時採樣。
