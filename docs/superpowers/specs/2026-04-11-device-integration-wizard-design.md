# Device Integration Wizard — Design Spec

**Date**: 2026-04-11
**Status**: Draft (awaiting user review)
**Type**: Feature design
**Successor of**: Direction-C dynamic device system (2026-04-10)

---

## Context

目前 IoT Dashboard 的設備類型 (`EquipmentType`) 雖然已經是 DB 管理（Direction-C 完成），但實際的「資料怎麼進來」還是綁死在外部程式 `OvenDataReceive` 透過 `POST /api/data/ingest` 推送。新增一台設備時，工程師仍要：
1. 手動 POST `/api/equipment-types` 建立類型
2. 手動定義每個 sensor ID 跟 register 的對應
3. 修改 `OvenDataReceive` 程式碼支援新設備
4. 觸發 OvenDataReceive 重新編譯部署

對「我要接一台新的 Modbus PLC」這類常見需求，門檻太高。

**目標**：一個圖形化精靈，讓使用者選協議（Modbus TCP / HTTP REST / 外部推送）→ 填連線資訊 → 後端自動掃描設備可讀資料 → 勾選需要的點 → 貼屬性標籤 → 設備自動上線到儀表板，**全程不需改動任何程式碼**。

**架構基座**：延伸 Direction-C 的 `EquipmentType` 架構，新增「協議插件」(Protocol Adapter) 抽象 + 背景輪詢服務 + 屬性管理 + 連線管理。

---

## Architectural decisions（已敲定）

| # | 問題 | 決定 |
|---|------|------|
| 1 | 後端要主動拉資料還是被動接收？ | **混合**：pull (Modbus/WebAPI) + push (現有 ingest) 兩種都支援 |
| 2 | v1 支援哪些協議？ | **Modbus TCP + HTTP REST + Push**，架構解耦讓未來加 OPC UA / MQTT 零核心改動 |
| 3 | 屬性標籤怎麼管？ | **DB 管理表** (`PropertyType` entity) + CRUD 頁面 + seed 8 個內建屬性 |
| 4 | 資料點如何組合成設備？ | **1 個連線 = 1 台設備**（精靈最後一步原子建立 Connection + EquipmentType + Sensors） |
| 5 | Push 模式如何「發現」資料點？ | **SSE 即時樣本**：前端開 `/api/stream`，等真實資料流進來，使用者看夠就按完成 |

---

## Section 1 — Architecture Overview

### 核心抽象：`IProtocolAdapter` 策略模式

每個協議實作此介面，加新協議 = 加新類別，核心邏輯不動。

```csharp
public interface IProtocolAdapter
{
    string ProtocolId { get; }            // "modbus_tcp" | "web_api" | "push_ingest"
    string DisplayName { get; }
    bool SupportsDiscovery { get; }       // 後端能否主動掃描
    bool SupportsLivePolling { get; }     // 後端能否定時輪詢
    ConfigSchema GetConfigSchema();       // 表單欄位定義（給前端動態渲染）

    ValidationResult ValidateConfig(string configJson);
    Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct);
    Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct);
}
```

### v1 三個 Adapter

| Adapter | 模式 | 用途 |
|---------|------|------|
| `ModbusTcpAdapter` | pull | 用 FluentModbus 連 PLC TCP port，讀 holding registers |
| `WebApiAdapter` | pull | 用 HttpClient 打 REST URL，解析 JSON |
| `PushIngestAdapter` | push | 不做事，資料由外部 POST `/api/data/ingest` 推進來 |

### 共用消化線

不論資料怎麼進來，**最後都走同一個 `DataIngestionService`**：

```
                Modbus 翻譯員 ──┐
                                │
                Web API 翻譯員 ─┼──► DataIngestionService ──► SQL + SSE + 告警 + 微信
                                │      （既有 Singleton, 不動）
        POST /api/data/ingest ──┘
        （既有 push 入口）
```

新增的 `PollingBackgroundService` (`IHostedService`) 負責：
1. 每秒掃描 DB 中 `IsEnabled=true && Protocol != "push_ingest"` 的所有 `DeviceConnection`
2. 對到期的 connection 呼叫對應 adapter 的 `PollAsync`
3. 把回傳結果包成 `IngestPayload` 後呼叫 `DataIngestionService.ProcessAsync()`
4. 共享既有的告警判斷、SSE 廣播、微信通知邏輯

### 設計原則

1. **既有 push pipeline 零改動** — `/api/data/ingest` + `DataIngestionService` 不動
2. **Pull 與 push 共享 `DataIngestionService`** — 不重寫告警邏輯
3. **Adapter 是純函數** — 只處理連線+讀取+格式轉換，不碰 DB/SSE/告警
4. **Adapter 註冊** — `services.AddSingleton<IProtocolAdapter, ModbusTcpAdapter>();`，`PollingBackgroundService` 透過 `IEnumerable<IProtocolAdapter>` 取得全部
5. **NuGet** — `FluentModbus` (modbus_tcp)、內建 `HttpClient` (web_api)

---

## Section 2 — Data Model Changes

### 新 Entity 1：`PropertyType`（屬性管理）

