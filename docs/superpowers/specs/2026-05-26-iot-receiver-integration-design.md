# IoT Dashboard ↔ IoTReceiverAPI 整合 + UI 自助化清除

| 文件編號 | 2026-05-26-iot-receiver-integration-design |
|---|---|
| 文件類型 | Design Spec |
| 版本 | v1.0 |
| 建立日期 | 2026-05-26 |
| 作者 | Keith + Claude |
| 狀態 | Draft for review |

---

## 1. 背景與動機

### 1.1 現況快照（2026-05-26）

- 4 條 Modbus TCP 連線跑在 prod (`192.168.6.23:5200`)，全指向同一 PLC gateway `192.168.62.74`
- 後端：18 controllers、11 services、13 entity tables
- 前端：14 modals、14-step `DeviceIntegrationWizard`、10 個 api helpers
- DB 共用：與 [`IoTReceiverAPI`](C:\Users\Keith.Lee\Diamond Groups\Source Code\IoT\IoTReceiverAPI) 共用同一個 `localhost / IoTControlChart`

### 1.2 痛點清單（從歷次 memory + 事故）

| 痛點 | 來源 | 影響 |
|---|---|---|
| Gating maxAgeMs 事故（dc_15 DI 拔光 → 看板沒資料） | 2026-04-30 | prod 中斷 |
| Wizard 14-step race condition | 2026-04-12 | 設備新增不可靠 |
| SensorGating UCL/LCL 整線複雜度 | 2026-04-27 後 | bug 面積大 |
| DI binding UX 反直覺（需操作員理解 polling/cross-asset/maxAge）| 2026-05-22 已退場 | 已不再使用 |
| Modal 過多、layout 重疊（Sensor management vs gating section） | 2026-05-14 | 維護心智負擔 |

### 1.3 新需求（2026-06 Phase 1）

CSW6 過程管控標準（`docs/CSW6/CSW6_IoT_Control標準.xlsx`）：

| 階段 | 時間 | 設備 |
|---|---|---|
| Phase 1 | 2026/06 | 智能視覺劃線機（VisualMarkingMachine）、壓合機（PressingMachine / 万能压机 / 壓底機）|
| Phase 2 | 2026/09 | 既有的烘箱、冷凍機、加硫機、後跟定型機（**仍走 Modbus**，不在本 spec 範圍）|

### 1.4 關鍵發現

Phase 1 的兩台新設備**資料流已就緒**：

- IoTReceiverAPI 已部署 (`192.168.6.23:5101`)，接收廠商（厚信）+ 集團標準兩種 endpoint
- 資料寫入共用 DB 的 `PressingMachineRealTimeData` 與 `VisualMarkingMachineRealTimeData` 表
- IoT-Dashboard 唯一缺的環節：**讀這兩張表並顯示在看板上**

---

## 2. 設計目標與非目標

### 2.1 目標

1. **整合 IoTReceiverAPI 資料**：壓合機 + 劃線機呈現在 IoT-Dashboard 看板，與既有 4 條 Modbus 並列
2. **減少 UI 自助化負擔**：砍掉操作員不該碰的 wizard / gating / template 配置 UI
3. **保留架構彈性**：`IProtocolAdapter` 介面留，未來新協議仍可加
4. **零生產中斷**：4 條 Modbus polling、SSE、Alerts、WeChat 不受影響

### 2.2 非目標

- 不重寫 Modbus 連線（保留現有 dc_3~dc_6）
- 不改 IoTReceiverAPI 的 schema 或部署
- 不遷移 Phase 2 既有 4 條 Modbus 至 IoTReceiverAPI
- 不重做 SSE/Alerts/WeChat 機制
- 不做雲端整合（其他機台仍在 TDM_WebAPI 雲端版，等遷移後再整合）

---

## 3. 整體架構

