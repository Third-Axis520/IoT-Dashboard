# UX Naming Consistency + Post-Wizard Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三項改善：(1) Step 6/7 命名消歧義，(2) 精靈完成後以單步 WizardPostPanel 取代 3 步 AddDeviceModal，(3) 記錄 Git credentials 修正步驟。

**Architecture:** 命名改善只改 i18n + 兩個 step 元件；WizardPostPanel 是新元件，App.tsx 調整 wizard onSuccess 流程；AddDeviceModal 本身不動（仍用於手動「新增設備卡片」按鈕）。

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind 4, react-i18next

---

## 背景 & 現況

### FAS API Key
已在 `backend/appsettings.json` 填入 `"ApiKey": "03a1d10d14ca484885087e7202444669"`，**跳過，不需處理**。

### 問題 1 — Step 7 Review 雙重「名稱」
Step7_Review.tsx 中，Connection 區塊和 Equipment 區塊都用 `t('wizard.review.colName')` 顯示「名稱」，讀者無法分辨是「連線名稱」還是「設備類型名稱」。

### 問題 2 — Step 6 Equipment 命名不清
`wizard.equipment.typeNameLabel` = "設備類型名稱"，但 AddDeviceModal 的 `addDevice.displayName` = "設備顯示名稱"，兩者性質完全不同（一是模板名稱、一是卡片顯示名稱）卻視覺相似。需在 Step 6 輸入框下方加提示文字。

### 問題 3 — 精靈後 3 步 AddDeviceModal 冗餘
精靈完成後，AddDeviceModal 的 Step 1（選模板）和 Step 2（填 AssetCode）都已有資料可自動帶入，使用者只需：選產線 + 確認/修改顯示名稱 + 可選感測器對應。應以新的 `WizardPostPanel.tsx` 取代這段流程。

### 問題 4 — Git Push 失敗
credential.helper = manager（Windows Credential Manager）。目前存的是 `Johannes0507` 帳號的 token，無法 push 到 `Third-Axis520/IoT-Dashboard`。需要手動更新憑證（見 Task 4）。

---

## File Map

| 動作 | 檔案 |
|------|------|
| 修改 | `frontend/src/i18n/locales/zh-TW.ts` |
| 修改 | `frontend/src/i18n/locales/zh-CN.ts` |
| 修改 | `frontend/src/i18n/locales/en.ts` |
| 修改 | `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step6_Equipment.tsx` |
| 修改 | `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step7_Review.tsx` |
| 新建 | `frontend/src/components/modals/WizardPostPanel.tsx` |
| 修改 | `frontend/src/App.tsx` |

---

## Task 1: i18n — 新增 Step 7 消歧義 key + Step 6 提示 key

**Files:**
- Modify: `frontend/src/i18n/locales/zh-TW.ts`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

目標：
- 在 `wizard.review` 新增 `colEquipmentName` — 在 Equipment 區塊取代重複的 `colName`
- 在 `wizard.equipment` 新增 `typeNameHint` — 說明此名稱是可複用的類型模板

- [ ] **Step 1: 修改 zh-TW.ts**

在 `review:` 區塊的 `colName: '名稱',` 之後加入新 key，並在 `equipment:` 區塊加入 hint：

```ts
// zh-TW.ts — wizard.review 區塊
review: {
  title: '確認並建立',
  connectionSection: '連線設定',
  colName: '名稱',          // ← 保留，Connection 區塊繼續用
  colEquipmentName: '設備類型名稱',  // ← 新增，Equipment 區塊專用
  colProtocol: '協議',
  colInterval: '輪詢間隔',
  intervalValue: '{{seconds}} 秒',
  equipmentSection: '設備類型',
  colDisplay: '顯示',
  colDesc: '說明',
  sensorsSection: '感測器 ({{count}} 個)',
},
```