```csharp
public class PropertyType
{
    public int Id { get; set; }
    public string Key { get; set; }           // "temperature" — 機器識別碼，不可改
    public string Name { get; set; }          // "溫度" — 顯示用，可改
    public string Icon { get; set; }          // "thermometer" — lucide 圖示名
    public string DefaultUnit { get; set; }   // "℃"
    public double? DefaultUcl { get; set; }
    public double? DefaultLcl { get; set; }
    public string Behavior { get; set; }      // "normal" | "material_detect" | "asset_code" | "state" | "counter"
    public bool IsBuiltIn { get; set; }       // true = 不可刪
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

**`Behavior` 欄位作用**：
- `normal` → 一般數值，走 UCL/LCL 告警
- `material_detect` → 在位判斷，值=0 時 `DataIngestionService` 跳過所有告警
- `asset_code` → 未來允許 register 值當 assetCode 讀出（v2 功能，v1 只保留欄位）
- `state` → 狀態碼（v2 用）
- `counter` → 計數器，不做 UCL/LCL 比對

**啟動時 seed 8 筆內建屬性**：

| Key | Name | Icon | Unit | Behavior |
|-----|------|------|------|----------|
| temperature | 溫度 | thermometer | ℃ | normal |
| pressure | 壓力 | gauge | kPa | normal |
| humidity | 濕度 | droplets | % | normal |
| flow | 流量 | waves | L/min | normal |
| counter | 計數器 | hash | count | counter |
| state | 狀態 | activity | — | state |
| asset_code | 資產編號 | tag | — | asset_code |
| material_detect | 在位 | check-circle | — | material_detect |

### 新 Entity 2：`DeviceConnection`（連線設定）

```csharp
public class DeviceConnection
{
    public int Id { get; set; }
    public string Name { get; set; }              // 用戶命名 — 給管理介面看
    public string Protocol { get; set; }          // "modbus_tcp" | "web_api" | "push_ingest"
    public string ConfigJson { get; set; }        // 協議專屬設定，每 adapter 自定 schema
    public int? PollIntervalMs { get; set; }      // pull 模式才有，push 為 null
    public bool IsEnabled { get; set; }

    public DateTime? LastPollAt { get; set; }
    public string? LastPollError { get; set; }
    public int ConsecutiveErrors { get; set; }    // 給斷路器用

    public int EquipmentTypeId { get; set; }      // FK：餵哪個 EquipmentType
    public EquipmentType EquipmentType { get; set; } = null!;

    public DateTime CreatedAt { get; set; }
}
```

**`ConfigJson` 範例**（每 adapter 反序列化成自己的 record）：

```json
// modbus_tcp
{ "host": "192.168.1.50", "port": 502, "unitId": 1, "startAddress": 40001, "count": 20, "dataType": "uint16" }

// web_api
{ "url": "http://192.168.1.10:8080/api/sensors", "method": "GET", "headers": {"Authorization": "Bearer xxx"}, "jsonPathRoot": "$.data.sensors" }

// push_ingest
{ "serialNumber": "OVEN-42" }
```

**為什麼用 JSON 字串而非子表**：
- 每協議設定欄位差異大，子表會有 5+ nullable FK
- JSON 讓 schema 由 adapter 自決定，加新協議時 DB 無需 migration
- 只有 adapter 自己讀此欄位，外部不會 query/join，效能無差

### 修改 Entity：`EquipmentTypeSensor`

把舊的 `Role: "normal" | "material_detect"` 換成 `PropertyTypeId` FK。

```csharp
public class EquipmentTypeSensor
{
    public int Id { get; set; }
    public int EquipmentTypeId { get; set; }
    public int SensorId { get; set; }
    public string PointId { get; set; }
    public string Label { get; set; }
    public string Unit { get; set; }
    public int SortOrder { get; set; }

    // 移除：public string Role { get; set; }
    // 新增：
    public int PropertyTypeId { get; set; }
    public PropertyType PropertyType { get; set; } = null!;
    public string? RawAddress { get; set; }   // Modbus: "40001"，WebAPI: "$.data.temp1"，push: null

    public EquipmentType EquipmentType { get; set; } = null!;
}
```

**`RawAddress` 欄位**：後端輪詢時需知道「這個 SensorId 對應設備端的哪個 register/json path」。`SensorId` 是系統內部識別碼（用於 `SensorReadings` 表），`RawAddress` 是設備端原始地址。

### 既有資料遷移

DB 已有 6 個 EquipmentType + 18 筆 EquipmentTypeSensor（Direction-C seed）。零 downtime 遷移：

```sql
-- 1. 建 PropertyTypes 表 + seed 8 筆
-- 2. 給 EquipmentTypeSensors 加 PropertyTypeId (nullable) + RawAddress 欄位
-- 3. UPDATE 現有 sensor：
--    Role='material_detect' → PropertyType.Key='material_detect'
--    Role='normal'          → PropertyType.Key='temperature'（既有都是溫度）
-- 4. ALTER COLUMN PropertyTypeId NOT NULL + 加 FK 約束
-- 5. DROP COLUMN Role
-- 6. 建 DeviceConnections 表
```

跟現有 `Program.cs` 的 `IF NOT EXISTS` SQL pattern 一致。

### `DataIngestionService` 微調

```csharp
// 既有 GetMaterialDetectSensorIdAsync()
// 改前：.Where(s => s.Role == "material_detect")
// 改後：.Where(s => s.PropertyType.Behavior == "material_detect")
```

一行改動。

### 資料模型總覽

```
PropertyType (8 seed + 用戶自訂)
  │
  │ 1:N
  ▼
EquipmentTypeSensor ────► EquipmentType ◄──── DeviceConnection
  - PropertyTypeId         - VisType              - Protocol
  - RawAddress             - Name                 - ConfigJson
  - SensorId                                      - PollIntervalMs
                                                  - IsEnabled
                                 │
                                 │ 1:N
                                 ▼
                            LineEquipment ────► LineConfig (既有)
