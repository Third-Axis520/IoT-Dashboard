import type { Point } from '../../types';
import { cn } from '../../utils/cn';
import { SensorErrorBadge } from './SensorErrorBadge';

interface Props {
  points: Point[];
}

function PointRow({ point }: { point: Point }) {
  const isOffline = point.status === 'offline';
  const statusColor =
    point.status === 'danger' ? 'text-[var(--accent-red)]' :
    point.status === 'warning' ? 'text-[var(--accent-yellow)]' :
    'text-[var(--text-primary)]';

  return (
    <div className="flex justify-between items-baseline text-xs">
      <span className="text-[var(--text-muted)]">{point.name}</span>
      {isOffline ? (
        <SensorErrorBadge size="xs" />
      ) : (
        <span className={cn("tabular-nums font-mono", statusColor)}>
          {point.value.toFixed(1)} {point.unit}
        </span>
      )}
    </div>
  );
}

function RuntimeStat({ label, point, unit }: { label: string; point: Point | undefined; unit: string }) {
  if (!point) return null;
  if (point.status === 'offline') {
    return (
      <span className="inline-flex items-center gap-1">
        {label} <SensorErrorBadge size="xs" />
      </span>
    );
  }
  return <span>{label} {point.value.toFixed(0)}{unit}</span>;
}

export const PressingMachineLr = ({ points }: Props) => {
  const byId = new Map(points.map(p => [p.id, p]));

  const runTime = byId.get('pt_run_time');
  const operateTime = byId.get('pt_operate_time');

  const leftPoints = [
    'pt_left_count', 'pt_left_cycle', 'pt_left_press_dur',
    'pt_left_p1', 'pt_left_p2', 'pt_left_p3',
  ].map(id => byId.get(id)).filter((p): p is Point => p !== undefined);

  const rightPoints = [
    'pt_right_count', 'pt_right_cycle', 'pt_right_press_dur',
    'pt_right_p1', 'pt_right_p2', 'pt_right_p3',
  ].map(id => byId.get(id)).filter((p): p is Point => p !== undefined);

  return (
    <div className="flex-1 flex flex-col gap-2">
      {(runTime || operateTime) && (
        <div className="flex justify-around text-[10px] text-[var(--text-muted)] border-b border-[var(--border)] pb-1">
          <RuntimeStat label="開機" point={runTime} unit="s" />
          <RuntimeStat label="作業" point={operateTime} unit="s" />
        </div>
      )}
      <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
        <div className="flex flex-col gap-1 border-r border-[var(--border)] pr-2">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">左側</div>
          {leftPoints.map(p => <PointRow key={p.id} point={p} />)}
        </div>
        <div className="flex flex-col gap-1 pl-2">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">右側</div>
          {rightPoints.map(p => <PointRow key={p.id} point={p} />)}
        </div>
      </div>
    </div>
  );
};
