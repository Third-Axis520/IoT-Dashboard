# Sensor 管理 UI 缺口 — 規格與實作計畫

**狀態**：📋 待排入 sprint
**識別日期**：2026-04-28
**估時**：0.5 ~ 1 天
**優先級**：中（影響 sensor gating 場景使用流暢度）

---

## 1. 問題

使用者已建立 DeviceConnection 並設定好 sensors（透過 DeviceIntegrationWizard），**事後想對該連線追加 sensor**（例如 sensor gating 需要追加 DI 來偵測新工位），目前**沒有 UI 入口**。

唯一 workaround：刪除整個連線、重跑 wizard 把所有 sensors（含新增的）一次選齊。

---

## 2. 現狀盤點

### 前端入口

| Modal | 能否新增 sensor row |
|-------|--------------------|
| `EditDeviceConnectionModal`（2026-04-28 新建）| ❌ 只改 host / port / 間隔 / 名稱 |
| `SensorMappingModal` | ❌ 只重新對應既有 sensorId，不能新增 row |
| `DeviceIntegrationWizard` | ❌ 只支援新建連線，無 edit-mode |
| `PlcTemplateModal` | ❌ 是 PLC template 區塊管理，與 EquipmentType sensors 不同 |
| `DeviceManagementModal` | ❌ 只處理綁定／解綁 |

### 後端

`PUT /api/equipment-types/{id}` **已支援全量替換**（`EquipmentTypeController.cs` line 113，`RemoveRange + AddRange` 模式）。前端**沒接**。

```csharp
// 現有可用：
db.EquipmentTypeSensors.RemoveRange(et.Sensors);
et.Sensors = req.Sensors.Select(s => new EquipmentTypeSensor { ... }).ToList();
await db.SaveChangesAsync();
```

---

## 3. 風險

- 刪除-重建會 cascade 觸發 `DELETE FROM EquipmentType` → 連帶 `EquipmentTypeSensor` 全清
- 該 EquipmentType 對應的歷史 reading 是否被刪，依 cascade 設定（**待驗證**：寫實作前先確認 `LiveReadings` / `Readings` 等表的 FK 是否設 cascade）
- Sensor gating 場景中 GatedAssetCode + GatedSensorId 的 `SensorGatingRule` 也會 cascade（FK 鏈：DeviceConnection → EquipmentType → Sensor → GatingRule？需要確認 schema）

---

## 4. 建議實作

### 4.1 前端 — 擴充 EditDeviceConnectionModal

加可展開「資料點管理」區塊（折疊預設展開，或改成 tab 介面）：

```
[編輯連線設定]
┌─────────────────────────────┐
│ 連線資訊                     │
│ 名稱: [____________]         │
│ 輪詢間隔: [5s v]             │
│ Host: [____________]         │
│ Port: [502]                  │
│ ...                          │
├─────────────────────────────┤
│ 資料點管理 ▼                 │  ← 可展開
│                              │
│ 既有 (3):                    │
│ ┌─ 烤箱A溫度 #40001 [編輯][🗑]│
│ ├─ 烤箱A濕度 #40002 [編輯][🗑]│
│ └─ 鞋子在位 DI #00001 [編輯][🗑]│
│                              │
│ [掃描並新增] →               │  ← 觸發 sub-flow
└─────────────────────────────┘
[取消] [測試] [儲存]
```

### 4.2 「掃描並新增」sub-flow

重用 wizard 的兩個 step：

1. **點按鈕** → 跑 `POST /api/device-connections/{id}/test`（既有 test endpoint 已 return discovered points）
2. **discovered points 列表**減去**既有 sensors 的 RawAddress** → 只列「未綁定」候選
3. 使用者勾選要新增的、填 label / unit / propertyType（重用 `Step5_Labels` 元件）
4. 確定後加進 modal 主畫面的 sensors list

### 4.3 儲存

點主 modal「儲存」時：
1. PUT `/api/device-connections/{id}` 帶連線層欄位（同現行）
2. PUT `/api/equipment-types/{equipmentTypeId}` 帶**完整 sensor list**（既有保留 + 新增 + 編輯 + 移除）
3. 兩個都成功才 onSaved，任一失敗顯示 ErrorBanner

### 4.4 元件抽取建議

把 `Step3_Discovery.tsx` + `Step4_SelectPoints.tsx` + `Step5_Labels.tsx` 的核心邏輯抽成可重用 hook / 元件，wizard 與本 modal 共用：

```
hooks/useDiscoveryFlow.ts   — discovery state + scan 邏輯
components/sensors/SensorPickerPanel.tsx  — 列表 + 勾選 + label 編輯
```

---

## 5. 實作計畫（Task 切分）

| # | Task | 工時 |
|---|------|------|
| 1 | 驗證 cascade 風險：實際試刪一個有歷史資料的 connection，確認 readings 是否被刪 | 0.5h |
| 2 | 抽 `useDiscoveryFlow` hook（從 Step3） | 1h |
| 3 | 抽 `SensorPickerPanel` 元件（從 Step4 + Step5） | 1.5h |
| 4 | `EditDeviceConnectionModal` 加 sensors 區塊 + 既有列表 + 編輯/刪除 | 1.5h |
| 5 | 加「掃描並新增」按鈕觸發 SensorPickerPanel sub-modal | 1h |
| 6 | 串 PUT `/api/equipment-types/{id}` 全量更新 + ErrorBanner | 1h |
| 7 | Vitest 覆蓋（add / edit / delete / scan / save） | 1.5h |
| 8 | Wizard 重構成共用元件（避免 regression） | 1h |
| **合計** | | **~9 小時** |

---

## 6. 驗收條件

- [ ] 既有連線可從 EditDeviceConnectionModal 看到所有 sensors
- [ ] 可掃描 PLC 取得未綁定 address 並勾選新增
- [ ] 可單獨刪除既有 sensor（保留其他）
- [ ] 可改 sensor 的 label / unit
- [ ] 儲存後，dashboard 自動 reload，新 sensor 開始輪詢
- [ ] DeviceIntegrationWizard 仍可正常新建（不被重構打壞）
- [ ] 後端 132 tests + 前端 ≥ 46 tests 全綠
- [ ] 加 sensor gating 規則時，新加的 DI 會出現在 GatingSelector 候選清單

---

## 7. 相關檔案

- 缺口位置：`frontend/src/components/modals/EditDeviceConnectionModal.tsx`
- 後端可重用 endpoint：`backend/Controllers/EquipmentTypeController.cs` PUT
- 可重用前端：
  - `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step3_Discovery.tsx`
  - `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step4_SelectPoints.tsx`
  - `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step5_Labels.tsx`
- 之前的 wizard spec：`docs/superpowers/specs/2026-04-11-device-integration-wizard-design.md`