```

---

## Section 3 — API Surface

### 3.1 `GET /api/protocols` — 協議列表 + 動態 schema

精靈 Step 1 載入時呼叫，回傳所有可用協議與其 config schema（**前端動態生成 Step 2 表單**）。

```json
[
  {
    "id": "modbus_tcp",
    "displayName": "Modbus TCP",
    "supportsDiscovery": true,
    "supportsLivePolling": true,
    "configSchema": {
      "host":         { "type": "string", "label": "IP 位址",  "required": true, "placeholder": "192.168.1.50" },
      "port":         { "type": "number", "label": "Port",     "required": true, "default": 502 },
      "unitId":       { "type": "number", "label": "Unit ID",  "required": true, "default": 1 },
      "startAddress": { "type": "number", "label": "起始位址", "required": true, "default": 40001 },
      "count":        { "type": "number", "label": "讀取數量", "required": true, "default": 20, "max": 125 },
      "dataType":     { "type": "enum",   "label": "資料型態",
                        "options": ["uint16","int16","uint32","int32","float32"], "default": "uint16" }
    }
  },
  {
    "id": "web_api",
    "displayName": "HTTP REST API",
    "supportsDiscovery": true,
    "supportsLivePolling": true,
    "configSchema": {
      "url":          { "type": "string", "label": "URL", "required": true },
      "method":       { "type": "enum",   "label": "Method", "options": ["GET","POST"], "default": "GET" },
      "jsonPathRoot": { "type": "string", "label": "JSON 根路徑", "placeholder": "$.data.sensors" }
    }
  },
  {
    "id": "push_ingest",
    "displayName": "外部推送",
    "supportsDiscovery": false,
    "supportsLivePolling": false,
    "configSchema": {
      "serialNumber": { "type": "string", "label": "設備序號 (SN)", "required": true }
    }
  }
]
```

**關鍵設計**：未來加 OPC UA 時，前端零改動。新 adapter 在 `GetConfigSchema()` 宣告欄位即可。

### 3.2 `POST /api/discovery/scan` — 一次性掃描（不存 DB）

精靈 Step 3 用戶按「掃描」呼叫。

**Request**：
```json
{
  "protocol": "modbus_tcp",
  "config": { "host": "192.168.1.50", "port": 502, "unitId": 1, "startAddress": 40001, "count": 20, "dataType": "uint16" }
}
```

**Response (success)**：
```json
{
  "success": true,
  "points": [
    { "rawAddress": "40001", "currentValue": 155.3, "dataType": "uint16", "suggestedLabel": null },
    { "rawAddress": "40002", "currentValue": 60.1,  "dataType": "uint16", "suggestedLabel": null },
    { "rawAddress": "40013", "currentValue": 1,     "dataType": "uint16", "suggestedLabel": null }
  ]
}
```

**Response (failure)**：
```json
{ "success": false, "error": "Connection timeout: 192.168.1.50:502 (tried for 5 seconds)" }
```

後端流程：
1. 找對應 `IProtocolAdapter`
2. `adapter.ValidateConfig(configJson)`
3. `adapter.DiscoverAsync(configJson, ct)` (10 秒 timeout)
4. 結構化錯誤訊息回傳，**不丟 exception 給前端**

### 3.3 `POST /api/device-connections` — 精靈最終儲存（原子交易）

精靈 Step 7 「完成」呼叫。一次寫入 `DeviceConnection` + `EquipmentType` + `EquipmentTypeSensors`。

**Request**：
```json
{
  "name": "車間 A 烤箱",
  "protocol": "modbus_tcp",
  "config": { "host": "192.168.1.50", "port": 502, "unitId": 1, "startAddress": 40001, "count": 20, "dataType": "uint16" },
  "pollIntervalMs": 2000,
  "isEnabled": true,

  "equipmentType": {
    "name": "烤箱 A",
    "visType": "single_kpi",
    "description": null,
    "sensors": [
      { "sensorId": 5001, "pointId": "pt_temp_main", "label": "主溫度", "unit": "℃", "propertyTypeId": 1, "rawAddress": "40001", "sortOrder": 0 },
      { "sensorId": 5002, "pointId": "pt_humidity",  "label": "濕度",   "unit": "%", "propertyTypeId": 3, "rawAddress": "40002", "sortOrder": 1 },
      { "sensorId": 5013, "pointId": "pt_material",  "label": "在位",   "unit": "",  "propertyTypeId": 8, "rawAddress": "40013", "sortOrder": 2 }
    ]
  }
}
```

**後端交易邏輯**（單一 SQL transaction）：
```
BEGIN TRANSACTION
  1. 驗證 protocol 存在、所有 propertyTypeIds 存在
  2. adapter.ValidateConfig(configJson)
  3. INSERT EquipmentType → 取得 Id
  4. INSERT EquipmentTypeSensors (N 筆)
  5. INSERT DeviceConnection (FK = EquipmentType.Id)
