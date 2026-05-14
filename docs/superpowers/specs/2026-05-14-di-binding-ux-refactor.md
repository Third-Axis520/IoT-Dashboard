# DI Binding UX Refactor Design (#9)

**狀態**：📋 ready for phased impl（建議從 D-3 開始試水）
**識別日期**：2026-04-28（使用者第一次回饋）
**估時**：D-3 = 2-3 天 / D-1 = 5-7 天 / D-2 = 8-12 天

---

## 1. 使用者痛點

「我有藥水箱（溫度設備），它配一個 DI 偵測鞋子在位 → 應該在藥水箱卡片直接『新增 DI』就好」

實際系統要使用者：
1. 跑精靈建 6 個溫度 EquipmentType
2. 跑精靈建 1 個 DI 集中器 EquipmentType（32 bit sensor）
3. 限值 modal → 溫度 sensor 列 → 「條件採樣」摺疊區 → 跨 AssetCode 下拉 → 透過 `SensorGatingRule` 表關聯

→ 跨 3 個 modal、跨 2 個 mental model（設備 vs gating rule）。**短期已做**「預設展開摺疊區 + ⚡ 快捷 icon」mitigation 但只是減少藏深度，沒解 mental model 問題。

## 2. 三條路徑（per memory `project_di_binding_ux_refactor.md`）

| 方案 | 後端 | 前端 | Migration | 估時 |
|---|---|---|---|---|
| **D-3 前端假象** | 無 | 中（卡片加 DI badge + 快捷綁定）| 無 | 2-3 天 |
| **D-1 資料模型統一** | 中（schema + ingestion + controller）| 中（精靈 step 改造、限值 modal 簡化）| 需轉 SensorGatingRule 到新欄位 | 5-7 天 |
| **D-2 多 function code** | 大（polling 重寫支援 holding + discrete 混合）| 中 | 大（合併兩個 ET）| 8-12 天 |

**推薦先做 D-3** — 試 UX 假象是否解決直覺問題，成本最低，不改資料。

## 3. D-3 詳細設計（推薦）

### 3.1 卡片增強

`EquipmentCard` 加：
- 若該 asset 的任一 sensor 被 `SensorGatingRule` gating → 顯示 small "DI: X 在位" badge
- Badge 點擊 → 開 LimitsSettingsModal 直接定位到該 sensor 的「條件採樣」區塊（已展開）

### 3.2 卡片「+ 綁 DI」按鈕

如果該 asset 還沒任何 gating rule：
- 卡片設定區（齒輪 icon 展開）加「+ 綁 DI」按鈕
- 點擊 → 開新 modal 或 inline panel：選哪個 sensor 要被 gate + 選哪個 DI sensor 當 source（從 `/api/sensor-gating/candidates` 拉）
- 儲存 → PUT `/api/sensor-gating/{assetCode}`（既有 API 不變）

### 3.3 後端零變動

`SensorGatingRule` 表保留、API endpoint 不動、`GatingEvaluator` 不動。D-3 純前端 UX 層 sugar。

### 3.4 驗收

- 使用者**不需要打開 LimitsSettingsModal** 就能完成「綁 DI」操作
- 卡片直接可見「目前 DI 狀態」
- 既有透過 LimitsSettingsModal 設定的 gating rule 仍然顯示一致狀態
- 132 backend + 65 frontend tests 全綠

### 3.5 風險

- **使用者仍會問「DI 集中器設備本身在哪裡可以管理？」** — 卡片偽裝後 DI 集中器這個 EquipmentType 仍然存在於系統，dashboard 上是否顯示？建議：dashboard 配置允許隱藏 DI 集中器卡片（讓使用者覺得 DI 只是另一個設備的屬性，不是獨立設備）
- **跨 AssetCode 場景**：如果 DI 集中器在 A 棟、被綁的溫度設備在 B 棟，卡片上的「+ 綁 DI」要能跨棟選 DI source。candidates API 已支援跨 asset，UI 加 group label 就好

## 4. D-1 詳細設計（若 D-3 不夠）

### 4.1 Schema 變動

`EquipmentTypeSensor` 加兩個欄位：
- `GatedByAssetCode VARCHAR(50) NULL` — 哪個 AssetCode 的 DI 控制這個 sensor
- `GatedBySensorId INT NULL` — 那個 DI 的 SensorId

NULL 表示無 gating。

### 4.2 Ingestion 路徑

`DataIngestionService.ProcessAsync` 不再查 SensorGatingRule，改成讀 sensor 的 GatedBy 欄位 + 從 LatestReadingCache 拿 DI 值。

### 4.3 API & UI

- 精靈 Step 5 「設定 sensor」加可選下拉「綁 DI（選用）」
- 限值 modal 條件採樣摺疊區內容收掉（gating 已在 sensor 層級設定）
- `SensorGatingRule` 表廢棄，提供一次性 migration script 轉資料

### 4.4 與 #7（Gating 收斂）的協同

D-1 等於同時完成 #7 的「統一到 SensorGatingRule 一套」**反向版本**（統一到 EquipmentTypeSensor 欄位）。**選 D-1 不要再做 #7**，兩者擇一。

## 5. D-2 路徑（一般不選）

只在「使用者需要同一台 PLC 同時混合 holding + discrete sensor 在同一個 EquipmentType」場景才考慮。當前場景沒這個需求。

## 6. 建議排程

```
今天：D-3 spec 落定（本 spec）
下次 sprint：D-3 impl + ship
觀察 1-2 週：使用者反饋
  ├─ 如解決 → 收工，#9 close
  └─ 仍困難 → 啟動 D-1（同時 close #7）
```

## 7. 相關

- 短期 mitigation 記錄：commit hash 待補（gating 預設展開 + ⚡ 快捷 icon）
- 後端 schema：`backend/Models/Entities/SensorGatingRule.cs`
- 前端 gating UI：`frontend/src/components/sensors/GatingRow.tsx`、`GatingSelector.tsx`、`GatingBadge.tsx`
- 限值 modal：`frontend/src/components/modals/LimitsSettingsModal.tsx`
- 精靈：`frontend/src/components/modals/DeviceIntegrationWizard/`
- 與 #7 的關係：`docs/superpowers/specs/2026-05-14-gating-convergence.md`