```
[廠商 PLC: 厚信 / 集團規格 vendor]
     │ POST /api/v1/... or /api/IoT/.../HouXin/RealTime
     ↓
[IoTReceiverAPI @ 192.168.6.23:5101]                        ← 不在本 spec 範圍
     │ writes rows
     ↓
[共用 DB: localhost / IoTControlChart]
     │
     ├─ PressingMachineRealTimeData      ← IoTReceiverAPI 寫
     ├─ VisualMarkingMachineRealTimeData ← IoTReceiverAPI 寫
     ├─ AssetCodeAndPlantView            ← Azure FAS sync (IoTReceiverAPI)
     │
     ├─ DeviceConnections (新增 2 筆 iot_receiver_db protocol)
     ├─ EquipmentTypes + EquipmentTypeSensors (新增 2 筆 + sensor mapping)
     ├─ LineEquipments (新增 2 筆 line layout)
     ├─ PropertyTypes (新增 pressure / duration / count)
     ├─ SensorReadings                   ← 既有 Modbus 寫 + 新 Adapter 寫
     ├─ SensorLimits                     ← UCL/LCL（可改）
     └─ SensorAlerts                     ← 自動告警
     ↑
[IoT-Dashboard backend @ 192.168.6.23:5200]
   ├─ ModbusTcpAdapter (4 條既有連線)
   ├─ IoTReceiverDbAdapter (新增！讀 PressingMachine/VisualMarking 表)
   ├─ WebApiAdapter / PushIngestAdapter (留，未來用)
   └─ PollingBackgroundService → DataIngestionService → SseHub
     ↓
[Frontend @ /]
   ├─ 既有 Tile: single_kpi / dual_side_spark / four_rings (4 條 Modbus)
   ├─ 新 Tile: PressingMachineLrTile (壓合機左右對稱)
   └─ 新 Tile: VisualMarkingMachineTile (劃線機壓力 + 狀態)
```

---

## 4. IoTReceiverDbAdapter 設計

### 4.1 識別欄位

```csharp
public string ProtocolId => "iot_receiver_db";
public string DisplayName => "IoT Receiver Shared DB";
public bool SupportsDiscovery => false;  // 沒有「發現」概念，AssetCode 是設定時指定的
public bool SupportsLivePolling => true;
```

### 4.2 ConfigJson 結構

```jsonc
{
  "tableName": "PressingMachineRealTimeData",  // or "VisualMarkingMachineRealTimeData"
  "assetCode": "0000020881",                    // 與 IoTReceiverAPI 上廠商寫入的 AssetCode 一致
  "maxAgeMs": 30000                              // 超過 30s 沒新資料視為 stale
}
```

`tableName` 限制為白名單兩個值，避免任意 SQL 注入。

### 4.3 PollAsync 邏輯

```csharp
public async Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
{
    if (!TryParseConfig(configJson, out var cfg, out var err))
        return Result<PollResult>.Fail(ErrorKind.InvalidConfig, err!);

    if (!IsAllowedTable(cfg.TableName))
        return Result<PollResult>.Fail(ErrorKind.InvalidConfig,
            $"tableName '{cfg.TableName}' 不在白名單");

    using var scope = _scopeFactory.CreateScope();
    var db = scope.ServiceProvider
        .GetRequiredService<IDbContextFactory<IoTDbContext>>()
        .CreateDbContext();

    // 用 raw SQL 避免在 IoT-Dashboard 的 DbContext 引入 IoTReceiverAPI 的 entity
    var row = await ReadLatestRowAsync(db, cfg.TableName, cfg.AssetCode, ct);
    if (row == null)
        return Result<PollResult>.Fail(ErrorKind.DeviceError,
            $"找不到 AssetCode '{cfg.AssetCode}' 的資料");

    var recordTime = (DateTime)row["RecordTime"];
    var ageMs = (DateTime.UtcNow - recordTime.ToUniversalTime()).TotalMilliseconds;
    if (ageMs > cfg.MaxAgeMs)
        return Result<PollResult>.Fail(ErrorKind.Transient,
            $"資料過舊 ({ageMs:F0}ms > {cfg.MaxAgeMs}ms)");

    var values = ExtractNumericFields(row, cfg.TableName);
    return Result<PollResult>.Ok(new PollResult(values, DateTime.UtcNow));
}
```

### 4.4 為何用 raw SQL 而不是 EF entity

IoT-Dashboard 的 `IoTDbContext` 不註冊 `PressingMachineRealTimeData` / `VisualMarkingMachineRealTimeData`，理由：

1. **Schema 主權清楚**：那兩張表的 schema 屬於 IoTReceiverAPI，由它 migration 管理。Dashboard 若引入會造成兩個 service 對同一張表都跑 migration → 衝突
2. **耦合最小化**：跨 service 透過 DB 通訊本身已是耦合；再加上 entity 共享會變成雙向耦合
3. **欄位映射靈活**：用 reflection + 白名單 dict 把欄位名直接映射成 `Dictionary<string, double>`，不需要強型別 entity

