import type { Point } from '../../types';
import { cn } from '../../utils/cn';

interface Props {
  points: Point[];
}

export const VisualMarkingMachine = function VisualMarkingMachine({ points }: Props) {
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
    isOffline ? 'text-[var(--text-muted)]/60' :
    pressure.status === 'danger' ? 'text-[var(--accent-red)]' :
    pressure.status === 'warning' ? 'text-[var(--accent-yellow)]' :
    'text-[var(--text-primary)]';

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className={cn("text-5xl font-bold tabular-nums", statusColor)} title={isOffline ? 'sensor offline' : undefined}>
        {isOffline ? '—' : pressure.value.toFixed(1)}
      </div>
      <div className="text-sm text-[var(--text-muted)] mt-2">
        {pressure.name} ({pressure.unit})
      </div>
    </div>
  );
};
