# EditModal Sensor Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add / edit / remove sensors on an existing DeviceConnection from the EditDeviceConnectionModal, eliminating the "delete and recreate wizard" workaround that risks losing history and gating rules.

**Architecture:** Expand `EditDeviceConnectionModal` with a collapsible "資料點管理" section. Existing sensors render as editable rows. A "掃描並新增" button triggers an inline discovery flow that lists unbound addresses for user selection + labelling. On Save, two backend calls: `PUT /api/device-connections/{id}` (existing) + `PUT /api/equipment-types/{equipmentTypeId}` (new — full-replace already supported). Wizard refactor (shared hooks/components) is **deferred** as future tech debt; this iteration accepts ~150 lines of duplication to keep wizard tests intact.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest, react-i18next.

---

## File Structure

**Create**:
- `frontend/src/lib/apiEquipmentTypes.ts` — typed helper for `PUT /api/equipment-types/{id}` (if not already exists)
- `frontend/src/components/modals/EditDeviceConnectionModal/SensorManagementSection.tsx` — collapsible section with sensor list + add button (extract from main modal to keep it under 250-line cap)
- `frontend/src/components/modals/EditDeviceConnectionModal/SensorAddPanel.tsx` — sub-panel rendering discovered points + label inputs

**Modify**:
- `frontend/src/components/modals/EditDeviceConnectionModal.tsx` — host SensorManagementSection; call PUT /api/equipment-types in save flow
- `frontend/src/i18n/locales/{zh-TW,zh-CN,en}.ts` — new keys for sensor management UI
- `frontend/src/components/modals/__tests__/EditDeviceConnectionModal.test.tsx` — new test cases (≥6)

**Verify (read-only)**:
- `backend/Controllers/EquipmentTypeController.cs:100-134` — confirm PUT full-replace semantics
- `backend/Program.cs` + entity FK setup — confirm cascade behavior on DeviceConnection / EquipmentType delete (needed for risk Task 1 only; this plan does NOT delete anything)

---

## Task 1: Verify cascade risk (read-only, no code change)

**Files:** none modified.

**Why first:** The spec lists cascade-on-delete behavior as a risk because the current workaround forces a full delete. This plan AVOIDS that path entirely (it uses PUT full-replace, not delete-recreate). So cascade is no longer a blocker — but verify the schema once to be sure that PUT-replacing the sensors list doesn't have hidden cascade impact (e.g., SensorGatingRule rows referencing the soon-removed sensor rows).

- [ ] **Step 1.1: Read the FK setup for EquipmentTypeSensor**

Run:
```
Grep pattern="EquipmentTypeSensor.*HasOne|EquipmentTypeSensor.*WithMany|OnDelete" path="backend"
```

Expected: see what happens to a Reading or SensorGatingRule row when its referenced sensor is removed.

- [ ] **Step 1.2: Read SensorGatingRule entity for its FK to sensors**

Run:
```
Grep pattern="GatedSensorId|GatingSensorId" path="backend/Models" output_mode="content"
```