COMMIT
```

任一步失敗 → rollback。

### 3.4 其他 `/api/device-connections` CRUD

| Endpoint | 用途 |
|----------|------|
| `GET /api/device-connections` | 列出全部（含 EquipmentType 名稱、protocol、isEnabled、lastPollAt、lastPollError） |
| `GET /api/device-connections/{id}` | 單筆完整資料 |
| `PUT /api/device-connections/{id}` | 編輯名稱 / pollIntervalMs / isEnabled / config（**不可改 sensors**） |
| `DELETE /api/device-connections/{id}` | 刪除，可選 `?cascade=true` 連 EquipmentType 一起刪 |
| `POST /api/device-connections/{id}/test` | 用當前 config 跑一次 discovery，不儲存 |
| `POST /api/device-connections/{id}/reset-errors` | 手動重置斷路器 |

### 3.5 `/api/property-types` CRUD

跟 `/api/equipment-types` 同形。**內建屬性 (`IsBuiltIn=true`) 不可刪、Key/Behavior 不可改**。

---

## Section 3.5 — Cross-Entity Impact & Notifications

### 危險操作矩陣

| 操作 | 受影響對象 | 處理 |
|------|---------|------|
| 改 PropertyType.Name/Icon | 所有引用的 sensor 顯示變更 | **silent** + SSE 廣播 |
| 改 PropertyType.Behavior | DataIngestionService 行為改變 | **warning** + 用戶確認 |
| 刪 PropertyType | 引用中的 sensor 失去屬性 | **block** (409)，除非 `?force=true&cascade=sensors` |
| 改 DeviceConnection 的 startAddress/count | 超出範圍的 sensor 失效 | **warning** + 列出失效 sensors |
| 刪 DeviceConnection | EquipmentType 變無資料來源 | **warning** + 選 cascade 或解除關聯 |
| 刪 EquipmentType | 關聯 DeviceConnection + 產線設備 | **block** + 提示先處理引用 |

### 統一 Impact Response 協定

**第一次呼叫**（不加 `?force=true`） → 伺服器 dry-run 算 impact：

```json
HTTP 409 Conflict
{
  "requiresConfirmation": true,
  "impact": {
    "severity": "block",
    "title": "無法刪除屬性「電流」",
    "message": "有 3 個感測器正在使用此屬性",
    "affected": {
      "equipmentTypes": [
        { "id": 5, "name": "馬達監控", "sensorCount": 2 },
        { "id": 7, "name": "壓縮機",   "sensorCount": 1 }
      ],
      "sensors": [
        { "id": 12, "label": "R 相電流", "equipmentTypeName": "馬達監控" },
        { "id": 13, "label": "S 相電流", "equipmentTypeName": "馬達監控" },
        { "id": 24, "label": "主電流",   "equipmentTypeName": "壓縮機" }
      ]
    },
    "suggestions": [
      { "action": "replace", "label": "改用其他屬性", "targetEndpoint": "PUT /api/equipment-types/{id}" },
      { "action": "cascade", "label": "連同 sensor 一起刪", "forceUrl": "DELETE /api/property-types/5?force=true&cascade=sensors" }
    ]
  }
}
```

**三種 severity**：

| Severity | 意義 | 前端 |
|----------|------|------|
| `silent` | 無影響 | 直接成功，小 toast |
| `warning` | 有影響但可進行 | Modal「以下項目會受影響，確認？」+ 影響列表 |
| `block` | 禁止（除非 force） | Modal「無法執行」+ 影響列表 + 建議動作 |

### SSE Config 變更廣播

既有 `/api/stream` SSE 增加事件類型 `config-updated`：

```javascript
event: config-updated
data: {
  "entity": "property_type" | "device_connection" | "equipment_type" | "line_config",
  "id": 5,
  "action": "created" | "updated" | "deleted",
  "affectedLineIds": ["line_live"]
}
```

任何 POST/PUT/DELETE 成功後，Controller 呼叫 `SseHub.BroadcastConfigAsync(...)`。

前端新增 `useConfigSync` hook 監聽，觸發對應 refetch + toast 通知。

### `ImpactAnalyzer` 服務（後端集中邏輯）

```csharp
public class ImpactAnalyzer(IDbContextFactory<IoTDbContext> dbFactory)
{
    public async Task<ImpactResult> AnalyzePropertyTypeDeletion(int propertyTypeId);
    public async Task<ImpactResult> AnalyzeConnectionConfigChange(int connId, string newConfigJson);
    public async Task<ImpactResult> AnalyzeConnectionDeletion(int connId);
    public async Task<ImpactResult> AnalyzeEquipmentTypeDeletion(int etId);
}
```

集中影響分析邏輯，所有 Controller 呼叫此服務。單元測試容易寫（純查詢、無副作用）。

### 前端通知系統

新增三層通知：

1. **Toast** — 短期狀態（success / info / warning / error）
2. **Banner** — 長期狀態（連線失敗、系統警告）
3. **Modal** — 危險操作確認

```typescript
toast.success('屬性已建立');                  // 綠 2 秒
toast.info('其他使用者更新了產線結構');         // 藍 4 秒
toast.warning('車間 A 烤箱 連線失敗');         // 黃 持久
toast.error('儲存失敗：網路錯誤');             // 紅 持久
```

頂部 Banner 範例：`⚠️ 2 個設備連線失敗: 車間 A 烤箱, 冷凍機  [查看]`

---

## Section 4 — Wizard UX Flow

### 入口點

主選單「+ 新增設備」按鈕變下拉，**共存兩個入口**：
- 🧙 整合新設備（掃描自動化） — 開精靈
- 📋 加入既有類型到產線 — 既有 `AddDeviceModal`

### 7-Step Wizard

```
Step 1 選協議 → Step 2 填連線資訊 → Step 3 掃描/等樣本 → Step 4 勾選資料點
                                                              │
                                                              ▼