Raw SQL 範例：

```sql
SELECT TOP 1 *
FROM PressingMachineRealTimeData
WHERE AssetCode = @assetCode
ORDER BY RecordTime DESC;
```

### 4.5 欄位映射（reflection-free 白名單）

```csharp
private static readonly Dictionary<string, string[]> TableFields = new()
{
    ["PressingMachineRealTimeData"] = [
        "RunTimeSeconds", "OperateTimeSeconds",
        "LeftPressCount", "LeftCycleTime", "LeftPressDuration",
        "RightPressCount", "RightCycleTime", "RightPressDuration",
        "LeftTighteningPressure", "LeftSecondaryPressure", "LeftEdgePressure",
        "RightTighteningPressure", "RightSecondaryPressure", "RightEdgePressure",
    ],
    ["VisualMarkingMachineRealTimeData"] = [
        "Pressure",
    ],
};
```

`PollAsync` 對 row dictionary 套這份白名單，把 `decimal/int` 一律轉 `double`，得到 `Dictionary<string, double>`。

### 4.6 ValidateConfig

檢查：
- `tableName` 是否在白名單
- `assetCode` 不為空
- `maxAgeMs` 在合理範圍（≥ 5000ms）

### 4.7 註冊位置

```csharp
// Program.cs
builder.Services.AddSingleton<IProtocolAdapter, IoTReceiverDbAdapter>();
```

---

## 5. EquipmentType 與 EquipmentTypeSensor seed

### 5.1 PressingMachine（壓合機）

```
EquipmentType {
  Name = "壓合機",
  VisType = "pressing_machine_lr",
  Description = "壓合段壓合機，左右兩側多階段壓力 + 循環時間"
}

EquipmentTypeSensors (PointId 對應前端 tile 預期的 key):
  SensorId=50001 PointId=pt_run_time        Label="開機時間"        Unit="s"   PropertyType=runtime
  SensorId=50002 PointId=pt_operate_time    Label="作業時間"        Unit="s"   PropertyType=runtime
  SensorId=50003 PointId=pt_left_count      Label="左壓次"          Unit="次"  PropertyType=count
  SensorId=50004 PointId=pt_left_cycle      Label="左循環時間"      Unit="s"   PropertyType=duration
  SensorId=50005 PointId=pt_left_press_dur  Label="左壓著時間"      Unit="s"   PropertyType=duration
  SensorId=50006 PointId=pt_right_count     Label="右壓次"          Unit="次"  PropertyType=count
  SensorId=50007 PointId=pt_right_cycle     Label="右循環時間"      Unit="s"   PropertyType=duration
  SensorId=50008 PointId=pt_right_press_dur Label="右壓著時間"      Unit="s"   PropertyType=duration
  SensorId=50009 PointId=pt_left_p1         Label="左束緊壓力"      Unit="bar" PropertyType=pressure
  SensorId=50010 PointId=pt_left_p2         Label="左二次壓力"      Unit="bar" PropertyType=pressure
  SensorId=50011 PointId=pt_left_p3         Label="左押邊壓力"      Unit="bar" PropertyType=pressure
  SensorId=50012 PointId=pt_right_p1        Label="右束緊壓力"      Unit="bar" PropertyType=pressure
  SensorId=50013 PointId=pt_right_p2        Label="右二次壓力"      Unit="bar" PropertyType=pressure
  SensorId=50014 PointId=pt_right_p3        Label="右押邊壓力"      Unit="bar" PropertyType=pressure
```

`EquipmentTypeSensor.RawAddress` 存對應 DB 欄位名（如 `"LeftTighteningPressure"`）。Adapter 用這個欄位查 row dictionary。

### 5.2 VisualMarkingMachine（智能視覺劃線機）

```
EquipmentType {
  Name = "智能視覺劃線機",
  VisType = "visual_marking_machine",
  Description = "視覺辨識劃線設備，僅監測壓力"
}

EquipmentTypeSensors:
  SensorId=60001 PointId=pt_pressure  Label="壓力"  Unit="bar"  PropertyType=pressure  RawAddress="Pressure"
```