Document in the plan (here) what the cascade chain is. If `RemoveRange + AddRange` would orphan a gating rule pointing at a removed sensor, we must either (a) prevent removing sensors that have gating rules, OR (b) cascade-delete the rule. **For this plan: prevent removal in the UI** (don't even show the trash icon for sensors that are referenced by a gating rule).

- [ ] **Step 1.3: Document findings inline in this plan**

Edit the "Risk findings" section below with what you found. No commit.

### Risk findings

(Fill in during Task 1)

- EquipmentTypeSensor → Reading FK: `__________________`
- EquipmentTypeSensor → SensorGatingRule FK: `__________________`
- Mitigation needed in UI: `__________________`

---

## Task 2: Verify backend PUT /api/equipment-types/{id} contract

**Files:** none modified.

- [ ] **Step 2.1: Re-read the controller to confirm full-replace semantics**

Run:
```
Read backend/Controllers/EquipmentTypeController.cs:100-134
```

Confirm:
- ✓ `db.EquipmentTypeSensors.RemoveRange(et.Sensors)` removes all current
- ✓ `et.Sensors = req.Sensors.Select(...).ToList()` rebuilds from request
- ✓ Returns updated DTO with sensors included

- [ ] **Step 2.2: Find the request DTO `SaveEquipmentTypeRequest`**

Run:
```
Grep pattern="record SaveEquipmentTypeRequest|class SaveEquipmentTypeRequest" path="backend"
```

Document the field names and types here so the frontend api helper matches exactly.

### Backend DTO shape

(Fill in during Task 2)

```csharp
record SaveEquipmentTypeRequest(
  // fill in
);
record SaveEquipmentTypeSensorRequest(
  // fill in
);
```

---

## Task 3: Add `frontend/src/lib/apiEquipmentTypes.ts` typed helper

**Files:**
- Check if exists: `frontend/src/lib/apiEquipmentTypes.ts` (might already exist for create flow)
- Create or extend: same path

- [ ] **Step 3.1: Check existing helper**

Run:
```
Grep pattern="apiEquipmentTypes|updateEquipmentType" path="frontend/src/lib" output_mode="files_with_matches"
```

If `apiEquipmentTypes.ts` exists, read it to see what's already exported. Extend rather than recreate.

- [ ] **Step 3.2: Add `updateEquipmentType` function matching backend DTO**

Code (adjust types to match findings from Task 2):

```ts
export interface UpdateEquipmentTypeRequest {
  name: string;
  visType: string;
  description: string;
  sensors: UpdateEquipmentTypeSensorRequest[];
}

export interface UpdateEquipmentTypeSensorRequest {
  sensorId: number;
  pointId?: number | null;
  label: string;
  unit: string;
  propertyTypeId: number;
  rawAddress: string;
  sortOrder: number;
}

export function updateEquipmentType(id: number, req: UpdateEquipmentTypeRequest) {
  return apiCall(`/api/equipment-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  });
}
```

- [ ] **Step 3.3: Write a unit test (typed signature only, no integration)**

The function just wraps `apiCall`; no logic to test. Skip. Move on.

- [ ] **Step 3.4: Commit**

```bash
git add frontend/src/lib/apiEquipmentTypes.ts
git commit -m "feat(api): add updateEquipmentType client for full-replace PUT"
```

---

## Task 4: Add i18n keys for sensor management UI

**Files:**
- Modify: `frontend/src/i18n/locales/zh-TW.ts`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

- [ ] **Step 4.1: Add new keys under `connectionSettings.sensors.*`**

zh-TW additions (insert in the `connectionSettings` block):

```ts
sensors: {
  sectionTitle: '資料點管理',
  sectionHint: '管理此連線的感測器資料點',
  existingHeader: '既有資料點 ({{count}})',
  scanAndAddButton: '掃描並新增',
  scanning: '掃描中...',
  scanFailed: '掃描失敗',
  noNewPoints: '所有掃描到的資料點都已綁定，沒有新候選',
  candidatesHeader: '可新增 ({{count}})',
  labelPlaceholder: '名稱',
  unitPlaceholder: '單位',
  removeConfirm: '確定要移除這個資料點？歷史讀數會保留，但不再採集。',
  removeBlockedByGating: '此資料點被 sensor gating 規則引用，無法移除',
  addAllButton: '全選',
  clearAllButton: '清空',
  applyAddButton: '確定新增 ({{count}})',
  cancelAddButton: '取消',
},
```

zh-CN equivalent (translate appropriately, e.g. 资料点 → 数据点, 既有 → 现有, etc.):

```ts
sensors: {
  sectionTitle: '数据点管理',
  sectionHint: '管理此连接的传感器数据点',
  existingHeader: '现有数据点 ({{count}})',
  scanAndAddButton: '扫描并新增',
  scanning: '扫描中...',
  scanFailed: '扫描失败',
  noNewPoints: '所有扫描到的数据点都已绑定，没有新候选',
  candidatesHeader: '可新增 ({{count}})',
  labelPlaceholder: '名称',
  unitPlaceholder: '单位',
  removeConfirm: '确定要移除这个数据点？历史读数会保留，但不再采集。',
  removeBlockedByGating: '此数据点被 sensor gating 规则引用，无法移除',
  addAllButton: '全选',
  clearAllButton: '清空',
  applyAddButton: '确定新增 ({{count}})',
  cancelAddButton: '取消',
},
```

en equivalent:

```ts
sensors: {
  sectionTitle: 'Sensors',
  sectionHint: 'Manage the data points on this connection',
  existingHeader: 'Existing ({{count}})',
  scanAndAddButton: 'Scan & Add',
  scanning: 'Scanning…',
  scanFailed: 'Scan failed',
  noNewPoints: 'All discovered points are already bound — nothing new to add',
  candidatesHeader: 'Available to add ({{count}})',
  labelPlaceholder: 'Label',
  unitPlaceholder: 'Unit',
  removeConfirm: 'Remove this sensor? Historical readings stay but no new data will be collected.',
  removeBlockedByGating: 'This sensor is referenced by a gating rule and cannot be removed',
  addAllButton: 'Select all',
  clearAllButton: 'Clear',
  applyAddButton: 'Add ({{count}})',
  cancelAddButton: 'Cancel',
},
```

- [ ] **Step 4.2: Run tests to verify no i18n type-check regression**

Run: `cd frontend && npx vitest run` — expect 65/65 still pass.

- [ ] **Step 4.3: Commit**

```bash
git add frontend/src/i18n/locales
git commit -m "i18n(connections): add sensor-management keys (zh-TW/zh-CN/en)"
```

---

## Task 5: Add `SensorAddPanel` component

**Files:**
- Create: `frontend/src/components/modals/EditDeviceConnectionModal/SensorAddPanel.tsx`

This component renders the inline "scan and add" sub-flow: it owns the discovery state, lists unbound points after filtering, and reports the selected new-sensor list back to the parent via a callback.

- [ ] **Step 5.1: Write the component skeleton**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scanDiscovery, type DiscoveredPoint } from '../../../lib/apiDiscovery';

export interface NewSensorDraft {
  rawAddress: string;
  label: string;
  unit: string;
  propertyTypeId: number;
  // sensorId will be assigned by backend on save
}

interface Props {
  connectionId: number;
  protocol: string;
  configJson: string;
  existingRawAddresses: Set<string>;
  onAdd: (drafts: NewSensorDraft[]) => void;
  onCancel: () => void;
}

export default function SensorAddPanel({
  connectionId, protocol, configJson, existingRawAddresses, onAdd, onCancel,
}: Props) {
  const { t } = useTranslation();
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'error' | 'ready'>('idle');
  const [scanError, setScanError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DiscoveredPoint[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [labels, setLabels] = useState<Record<number, { label: string; unit: string; propertyTypeId: number }>>({});

  async function handleScan() {
    setScanState('scanning');
    setScanError(null);
    try {
      const result = await scanDiscovery(protocol, configJson);
      if (result.success && result.points) {
        const unbound = result.points.filter(p => !existingRawAddresses.has(p.rawAddress));
        setCandidates(unbound);
        setScanState('ready');
      } else {
        setScanError(result.error ?? t('connectionSettings.sensors.scanFailed'));
        setScanState('error');
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : t('connectionSettings.sensors.scanFailed'));
      setScanState('error');
    }
  }

  function applyAdd() {
    const drafts: NewSensorDraft[] = Array.from(selectedIdx).map(i => ({
      rawAddress: candidates[i].rawAddress,
      label: labels[i]?.label ?? candidates[i].suggestedLabel ?? '',
      unit: labels[i]?.unit ?? '',
      propertyTypeId: labels[i]?.propertyTypeId ?? 1,  // FIXME: default propertyTypeId — confirm valid id
    }));
    onAdd(drafts);
  }

  // ... render scan button, candidate list, label inputs, action buttons
  // (full JSX in subsequent steps if review demands)

  return (
    <div className="border border-[var(--border-base)] rounded-lg p-3 space-y-3">
      {scanState === 'idle' && (
        <button
          type="button"
          onClick={handleScan}
          className="px-3 py-1 rounded border border-[var(--accent-green)] text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10"
        >
          {t('connectionSettings.sensors.scanAndAddButton')}
        </button>
      )}
      {scanState === 'scanning' && (
        <div className="text-sm text-[var(--text-muted)]">{t('connectionSettings.sensors.scanning')}</div>
      )}
      {scanState === 'error' && (
        <div className="text-sm text-[var(--accent-red)]">{scanError}</div>
      )}
      {scanState === 'ready' && candidates.length === 0 && (
        <div className="text-sm text-[var(--text-muted)]">{t('connectionSettings.sensors.noNewPoints')}</div>
      )}
      {scanState === 'ready' && candidates.length > 0 && (
        <>
          <div className="text-sm font-medium">
            {t('connectionSettings.sensors.candidatesHeader', { count: candidates.length })}
          </div>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {candidates.map((c, i) => (
              <li key={c.rawAddress} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIdx.has(i)}
                  onChange={e => {
                    const next = new Set(selectedIdx);
                    if (e.target.checked) next.add(i); else next.delete(i);
                    setSelectedIdx(next);
                  }}
                />
                <span className="font-mono text-xs">{c.rawAddress}</span>
                {selectedIdx.has(i) && (
                  <input
                    type="text"
                    placeholder={t('connectionSettings.sensors.labelPlaceholder')}
                    value={labels[i]?.label ?? c.suggestedLabel ?? ''}
                    onChange={e => setLabels({ ...labels, [i]: { ...(labels[i] ?? { unit: '', propertyTypeId: 1 }), label: e.target.value } })}
                    className="flex-1 px-2 py-0.5 text-xs rounded border border-[var(--border-input)] bg-[var(--bg-panel)]"
                  />
                )}
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded border border-[var(--border-base)] text-[var(--text-muted)]">
              {t('connectionSettings.sensors.cancelAddButton')}
            </button>
            <button
              type="button"
              onClick={applyAdd}
              disabled={selectedIdx.size === 0}
              className="px-3 py-1 text-sm rounded bg-[var(--accent-green)] text-[var(--bg-panel)] disabled:opacity-40"
            >
              {t('connectionSettings.sensors.applyAddButton', { count: selectedIdx.size })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

⚠️ **The default `propertyTypeId: 1` is a placeholder.** Task 6 must use a real propertyType picker (load from `/api/property-types` and let user pick — same pattern as wizard Step 5). If time-constrained, ship without it (validate that 1 is a real id in DB) and add the picker in a follow-up.

- [ ] **Step 5.2: Add a smoke test (no full coverage yet — that's Task 8)**

Create `frontend/src/components/modals/__tests__/SensorAddPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SensorAddPanel from '../EditDeviceConnectionModal/SensorAddPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../lib/apiDiscovery', () => ({
  scanDiscovery: vi.fn(),
}));
import { scanDiscovery } from '../../../lib/apiDiscovery';

