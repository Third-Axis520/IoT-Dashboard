# 移除衝突/冗餘舊程式碼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除被「設備整合精靈」取代的 5 個舊功能模組，消除前端硬編碼殘留，讓系統只保留 DB 驅動的資料流。

**Architecture:** 由外而內拆除 — 先斷 UI 入口（toolbar 按鈕），再刪元件檔案，最後清理被釋放的常數/工具函數。每個 Task 獨立可 commit，不互相阻塞。

**Tech Stack:** React 19, TypeScript 5.8, Vite 6

---

## 影響範圍總覽

```
要刪除的檔案（5 個）:
  frontend/src/components/modals/DeviceDefCenterModal.tsx   ← Task 1
  frontend/src/constants/sensorConfig.ts                     ← Task 3
  frontend/src/constants/liveLineConfig.ts                   ← Task 4
  frontend/src/constants/templates.ts (部分刪除)             ← Task 4
  frontend/src/utils/simulation.ts (部分刪除)                ← Task 5

要修改的檔案（5 個）:
  frontend/src/App.tsx                                       ← Task 1, 5
  frontend/src/components/modals/AddDeviceModal.tsx           ← Task 2
  frontend/src/components/modals/SensorMappingModal.tsx       ← Task 2
  frontend/src/constants/templates.ts (保留 COLORS/getStatusColor) ← Task 4
  frontend/src/utils/simulation.ts (保留 generateId)         ← Task 5
```

## 依賴鏈

```
Task 1 (刪 DefCenter)        → 無前置依賴
Task 2 (移除 SENSOR_CONFIG 引用) → 無前置依賴
Task 3 (刪 sensorConfig.ts)  → 依賴 Task 2 完成（否則 import 會壞）
Task 4 (刪 liveLineConfig + 清理 templates.ts) → 依賴 Task 3（liveLineConfig import sensorConfig）
Task 5 (清理 simulation.ts)  → 依賴 Task 1, 4（DefCenter + templates 死碼是主要 consumer）
Task 6 (驗證 + commit)       → 依賴全部
```

---

### Task 1: 移除 DeviceDefCenterModal 與 Toolbar 按鈕

**Why:** DefCenter 建立的模板只存前端記憶體，刷新即消失。設備整合精靈的 Step 6-7 已完整取代此功能並正確寫入 DB。

**Files:**
- Delete: `frontend/src/components/modals/DeviceDefCenterModal.tsx`
- Modify: `frontend/src/App.tsx`

**修改 App.tsx 的 4 個位置：**

- [ ] **Step 1: 移除 import**

  刪掉 `App.tsx` 第 27 行：
  ```
  import { DeviceDefCenterModal } from './components/modals/DeviceDefCenterModal';
  ```

- [ ] **Step 2: 移除 state 與 handler**

  刪掉 `App.tsx` 中：
  - `const [showDefCenter, setShowDefCenter] = useState(false);` （第 62 行）
  - `handleAddTemplate` callback（第 408-411 行）：
    ```typescript
    const handleAddTemplate = useCallback((tpl: MachineTemplate) => {
      setTemplates(prev => [...prev, tpl]);
      setShowDefCenter(false);
    }, []);
    ```

- [ ] **Step 3: 移除 Toolbar 中的 Database 圖示按鈕**

  刪掉 `App.tsx` 第 606-614 行的整個 `<button>` 區塊：
  ```tsx
  <button
    onClick={() => setShowDefCenter(true)}
    className="flex items-center justify-center w-8 h-8 ..."
    title="设备定义中心"
    aria-label="设备定义中心"
  >
    <Database className="w-4 h-4" />
  </button>
  ```

  同時檢查 `Database` icon 是否還被其他地方使用 — 若無，從第 2 行的 lucide import 中也移除 `Database`。

- [ ] **Step 4: 移除 Modal render**

  刪掉 `App.tsx` 第 965 行：
  ```tsx
  {showDefCenter && <DeviceDefCenterModal onClose={() => setShowDefCenter(false)} onSave={handleAddTemplate} />}
  ```

- [ ] **Step 5: 刪除元件檔案**

  ```bash
  rm frontend/src/components/modals/DeviceDefCenterModal.tsx
  ```

- [ ] **Step 6: 確認 TypeScript 編譯通過**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 errors

- [ ] **Step 7: Commit**

  ```bash
  git add -A frontend/src/components/modals/DeviceDefCenterModal.tsx frontend/src/App.tsx
  git commit -m "refactor: remove DeviceDefCenterModal (replaced by integration wizard)"
  ```

---

### Task 2: 移除 SENSOR_CONFIG 硬編碼引用

