import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scanDiscovery, type DiscoveredPoint } from '../../lib/apiDiscovery';
import { fetchPropertyTypes, type PropertyTypeItem } from '../../lib/apiPropertyTypes';

export interface NewSensorDraft {
  rawAddress: string;
  label: string;
  unit: string;
  propertyTypeId: number;
}

interface Props {
  protocol: string;
  configJson: string;
  existingRawAddresses: Set<string>;
  onAdd: (drafts: NewSensorDraft[]) => void;
  onCancel: () => void;
}

interface RowDraft {
  label: string;
  unit: string;
  propertyTypeId: number;
}

export default function SensorAddPanel({
  protocol, configJson, existingRawAddresses, onAdd, onCancel,
}: Props) {
  const { t } = useTranslation();
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'error' | 'ready'>('idle');
  const [scanError, setScanError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DiscoveredPoint[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyTypeItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});

  useEffect(() => {
    fetchPropertyTypes().then(setPropertyTypes).catch(() => { /* picker just empties */ });
  }, []);

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

  function defaultDraft(c: DiscoveredPoint): RowDraft {
    const fallbackPt = propertyTypes[0];
    return {
      label: c.suggestedLabel ?? '',
      unit: fallbackPt?.defaultUnit ?? '',
      propertyTypeId: fallbackPt?.id ?? 0,
    };
  }

  function getDraft(i: number): RowDraft {
    return drafts[i] ?? defaultDraft(candidates[i]);
  }

  function setDraft(i: number, patch: Partial<RowDraft>) {
    setDrafts(prev => ({ ...prev, [i]: { ...getDraft(i), ...patch } }));
  }

  function toggleSelect(i: number, checked: boolean) {
    const next = new Set(selectedIdx);
    if (checked) {
      next.add(i);
      if (!drafts[i]) setDrafts(prev => ({ ...prev, [i]: defaultDraft(candidates[i]) }));
    } else {
      next.delete(i);
    }
    setSelectedIdx(next);
  }

  function handleApply() {
    const drafts: NewSensorDraft[] = Array.from(selectedIdx).map(i => {
      const d = getDraft(i);
      return {
        rawAddress: candidates[i].rawAddress,
        label: d.label.trim() || candidates[i].suggestedLabel || candidates[i].rawAddress,
        unit: d.unit,
        propertyTypeId: d.propertyTypeId,
      };
    }).filter(d => d.propertyTypeId > 0);  // skip invalid (picker not loaded)
    if (drafts.length > 0) onAdd(drafts);
  }

  const canApply = selectedIdx.size > 0 && propertyTypes.length > 0;

  return (
    <div className="border border-[var(--border-base)] rounded-lg p-3 space-y-3 bg-[var(--bg-panel)]">
      {scanState === 'idle' && (
        <button
          type="button"
          onClick={handleScan}
          className="px-3 py-1 text-sm rounded border border-[var(--accent-green)] text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 transition-colors"
        >
          {t('connectionSettings.sensors.scanAndAddButton')}
        </button>
      )}

      {scanState === 'scanning' && (
        <div className="text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
          {t('connectionSettings.sensors.scanning')}
        </div>
      )}

      {scanState === 'error' && (
        <div className="text-sm text-[var(--accent-red)]" role="alert">
          {scanError}
        </div>
      )}

      {scanState === 'ready' && candidates.length === 0 && (
        <div className="text-sm text-[var(--text-muted)]">
          {t('connectionSettings.sensors.noNewPoints')}
        </div>
      )}

      {scanState === 'ready' && candidates.length > 0 && (
        <>
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {t('connectionSettings.sensors.candidatesHeader', { count: candidates.length })}
          </div>
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {candidates.map((c, i) => {
              const d = getDraft(i);
              const selected = selectedIdx.has(i);
              return (
                <li key={c.rawAddress} className="text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={e => toggleSelect(i, e.target.checked)}
                      aria-label={`select ${c.rawAddress}`}
                    />
                    <span className="font-mono text-xs text-[var(--text-muted)] w-20 shrink-0">
                      {c.rawAddress}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] flex-1 truncate">
                      {c.suggestedLabel ?? c.dataType}
                    </span>
                  </label>
                  {selected && (
                    <div className="flex items-center gap-2 mt-1 pl-6">
                      <input
                        type="text"
                        value={d.label}
                        onChange={e => setDraft(i, { label: e.target.value })}
                        placeholder={t('connectionSettings.sensors.labelPlaceholder')}
                        aria-label={`label ${c.rawAddress}`}
                        className="flex-1 px-2 py-0.5 text-xs rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
                      />
                      <select
                        value={d.propertyTypeId}
                        onChange={e => {
                          const pt = propertyTypes.find(p => p.id === Number(e.target.value));
                          setDraft(i, { propertyTypeId: Number(e.target.value), unit: pt?.defaultUnit ?? d.unit });
                        }}
                        aria-label={`property type ${c.rawAddress}`}
                        className="px-2 py-0.5 text-xs rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
                      >
                        {propertyTypes.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={d.unit}
                        onChange={e => setDraft(i, { unit: e.target.value })}
                        placeholder={t('connectionSettings.sensors.unitPlaceholder')}
                        aria-label={`unit ${c.rawAddress}`}
                        className="w-14 px-2 py-0.5 text-xs rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-sm rounded border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
        >
          {t('connectionSettings.sensors.cancelAddButton')}
        </button>
        {scanState === 'ready' && candidates.length > 0 && (
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="px-3 py-1 text-sm rounded bg-[var(--accent-green)] text-[var(--bg-panel)] font-medium disabled:opacity-40 hover:bg-[var(--accent-green-hover)] transition-colors"
          >
            {t('connectionSettings.sensors.applyAddButton', { count: selectedIdx.size })}
          </button>
        )}
      </div>
    </div>
  );
}
