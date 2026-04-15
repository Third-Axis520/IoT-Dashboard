import { useState, useMemo } from 'react';
import { X, Save, CheckCircle, AlertCircle } from 'lucide-react';
import type { Equipment } from '../../types';
import { cn } from '../../utils/cn';

interface SensorMappingModalProps {
  equipment: Equipment;
  latestRawSensors: Map<string, Map<number, number>>;
  onClose: () => void;
  onSave: (updatedEquipment: Equipment) => void;
}

export const SensorMappingModal = ({
  equipment,
  latestRawSensors,
  onClose,
  onSave,
}: SensorMappingModalProps) => {
  const [mapping, setMapping] = useState<Record<number, number | undefined>>(() => {
    const m: Record<number, number | undefined> = {};
    equipment.points.forEach((p, idx) => { m[idx] = p.sensorId; });
    return m;
  });
  const [pointNames, setPointNames] = useState<string[]>(equipment.points.map(p => p.name));
  const [saved, setSaved] = useState(false);

  const liveSensors = equipment.deviceId ? latestRawSensors.get(equipment.deviceId) : undefined;

  const sensorIds = useMemo(() => {
    if (liveSensors && liveSensors.size > 0) {
      return Array.from(liveSensors.keys()).sort((a, b) => a - b);
    }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [liveSensors]);

  const usedIds = (Object.values(mapping).filter(v => v !== undefined) as number[]);
  const duplicates = usedIds.filter((id, idx) => usedIds.indexOf(id) !== idx);

  const handleSave = () => {
    const updatedEq: Equipment = {
      ...equipment,
      points: equipment.points.map((p, idx) => ({
        ...p,
        name: pointNames[idx] ?? p.name,
        sensorId: mapping[idx],
      })),
    };
    onSave(updatedEq);
    setSaved(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/90 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sensor-map-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--bg-card)]/95 border border-[var(--border-base)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-base)] shrink-0">
          <div>
            <h2 id="sensor-map-title" className="text-lg font-bold text-[var(--text-main)]">
              感測器對應設定
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {equipment.name}
              {equipment.deviceId && (
                <> · <span className="font-mono text-[var(--accent-blue)]">{equipment.deviceId}</span></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {!equipment.deviceId && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-[var(--accent-yellow)]/40 bg-[var(--accent-yellow)]/5 text-xs text-[var(--accent-yellow)]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              此設備未設定 AssetCode，感測器資料無法路由。請先在編輯模式中設定 Device ID，再來配置感測器對應。
            </div>
          )}

          {duplicates.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/40 text-xs text-[var(--accent-yellow)]">
              ⚠ 有重複的感測器編號，每個點位請使用不同的感測器。
            </div>
          )}

          {liveSensors && liveSensors.size > 0 && (
            <div className="p-3 rounded-lg border border-[var(--accent-green)]/40 bg-[var(--accent-green)]/5 text-xs text-[var(--accent-green)]">
              ✓ 目前 {liveSensors.size} 個感測器正在傳輸即時資料
            </div>
          )}

          <div className="space-y-2">
            {equipment.points.map((pt, idx) => {
              const currentSensorId = mapping[idx];
              const liveVal = currentSensorId !== undefined && liveSensors
                ? liveSensors.get(currentSensorId)
                : undefined;
              const isDup = currentSensorId !== undefined &&
                usedIds.filter(id => id === currentSensorId).length > 1;

              return (
                <div
                  key={pt.id}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-lg border bg-[var(--bg-panel)]",
                    isDup ? "border-[var(--accent-yellow)]/60" : "border-[var(--border-base)]"
                  )}
                >
                  {/* Editable point name */}
                  <input
                    type="text"
                    value={pointNames[idx] ?? pt.name}
                    onChange={e => {
                      const n = [...pointNames];
                      n[idx] = e.target.value;
                      setPointNames(n);
                      setSaved(false);
                    }}
                    className="flex-1 min-w-0 bg-transparent border-b border-[var(--border-input)] focus:border-[var(--accent-green)] text-sm text-[var(--text-main)] outline-none pb-0.5 transition-colors"
                  />

                  {/* Sensor dropdown */}
                  <select
                    value={currentSensorId ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      setMapping(prev => ({
                        ...prev,
                        [idx]: val === '' ? undefined : Number(val),
                      }));
                      setSaved(false);
                    }}
                    className={cn(
                      "bg-[var(--bg-card)] border rounded-md px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent-green)] w-40 shrink-0",
                      isDup ? "border-[var(--accent-yellow)]" : "border-[var(--border-input)]"
                    )}
                  >
                    <option value="">— 未設定 —</option>
                    {sensorIds.map(id => {
                      const val = liveSensors?.get(id);
                      return (
                        <option key={id} value={id}>
                          #{id} {val !== undefined ? val.toFixed(1) : '—'}
                        </option>
                      );
                    })}
                  </select>

                  {/* Live value badge */}
                  {liveVal !== undefined && (
                    <span className="text-[11px] font-mono text-[var(--accent-green)] bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 rounded px-1.5 py-0.5 shrink-0">
                      {liveVal.toFixed(1)}{equipment.points[idx]?.unit ?? ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-[var(--border-base)] shrink-0">
          <div className="text-sm min-h-[1.5rem] flex items-center">
            {saved && (
              <span className="flex items-center gap-1.5 text-[var(--accent-green)] animate-in fade-in duration-300">
                <CheckCircle className="w-4 h-4" />
                已套用，下一筆資料即生效
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] rounded-lg transition-colors"
            >
              關閉
            </button>
            <button
              onClick={handleSave}
              disabled={duplicates.length > 0}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold rounded-lg hover:bg-[var(--accent-green-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              套用對應
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