```ts
// zh-TW.ts — wizard.equipment 區塊
equipment: {
  // ... 現有 key 不動 ...
  typeNameHint: '此名稱為設備類型模板，可被多台實體設備複用',  // ← 新增
  // ... 其餘 key 不動 ...
},
```

- [ ] **Step 2: 修改 zh-CN.ts**

```ts
// zh-CN.ts — wizard.review 區塊
review: {
  title: '确认并创建',
  connectionSection: '连线设置',
  colName: '名称',
  colEquipmentName: '设备类型名称',  // ← 新增
  colProtocol: '协议',
  colInterval: '轮询间隔',
  intervalValue: '{{seconds}} 秒',
  equipmentSection: '设备类型',
  colDisplay: '显示',
  colDesc: '说明',
  sensorsSection: '传感器 ({{count}} 个)',
},
```

```ts
// zh-CN.ts — wizard.equipment 區塊
typeNameHint: '此名称为设备类型模板，可被多台实体设备复用',  // ← 新增
```

- [ ] **Step 3: 修改 en.ts**

```ts
// en.ts — wizard.review 區塊
review: {
  title: 'Review & Create',
  connectionSection: 'Connection',
  colName: 'Name',
  colEquipmentName: 'Equipment Type Name',  // ← 新增
  colProtocol: 'Protocol',
  colInterval: 'Poll Interval',
  intervalValue: '{{seconds}}s',
  equipmentSection: 'Equipment Type',
  colDisplay: 'Display',
  colDesc: 'Description',
  sensorsSection: 'Sensors ({{count}})',
},
```

```ts
// en.ts — wizard.equipment 區塊
typeNameHint: 'This name defines a reusable equipment type template',  // ← 新增
```

- [ ] **Step 4: 確認 TypeScript 無錯誤**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npx tsc --noEmit
```

Expected: 無錯誤（新增的 key 如果 Translation type 用 `DeepString` 應自動更新）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/zh-TW.ts frontend/src/i18n/locales/zh-CN.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add colEquipmentName and typeNameHint keys for naming clarity"
```

---

## Task 2: Step 6 & Step 7 元件更新

**Files:**
- Modify: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step6_Equipment.tsx`
- Modify: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step7_Review.tsx`

- [ ] **Step 1: Step6_Equipment.tsx — 在 typeNameLabel 輸入框下方加提示文字**

找到：
```tsx
        <input
          type="text"
          value={state.equipmentName}
          onChange={(e) => dispatch({
            type: 'SET_EQUIPMENT_INFO',
            name: e.target.value,
            visType: state.visType,
            description: state.description,
          })}
          placeholder={t('wizard.equipment.typeNamePlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
        />
```

替換為（在 input 後加 hint p 標籤）：
```tsx
        <input
          type="text"
          value={state.equipmentName}
          onChange={(e) => dispatch({
            type: 'SET_EQUIPMENT_INFO',
            name: e.target.value,
            visType: state.visType,
            description: state.description,
          })}
          placeholder={t('wizard.equipment.typeNamePlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t('wizard.equipment.typeNameHint')}</p>
```

- [ ] **Step 2: Step7_Review.tsx — Equipment 區塊改用 colEquipmentName**

找到（Equipment info 區塊中的名稱欄位）：
```tsx
          <div className="grid grid-cols-2 gap-1 text-[var(--text-muted)]">
            <span>{t('wizard.review.colName')}</span><span className="text-[var(--text-main)]">{state.equipmentName}</span>
            <span>{t('wizard.review.colDisplay')}</span><span className="text-[var(--text-main)]">{state.visType}</span>
```

替換為：
```tsx
          <div className="grid grid-cols-2 gap-1 text-[var(--text-muted)]">
            <span>{t('wizard.review.colEquipmentName')}</span><span className="text-[var(--text-main)]">{state.equipmentName}</span>
            <span>{t('wizard.review.colDisplay')}</span><span className="text-[var(--text-main)]">{state.visType}</span>
```