Step 7 儲存+建立 ◄ Step 6 命名+選視覺 ◄ (回跳) ◄ Step 5 貼屬性標籤
```

### Step 1 — 協議選擇
卡片式選擇，每張顯示協議能力（掃描 / 輪詢）。Modbus TCP / HTTP REST / 外部推送 三張卡片，未來新協議自動新增。

### Step 2 — 連線設定（動態表單）
根據 Step 1 選的協議，**動態渲染** `configSchema` 定義的欄位。
- Modbus TCP 顯示：IP / Port / Unit ID / 起始位址 / 讀取數量 / 資料型態
- Push Ingest 顯示：選擇現有 Device 的 SerialNumber dropdown

### Step 3 — 掃描或樣本等待

**Modbus / WebAPI**：「正在連接...」progress bar → 表格顯示掃描結果（地址 / 當前值 / 資料型態），值=0 灰階顯示

**Push Ingest**：開 SSE 過濾 SN，表格逐筆 append，「已收到 X 筆樣本 / 等待 Y 秒」即時更新，用戶按「樣本已足夠」結束

### Step 4 — 勾選資料點
表格 checkbox + 「全選 / 全不選 / 隱藏零值」工具列，「已選 N / 共 M」即時統計

### Step 5 — 屬性標籤 + 命名
每個勾選的點：
- **名稱**（文字框）
- **屬性**（PropertyType dropdown，選擇後 DefaultUnit 自動帶入）
- **單位**（文字框，可覆寫）

選 `material_detect` 等特殊 behavior 屬性時顯示 ⚠️ 警告框，解釋對告警邏輯的影響。
右下角「+ 管理屬性」連結 → 開 PropertyTypesModal（不離開精靈）

### Step 6 — 設備類型命名 + 視覺元件
- 設備類型名稱、描述
- 視覺元件選擇（卡片式：SingleKpi / FourRings / DualSideSpark / CustomGrid）
- **根據 Step 4 勾選的 sensor 數量智慧推薦**對應 visType

### Step 7 — Review + Save
總覽連線設定 + 設備類型結構 + 將執行的動作清單，「✓ 建立」按鈕提交。

### UX 細節

- **可回跳，資料保留** — 每步狀態存 React Context
- **可最小化** — 右上「縮小到角落」變 badge，可繼續操作主畫面
- **錯誤處理** — Step 3 掃描失敗紅框 + 檢查清單；Step 7 儲存失敗保留精靈
- **鍵盤快捷** — `Enter` = 下一步、`Esc` = 取消（含確認）、`Ctrl+Enter` = Step 7 直接送出

### 組件拆解

```
components/modals/DeviceIntegrationWizard/
  ├─ index.tsx                  # 主容器 + step state
  ├─ WizardContext.tsx          # 共享狀態（純 reducer + Context Provider）
  ├─ WizardStepper.tsx          # 步驟指示器
  ├─ DynamicForm.tsx            # 根據 configSchema 渲染表單
  ├─ PropertyTypePicker.tsx     # Step 5 用 dropdown
  └─ steps/
      ├─ _StepTemplate.tsx
      ├─ Step1_Protocol.tsx
      ├─ Step2_Config.tsx
      ├─ Step3_Discovery.tsx
      ├─ Step4_SelectPoints.tsx
      ├─ Step5_Labels.tsx
      ├─ Step6_Equipment.tsx
      └─ Step7_Review.tsx

components/modals/PropertyTypesModal.tsx       # 屬性管理
components/modals/DeviceConnectionsModal.tsx   # 連線管理
```

---

## Section 4.5 — AI-Friendly Code Organization

未來這個功能會由 Claude Code / Cursor 等 AI 工具維護。設計時就要降低 AI 的 context cost。

### 原則 1：檔案小而專注

| 類型 | 上限 |
|------|------|
| C# Controller / Service | 300 行 |
| React 元件 | 250 行 |
| Entity / DTO 檔案 | 150 行 |

超過 → 拆檔，無例外。
- 既有 `Entities.cs` (~270 行) 已接近上限 → 新 entity **獨立檔案**，不再往裡面塞
- 既有 `App.tsx` (~800 行) 已超標 → 新精靈 state/handler 不放進去

### 原則 2：每個資料夾都有 `README.md`

固定格式，AI 第一個讀取的檔案：

```markdown
# [資料夾名稱]

## 用途
一句話說明。

## 關鍵檔案
- `xxx.cs` — 做什麼

## 如何新增 [X]
1. 複製 `_Template.cs`
2. 改 XXX、YYY、ZZZ
3. 註冊：...
4. 跑測試：...

## 依賴
- ...

## 不要改動
- ...
```

### 原則 3：Template 檔案

每個擴充點放 `_Template.*` 模板：
- `backend/Adapters/_Template.cs` — 加新 Adapter 的範本
- `frontend/.../steps/_StepTemplate.tsx` — 加新 Wizard step 的範本

模板開頭有「複製→改名→實作 X→註冊→寫測試」操作清單。

### 原則 4：資料夾結構（folder-as-contract）

```
backend/
  Adapters/                          # NEW
    README.md
    _Template.cs
    Contracts/
      IProtocolAdapter.cs
      Result.cs
      ConfigSchema.cs
      ValidationResult.cs
      DiscoveryResult.cs
      PollResult.cs
    ModbusTcpAdapter.cs
    WebApiAdapter.cs
    PushIngestAdapter.cs
  Services/
    README.md
    DataIngestionService.cs          # 既有
    PollingBackgroundService.cs      # NEW
    ImpactAnalyzer.cs                # NEW
  Controllers/
    README.md
    PropertyTypeController.cs        # NEW
    DeviceConnectionController.cs    # NEW
    DiscoveryController.cs           # NEW
    ProtocolsController.cs           # NEW
  Models/
    Entities.cs                      # 既有，不動
    Entities/                        # NEW — 新 entity 一檔一類
      README.md
      PropertyType.cs
      DeviceConnection.cs
  Dtos/                              # NEW — DTO 集中
    README.md
    PropertyTypeDtos.cs
    DeviceConnectionDtos.cs
    DiscoveryDtos.cs
    ErrorResponse.cs

