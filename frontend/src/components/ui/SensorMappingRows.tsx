import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/cn';

interface PointDef {
  name: string;
  unit?: string;
}

interface SensorMappingRowsProps {
  points: PointDef[];
  liveSensors: Map<number, number> | undefined;
  sensorMapping: Record<number, number>;
  onMappingChange: (mapping: Record<number, number>) => void;
  pointNames: string[];
  onPointNamesChange: (names: string[]) => void;
  /** Show unit suffix on live value badge */
  showUnit?: boolean;
}

export function useSensorMappingState(sensorMapping: Record<number, number>) {
  const usedSensorIds = Object.values(sensorMapping);
  const duplicates = usedSensorIds.filter((id, idx) => usedSensorIds.indexOf(id) !== idx);
  return { usedSensorIds, duplicates, hasDuplicates: duplicates.length > 0 };
}

export default function SensorMappingRows({
  points,
  liveSensors,
  sensorMapping,
  onMappingChange,
  pointNames,
  onPointNamesChange,
  showUnit,
}: SensorMappingRowsProps) {
  const { t } = useTranslation();

  const sensorIds = useMemo(() => {
    if (liveSensors && liveSensors.size > 0) {
      return Array.from(liveSensors.keys()).sort((a, b) => a - b);
    }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [liveSensors]);

  const usedSensorIds = Object.values(sensorMapping);
  const duplicates = usedSensorIds.filter((id, idx) => usedSensorIds.indexOf(id) !== idx);

  return (
    <div className="space-y-2">
      {duplicates.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/40 text-xs text-[var(--accent-yellow)]">
          {t('addDevice.duplicateWarning')}
        </div>
      )}
      {points.map((pt, idx) => {
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
                onPointNamesChange(n);
              }}
              className="flex-1 min-w-0 bg-transparent border-b border-[var(--border-input)] focus:border-[var(--accent-green)] text-sm text-[var(--text-main)] outline-none pb-0.5 transition-colors"
            />
            <select
              value={currentSensorId ?? ''}
              onChange={e => {
                const val = e.target.value;
                const next = { ...sensorMapping };
                if (val === '') delete next[idx];
                else next[idx] = Number(val);
                onMappingChange(next);
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
                {liveVal.toFixed(1)}{showUnit && pt.unit ? ` ${pt.unit}` : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