### 5.3 SensorId 編碼規則

- `40000-49999`：既有 Modbus（不動）
- `50000-59999`：壓合機（IoTReceiverDb）
- `60000-69999`：劃線機（IoTReceiverDb）
- `70000+`：未來新設備

---

## 6. PropertyType seed

新增 PropertyType（既有可能已有 temperature / humidity，這裡只列新增）：

```
{ Code = "pressure",  Behavior = "pressure",  DefaultUnit = "bar" }
{ Code = "duration",  Behavior = "duration",  DefaultUnit = "s"   }
{ Code = "count",     Behavior = "count",     DefaultUnit = "次"  }
{ Code = "runtime",   Behavior = "runtime",   DefaultUnit = "s"   }
```

---

## 7. UCL/LCL 預設值

從 CSW6 標準 xlsx + IoTReceiverAPI 規格書交叉比對：

| Sensor | UCL | LCL | 來源 |
|---|---|---|---|
| pt_left_p1（左束緊壓力）| ⚠️ **TBD** | ⚠️ **TBD** | 待 vendor 提供 |
| pt_right_p1（右束緊壓力）| ⚠️ **TBD** | ⚠️ **TBD** | 待 vendor 提供 |
| pt_left_press_dur（左壓著時間，s）| 540 (9min) | 480 (8min) | CSW6 xlsx「壓機時間 上限9min 下限8min」推斷 |
| pt_right_press_dur | 540 | 480 | 同上 |
| pt_pressure（劃線機）| ⚠️ **TBD** | ⚠️ **TBD** | xlsx 未列具體值 |
| 其他壓力 / count / runtime | 無 UCL/LCL | 無 UCL/LCL | 計數器與運轉時間不適合靜態閾值 |

**TBD 處理策略**：seed 不寫 UCL/LCL（NULL），prod 接通後由廠長/工程師在 LimitsSettingsModal 中填入。

> ⚠️ CSW6 xlsx 提到「机器温度 / 产品温度 1, 2 / 模具温度」共 4 個溫度量測，但 **IoTReceiverAPI 目前 schema 沒有溫度欄位**。這是未來擴充：IoTReceiverAPI 加 migration → Dashboard 加 EquipmentTypeSensor。**Phase 1 不做。**

---

## 8. LineEquipment 編排

新增到既有 `LineConfigId=3`（current production line）：

```
LineEquipments (append, SortOrder 接在現有 4 個之後):
  LineConfigId=3 EquipmentTypeId=<壓合機>   AssetCode="<TBD-real-asset>" DisplayName="壓合機" SortOrder=4 IsHidden=false
  LineConfigId=3 EquipmentTypeId=<劃線機>   AssetCode="<TBD-real-asset>" DisplayName="劃線機" SortOrder=5 IsHidden=false
```

**TBD**：等 vendor 提供實際 AssetCode（10-digit 集團 master 編號，與 IoTReceiverAPI 上廠商寫的 AssetCode 必須一致）。

---

## 9. Frontend Tile 設計

### 9.1 PressingMachineLrTile（VisType: `pressing_machine_lr`）

Layout 草圖：

```
┌─────────────────────────────────────────────────────┐
│ 壓合機 [AssetCode]                                  │
│ 開機 3600s / 作業 3500s     [● 在線 / ○ Stale]       │
├──────────────────┬──────────────────────────────────┤
│ 左側              │ 右側                              │
│ 壓次: 100        │ 壓次: 98                          │
│ 循環: 30.5s      │ 循環: 30.8s                       │
│ 壓著: 5.2s ✓     │ 壓著: 5.3s ✓                      │
│                  │                                   │
│ 束緊 12.5 bar ✓  │ 束緊 12.6 bar ✓                   │
│ 二次  8.3 bar ✓  │ 二次  8.4 bar ✓                   │
│ 押邊  6.1 bar ✓  │ 押邊  6.2 bar ✓                   │
└──────────────────┴──────────────────────────────────┘
```

互動：點任一壓力數值 → 打開 DrillDownModal 看歷史趨勢（既有元件，無需新做）。

### 9.2 VisualMarkingMachineTile（VisType: `visual_marking_machine`）

