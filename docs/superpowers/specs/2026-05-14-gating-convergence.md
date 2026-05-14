# Sensor Gating Convergence Design (#7)

**狀態**：📋 ready for plan/impl（建議分 2 個 sprint 做）
**識別日期**：2026-04-27（並存策略落地當時就記為 tech debt）
**估時**：3-5 天

---

## 1. 現狀（驗證自 2026-05-14 current code）

兩套並存中：

### 1a. 舊機制 — `PropertyType.Behavior == "material_detect"`
- 觸發點：`DataIngestionService.ProcessAsync` 在判斷 `hasMaterial` 用
- 行為：material_detect=false 時 reading 仍寫入 + 標記 `HasMaterial=false`，**告警跳過**
- UI 入口：`PlcTemplateModal` 設定 sensor 為 material_detect property type

### 1b. 新機制 — `SensorGatingRule` 表
- 觸發點：`GatingEvaluator.Evaluate` 在 polling tick 判斷
- 行為：gated=true 時 **reading 完全不寫**（從 SSE payload 過濾掉）
- UI 入口：`LimitsSettingsModal` 的 sensor row 下「條件採樣」展開

### 1c. 並存規則（AND）
同一 sensor 被兩種同時 gating → 兩邊都要 pass 才寫入。實作上：
- material_detect fail → reading 寫入但 HasMaterial=false，告警跳過
- SensorGatingRule fail → reading 完全不寫

衝突場景（兩者結論不一致）→ 較嚴格者勝（不寫 > 寫入但標記）。

## 2. 收斂目標

統一到 `SensorGatingRule` 一套 — 把 `material_detect` 表示為 SensorGatingRule 的 self-referential 特例：
- `GatedAssetCode = own AssetCode`
- `GatingAssetCode = own AssetCode`
- `GatingSensorId = the material_detect sensor in this asset`
- `DelayMs = 0`, `MaxAgeMs = poll interval × 2`

## 3. Tasks（建議分兩 sprint）

### Sprint 1（基礎，1-2 天）

**T1：Migration script**
寫 SQL 把現有 `PropertyType.Behavior == "material_detect"` 的 sensor 反映到 `SensorGatingRule` 表：
```sql
INSERT INTO SensorGatingRules (GatedAssetCode, GatedSensorId, GatingAssetCode, GatingSensorId, DelayMs, MaxAgeMs)
SELECT le.AssetCode, ets.SensorId, le.AssetCode, mat.SensorId, 0, 10000
FROM LineEquipments le
JOIN EquipmentTypes et ON et.Id = le.EquipmentTypeId
JOIN EquipmentTypeSensors mat ON mat.EquipmentTypeId = et.Id
JOIN PropertyTypes mat_pt ON mat_pt.Id = mat.PropertyTypeId AND mat_pt.Behavior = 'material_detect'
JOIN EquipmentTypeSensors ets ON ets.EquipmentTypeId = et.Id AND ets.PropertyTypeId != mat.PropertyTypeId
WHERE le.AssetCode IS NOT NULL
ON DUPLICATE KEY UPDATE ... -- 對 SQL Server: MERGE
```

⚠️ idempotent — 多次跑不該重複建。`(GatedAssetCode, GatedSensorId, GatingAssetCode, GatingSensorId)` 應該 unique constrain 或 controller validation 已防呆。

**T2：Read path 統一**
`DataIngestionService.ProcessAsync` 移除 hasMaterial 分支，全部走 GatingEvaluator + SensorGatingRule。`HasMaterial` 欄位變成從 SensorGatingRule 反查的 derived value。

**T3：Reading 寫入策略統一**
material_detect=false 時改成 **不寫**（跟 SensorGatingRule 一致）。這是 breaking change：歷史查詢看不到 「無料時段」的 0 值。

**Sprint 1 deliverable**：兩個 gating 機制邏輯統一，但 UI 仍兩處入口。

### Sprint 2（UI + cleanup，1-2 天）

**T4：UI 統一入口**
把 PlcTemplateModal 的 material_detect property 設定整合到 LimitsSettingsModal「條件採樣」。Wizard 流程：選 material_detect sensor 時自動建 SensorGatingRule。

**T5：Property type 收尾**
`PropertyType.Behavior == "material_detect"` 改成純標籤（給 UI 顯示用，不再有特殊邏輯）。

**T6：HasMaterial 欄位處理**
2 條路：
- (a) 保留為 derived column（從 SensorGatingRule.GatingDecision 反算）— 向後相容
- (b) 移除 + 改前端 dashboard 用其他指標

**推薦 (a)** — 避免前端要動。Sprint 2 終止後可以收 (b) 作另一個 tech debt。

**T7：歷史資料**
既有 HasMaterial=false 的 reading 怎麼處理：
- 保留（不動 DB）
- 提供管理頁面可以「清理舊 HasMaterial=false 行」

## 4. 風險

- **Breaking T3**：reading 完全不寫，dashboard 顯示「無料時段」會留空（之前是 0）。需要前端配合空值 UX。
- **Migration T1 race condition**：跑 migration 時若 polling 仍在進行，可能新加的 reading 觸發舊路徑邏輯。建議部署時短暫停 polling 服務 → 跑 migration → 啟動服務。
- **HasMaterial 反查成本**：每筆 reading 查 SensorGatingRule 表會慢。需要適當索引 + 可能加 LatestReadingCache 包裝。

## 5. 何時做

**觸發條件**（per memory）：
1. 使用者抱怨兩處設定不一致
2. 新功能需要查「此刻是否被 gated」
3. 歷史資料需要重算

**目前優先級：中** — 兩套並存已運行 2 週無事故，但 UI 入口分散會逐步累積使用者困惑。建議 Q3 完成。

## 6. 相關

- 原並存設計：`docs/superpowers/specs/2026-04-27-sensor-gating-design.md`
- Tech debt memory：`project_gating_tech_debt.md`
- 既有 maxAgeMs validation：`project_gating_max_age_pitfall.md`（已 close）