**Why:** `SENSOR_CONFIG` 把 12 個感測器的 label/unit 寫死在前端，但系統已有 DB PropertyType 和 Point.unit。AddDeviceModal 和 SensorMappingModal 用它只是為了在 sensor dropdown 顯示 unit 和 label — 可以改用已有的即時資料。

**Files:**
- Modify: `frontend/src/components/modals/AddDeviceModal.tsx`
- Modify: `frontend/src/components/modals/SensorMappingModal.tsx`

**核心改法：** 兩個 Modal 都已經拿到 `liveSensors: Map<number, number>` （即時的 sensorId → value），但沒有 unit 資訊。sensor dropdown 的 unit 目前從 `SENSOR_CONFIG[id]?.unit ?? '℃'` 取 — 改為統一 fallback `''`，因為 unit 最終由 Point 自身決定，不是由 sensor 決定。

#### AddDeviceModal.tsx（4 處）

- [ ] **Step 1: 移除 import**

  刪掉第 4 行：
  ```
  import { SENSOR_CONFIG } from '../../constants/sensorConfig';
  ```

- [ ] **Step 2: 替換 sensor preview 的 unit 引用（第 283 行）**

  ```
  // Before:
  <span className="opacity-50">{SENSOR_CONFIG[id]?.unit ?? '℃'}</span>
  // After — 直接不顯示 unit（這裡是 Step 2 的 live preview，只是粗覽）:
  <span className="opacity-50">{val.toFixed(1)}</span>
  ```

  或者更好的方式：用已選 template 的 point type 推斷 unit。由於這區是 assetCode live preview（grid 顯示所有 sensor raw values），sensor 本身並不帶 unit 資訊，**直接顯示數值即可**，unit 會在 Step 3 mapping 後從 Point 物件取得。

- [ ] **Step 3: 替換 sensor dropdown 的 label/unit（第 365-366 行）**

  ```typescript
  // Before:
  const unit = SENSOR_CONFIG[id]?.unit ?? '℃';
  const label = SENSOR_CONFIG[id]?.label ?? '感測器';
  // After:
  const val = liveSensors?.get(id);
  ```

  option 文字改為：
  ```tsx
  // Before:
  <option key={id} value={id}>
    #{id} {val !== undefined ? `${val.toFixed(1)}${unit}` : label}
  </option>
  // After:
  <option key={id} value={id}>
    #{id} {val !== undefined ? val.toFixed(1) : '—'}
  </option>
  ```

- [ ] **Step 4: 替換 live value badge 的 unit（第 378 行）**

  這裡可以用已選 template 的 point unit：
  ```typescript
  // Before:
  {liveVal.toFixed(1)}{SENSOR_CONFIG[currentSensorId!]?.unit ?? '℃'}
  // After — 用 selectedTpl 的 point unit:
  {liveVal.toFixed(1)}{selectedTpl?.points[idx]?.type === 'temperature' ? '℃' : selectedTpl?.points[idx]?.type === 'pressure' ? 'MPa' : ''}
  ```

  或更簡單：point 的 unit 在 template 建立時已由 `createEquipmentFromTemplate` 設定，但在 Step 3 階段 point 還沒建好，所以 **直接顯示數值即可**：
  ```tsx
  {liveVal.toFixed(1)}
  ```

#### SensorMappingModal.tsx（3 處）

- [ ] **Step 5: 移除 import**

  刪掉第 4 行：
  ```
  import { SENSOR_CONFIG } from '../../constants/sensorConfig';
  ```

- [ ] **Step 6: 替換 sensor dropdown（第 155-156 行）**

  SensorMappingModal 已經有完整的 `equipment.points` 資料（包含 `unit`），改用 point 自身的 unit：

  ```typescript
  // Before:
  const unit = SENSOR_CONFIG[id]?.unit ?? '℃';
  const label = SENSOR_CONFIG[id]?.label ?? '感測器';
  // After:
  const val = liveSensors?.get(id);
  ```

  option 改為：
  ```tsx
  <option key={id} value={id}>
    #{id} {val !== undefined ? val.toFixed(1) : '—'}
  </option>
  ```

- [ ] **Step 7: 替換 live value badge（第 168 行）**

  這裡有 point 的 unit 可用：
  ```tsx
  // Before:
  {liveVal.toFixed(1)}{SENSOR_CONFIG[currentSensorId!]?.unit ?? '℃'}
  // After — 用 equipment.points[idx].unit:
  {liveVal.toFixed(1)}{equipment.points[idx]?.unit ?? ''}
  ```

- [ ] **Step 8: 確認 TypeScript 編譯通過**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