```
┌──────────────────────────┐
│ 劃線機 [AssetCode]       │
├──────────────────────────┤
│                          │
│         12 bar           │
│         壓力              │
│                          │
│ [● 在線 / ○ Stale]        │
└──────────────────────────┘
```

### 9.3 Tile 註冊

`frontend/src/components/dashboard/tiles/registry.ts`（既有架構）加兩行：

```typescript
export const tileRegistry: Record<string, FC<TileProps>> = {
  single_kpi: SingleKpiTile,
  dual_side_spark: DualSideSparkTile,
  four_rings: FourRingsTile,
  molding_matrix: MoldingMatrixTile,
  custom_grid: CustomGridTile,
  pressing_machine_lr: PressingMachineLrTile,        // 新
  visual_marking_machine: VisualMarkingMachineTile,  // 新
};
```

### 9.4 Stale data 處理

Tile header 顯示「在線 / Stale」狀態：
- IoTReceiverDbAdapter 回 `Transient` error（資料 > maxAgeMs）→ `ConnectionState = Degraded` → tile header 標 Stale
- 既有 `ConnectionStateRegistry` 機制自動處理，無需新邏輯

---

## 10. 砍除清單

### 10.1 後端 Controllers

**整檔砍**（操作員自助化路徑，無 dashboard 讀取需求）：
- `PlcTemplateController.cs`
- `RegisterMapController.cs`
- `DiscoveryController.cs`
- `ProtocolsController.cs`
- `DevicesController.cs`
- `SensorGatingController.cs`

**保留整檔，但移除 POST/PUT/DELETE action**（dashboard 載入仍需 GET 讀設備清單與屬性類型）：
- `EquipmentTypeController.cs` — 保留 GET（前端 tile 渲染需要）
- `PropertyTypeController.cs` — 保留 GET（LimitsSettingsModal 顯示屬性標籤需要）
- `LineConfigController.cs` — 保留 GET（dashboard 取得產線佈局）
- `DeviceConnectionController.cs` — 保留 GET（dashboard 顯示連線狀態）

> 實作時須 grep `frontend/src/lib/api*.ts` 確認哪些 GET 路徑仍被前端呼叫，未被呼叫的 GET 也砍掉。

**完整保留**：
- `StreamController.cs` — SSE
- `LimitsController.cs` — UCL/LCL
- `AlertsController.cs`
- `HistoryController.cs`
- `DataIngestController.cs` — push_ingest 仍可用
- `MaintenanceController.cs`
- `DiagnosticsController.cs`
- `FasController.cs` — AssetCache 顯示用

### 10.2 後端 Services（11 → 9）

砍：
- `ImpactAnalyzer.cs`（給 CRUD 評估影響的，砍 UI 後沒人用）
- `GatingEvaluator.cs`

留全部其他 9 個。

### 10.3 後端 Entities

**砍**（連同對應 EF migration drop table，共 6 個 entity / 7 張表）：
- `SensorGatingRule.cs` → DROP `SensorGatingRules`
- `PlcTemplate.cs` → DROP `PlcTemplates`
- `PlcZoneDefinition.cs` → DROP `PlcZoneDefinitions`
- `PlcRegisterDefinition.cs` → DROP `PlcRegisterDefinitions`
- `RegisterMapProfile.cs` → DROP `RegisterMapProfiles`
- `RegisterMapEntry.cs` → DROP `RegisterMapEntries`
- `Device.cs`（早期的 SerialNumber → AssetCode 綁定）→ DROP `Devices`

**留**：
- `DeviceConnection` — 新 Adapter + 既有 Modbus 都需要
- `EquipmentType` / `EquipmentTypeSensor` — 看板渲染需要
- `LineConfig` / `LineEquipment` — 看板佈局
- `PropertyType` — sensor 屬性分類 + LimitsSettingsModal 顯示需要
- `SensorReading` / `SensorAlert` / `SensorLimit` / `AssetCache` — 核心資料

### 10.4 前端 Modals（14 → 3）

砍：
- `PlcTemplateModal.tsx`
- `PropertyTypesModal.tsx`
- `RegisterMapModal.tsx`
- `WizardPostPanel.tsx`
- `SensorMappingModal.tsx`
- `DeviceConnectionsModal.tsx`
- `AddDeviceModal.tsx`
- `DeviceManagementModal.tsx`
- `SensorAddPanel.tsx`
- `SensorManagementSection.tsx`
- `EditDeviceConnectionModal.tsx`