- [ ] **Step 3: 確認 TypeScript 無錯誤**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npx tsc --noEmit
```

Expected: 無錯誤

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/modals/DeviceIntegrationWizard/steps/Step6_Equipment.tsx
git add frontend/src/components/modals/DeviceIntegrationWizard/steps/Step7_Review.tsx
git commit -m "fix(wizard): disambiguate naming in Step6 hint and Step7 equipment label"
```

---

## Task 3: 新建 WizardPostPanel.tsx

**Files:**
- Create: `frontend/src/components/modals/WizardPostPanel.tsx`

這是精靈完成後的單步確認面板，取代原本 3 步 AddDeviceModal 的 preset 流程。

Props:
- `template: MachineTemplate` — 精靈建立的設備類型（已轉為模板）
- `initialName: string` — 精靈的連線名稱，預填為顯示名稱
- `assetCode: string | null` — 精靈回傳的 assetCode
- `lines: ProductionLine[]` — 可選的產線清單
- `latestRawSensors: Map<string, Map<number, number>>` — 即時感測器資料（sensor mapping 用）
- `onAdd: (lineId: string, name: string, assetCode: string, sensorMapping: Record<number, number>, pointNames: string[]) => void`
- `onClose: () => void`

- [ ] **Step 1: 建立 WizardPostPanel.tsx**

