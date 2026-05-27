import type { Point } from '../../types';
import { cn } from '../../utils/cn';
import { SensorErrorBadge } from './SensorErrorBadge';

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

  const statusColor =
    pressure.status === 'danger' ? 'text-[var(--accent-red)]' :
    pressure.status === 'warning' ? 'text-[var(--accent-yellow)]' :
    'text-[var(--text-primary)]';

  if (pressure.status === 'offline') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <SensorErrorBadge size="lg" vertical />
        <div className="text-xs text-[var(--text-muted)] mt-2">{pressure.name}</div>
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
