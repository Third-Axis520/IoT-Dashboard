import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Save, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Equipment } from '../../types';
import { fetchPointLimits, savePointLimits } from '../../hooks/useSensorLimits';
import { cn } from '../../utils/cn';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface LimitsSettingsModalProps {
  assetCode: string;
  /** 綁定此 assetCode 的所有設備（用於建構點位列表） */
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
  ucl: number;
  lcl: number;
}

export const LimitsSettingsModal = ({ assetCode, equipments, onClose, onSaved }: LimitsSettingsModalProps) => {
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
          ucl: p.ucl,
          lcl: p.lcl,
        }))
      )
      .sort((a, b) => a.sensorId - b.sensorId)
  , [equipments]);

  const [rows, setRows] = useState<LimitRow[]>(initialRows);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // 載入 DB 現有限值
  useEffect(() => {
    setRows(initialRows);
    setLoading(true);
    setSaveResult(null);
    fetchPointLimits(assetCode)
      .then(limits => {
        if (Object.keys(limits).length > 0) {
          setRows(prev => prev.map(row => {
            const lim = limits[row.sensorId];
            return lim ? { ...row, ucl: lim.ucl, lcl: lim.lcl } : row;
          }));
        }
      })
      .catch(() => { /* 靜默失敗，使用設備預設值 */ })
      .finally(() => setLoading(false));
  }, [assetCode, initialRows]);

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
      await savePointLimits(assetCode, rows.map(r => ({
        sensorId: r.sensorId,
        label: r.label,
        unit: r.unit,
        ucl: r.ucl,
        lcl: r.lcl,
      })));
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
  }, [assetCode, rows, onSaved]);

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
              {t('limitsSettings.assetCode', { code: assetCode })}
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
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
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
                        <tr
                          key={row.sensorId}
                          className={cn(
                            "transition-colors hover:bg-[var(--border-base)]/30",
                            i < groupRows.length - 1 && "border-b border-[var(--border-base)]/40"
                          )}
                        >
                          <td className="px-4 py-3 text-sm text-[var(--text-main)] font-medium">
                            {row.label}
                            <span className="ml-1.5 text-[11px] text-[var(--text-muted)] font-normal">{row.unit}</span>
                            <span className="ml-2 text-[10px] text-[var(--text-muted)] font-mono opacity-60">#{row.sensorId}</span>
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
          <div className="flex items-center gap-2 text-sm min-h-[1.5rem]">
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