```tsx
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { MachineTemplate, ProductionLine } from '../../types';
import { cn } from '../../utils/cn';

interface WizardPostPanelProps {
  template: MachineTemplate;
  initialName: string;
  assetCode: string | null;
  lines: ProductionLine[];
  latestRawSensors: Map<string, Map<number, number>>;
  onAdd: (
    lineId: string,
    name: string,
    assetCode: string,
    sensorMapping: Record<number, number>,
    pointNames: string[]
  ) => void;
  onClose: () => void;
}

export default function WizardPostPanel({
  template,
  initialName,
  assetCode,
  lines,
  latestRawSensors,
  onAdd,
  onClose,
}: WizardPostPanelProps) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(initialName);
  const [lineId, setLineId] = useState(lines[0]?.id ?? '');
  const [sensorMapping, setSensorMapping] = useState<Record<number, number>>({});
  const [pointNames, setPointNames] = useState<string[]>(template.points.map(p => p.name));
  const [showMapping, setShowMapping] = useState(false);

  const liveSensors = assetCode ? latestRawSensors.get(assetCode) : undefined;

  const sensorIds = useMemo(() => {
    if (liveSensors && liveSensors.size > 0) {
      return Array.from(liveSensors.keys()).sort((a, b) => a - b);
    }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [liveSensors]);

  const usedSensorIds = Object.values(sensorMapping);
  const duplicates = usedSensorIds.filter((id, idx) => usedSensorIds.indexOf(id) !== idx);
  const canSubmit = displayName.trim().length > 0 && lineId !== '' && duplicates.length === 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onAdd(lineId, displayName.trim(), assetCode ?? '', sensorMapping, pointNames);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="font-bold text-[var(--text-main)]">{t('wizardPost.title')}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{t('wizardPost.subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]" aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4 min-h-0">

          {/* Created equipment info (read-only) */}
          <div className="p-3 rounded-lg bg-[var(--accent-green)]/5 border border-[var(--accent-green)]/30 text-sm">
            <div className="text-xs text-[var(--accent-green)] font-semibold mb-1">{t('wizardPost.equipmentCreated')}</div>
            <div className="text-[var(--text-main)] font-medium">{template.name}</div>
            {assetCode && (
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {t('wizardPost.assetCodeLabel')} <span className="font-mono text-[var(--accent-blue)]">{assetCode}</span>
              </div>
            )}
          </div>

          {/* Display name */}
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
              {t('wizardPost.displayName')}
            </label>
            <input
              autoFocus
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
              className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">{t('wizardPost.displayNameHint')}</p>
          </div>

          {/* Line selector */}
          <div>
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
              {t('wizardPost.lineSelect')}
            </label>
            {lines.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] py-2">{t('wizardPost.noLines')}</p>
            ) : (
              <select
                value={lineId}
                onChange={e => setLineId(e.target.value)}
                className="w-full bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
              >
                {lines.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Sensor mapping (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setShowMapping(v => !v)}
              className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            >
              {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {t('wizardPost.sensorMapping')}
              <span className="text-xs opacity-60">{t('wizardPost.sensorMappingHint')}</span>
            </button>

            {showMapping && (
              <div className="mt-3 space-y-2">
                {duplicates.length > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/40 text-xs text-[var(--accent-yellow)]">
                    {t('addDevice.duplicateWarning')}
                  </div>
                )}
                {template.points.map((pt, idx) => {
                  const currentSensorId = sensorMapping[idx];
                  const liveVal = currentSensorId !== undefined && liveSensors
                    ? liveSensors.get(currentSensorId)
                    : undefined;
                  const isDup = currentSensorId !== undefined &&
                    usedSensorIds.filter(id => id === currentSensorId).length > 1;

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-lg border bg-[var(--bg-panel)]",
                        isDup ? "border-[var(--accent-yellow)]/60" : "border-[var(--border-base)]"
                      )}
                    >
                      <input
                        type="text"
                        value={pointNames[idx] ?? pt.name}
                        onChange={e => {
                          const n = [...pointNames];
                          n[idx] = e.target.value;
                          setPointNames(n);
                        }}
                        className="flex-1 min-w-0 bg-transparent border-b border-[var(--border-input)] focus:border-[var(--accent-green)] text-sm text-[var(--text-main)] outline-none pb-0.5 transition-colors"
                      />
                      <select
                        value={currentSensorId ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setSensorMapping(prev => {
                            const next = { ...prev };
                            if (val === '') delete next[idx];
                            else next[idx] = Number(val);
                            return next;
                          });
                        }}
                        className={cn(
                          "bg-[var(--bg-card)] border rounded-md px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent-green)] w-40 shrink-0",
                          isDup ? "border-[var(--accent-yellow)]" : "border-[var(--border-input)]"
                        )}
                      >
                        <option value="">{t('addDevice.unset')}</option>
                        {sensorIds.map(id => {
                          const val = liveSensors?.get(id);
                          return (
                            <option key={id} value={id}>
                              #{id} {val !== undefined ? val.toFixed(1) : '—'}
                            </option>
                          );
                        })}
                      </select>
                      {liveVal !== undefined && (
                        <span className="text-[11px] font-mono text-[var(--accent-green)] bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 rounded px-1.5 py-0.5 shrink-0">
                          {liveVal.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border-base)] shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold hover:bg-[var(--accent-green-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            {t('wizardPost.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 確認 TypeScript 無錯誤（先跑，故意會 fail，因為 i18n key 還沒加）**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npx tsc --noEmit 2>&1 | head -30
```

Expected: 可能有 i18n key 找不到的提示（下一個 task 會補）

---

## Task 4: 新增 wizardPost i18n keys

**Files:**
- Modify: `frontend/src/i18n/locales/zh-TW.ts`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

- [ ] **Step 1: zh-TW.ts — 在頂層新增 wizardPost 區塊**

在 `wizard: { ... },` 之後、`errorBoundary: { ... }` 之前加入：

```ts
  wizardPost: {
    title: '加入儀表板',
    subtitle: '精靈已完成設備建立，請選擇要加入的產線',
    equipmentCreated: '✓ 設備類型已建立',
    assetCodeLabel: '資產碼：',
    displayName: '設備顯示名稱 *',
    displayNameHint: '此名稱顯示在儀表板卡片上，可與設備類型名稱不同',
    lineSelect: '加入產線 *',
    noLines: '尚無產線，請先在儀表板建立產線',
    sensorMapping: '感測器對應',
    sensorMappingHint: '（選填，可日後從卡片設定）',
    submit: '加入儀表板',
  },
```