留：
- `DrillDownModal.tsx`
- `LimitsSettingsModal.tsx`（拔掉 gating + sensor management 區段）
- `AlertSettingsSection.tsx`（嵌在 LimitsSettingsModal 內）

### 10.5 前端 DeviceIntegrationWizard

**整個 `frontend/src/components/modals/DeviceIntegrationWizard/` 目錄砍**（14 步驟 + helper + tests）。

### 10.6 前端 API helpers

**整檔砍**：
- `apiDiscovery.ts`
- `apiProtocols.ts`
- `apiSensorGating.ts`

**保留檔，但只留 GET / list 函式，砍 mutation 函式**：
- `apiLineConfig.ts` — dashboard 載入產線佈局
- `apiDeviceConnections.ts` — dashboard 顯示連線狀態
- `apiEquipmentTypes.ts` — tile 渲染需要 EquipmentType + Sensors
- `apiPropertyTypes.ts` — LimitsSettingsModal 顯示屬性標籤

**完整保留**：
- `apiClient.ts`
- `apiHistory.ts`
- `apiFas.ts`

### 10.7 i18n key 清理

對砍掉的 modal 對應的 i18n key（en/zh-TW/zh-CN/zh-HK 四語言）跟著刪。位置：`frontend/src/contexts/LanguageContext.tsx`。

---

## 11. 部署工具：DeviceSeeder

取代 wizard 的新增設備工具：

```csharp
// backend/Tools/DeviceSeeder.cs
public static class DeviceSeeder
{
    public static async Task SeedPressingMachineAsync(IoTDbContext db, string assetCode, string displayName)
    {
        // 1. 確認 PropertyType 存在 (pressure/duration/count/runtime)
        // 2. 建立 EquipmentType + 14 個 EquipmentTypeSensor
        // 3. 建立 DeviceConnection (Protocol=iot_receiver_db, ConfigJson 指向 PressingMachineRealTimeData)
        // 4. 建立 LineEquipment 掛到 LineConfigId=3
        // 5. 不寫 UCL/LCL（讓 prod 從 LimitsSettingsModal 填）
    }

    public static async Task SeedVisualMarkingMachineAsync(IoTDbContext db, string assetCode, string displayName)
    {
        // 類似上面，但只 1 個 sensor (Pressure)
    }
}
```

執行入口：

```powershell
dotnet run --project backend -- seed-pressing-machine --asset 0000020881 --name "C 棟壓合機 #1"
dotnet run --project backend -- seed-marking-machine --asset 0000020882 --name "C 棟劃線機 #1"
```

Idempotent：若 DeviceConnection 已存在則跳過或更新，不重複建立。

---

## 12. EF Migration 計畫

### 12.1 新 migration: `2026-05-26_StripSelfServiceAndAddIoTReceiver`

包含：
- DROP TABLE `SensorGatingRules`
- DROP TABLE `RegisterMapEntries` → `RegisterMapProfiles`
- DROP TABLE `PlcRegisterDefinitions` → `PlcZoneDefinitions` → `PlcTemplates`
- DROP TABLE `Devices`
- 對 `EquipmentTypeSensors` 增加白名單欄位驗證？（可選；用 application-level validation 即可）

### 12.2 ⚠️ 關鍵注意：絕對不能 drop 的表

| 表 | 所有者 | 處理 |
|---|---|---|
| `PressingMachineRealTimeData` | IoTReceiverAPI | **不要** include in DbContext，否則 EF 會嘗試 migrate |
| `VisualMarkingMachineRealTimeData` | IoTReceiverAPI | 同上 |
| `AssetCodeAndPlantView` | IoTReceiverAPI | 同上 |
| `AssetSyncLog` | IoTReceiverAPI | 同上 |
| `IoTErrorLog` | IoTReceiverAPI | 同上 |
| `__EFMigrationsHistory` | 兩個 service 共用 | Each service 用自己的 migration name space |

**驗證步驟**：跑 `dotnet ef migrations script` 比對 SQL，確認 DROP 只在自己的表。

### 12.3 Rollback

- 砍掉的 entity 表若需要恢復，需手動 SQL 重建 + 跑 down migration（但 Up migration 還有 data，down 會 DROP 表，所以實質不可逆）
- 建議：執行此 migration 前做 DB 完整備份（`backup database IoTControlChart to disk='C:\backup\pre-strip-2026-05-26.bak'`）

