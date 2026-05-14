import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import SensorAddPanel, { type NewSensorDraft } from './SensorAddPanel';

export interface SensorRow {
  sensorId: number;
  pointId: string;
  rawAddress: string | null;
  label: string;
  unit: string;
  propertyTypeId: number;
  sortOrder: number;
}

interface Props {
  sensors: SensorRow[];
  onChange: (next: SensorRow[]) => void;
  onAdd: (drafts: NewSensorDraft[]) => void;
  protocol: string;
  configJson: string;
  loading?: boolean;
  loadError?: string | null;
  defaultOpen?: boolean;
}

export default function SensorManagementSection({
  sensors, onChange, onAdd, protocol, configJson,
  loading = false, loadError = null, defaultOpen = false,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const [adding, setAdding] = useState(false);

  function handleLabelChange(idx: number, label: string) {
    onChange(sensors.map((s, i) => i === idx ? { ...s, label } : s));
  }

  function handleRemove(idx: number) {
    const row = sensors[idx];
    const msg = t('connectionSettings.sensors.removeConfirm') +
      `\n\n${row.label || row.rawAddress || `Sensor ${row.sensorId}`}`;
    if (typeof window !== 'undefined' && !window.confirm(msg)) return;
    onChange(sensors.filter((_, i) => i !== idx));
  }

  function handleAddDrafts(drafts: NewSensorDraft[]) {
    onAdd(drafts);
    setAdding(false);
  }

  const existingRawAddresses = new Set(
    sensors.map(s => s.rawAddress).filter((a): a is string => a !== null)
  );

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
          {loading && (
            <div className="text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
              {t('common.loading')}
            </div>
          )}

          {loadError && (
            <div className="text-sm text-[var(--accent-red)]" role="alert">
              {loadError}
            </div>
          )}

          {!loading && !loadError && sensors.length === 0 && !adding && (
            <div className="text-sm text-[var(--text-muted)]">
              {t('connectionSettings.sensors.noSensors')}
            </div>
          )}

          {!loading && !loadError && sensors.length > 0 && (
            <>
              <div className="text-xs font-medium text-[var(--text-muted)]">
                {t('connectionSettings.sensors.existingHeader', { count: sensors.length })}
              </div>
              <ul className="space-y-1.5">
                {sensors.map((s, i) => (
                  <li key={s.sensorId} className="flex items-center gap-2 text-sm">
                    <span
                      className="font-mono text-xs text-[var(--text-muted)] w-20 shrink-0"
                      title={s.rawAddress ?? s.pointId}
                    >
                      {s.rawAddress ?? s.pointId}
                    </span>
                    <input
                      type="text"
                      value={s.label}
                      onChange={e => handleLabelChange(i, e.target.value)}
                      placeholder={t('connectionSettings.sensors.labelPlaceholder')}
                      aria-label={`${t('connectionSettings.sensors.labelPlaceholder')} — ${s.rawAddress ?? s.pointId}`}
                      className="flex-1 px-2 py-0.5 text-xs rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] outline-none focus:border-[var(--accent-green)]"
                    />
                    {s.unit && (
                      <span className="text-xs text-[var(--text-muted)] shrink-0">{s.unit}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(i)}
                      aria-label={`remove sensor ${s.sensorId}`}
                      className="text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!loading && !loadError && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="px-3 py-1 text-sm rounded border border-[var(--accent-green)] text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 transition-colors"
            >
              + {t('connectionSettings.sensors.scanAndAddButton')}
            </button>
          )}

          {!loading && !loadError && adding && (
            <SensorAddPanel
              protocol={protocol}
              configJson={configJson}
              existingRawAddresses={existingRawAddresses}
              onAdd={handleAddDrafts}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