- [ ] **Step 2: zh-CN.ts**

```ts
  wizardPost: {
    title: '加入仪表盘',
    subtitle: '向导已完成设备建立，请选择要加入的产线',
    equipmentCreated: '✓ 设备类型已建立',
    assetCodeLabel: '资产码：',
    displayName: '设备显示名称 *',
    displayNameHint: '此名称显示在仪表盘卡片上，可与设备类型名称不同',
    lineSelect: '加入产线 *',
    noLines: '尚无产线，请先在仪表盘建立产线',
    sensorMapping: '传感器对应',
    sensorMappingHint: '（选填，可日后从卡片设定）',
    submit: '加入仪表盘',
  },
```

- [ ] **Step 3: en.ts**

```ts
  wizardPost: {
    title: 'Add to Dashboard',
    subtitle: 'Device created by wizard — select a production line to add it to',
    equipmentCreated: '✓ Equipment type created',
    assetCodeLabel: 'Asset Code:',
    displayName: 'Display Name *',
    displayNameHint: 'This name appears on the dashboard card and may differ from the type name',
    lineSelect: 'Add to Line *',
    noLines: 'No production lines found — create one on the dashboard first',
    sensorMapping: 'Sensor Mapping',
    sensorMappingHint: '(optional — configure later from the card)',
    submit: 'Add to Dashboard',
  },
```

- [ ] **Step 4: 確認 TypeScript 無錯誤**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npx tsc --noEmit
```

Expected: 無錯誤

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/modals/WizardPostPanel.tsx
git add frontend/src/i18n/locales/zh-TW.ts frontend/src/i18n/locales/zh-CN.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(ux): add WizardPostPanel — single-step post-wizard line selection"
```

---

## Task 5: App.tsx — 接入 WizardPostPanel

**Files:**
- Modify: `frontend/src/App.tsx`

這個 Task 做三件事：
1. 引入 WizardPostPanel
2. 新增 `wizardPostInfo` state 取代 preset 流程
3. 更新 `handleAddDevice` 接受 optional `lineId`
4. 更新 wizard `onSuccess` 和 JSX

- [ ] **Step 1: 在 import 區加入 WizardPostPanel**

找到：
```ts
import DeviceIntegrationWizard from './components/modals/DeviceIntegrationWizard';
```

在其後加入：
```ts
import WizardPostPanel from './components/modals/WizardPostPanel';
```

- [ ] **Step 2: 新增 wizardPostInfo state，保留 addDevicePreset 僅供舊流程**

找到：
```ts
  const [addDevicePreset, setAddDevicePreset] = useState<{ templateId: string; assetCode: string } | null>(null);
```

替換為（新增 wizardPostInfo，移除舊 addDevicePreset）：
```ts
  const [wizardPostInfo, setWizardPostInfo] = useState<{
    template: MachineTemplate;
    initialName: string;
    assetCode: string | null;
  } | null>(null);
```

- [ ] **Step 3: 修改 handleAddDevice，加入 optional lineId 參數**

找到 `handleAddDevice` 的完整函數（從 `const handleAddDevice = useCallback(async (` 開始到 `}, [activeLineId, apiLineConfigs]);`）