frontend/src/
  lib/
    apiClient.ts                     # NEW — 統一 fetch wrapper
    apiPropertyTypes.ts              # NEW
    apiDeviceConnections.ts          # NEW
    apiDiscovery.ts                  # NEW
    apiProtocols.ts                  # NEW
  components/
    modals/
      DeviceIntegrationWizard/       # NEW
      PropertyTypesModal.tsx         # NEW
      DeviceConnectionsModal.tsx     # NEW
    ui/
      Toast.tsx                      # NEW
      ConfirmModal.tsx               # NEW
      ImpactWarningBanner.tsx        # NEW
  hooks/
    useConfigSync.ts                 # NEW
    useToast.ts                      # NEW
```

### 原則 5：命名是合約

| 類型 | 模式 | 範例 |
|------|------|------|
| Entity | `{Name}` | `PropertyType` |
| DTO (read) | `{Name}Dto` | `PropertyTypeDto` |
| DTO (request) | `Save{Name}Request` | `SavePropertyTypeRequest` |
| Controller | `{Name}Controller` | `PropertyTypeController` |
| Adapter | `{Protocol}Adapter` | `ModbusTcpAdapter` |
| React Modal | `{Name}Modal.tsx` | `PropertyTypesModal.tsx` |
| Hook | `use{Name}.ts` | `useConfigSync.ts` |
| API helper | `api{Resource}.ts` | `apiPropertyTypes.ts` |

### 原則 6：專案根 `CLAUDE.md`

新建 `CLAUDE.md` 在專案根目錄，AI 進入專案第一個讀的檔案。包含：
- 專案是什麼
- 改動前要讀哪些檔案
- 資料夾地圖
- 常見任務 how-to
- 命名規則
- 不要做的事

### 原則 7-10

- **註解寫「為什麼」不寫「做什麼」**
- **每個重要檔案頂部有導覽註解**（職責 / 依賴 / 不依賴 / 測試位置）
- **測試是規格說明書**（測試名描述行為）
- **避免魔法**（顯式 DI、顯式註冊，不用反射自動掃描）

---

## Section 5 — Error Handling & Observability

### 錯誤分類

| 類型 | 例子 | 策略 |
|------|------|------|
| Transient | 網路抖動、設備重啟、Modbus busy | 自動重試 + 退避 |
| Permanent | IP 打錯、Unit ID 不對、防火牆封鎖 | 停止重試、告知用戶 |
| Bug | NullRef、DB 連不上 | 記 log、不影響其他 connection |

判定方式：連續錯誤次數 < 3 → transient；≥ 3 → 升級為 permanent，觸發斷路器

### Adapter 層 — 絕不 throw，回 `Result<T>`

```csharp
public record Result<T>
{
    public bool IsSuccess { get; init; }
    public T? Value { get; init; }
    public string? ErrorMessage { get; init; }
    public ErrorKind ErrorKind { get; init; }

    public static Result<T> Ok(T value);
    public static Result<T> Fail(ErrorKind kind, string message);
}

public enum ErrorKind
{
    None, Transient, InvalidConfig, DeviceError, Unauthorized, UnknownProtocol, Bug
}
```

每個 adapter 方法完整 try/catch，把 exception 包成 `Result.Fail`。**唯一例外**：`OperationCanceledException` 往上拋。

### `PollingBackgroundService` — 三大防線

```csharp
public class PollingBackgroundService : BackgroundService
{
    private readonly ConcurrentDictionary<int, ConnectionState> _states = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var conns = await LoadActiveConnectionsAsync(stoppingToken);
            // 每個 connection 獨立 Task — 隔離
            var tasks = conns.Select(c => PollOneConnectionAsync(c, stoppingToken));
            await Task.WhenAll(tasks);
            await Task.Delay(1000, stoppingToken);
        }
    }
}
```

**三大防線**：
1. **隔離** — 每個 connection 獨立 Task + 獨立 `ConnectionState`，一個掛掉其他繼續
2. **退避** — 連續 transient 錯誤：2s → 4s → 8s → 10s 上限
3. **斷路器** — 連續 ≥ 3 次失敗 → 30 秒一次的「慢重試模式」，成功一次即恢復

`ConnectionState` 包含 `ConsecutiveErrors`、`NextPollAt`、`LastErrorKind`、`IsCircuitOpen`、`ScheduleNext()` 計算邏輯。

### Controller 層 — 統一錯誤回應

```csharp
public record ErrorResponse(string Code, string Message, object? Details = null);
```

| Code | HTTP | 意義 |
|------|------|------|
| `not_found` | 404 | 資源不存在 |
| `invalid_config` | 400 | Config 驗證失敗 |
| `validation_failed` | 400 | Request body 欄位錯 |
| `conflict` | 409 | 有依賴 |
| `unauthorized` | 401 | 認證失敗 |
| `adapter_error` | 502 | Adapter 回 Fail |
| `timeout` | 504 | 掃描逾時 |
| `internal_error` | 500 | Bug |

### 前端錯誤呈現策略

| 情境 | 呈現方式 |
|------|---------|
| 操作成功 | ✅ 綠 toast 2 秒 |
| 失敗可立即重試 | ⚠️ 黃 toast 4 秒 |
| 失敗需仔細看 | 🔴 紅 modal 手動關 |
| 表單欄位錯 | ⬇️ Inline 紅字 |
| 系統長期問題 | 📢 頂部 banner 持續顯示 |
| 影響確認 | ❓ Confirm modal |
| SSE 斷線 | 🟡 右上角 badge 默默重連 |

統一在 `frontend/src/lib/apiClient.ts` 處理所有 fetch + ApiError 抛出。

### Observability — OpenTelemetry + 結構化 log + Metrics

專案已有 `OpenTelemetry.Instrumentation.AspNetCore`，延伸至 Adapter 和 Polling：

**Traces**: 每次 Discover/Poll 開 ActivitySource span，標註 `modbus.host`、`modbus.port`、`poll.point_count`、`poll.success`

**Metrics**: 用 `Meter` 建 Counter/Histogram：
- `polling.success` (counter, by protocol)
- `polling.failure` (counter, by protocol + error_kind)
- `polling.duration_ms` (histogram, by protocol + connection_id)

**結構化 Log**: 用 `LoggerMessage` source generator (零 boxing、欄位命名、AI 友善)

```csharp
public static partial class PollingLogs
{
    [LoggerMessage(EventId = 2001, Level = LogLevel.Information,
        Message = "Poll success: ConnId={ConnId} Protocol={Protocol} Points={PointCount} DurationMs={DurationMs}")]
    public static partial void PollSuccess(ILogger logger, int connId, string protocol, int pointCount, long durationMs);
}
```

### 診斷 API

```http
GET /api/diagnostics/polling
```

回傳：背景服務狀態 + 每個 connection 的健康狀況（status / consecutiveErrors / lastPollAt / lastErrorMessage / averagePollDurationMs）。

管理頁直接 render 此結構。

### 錯誤傳播全景

```
設備 timeout
  ↓