- [ ] **Step 9: Commit**

  ```bash
  git add frontend/src/components/modals/AddDeviceModal.tsx frontend/src/components/modals/SensorMappingModal.tsx
  git commit -m "refactor: replace hardcoded SENSOR_CONFIG with dynamic data from Point/liveSensors"
  ```

---

### Task 3: 刪除 sensorConfig.ts

**Why:** Task 2 已移除所有引用，此檔案現在無人 import。

**Files:**
- Delete: `frontend/src/constants/sensorConfig.ts`

**前置條件：** Task 2 已完成。

- [ ] **Step 1: 確認無殘餘引用**

  ```bash
  cd frontend && grep -r "sensorConfig" src/ --include="*.ts" --include="*.tsx"
  ```
  Expected: 只有 `liveLineConfig.ts` 仍引用（Task 4 會處理）。

- [ ] **Step 2: 刪除檔案**

  ```bash
  rm frontend/src/constants/sensorConfig.ts
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add -A frontend/src/constants/sensorConfig.ts
  git commit -m "refactor: delete sensorConfig.ts (hardcoded sensor definitions, replaced by DB PropertyType)"
  ```

---

### Task 4: 刪除 liveLineConfig.ts + 清理 templates.ts

**Why:**
- `liveLineConfig.ts`：硬編碼的「烤箱生產線」定義，無人 import，完全死碼。
- `templates.ts` 的 `INITIAL_TEMPLATES` 和 `INITIAL_LINES`：硬編碼示範資料，無人 import。但 `COLORS` 和 `getStatusColor` 被 7 個視覺化元件使用，必須保留。

**Files:**
- Delete: `frontend/src/constants/liveLineConfig.ts`
- Modify: `frontend/src/constants/templates.ts`

- [ ] **Step 1: 刪除 liveLineConfig.ts**

  ```bash
  rm frontend/src/constants/liveLineConfig.ts
  ```

- [ ] **Step 2: 清理 templates.ts — 只保留 COLORS 和 getStatusColor**

  `templates.ts` 改為只保留以下內容（約 21 行）：

  ```typescript
  import type { PointStatus } from '../types';

  export const COLORS = {
    bg: 'var(--bg-panel)',
    cardBg: 'var(--bg-card)',
    border: 'var(--border-base)',
    textPrimary: 'var(--text-main)',
    textSecondary: 'var(--text-muted)',
    normal: 'var(--accent-green)',
    warning: 'var(--accent-yellow)',
    danger: 'var(--accent-red)',
    hot: 'var(--accent-orange)',
    cold: 'var(--accent-blue)',
  };

  export const getStatusColor = (status: PointStatus) => {
    if (status === 'danger') return COLORS.danger;
    if (status === 'warning') return COLORS.warning;
    return COLORS.normal;
  };
  ```

  移除的部分：
  - `import { createEquipmentFromTemplate }` （第 2 行）
  - `import type { MachineTemplate, ProductionLine }` 中的 `MachineTemplate, ProductionLine`（只保留 `PointStatus`）
  - `INITIAL_TEMPLATES` 常數（第 23-67 行）
  - `INITIAL_LINES` 常數（第 69-94 行）

- [ ] **Step 3: 確認 TypeScript 編譯通過**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add -A frontend/src/constants/liveLineConfig.ts frontend/src/constants/templates.ts
  git commit -m "refactor: delete liveLineConfig.ts, remove dead demo data from templates.ts"
  ```

---

### Task 5: 清理 simulation.ts — 只保留仍在使用的函數

**Why:** 移除 DefCenter 和 templates 死碼後，`simulation.ts` 中只剩兩個函數仍被使用：
- `generateId()` — 被 `useLiveData.ts`（alert ID 生成）使用
- `createEquipmentFromTemplate()` — 被 `App.tsx`（handleAddDevice）使用

`generateHistory()` 只被 `createEquipmentFromTemplate` 內部呼叫，但在真實資料流中 `sensorMapping` 有值時會跳過（設 `history: []`），只有模擬設備才用它。考慮到 `createEquipmentFromTemplate` 仍被 App.tsx 使用，保留它但移除 `generateHistory` 的 export。

**Files:**
- Modify: `frontend/src/utils/simulation.ts`
- Modify: `frontend/src/App.tsx`（確認 import 沒壞）

- [ ] **Step 1: 精簡 simulation.ts**

  保留 `generateId`、`generateHistory`（作為內部函數不 export）、`createEquipmentFromTemplate`：

  ```typescript
  import type { Equipment, MachineTemplate, PointStatus } from '../types';

  export const generateId = () => Math.random().toString(36).substr(2, 9);

  const generateHistory = (base: number, variance: number, length = 60) => {
    return Array.from({ length }, (_, i) => ({
      time: Date.now() - (length - i) * 60000,
      value: Number((base + (Math.random() * variance * 2 - variance)).toFixed(1))
    }));
  };

  export const createEquipmentFromTemplate = (
    template: MachineTemplate,
    name: string,
    deviceId: string,
    sensorMapping?: Record<number, number>,
    pointNames?: string[]
  ): Equipment => ({
    id: `eq_${generateId()}`,
    deviceId,
    templateId: template.id,
    name,
    visType: template.visType,
    points: template.points.map((pt, idx) => {
      const hasSensor = sensorMapping?.[idx] !== undefined;
      return {
        id: `pt_${generateId()}`,
        name: pointNames?.[idx] ?? pt.name,
        type: pt.type,
        value: hasSensor ? 0 : pt.defaultBase,
        unit: pt.type === 'temperature' ? '℃' : 'MPa',
        status: (hasSensor ? 'offline' : 'normal') as PointStatus,
        history: hasSensor ? [] : generateHistory(pt.defaultBase, pt.type === 'temperature' ? 1 : 0.2),
        ucl: pt.defaultUcl,
        lcl: pt.defaultLcl,
        sensorId: sensorMapping?.[idx],
      };
    })
  });
  ```

  唯一變更：`generateHistory` 從 `export const` 改為 `const`（移除 export）。

- [ ] **Step 2: 確認 TypeScript 編譯通過**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/utils/simulation.ts
  git commit -m "refactor: remove generateHistory export from simulation.ts (internal only)"
  ```