替換整個函數為：
```ts
  const handleAddDevice = useCallback(async (
    tpl: MachineTemplate,
    name: string,
    deviceId: string,
    sensorMapping: Record<number, number>,
    pointNames: string[],
    targetLineId?: string
  ) => {
    const lineId = targetLineId ?? activeLineId;
    const newEq = createEquipmentFromTemplate(tpl, name, deviceId, sensorMapping, pointNames);
    // Optimistic UI update
    setData(prev => prev.map(line => line.id === lineId ? { ...line, equipments: [...line.equipments, newEq] } : line));
    setShowAddDevice(false);
    // Persist to API
    const lineConfig = apiLineConfigs.find(lc => lc.lineId === lineId);
    if (lineConfig && tpl.id) {
      try {
        const updated = await saveLineConfig(
          lineId,
          lineConfig.name,
          [
            ...lineConfig.equipments.map((le, i) => ({
              equipmentTypeId: le.equipmentTypeId,
              assetCode: le.assetCode,
              displayName: le.displayName,
              sortOrder: i,
            })),
            {
              equipmentTypeId: Number(tpl.id),
              assetCode: deviceId || null,
              displayName: name !== tpl.name ? name : null,
              sortOrder: lineConfig.equipments.length,
            },
          ]
        );
        setApiLineConfigs(prev => prev.map(lc => lc.lineId === lineId ? updated : lc));
      } catch (err) {
        console.error('Failed to persist equipment to API:', err);
      }
    }
  }, [activeLineId, apiLineConfigs]);
```

- [ ] **Step 4: 更新 wizard onSuccess handler**

找到：
```ts
          onSuccess={async ({ name, assetCode, equipmentTypeId }) => {
            setShowWizard(false);
            await reloadConfig();
            addToast('success', `「${name}」已建立！請選擇要加入的產線。`);
            if (assetCode && equipmentTypeId) {
              setAddDevicePreset({ templateId: String(equipmentTypeId), assetCode });
              setShowAddDevice(true);
            }
          }}
```

替換為：
```ts
          onSuccess={async ({ name, assetCode, equipmentTypeId }) => {
            setShowWizard(false);
            await reloadConfig();
            if (assetCode && equipmentTypeId) {
              // reloadConfig 已更新 templates，取最新的對應模板
              setWizardPostInfo(prev => {
                // templates 在 reloadConfig 後更新，需在 setState 外讀取最新
                return null; // 先 reset，下面再 set
              });
              // 直接用 setTemplates 後的值：reloadConfig 是 async 已完成
              const tpl = templates.find(t => t.id === String(equipmentTypeId));
              if (tpl) {
                setWizardPostInfo({ template: tpl, initialName: name, assetCode });
              } else {
                // fallback: 精靈建立的類型還沒進 templates（理論上不應發生）
                addToast('success', `「${name}」已建立！請選擇要加入的產線。`);
              }
            } else {
              addToast('success', `「${name}」已建立！`);
            }
          }}
```

- [ ] **Step 5: 在 JSX 中加入 WizardPostPanel，移除 AddDeviceModal 的 preset props**

找到：
```tsx
      {showAddDevice && (
        <AddDeviceModal
          templates={templates}
          devices={devices}
          latestRawSensors={latestRawSensors}
          onClose={() => { setShowAddDevice(false); setAddDevicePreset(null); }}
          onAdd={(tpl, name, ac, mapping, names) => { handleAddDevice(tpl, name, ac, mapping, names); setAddDevicePreset(null); }}
          initialTemplateId={addDevicePreset?.templateId}
          initialAssetCode={addDevicePreset?.assetCode}
        />
      )}
```

替換為（移除 preset props，AddDeviceModal 只用於普通手動流程）：
```tsx
      {showAddDevice && (
        <AddDeviceModal
          templates={templates}
          devices={devices}
          latestRawSensors={latestRawSensors}
          onClose={() => setShowAddDevice(false)}
          onAdd={(tpl, name, ac, mapping, names) => handleAddDevice(tpl, name, ac, mapping, names)}
        />
      )}
      {wizardPostInfo && (
        <WizardPostPanel
          template={wizardPostInfo.template}
          initialName={wizardPostInfo.initialName}
          assetCode={wizardPostInfo.assetCode}
          lines={data}
          latestRawSensors={latestRawSensors}
          onAdd={(lineId, name, assetCode, mapping, names) => {
            handleAddDevice(wizardPostInfo.template, name, assetCode, mapping, names, lineId);
            setWizardPostInfo(null);
            addToast('success', `「${name}」已加入儀表板`);
          }}
          onClose={() => setWizardPostInfo(null)}
        />
      )}
```

