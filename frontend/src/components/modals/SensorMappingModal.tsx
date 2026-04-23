import { useState } from 'react';
import { X, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { Equipment } from '../../types';
import SensorMappingRows, { useSensorMappingState } from '../ui/SensorMappingRows';

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
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  const { t } = useTranslation();

  const liveSensors = equipment.deviceId ? latestRawSensors.get(equipment.deviceId) : undefined;

  const { hasDuplicates } = useSensorMappingState(mapping as Record<number, number>);

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
      ref={trapRef}
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
              {t('dashboard.sensorMapping')}
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
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {!equipment.deviceId && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-[var(--accent-yellow)]/40 bg-[var(--accent-yellow)]/5 text-xs text-[var(--accent-yellow)]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {t('sensorMapModal.noDeviceId')}
            </div>
          )}

          {liveSensors && liveSensors.size > 0 && (
            <div className="p-3 rounded-lg border border-[var(--accent-green)]/40 bg-[var(--accent-green)]/5 text-xs text-[var(--accent-green)]">
              {t('addDevice.liveSensors', { count: liveSensors.size })}
            </div>
          )}

          <SensorMappingRows
            points={equipment.points}
            liveSensors={liveSensors}
            sensorMapping={mapping as Record<number, number>}
            onMappingChange={(m) => { setMapping(m); setSaved(false); }}
            pointNames={pointNames}
            onPointNamesChange={(n) => { setPointNames(n); setSaved(false); }}
            showUnit
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-[var(--border-base)] shrink-0">
          <div className="text-sm min-h-[1.5rem] flex items-center">
            {saved && (
              <span className="flex items-center gap-1.5 text-[var(--accent-green)] animate-in fade-in duration-300">
                <CheckCircle className="w-4 h-4" />
                {t('sensorMapModal.saved')}
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
              disabled={hasDuplicates}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--accent-green)] text-[var(--bg-panel)] font-bold rounded-lg hover:bg-[var(--accent-green-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              {t('sensorMapModal.apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
