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
      aria-labelledby="wizard-post-title"
    >
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 id="wizard-post-title" className="font-bold text-[var(--text-main)]">{t('wizardPost.title')}</h2>
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

          {/* No asset code soft notice */}
          {!assetCode && (
            <div className="px-3 py-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-panel)] text-xs text-[var(--text-muted)]">
              {t('wizardPost.noAssetCodeHint')}
            </div>
          )}

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
