import React from 'react';
import { Bell } from 'lucide-react';
import type { AlertRecord } from '../../types';
import { cn } from '../../utils/cn';

interface Props {
  alerts: AlertRecord[];
}

/**
 * System footer — always-visible single-line marquee of the most recent
 * alerts. Hover pauses the animation so operators can read entries that
 * scrolled by.
 */
export const AlertMarqueeBar = React.memo(function AlertMarqueeBar({ alerts }: Props) {
  const recent = alerts.slice(-10).reverse();

  return (
    <div
      className="h-9 w-full shrink-0 bg-[var(--bg-card)] border-t border-[var(--border-base)] flex items-center px-4 overflow-hidden group"
      role="status"
      aria-live="polite"
      aria-label="Real-time alerts"
    >
      <div className="flex items-center gap-2 text-[var(--accent-red)] font-bold shrink-0">
        <Bell className={cn('w-4 h-4', recent.length > 0 && 'animate-pulse')} />
        <span className="hidden md:inline text-xs tracking-widest">REAL-TIME ALERTS</span>
      </div>
      <div className="w-px h-5 bg-[var(--border-base)] mx-3 shrink-0" />
      <div className="flex-1 overflow-hidden relative h-full flex items-center">
        {recent.length > 0 ? (
          <div className="flex gap-8 animate-marquee group-hover:[animation-play-state:paused] whitespace-nowrap items-center">
            {[...recent, ...recent].map((a, i) => (
              <div key={`${a.id}-${i}`} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)] font-mono">
                  {new Date(a.time).toLocaleTimeString()}
                </span>
                <span className="text-xs font-bold text-[var(--text-main)]">
                  {a.eqName}{' '}
                  <span className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--border-base)] px-1 rounded">
                    {a.deviceId}
                  </span>{' '}
                  – {a.pointName}
                </span>
                <span
                  className={cn(
                    'text-xs font-bold',
                    a.status === 'danger' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-yellow)]'
                  )}
                >
                  {a.type} {a.value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">No recent alerts</span>
        )}
      </div>
    </div>
  );
});