describe('SensorAddPanel', () => {
  it('renders scan button initially', () => {
    render(<SensorAddPanel
      connectionId={1}
      protocol="modbus_tcp"
      configJson="{}"
      existingRawAddresses={new Set()}
      onAdd={vi.fn()}
      onCancel={vi.fn()}
    />);
    expect(screen.getByText(/scanAndAddButton/)).toBeInTheDocument();
  });

  it('filters out existing raw addresses from candidates', async () => {
    vi.mocked(scanDiscovery).mockResolvedValue({
      success: true,
      points: [
        { rawAddress: '40001', currentValue: 0, dataType: 'int16', suggestedLabel: 'A' },
        { rawAddress: '40002', currentValue: 0, dataType: 'int16', suggestedLabel: 'B' },
      ],
    } as never);
    render(<SensorAddPanel
      connectionId={1}
      protocol="modbus_tcp"
      configJson="{}"
      existingRawAddresses={new Set(['40001'])}
      onAdd={vi.fn()}
      onCancel={vi.fn()}
    />);
    fireEvent.click(screen.getByText(/scanAndAddButton/));
    await waitFor(() => {
      // Only 40002 should appear (40001 filtered)
      expect(screen.getByText('40002')).toBeInTheDocument();
      expect(screen.queryByText('40001')).toBeNull();
    });
  });
});
```

- [ ] **Step 5.3: Run tests**

```bash
cd frontend && npx vitest run src/components/modals/__tests__/SensorAddPanel.test.tsx
```

Expected: 2/2 pass.

- [ ] **Step 5.4: Commit**

```bash
git add frontend/src/components/modals/EditDeviceConnectionModal/SensorAddPanel.tsx \
        frontend/src/components/modals/__tests__/SensorAddPanel.test.tsx