Adapter.PollAsync (catch + wrap)
  ↓
Result.Fail(Transient, "...")
  ↓
PollingBackgroundService:
  - 更新 in-memory ConnectionState (++errorCount)
  - 寫 DB (LastPollError)
  - 寫 OTel trace (status=error)
  - 寫 Metric (polling.failure)
  - 寫結構化 log
  - (errorCount==3) 廣播 SSE config-updated
  ↓
前端 useConfigSync hook
  ↓
頂部 Banner: 「1 個連線失敗 [查看]」
  ↓
用戶按「查看」→ DeviceConnectionsModal → [測試連線]
  ↓
POST /api/device-connections/{id}/test
  ↓
成功 → 重置 errorCount → Banner 消失
失敗 → 更新錯誤訊息
```

---

## Section 6 — Testing Strategy

### 現況

專案目前**沒有 test project**，要同時建立測試基礎設施。

新增：
- `backend/Tests/IoT.CentralApi.Tests.csproj` (xUnit + FluentAssertions + Moq + Microsoft.AspNetCore.Mvc.Testing + WireMock.Net)
- `frontend/vitest.config.ts` (Vitest + React Testing Library)

### 測試金字塔

```
         ╱╲
        ╱  ╲      E2E (2-3)
       ╱────╲     Playwright — wizard happy path
      ╱      ╲
     ╱        ╲   Integration (15-20)
    ╱──────────╲  WebApplicationFactory + SQLite + 真實 Modbus server
   ╱            ╲
  ╱              ╲ Unit (60-80)
 ╱────────────────╲ xUnit + Moq — Adapter 邏輯、reducer
──────────────────
```

### 後端測試結構

```
backend/Tests/
  README.md
  IoT.CentralApi.Tests.csproj

  Adapters/
    ModbusTcpAdapterTests.cs
    WebApiAdapterTests.cs
    PushIngestAdapterTests.cs
    _Fixtures/
      ModbusTestServerFixture.cs    # 用 FluentModbus.ModbusTcpServer 跑 in-memory
      HttpMockFixture.cs            # WireMock.Net

  Services/
    PollingBackgroundServiceTests.cs
    ImpactAnalyzerTests.cs

  Controllers/
    PropertyTypeControllerTests.cs
    DeviceConnectionControllerTests.cs
    DiscoveryControllerTests.cs
    ProtocolsControllerTests.cs

  Integration/
    WizardE2EHappyPath.cs           # POST → background poll → SSE 廣播
    MigrationBackfillTests.cs       # 既有 Role → PropertyTypeId 遷移正確性

  _Shared/
    IntegrationTestBase.cs          # WebApplicationFactory + SQLite
    TestDbFactory.cs
```

**測試命名**：`{ClassName}_{MethodName}_{Behavior}`，例：
- `ModbusTcpAdapter_Discover_ReadsRegistersAndReturnsCurrentValues`
- `ModbusTcpAdapter_Discover_ReturnsTransientError_WhenHostUnreachable`
- `ImpactAnalyzer_AnalyzePropertyTypeDeletion_BlocksWhenInUse`

### 關鍵技術選擇

**Modbus 測試**: `FluentModbus` 自帶 `ModbusTcpServer` 類別，可在記憶體中跑 fake device，完美測試材料

**WebAPI 測試**: `WireMock.Net` 啟動本地 HTTP mock server

**Integration 測試**: `Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program>` 在同 process 啟動完整後端，用 SQLite (in-memory or file) 取代 SQL Server，每個 test 獨立 DB

### 前端測試結構

```
frontend/src/
  components/modals/DeviceIntegrationWizard/__tests__/
    WizardStateMachine.test.ts      # 純 reducer 邏輯
    DynamicForm.test.tsx            # schema → 表單渲染
    Step1_Protocol.test.tsx
    PropertyTypePicker.test.tsx
  hooks/__tests__/
    useConfigSync.test.ts           # 模擬 SSE 事件
  lib/__tests__/
    apiClient.test.ts               # 錯誤處理