---

## 13. 實作分階段

| Phase | 範圍 | 風險 | 可否獨立部署 |
|---|---|---|---|
| **P0** 加 Adapter | IoTReceiverDbAdapter + 註冊 + 單元測試 | 極低 | ✅（保留功能不變）|
| **P1** Seed + Tile | DeviceSeeder + 2 個 EquipmentType + 2 個前端 Tile | 低 | ✅（dashboard 多 2 個區塊）|
| **P2** 前端砍 UI | 砍 12 modals + wizard + 7 api helpers | 中（要驗 dashboard 主流程不炸）| ✅ |
| **P3** 後端砍 controller/service | 砍 10 controllers + 2 services | 中 | ✅ |
| **P4** EF migration drop tables | DROP 9 張表 | 中高（不可逆）| ⚠️ 最後做，先觀察 1-2 週 |

每個 Phase 自成 PR，順序執行。P4 前可隨時回退。

---

## 14. 風險評估

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| EF migration 誤砍 IoTReceiverAPI 的表 | 低 | **極高** | DbContext 嚴格不引用、migration script 人工 review |
| 廠商還沒接通 → 新 tile 永遠 Stale | 中 | 中 | tile UI 處理 stale state、加 dashboard 文字提示 |
| UCL/LCL 預設值 NULL → 沒告警 | 中 | 低 | 接通後從 LimitsSettingsModal 填；發 ops 通知 |
| 砍 controller 後其他系統呼叫炸 | 低 | 中 | grep 全 codebase + 看 nginx access log |
| Adapter raw SQL 注入 | 低 | 高 | tableName 白名單 + parameterized assetCode |
| 跨 service DB schema 衝突 | 低 | 高 | 兩邊 migration 命名 + table prefix 不重疊 |

---

## 15. 文件化新增

在本 spec 完成 + 實作後追加：

1. `docs/operations/add-new-equipment-from-iot-receiver.md` — 工程師 SOP：何時加新設備、如何跑 DeviceSeeder、如何加新 VisType tile
2. `docs/architecture/iot-receiver-integration.md` — IoT-Dashboard ↔ IoTReceiverAPI 邊界、共用 DB 規約、不要互相 migrate 對方表
3. `CLAUDE.md` 更新：「Do not」段落加「不要 include IoTReceiverAPI entity 進 IoTDbContext」

---

## 16. 待確認 / 待補資料

| # | 項目 | 影響 | 阻塞性 |
|---|------|------|--------|
| Q1 | 壓合機與劃線機的**實際 AssetCode**（10-digit）| seed script 跑不了 | 阻塞 P1 |
| Q2 | 壓合機**壓力 UCL/LCL 預設值**（vendor 標準範圍）| 告警準確度 | 不阻塞，可後補 |
| Q3 | 劃線機 Pressure 的合理範圍 | 同上 | 不阻塞 |
| Q4 | Phase 1 上線時程：先 dev 環境試一個月還是直接 prod | 部署計劃 | 不阻塞 |
| Q5 | LineConfigId=3 是否為要掛載的目標產線（dev 與 prod 同一個）| seed 目標 | 不阻塞，可驗證 |
| Q6 | 既有 4 條 Modbus 是否有要拔掉/改名 | 完整看板呈現 | 不阻塞 |
| Q7 | 壓合機未來加溫度欄位的時程（CSW6 標準 vs IoTReceiverAPI 現況）| 是否影響 VisType 設計 | 不阻塞 |
| Q8 | 是否做 i18n key 完整清理 vs 留著（不會用到也沒實害）| 維護乾淨度 | 不阻塞 |

---

## 17. 不在本 spec 範圍

- Phase 2 (2026/09) 烘箱/冷凍機/加硫機/後跟定型機的進一步整合
- 其他機台（黏膠機、印刷機、切割機）遷移至 IoTReceiverAPI — 待 TDM_WebAPI 那邊先遷
- AssetCache 與 AssetCodeAndPlantView 整併
- IoTReceiverAPI schema 加溫度欄位（屬於 IoTReceiverAPI 專案的工作）
- 多語系翻譯校對（保留現有翻譯）
- 雲端/Azure 整合