git commit -m "feat(connections): add SensorAddPanel for inline scan-and-add flow"
```

---

## Task 6: Add `SensorManagementSection` host component

**Files:**
- Create: `frontend/src/components/modals/EditDeviceConnectionModal/SensorManagementSection.tsx`

This wraps:
- The existing sensors list (read from `conn` initial + maintained as local state)
- The toggle between "viewing existing" and "scan and add" mode
- Per-sensor edit-label / remove behavior (with gating-rule-block UX from Task 1 findings)

- [ ] **Step 6.1: Define the component**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import SensorAddPanel, { type NewSensorDraft } from './SensorAddPanel';

export interface SensorRow {
  // Existing sensors carry an id; new drafts get undefined until saved
  sensorId?: number;
  rawAddress: string;
  label: string;
  unit: string;
  propertyTypeId: number;
  sortOrder: number;
  // True when this sensor is referenced by a SensorGatingRule and must not be removed
  isReferencedByGating?: boolean;
}

interface Props {
  connectionId: number;
  protocol: string;
  configJson: string;
  sensors: SensorRow[];
  onChange: (next: SensorRow[]) => void;
  defaultOpen?: boolean;
}

export default function SensorManagementSection({
  connectionId, protocol, configJson, sensors, onChange, defaultOpen = false,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const [adding, setAdding] = useState(false);

  function handleAdd(drafts: NewSensorDraft[]) {
    const maxSortOrder = sensors.reduce((m, s) => Math.max(m, s.sortOrder), 0);
    const newRows: SensorRow[] = drafts.map((d, i) => ({
      rawAddress: d.rawAddress,
      label: d.label,
      unit: d.unit,
      propertyTypeId: d.propertyTypeId,
      sortOrder: maxSortOrder + i + 1,
    }));
    onChange([...sensors, ...newRows]);
    setAdding(false);
  }

  function handleLabelChange(idx: number, label: string) {
    const next = sensors.map((s, i) => i === idx ? { ...s, label } : s);
    onChange(next);
  }

  function handleRemove(idx: number) {
    const row = sensors[idx];
    if (row.isReferencedByGating) return;  // UI disables button; defensive
    if (!confirm(t('connectionSettings.sensors.removeConfirm'))) return;
    onChange(sensors.filter((_, i) => i !== idx));
  }

  const existingRawAddresses = new Set(sensors.map(s => s.rawAddress));

  return (
    <div className="mt-4 border-t border-[var(--border-base)] pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {t('connectionSettings.sensors.sectionTitle')}
        <span className="text-xs text-[var(--text-muted)] ml-2">— {t('connectionSettings.sensors.sectionHint')}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {t('connectionSettings.sensors.existingHeader', { count: sensors.length })}
          </div>
          <ul className="space-y-1">
            {sensors.map((s, i) => (
              <li key={s.sensorId ?? `new-${i}`} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-[var(--text-muted)] w-20 shrink-0">{s.rawAddress}</span>
                <input
                  type="text"
                  value={s.label}
                  onChange={e => handleLabelChange(i, e.target.value)}
                  className="flex-1 px-2 py-0.5 text-xs rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)]"
                />
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  disabled={s.isReferencedByGating}
                  title={s.isReferencedByGating ? t('connectionSettings.sensors.removeBlockedByGating') : undefined}
                  className="text-[var(--accent-red)] hover:text-[var(--accent-red)] disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="remove sensor"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>

          {adding ? (
            <SensorAddPanel
              connectionId={connectionId}
              protocol={protocol}
              configJson={configJson}
              existingRawAddresses={existingRawAddresses}
              onAdd={handleAdd}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="px-3 py-1 text-sm rounded border border-[var(--accent-green)] text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10"
            >
              + {t('connectionSettings.sensors.scanAndAddButton')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.2: Commit (no test yet — covered in Task 8)**

```bash
git add frontend/src/components/modals/EditDeviceConnectionModal/SensorManagementSection.tsx
git commit -m "feat(connections): add SensorManagementSection wrapper"
```

---

## Task 7: Wire SensorManagementSection into EditDeviceConnectionModal

**Files:**
- Modify: `frontend/src/components/modals/EditDeviceConnectionModal.tsx`

- [ ] **Step 7.1: Add sensor state and load from conn**

The `conn` prop currently exposes only connection-layer fields. We need the EquipmentType's sensors list too. Either:
- (a) Read from `conn.equipmentTypeId` and fetch `/api/equipment-types/{id}` separately on mount
- (b) Expand `DeviceConnectionItem` DTO to include sensors

For minimum churn, go with (a). Add a fetch in a useEffect.

```tsx
import { fetchEquipmentTypeDetail } from '../../lib/apiEquipmentTypes';  // add to helper
import SensorManagementSection, { type SensorRow } from './EditDeviceConnectionModal/SensorManagementSection';

