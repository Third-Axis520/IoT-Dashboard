import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { Point } from '../../types';
import { cn } from '../../utils/cn';

interface Props {
  points: Point[];
}

export const VisualMarkingMachine = function VisualMarkingMachine({ points }: Props) {
  const { t } = useTranslation();
  const pressure = points.find(p => p.id === 'pt_pressure');

  if (!pressure) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">
        無資料
      </div>
    );
  }

  const isOffline = pressure.status === 'offline';
  const statusColor =
    pressure.status === 'danger' ? 'text-[var(--accent-red)]' :
    pressure.status === 'warning' ? 'text-[var(--accent-yellow)]' :
    'text-[var(--text-primary)]';

  if (isOffline) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--accent-yellow)] animate-pulse"
        title={t('common.sensorErrorTooltip')}
        role="status"
        aria-label={t('common.sensorError')}
      >
        <AlertTriangle className="w-12 h-12" strokeWidth={2.5} />
        <div className="text-xl font-bold tracking-wide">{t('common.sensorError')}</div>
        <div className="text-xs text-[var(--text-muted)]">
          {pressure.name}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className={cn("text-5xl font-bold tabular-nums", statusColor)}>
        {pressure.value.toFixed(1)}
      </div>
      <div className="text-sm text-[var(--text-muted)] mt-2">
        {pressure.name} ({pressure.unit})
      </div>
    </div>
  );
};
