import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { X, Save, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Equipment } from '../../types';
import { fetchPointLimits, savePointLimits } from '../../hooks/useSensorLimits';
import { fetchGatingRules, saveGatingRules } from '../../lib/apiSensorGating';
import type { SaveGatingRuleItem } from '../../types/gating';
import { GatingRow } from '../sensors/GatingRow';
import { cn } from '../../utils/cn';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import InlineErrorBanner from '../ui/InlineErrorBanner';

interface LimitsSettingsModalProps {
  /** Modal scope label (e.g. production line name) — informational only */
  scopeLabel?: string;
  /** All equipments to manage UCL/LCL + gating for. Each must have its own deviceId (=AssetCode). */
  equipments: Equipment[];
  onClose: () => void;
  /** 儲存成功後，通知 App 更新所有 point 的 ucl/lcl（keyed by sensorId） */
  onSaved: (limits: Record<number, { ucl: number; lcl: number }>) => void;
}

interface LimitRow {
  sensorId: number;
  label: string;
  unit: string;
  equipmentName: string;
  /** AssetCode this sensor belongs to — needed because one modal now spans
   *  multiple equipments, each potentially under a different AssetCode. */
  assetCode: string;
  ucl: number;
  lcl: number;
}

export const LimitsSettingsModal = ({ scopeLabel, equipments, onClose, onSaved }: LimitsSettingsModalProps) => {
  const { t } = useTranslation();
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  const initialRows = useMemo<LimitRow[]>(() =>
    equipments
      .flatMap(eq => eq.points
        .filter(p => p.sensorId !== undefined)
        .map(p => ({
          sensorId: p.sensorId!,
          label: p.name,
          unit: p.unit,
          equipmentName: eq.name,
          assetCode: eq.deviceId,
          ucl: p.ucl,
          lcl: p.lcl,
        }))
      )
      .sort((a, b) => a.sensorId - b.sensorId)
  , [equipments]);

  // Distinct asset codes covered by this modal — used to fetch limits/gating per-asset
  const assetCodes = useMemo(
    () => Array.from(new Set(equipments.map(e => e.deviceId).filter(Boolean))),
    [equipments]
  );

  const [rows, setRows] = useState<LimitRow[]>(initialRows);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gatingRules, setGatingRules] = useState<Record<number, SaveGatingRuleItem | null>>({});

  // initialRows changes reference whenever the parent's `data` state ticks
  // (every SSE sensor reading), so we cannot put it in loadAll's deps —
  // doing so re-fired loadAll every poll tick and stomped in-flight edits.
  // Stash it in a ref so loadAll always sees the latest schema list without
  // being re-created.
  const initialRowsRef = useRef(initialRows);
  initialRowsRef.current = initialRows;

  // Stable signature so loadAll's deps don't include the array reference
  const assetCodesKey = assetCodes.join(',');

  // Combined loader: limits + gating rules across ALL asset codes covered by
  // this modal. Surfaces failures so user can retry.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setSaveResult(null);
    setRows(initialRowsRef.current);
    const codes = assetCodesKey ? assetCodesKey.split(',') : [];
    try {
      // Fetch limits and gating rules for ALL asset codes concurrently
      const fetches = await Promise.all([
        ...codes.map(ac => fetchPointLimits(ac).then(lim => ({ kind: 'limits' as const, ac, data: lim }))),
        ...codes.map(ac => fetchGatingRules(ac).then(rules => ({ kind: 'rules' as const, ac, data: rules }))),
      ]);
      const limitsPerAsset = fetches.filter(f => f.kind === 'limits').map(f => [f.ac, f.data] as const);
      const rulesPerAsset = fetches.filter(f => f.kind === 'rules').map(f => [f.ac, f.data] as const);

      // Merge limits — keyed by (assetCode, sensorId), but our row already
      // carries assetCode so we just look up by sensorId scoped to its asset
      setRows(prev => prev.map(row => {
        const entry = limitsPerAsset.find(([ac]) => ac === row.assetCode);
        const lim = entry?.[1]?.[row.sensorId];
        return lim ? { ...row, ucl: lim.ucl, lcl: lim.lcl } : row;
      }));

      const map: Record<number, SaveGatingRuleItem> = {};
      rulesPerAsset.forEach(([, rules]) => {
        rules.forEach(r => {
          map[r.gatedSensorId] = {
            gatedSensorId: r.gatedSensorId,
            gatingAssetCode: r.gatingAssetCode,
            gatingSensorId: r.gatingSensorId,
            delayMs: r.delayMs,
            maxAgeMs: r.maxAgeMs,
          };
        });
      });
      setGatingRules(map);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [assetCodesKey]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleChange = useCallback((sensorId: number, field: 'ucl' | 'lcl', value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setRows(prev => prev.map(r => r.sensorId === sensorId ? { ...r, [field]: num } : r));
    setSaveResult(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      // Group rows by their AssetCode so we can save each asset's limits independently
      const rowsByAsset = new Map<string, LimitRow[]>();
      for (const r of rows) {
        if (!rowsByAsset.has(r.assetCode)) rowsByAsset.set(r.assetCode, []);
        rowsByAsset.get(r.assetCode)!.push(r);
      }
      // Group gating rules by their gated AssetCode (where the sensor lives)
      const sensorAssetMap = new Map(rows.map(r => [r.sensorId, r.assetCode]));
      const rulesByAsset = new Map<string, SaveGatingRuleItem[]>();
      for (const ac of rowsByAsset.keys()) rulesByAsset.set(ac, []);
      Object.values(gatingRules).forEach(rule => {
        if (rule === null || rule.gatingAssetCode === '') return;
        const ac = sensorAssetMap.get(rule.gatedSensorId);
        if (!ac) return;
        rulesByAsset.get(ac)?.push(rule);
      });

      // 1. Save UCL/LCL per AssetCode
      await Promise.all(Array.from(rowsByAsset.entries()).map(([ac, assetRows]) =>
        savePointLimits(ac, assetRows.map(r => ({
          sensorId: r.sensorId,
          label: r.label,
          unit: r.unit,
          ucl: r.ucl,
          lcl: r.lcl,
        })))
      ));

      // 2. Save gating rules per AssetCode (PUT with empty list = delete all)
      await Promise.all(Array.from(rulesByAsset.entries()).map(([ac, ruleList]) =>
        saveGatingRules(ac, ruleList)
      ));

      setSaveResult('success');
      const limitMap: Record<number, { ucl: number; lcl: number }> = {};
      rows.forEach(r => { limitMap[r.sensorId] = { ucl: r.ucl, lcl: r.lcl }; });
      onSaved(limitMap);
    } catch (e) {
      setSaveResult('error');
      setErrorMsg(e instanceof Error ? e.message : '儲存失敗，請確認後端服務正常');
    } finally {
      setSaving(false);
    }
  }, [rows, gatingRules, onSaved]);

  // 依設備分組
  const groups = rows.reduce<Record<string, LimitRow[]>>((acc, row) => {
    if (!acc[row.equipmentName]) acc[row.equipmentName] = [];
    acc[row.equipmentName].push(row);
    return acc;
  }, {});

  const hasNoRows = rows.length === 0;

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/90 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="limits-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--bg-card)]/95 border border-[var(--border-base)] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-300 max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-base)] shrink-0">
          <div>
            <h2 id="limits-modal-title" className="text-lg font-bold text-[var(--text-main)]">
              {t('limitsSettings.title')}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {scopeLabel ? `${scopeLabel}　·　` : ''}
              {assetCodes.length > 0 && t('limitsSettings.assetCode', { code: assetCodes.join(', ') })}
              　·　{t('limitsSettings.infoHint')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5" aria-busy={loading}>
          {loadError ? (
            <InlineErrorBanner
              message={t('common.loadFailed')}
              hint={`${loadError} — ${t('common.loadFailedHint')}`}
              onRetry={loadAll}
            />
          ) : loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-muted)]" role="status" aria-live="polite">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              {t('limitsSettings.loading')}
            </div>
          ) : hasNoRows ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)] text-sm text-center gap-3">
              <AlertCircle className="w-8 h-8 opacity-40" />
              <p>{t('limitsSettings.empty')}</p>
              <p className="text-xs opacity-70">{t('limitsSettings.emptyHint')}</p>
            </div>
          ) : (
            Object.entries(groups).map(([eqName, groupRows]) => (
              <div key={eqName}>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 mb-2">
                  {eqName}
                </div>
                <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-base)] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--border-base)] text-[var(--text-muted)] text-xs">
                        <th className="text-left px-4 py-2 font-medium">{t('limitsSettings.colSensor')}</th>
                        <th className="text-right px-4 py-2 font-medium w-32">
                          {t('limitsSettings.colUcl')}
                        </th>
                        <th className="text-right px-4 py-2 font-medium w-32">
                          {t('limitsSettings.colLcl')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((row, i) => (
                        <Fragment key={row.sensorId}>
                          <tr className={cn(
                            "transition-colors hover:bg-[var(--border-base)]/30",
                            !gatingRules[row.sensorId] && i < groupRows.length - 1 && "border-b border-[var(--border-base)]/40"
                          )}>
                            <td className="px-4 py-3 text-sm text-[var(--text-main)] font-medium">
                              <div className="flex items-center gap-2">
                                <span className="truncate">{row.label}</span>
                                <span className="text-[11px] text-[var(--text-muted)] font-normal shrink-0">{row.unit}</span>
                                <span className="text-[10px] text-[var(--text-muted)] font-mono opacity-60 shrink-0">#{row.sensorId}</span>
                                {/* Gating status pill — quick visual indicator of whether DI gating is bound */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const el = document.getElementById(`gating-row-${row.sensorId}`);
                                    if (el) {
                                      (el as HTMLDetailsElement).open = true;
                                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      // Focus the source dropdown so user can immediately pick
                                      setTimeout(() => {
                                        el.querySelector<HTMLSelectElement>('select')?.focus();
                                      }, 200);
                                    }
                                  }}
                                  title={gatingRules[row.sensorId] ? t('sensor.gating.gotoEnabled') : t('sensor.gating.gotoDisabled')}
                                  className={cn(
                                    'shrink-0 ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                                    gatingRules[row.sensorId]
                                      ? 'bg-[var(--accent-green)]/15 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/25'
                                      : 'bg-[var(--border-base)]/40 text-[var(--text-muted)] hover:bg-[var(--border-base)] hover:text-[var(--text-main)]'
                                  )}
                                >
                                  ⚡ {gatingRules[row.sensorId] ? t('sensor.gating.bound') : t('sensor.gating.bind')}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                step="0.5"
                                value={row.ucl}
                                onChange={e => handleChange(row.sensorId, 'ucl', e.target.value)}
                                className="w-24 bg-[var(--bg-card)] border border-[var(--border-input)] rounded-md px-2 py-1.5 text-right text-[var(--accent-red)] font-mono text-sm outline-none focus:border-[var(--accent-red)]/70 transition-colors"
                                aria-label={`${row.label} UCL`}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                step="0.5"
                                value={row.lcl}
                                onChange={e => handleChange(row.sensorId, 'lcl', e.target.value)}
                                className="w-24 bg-[var(--bg-card)] border border-[var(--border-input)] rounded-md px-2 py-1.5 text-right text-[var(--accent-blue)] font-mono text-sm outline-none focus:border-[var(--accent-blue)]/70 transition-colors"
                                aria-label={`${row.label} LCL`}
                              />
                            </td>
                          </tr>
                          <tr className={cn(
                            i < groupRows.length - 1 && "border-b border-[var(--border-base)]/40"
                          )}>
                            <td colSpan={3} className="px-4 pb-2">
                              {/* Default open: gating is the primary reason users open this modal,
                                  hiding it behind a fold made it un-discoverable */}
                              <details id={`gating-row-${row.sensorId}`} className="mt-1" open>
                                <summary className="cursor-pointer text-xs text-[var(--text-muted)] select-none">
                                  ⚙ {t('sensor.gating.advanced')}: {gatingRules[row.sensorId] ? t('sensor.gating.enabled') : t('sensor.gating.disabled')}
                                </summary>
                                <GatingRow
                                  assetCode={row.assetCode}
                                  sensorId={row.sensorId}
                                  rule={gatingRules[row.sensorId] ?? null}
                                  onChange={rule => {
                                    setGatingRules(prev => ({ ...prev, [row.sensorId]: rule }));
                                    setSaveResult(null);
                                  }}
                                />
                              </details>
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-[var(--border-base)] shrink-0">
          <div className="flex items-center gap-2 text-sm min-h-[1.5rem]" role="status" aria-live="polite">
            {saveResult === 'success' && (
              <span className="flex items-center gap-1.5 text-[var(--accent-green)] animate-in fade-in duration-300">
                <CheckCircle className="w-4 h-4" />
                {t('limitsSettings.saveSuccess')}
              </span>
            )}
            {saveResult === 'error' && (
              <span className="flex items-center gap-1.5 text-[var(--accent-red)] animate-in fade-in duration-300">
                <AlertCircle className="w-4 h-4" />
                {errorMsg}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
            >
              {t('common.close')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || hasNoRows}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold rounded-lg hover:bg-[var(--accent-green-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />
              }
              {saving ? t('drillDown.saving') : t('limitsSettings.saveButton')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