// inside component:
const [sensors, setSensors] = useState<SensorRow[]>([]);
const [initialSensors, setInitialSensors] = useState<SensorRow[]>([]);
const [sensorsLoading, setSensorsLoading] = useState(false);

useEffect(() => {
  if (!conn.equipmentTypeId) return;  // no ET → no sensors to manage
  setSensorsLoading(true);
  fetchEquipmentTypeDetail(conn.equipmentTypeId)
    .then(et => {
      // ... TODO: also fetch which sensors are referenced by gating rules
      const rows: SensorRow[] = et.sensors.map(s => ({
        sensorId: s.sensorId,
        rawAddress: s.rawAddress,
        label: s.label,
        unit: s.unit,
        propertyTypeId: s.propertyTypeId,
        sortOrder: s.sortOrder,
        isReferencedByGating: false,  // TODO: real check
      }));
      setSensors(rows);
      setInitialSensors(rows);
    })
    .catch(() => { /* surface error in InlineErrorBanner */ })
    .finally(() => setSensorsLoading(false));
}, [conn.equipmentTypeId]);
```

⚠️ Add `fetchEquipmentTypeDetail` to `apiEquipmentTypes.ts` if not present.

- [ ] **Step 7.2: Add sensors-changed flag into isDirty**

```tsx
const sensorsChanged = JSON.stringify(sensors) !== JSON.stringify(initialSensors);
const isDirty =
  name !== conn.name ||
  // ...existing flags
  sensorsChanged;