---

### Task 6: 最終驗證 + 更新文件

**Files:**
- Verify: 全部前端
- Modify: `docs/operations-guide.md`（移除 DefCenter 相關文字，如有的話）

- [ ] **Step 1: 完整 TypeScript 編譯檢查**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 errors

- [ ] **Step 2: 跑全部測試**

  ```bash
  cd frontend && npx vitest run
  ```
  Expected: all pass

- [ ] **Step 3: 確認無殘餘引用**

  確認所有被刪的模組不再被引用：
  ```bash
  cd frontend && grep -rE "sensorConfig|liveLineConfig|DeviceDefCenter|INITIAL_TEMPLATES|INITIAL_LINES|POINT_TO_SENSOR" src/ --include="*.ts" --include="*.tsx"
  ```
  Expected: 0 matches

- [ ] **Step 4: 確認 Toolbar 按鈕數量正確**

  手動或搜尋確認 App.tsx 的 toolbar right section 還有這些按鈕（且沒有 Database 圖示）：
  - Search input
  - Cpu（設備管理）
  - SlidersHorizontal（限值設定）
  - Settings（系統設定下拉）
  - Plus（新增設備下拉）
  - Play/Pause（自動播放）
  - Lock/Unlock（編輯模式）
  - Sun/Moon（主題切換）
  - Maximize（全螢幕）

- [ ] **Step 5: 更新 operations-guide.md**

  若文件中有提到「設備定義中心」或 Database 圖示，移除或改寫。

- [ ] **Step 6: 最終 Commit**

  ```bash
  git add -A
  git commit -m "refactor: final cleanup — verify no dead references after legacy code removal"
  ```

---

## 清理前後對比

| 項目 | 清理前 | 清理後 |
|------|--------|--------|
| constants/ 檔案數 | 3（sensorConfig, liveLineConfig, templates） | 1（templates — 只剩 COLORS/getStatusColor） |
| Toolbar 按鈕數 | 10 | 9（移除 Database 圖示） |
| Modal 數量 | 11 | 10（移除 DeviceDefCenterModal） |
| 硬編碼感測器 | 12 個寫死在 sensorConfig.ts | 0（全由 DB PropertyType 驅動） |
| simulation.ts exports | 3（generateId, generateHistory, createEquipmentFromTemplate） | 2（generateId, createEquipmentFromTemplate） |
| 估計刪除行數 | ~300 行 | — |

## 風險評估

| 風險 | 影響 | 緩解 |
|------|------|------|
| AddDeviceModal sensor dropdown 不再顯示 label/unit | dropdown 只顯示 `#1 85.2` 而非 `#1 85.2℃ 設備溫度` | sensor dropdown 本來就只是選哪個 sensor，unit 不是關鍵資訊。mapping 完成後 Point 自帶 unit |
| 有人已經用 DefCenter 建了前端模板 | 刷新頁面即消失（本來就有此問題） | 本次移除只是刪掉入口，不影響已存 DB 的模板 |
| liveLineConfig 是 demo 資料的一部分 | demo 功能可能受影響 | App.tsx 的「載入示範資料」按鈕呼叫 `fetchLineConfigs()`，從 API 載入，不依賴 liveLineConfig |