```

**關鍵設計**：把 wizard state 抽成 **pure reducer + Context**，所有重要邏輯用純函式測試，不用 render。

### TDD 流程

每個 implementation task 遵守：
1. 寫 failing test
2. 跑測試確認 fail
3. 寫最小實作讓 test 過
4. 跑測試確認 pass
5. 補錯誤路徑 test
6. Commit

### CI 整合

GitLab CI 新增 stage：
```yaml
test-backend:
  stage: test
  image: mcr.microsoft.com/dotnet/sdk:9.0
  script:
    - dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --configuration Release
test-frontend:
  stage: test
  image: node:20
  script:
    - cd frontend && npm ci && npm run test
```

v1 階段不 enforce coverage 數字。

### 測試 ROI

| 類型 | 目標覆蓋 | ROI |
|------|---------|-----|
| Unit (adapter / reducer / state machine) | 80%+ | 🟢 非常高 |
| Integration (controller + DB) | 關鍵路徑 | 🟢 高 |
| E2E (wizard happy path) | 1-2 支 | 🟡 中 |
| Adapter error paths | 每種 ErrorKind | 🟢 高 |
| UI 像素驗證 | 0 | 🔴 低 |

---

## 驗收 Verification

開發完成後，以下場景必須能跑通：

### 場景 1：Modbus TCP 完整接入
1. 啟動 fake Modbus TCP server (port 5020)，預填 register 40001=155, 40002=60, 40013=1
2. 開瀏覽器，按「+ 新增設備 → 整合新設備」
3. 選 Modbus TCP，填 host=localhost、port=5020、startAddress=40001、count=3
4. 按掃描 → 看到 3 筆 register
5. 全勾，標籤分別貼「溫度」「濕度」「在位」
6. 命名「測試烤箱」、選 single_kpi、按建立
7. **預期**：2 秒內儀表板出現「測試烤箱」卡片，顯示 155℃ / 60% / 鞋子在位
8. 改 Modbus server 的 40013=0
9. **預期**：設備卡片顯示「無料」狀態，告警邏輯跳過

### 場景 2：Push Ingest 流程
1. 已有 OvenDataReceive 在推 SN=OVEN-42
2. 開精靈，選「外部推送」，下拉選 OVEN-42
3. 等 SSE 資料流進來，看到 sensor IDs
4. 勾選 + 標籤 + 命名 + 建立
5. **預期**：設備卡片即時顯示 push 進來的資料

### 場景 3：跨實體影響
1. 建一個自訂屬性「電流」（從屬性管理頁）
2. 用該屬性在某個設備掛 1 個 sensor
3. 試圖刪「電流」屬性
4. **預期**：跳 modal「無法刪除，被 1 個 sensor 使用」+ 列出 sensor + 「級聯刪除」選項

### 場景 4：連線錯誤恢復
1. 停止 Modbus server
2. 等待 7-10 秒
3. **預期**：頂部 banner 顯示「1 個連線失敗」，設備卡片變灰
4. 重新啟動 Modbus server
5. **預期**：30 秒內 banner 消失，設備卡片恢復顯示

### 場景 5：既有資料無痛遷移
1. 在 Direction-C 之後的 DB（已有 6 EquipmentType + 18 sensors，全 Role=normal/material_detect）
2. 部署本功能
3. 啟動 backend
4. **預期**：所有既有 sensor 自動取得對應 PropertyTypeId，舊功能完全不受影響

### 自動化驗收
- 後端：`dotnet test backend/Tests/IoT.CentralApi.Tests.csproj` 全綠
- 前端：`cd frontend && npm test` 全綠
- E2E：Playwright 走完場景 1 (happy path)

---

## Out of Scope (v2+)

- OPC UA / MQTT / Siemens S7 protocol adapters
- Modbus RTU (serial)
- 跨設備組合（point pool）
- Wizard 中途自動儲存 draft
- 詳細的權限管理（誰能建/改/刪 connection）
- 連線設定的版本管理（rollback）
- Property type 的視覺化編輯器（icon picker、顏色選擇）
- 多語系（目前繁中為主）

---

## Self-Review

✅ **Placeholder scan**: 沒有 TBD/TODO/「實作後決定」字樣
✅ **Internal consistency**: Section 之間引用一致（例如 `IProtocolAdapter` 在 1/3/4.5/5/6 都有提及，含義一致）
✅ **Scope check**: 此 spec 範圍夠大但仍然可在單一 implementation plan 內完成（後端基礎 + 3 adapter + 精靈 + 管理頁 + 測試）。建議在 writing-plans 階段拆成 ~12-15 個 task，每個 task 約 1-2 小時
✅ **Ambiguity check**: 關鍵決策都有明確選擇（Q1-5）；協議用 JSON config 而非子表的決定有明確理由；錯誤處理三層（adapter / polling / controller）職責清楚

---

## 下一步

1. **使用者 review 此 spec** — 你 review 後告知是否要修改
2. **invoke `writing-plans` skill** — 產出 task-by-task 的 implementation plan，存在 `docs/superpowers/plans/2026-04-11-device-integration-wizard-plan.md`
3. **執行階段** — 用 `executing-plans` (inline) 或 `subagent-driven-development`（推薦，每個 task 獨立 subagent + 跨 task review）