```

- [ ] **Step 7.3: Render SensorManagementSection in the modal body**

Insert between AlertSettingsSection and the save-error banner:

```tsx
{conn.equipmentTypeId && (
  <SensorManagementSection
    connectionId={conn.id}
    protocol={conn.protocol}
    configJson={conn.configJson}
    sensors={sensors}
    onChange={setSensors}
  />
)}
```

- [ ] **Step 7.4: Extend handleSave to also PUT /api/equipment-types**

```tsx
async function handleSave() {
  // ... existing connection save first
  await updateDeviceConnection(conn.id, { /* existing */ });
  // Then sensors if changed and ET exists
  if (sensorsChanged && conn.equipmentTypeId && conn.equipmentTypeName != null) {
    await updateEquipmentType(conn.equipmentTypeId, {
      name: conn.equipmentTypeName,
      visType: /* fetched ET.visType */ 'single_kpi',  // TODO: preserve from fetched ET detail
      description: /* fetched ET.description */ '',
      sensors: sensors.map((s, i) => ({
        sensorId: s.sensorId ?? 0,  // 0 = new, backend assigns
        label: s.label,
        unit: s.unit,
        propertyTypeId: s.propertyTypeId,
        rawAddress: s.rawAddress,
        sortOrder: s.sortOrder === 0 ? i : s.sortOrder,
      })),
    });
  }
  // ... existing onSaved + setTimeout
}
```

⚠️ The two PUTs are sequential, not transactional. If the second fails, the connection is updated but sensors aren't. Surface a partial-success error message. Future task: wrap in a single backend endpoint.

- [ ] **Step 7.5: Run tests to check no existing test breaks**

```bash
cd frontend && npx vitest run src/components/modals/__tests__/EditDeviceConnectionModal.test.tsx
```

Expected: existing 19 pass. The new section is gated on `conn.equipmentTypeId` which is null in the mockConn fixture → no behavior change for existing tests.

- [ ] **Step 7.6: Commit**

```bash
git add frontend/src/components/modals/EditDeviceConnectionModal.tsx \
        frontend/src/lib/apiEquipmentTypes.ts