- [ ] **Step 6: 確認 TypeScript 無錯誤**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npx tsc --noEmit
```

Expected: 無錯誤。如果有 `addDevicePreset` 未找到的錯誤，搜尋剩餘使用點並移除。

- [ ] **Step 7: 確認 initialTemplateId/initialAssetCode 未使用（清理）**

```bash
grep -r "addDevicePreset\|initialTemplateId\|initialAssetCode" frontend/src/ 2>/dev/null
```

若有殘留，逐一移除。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(ux): wire WizardPostPanel — replace preset AddDeviceModal with single-step panel"
```

---

## Task 6: 手動測試 UX 流程

- [ ] **Step 1: 啟動 dev server**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npm run dev
```

- [ ] **Step 2: 驗收 Step 6 命名**

開啟精靈 → 走到 Step 6 → 確認：
- 輸入框下方出現灰色提示文字「此名稱為設備類型模板，可被多台實體設備複用」

- [ ] **Step 3: 驗收 Step 7 命名**

走到 Step 7 Review → 確認：
- Connection 區塊顯示「名稱」（連線名稱）
- Equipment 區塊顯示「設備類型名稱」（不再是「名稱」）

- [ ] **Step 4: 驗收 WizardPostPanel 流程**

完成精靈的所有 7 步 → 點「建立」→ 確認：
1. 精靈關閉
2. WizardPostPanel 彈出（不是 3 步 AddDeviceModal）
3. 設備顯示名稱已預填（精靈的連線名稱）
4. 產線下拉選單有資料
5. 「感測器對應」可展開/收合
6. 選線 → 點「加入儀表板」→ Panel 關閉 + Toast 出現 + 儀表板卡片出現

- [ ] **Step 5: 驗收舊流程不受影響**

點儀表板「新增設備卡片」按鈕 → 確認舊的 3 步 AddDeviceModal 仍正常運作

---

## Task 7: Git Credentials 修正（使用者手動執行）

> **注意：這個 Task 需要使用者在 Terminal 執行，Claude 無法代勞（需要互動式輸入）**

目前問題：Windows Credential Manager 儲存的是 `Johannes0507` 帳號的 GitHub token，但 push 目標 `Third-Axis520/IoT-Dashboard` 需要有寫入權限的帳號。

- [ ] **Step 1: 清除舊 GitHub 憑證（PowerShell 或 Git Bash）**

```powershell
# 方法 A: 用 git 清除
git credential reject <<EOF
protocol=https
host=github.com
EOF
```

或開啟 **Windows 認證管理員**（Credential Manager）→ Windows 認證 → 找到 `git:https://github.com` → 刪除

- [ ] **Step 2: 嘗試 push，Windows 會彈出登入視窗**

```bash
git push origin main
```

在彈出的視窗中，選擇「使用 Token 登入」，輸入有 `Third-Axis520/IoT-Dashboard` 寫入權限的 GitHub Personal Access Token（PAT）。

若無 PAT，至 GitHub → Settings → Developer settings → Personal access tokens → Generate new token（需 repo 權限）。

- [ ] **Step 3: 確認 push 成功**

```bash
git log origin/main..main --oneline
```

Expected: 空（代表本地與 remote 同步）

---

## 完成後的 Commit 列表

```
feat(i18n): add colEquipmentName and typeNameHint keys for naming clarity
fix(wizard): disambiguate naming in Step6 hint and Step7 equipment label
feat(ux): add WizardPostPanel — single-step post-wizard line selection
feat(ux): wire WizardPostPanel — replace preset AddDeviceModal with single-step panel
```