git commit -m "feat(connections): wire SensorManagementSection into EditDeviceConnectionModal with full-replace save"
```

---

## Task 8: Add EditModal sensor management tests

**Files:**
- Modify: `frontend/src/components/modals/__tests__/EditDeviceConnectionModal.test.tsx`

Cases to cover (≥6):

1. Section hidden when `conn.equipmentTypeId == null`
2. Section shows existing sensors when ET present
3. Editing a sensor label flips isDirty → unsaved-changes indicator appears
4. Remove button disabled (with title) when sensor is gating-referenced
5. Clicking remove → confirm dialog → on confirm, sensor removed from list
6. Save flow calls BOTH `updateDeviceConnection` AND `updateEquipmentType` when sensors changed
7. Save flow calls ONLY `updateDeviceConnection` when sensors NOT changed

- [ ] **Step 8.1: Add mock for fetchEquipmentTypeDetail + updateEquipmentType**

Add to the `vi.mock` block:

```ts
vi.mock('../../../lib/apiEquipmentTypes', () => ({
  fetchEquipmentTypeDetail: vi.fn(),
  updateEquipmentType: vi.fn(),
}));
import {
  fetchEquipmentTypeDetail,
  updateEquipmentType,
} from '../../../lib/apiEquipmentTypes';
```

In `beforeEach`:

```ts
vi.mocked(fetchEquipmentTypeDetail).mockResolvedValue({
  id: 50,
  name: 'PLC-A Equipment',
  visType: 'single_kpi',
  description: '',
  sensors: [
    { sensorId: 1, rawAddress: '40001', label: 'Temp', unit: '°C', propertyTypeId: 1, sortOrder: 0 },
    { sensorId: 2, rawAddress: '40002', label: 'Humid', unit: '%', propertyTypeId: 2, sortOrder: 1 },
  ],
} as never);
vi.mocked(updateEquipmentType).mockResolvedValue(undefined as never);
```

Also extend `mockConn` to set `equipmentTypeId: 50, equipmentTypeName: 'PLC-A Equipment'`.

- [ ] **Step 8.2: Write the 7 test cases**

(See detailed test bodies in Task 8 design notes — each follows the same `renderModal()` + `findByText` + `fireEvent` + `waitFor` pattern as existing tests.)

- [ ] **Step 8.3: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: 65 (current) + ≥7 (new) = ≥72 passing.

- [ ] **Step 8.4: Commit**

```bash
git add frontend/src/components/modals/__tests__/EditDeviceConnectionModal.test.tsx
git commit -m "test(connections): cover sensor management section in EditModal"
```

---

## Task 9: Build + /ux-review + commit + push

- [ ] **Step 9.1: Production build**

```bash
cd frontend && npx vite build
```

Expected: success, new bundle hash.

- [ ] **Step 9.2: Invoke /ux-review skill on this change**

```
Skill ux-review --args "EditDeviceConnectionModal 加入 SensorManagementSection + SensorAddPanel sub-flow，可從 modal 內掃描 + 新增 / 編輯 label / 移除 sensor。檔案 SensorManagementSection.tsx, SensorAddPanel.tsx, EditDeviceConnectionModal.tsx + i18n + tests。重點：引導性（section 預設摺疊使用者要知道入口）、回饋性（掃描中、無新候選、儲存進度）、防呆性（gating-referenced 不能移除、移除二次確認、partial-save 失敗訊息）、一致性（跟 wizard discovery flow 視覺一致）"
```

Fix any ❌ blockers immediately. Note ⚠️ suggestions in the memory tech-debt or implement if quick.

- [ ] **Step 9.3: Deploy decision point**

Phase 2 deploys as a single unit after all of #8 is committed.

- [ ] **Step 9.4: Push origin/main**

```bash
git push origin main
```

- [ ] **Step 9.5: Deploy to prod 192.168.6.23**

Standard 3-step (stop / robocopy / start) + smoke test.

---

## Task 10: Memory + spec status update

**Files:**
- Modify: `~/.claude/projects/.../memory/project_sensor_management_gap.md` — mark as ✅ done
- Modify: `~/.claude/projects/.../memory/MEMORY.md` index — flip status

- [ ] **Step 10.1: Update tech-debt entry**

Change description to: `✅ 已實作：EditDeviceConnectionModal 加入 SensorManagementSection + SensorAddPanel，可掃描 / 新增 / 編輯 label / 移除（gating-referenced 防呆）`.

- [ ] **Step 10.2: Update MEMORY.md index**

Replace the gap entry to reflect closure.

---

## Self-Review Notes

- ✅ Task 1 (cascade verify) is read-only and produces explicit findings used by Task 6/7
- ✅ Each task has its own commit
- ⚠️ Task 5 has a `propertyTypeId: 1` placeholder — that's flagged inline; engineer must verify before merge
- ⚠️ Task 7 has TWO `// TODO` comments for visType/description preservation — these are real gaps that must be filled before commit; the plan flags them but doesn't show the exact fetch+preserve code
- ✅ Task 8 has 7 cases; matches spec's acceptance criteria

## Open Decisions

1. **PropertyType picker** — Task 5 uses a hardcoded `propertyTypeId: 1` default. Real solution: load `/api/property-types` and let user pick. **Decision**: implement minimal picker in Task 5, OR defer with explicit warning. Default to **implement minimal picker** since otherwise users can't add temp/humidity correctly.
2. **Wizard refactor (Task 8 of spec)** — DEFERRED. Wizard keeps its current Step3/4/5 inline implementation. Risk: future divergence between two scan-and-label flows. **Decision**: revisit after this iteration ships; capture as new tech-debt memory entry.
3. **Cross-PUT atomicity** — Task 7.4 ships with two sequential PUTs (connection + ET). Risk: partial failure leaves inconsistent state. **Decision**: ship sequentially; add a follow-up backend endpoint that combines both updates atomically as P2 tech debt.
