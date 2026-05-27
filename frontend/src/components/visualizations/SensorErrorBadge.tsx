import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/cn';

export type SensorErrorBadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface SensorErrorBadgeProps {
  /**
   * Visual scale. Picks icon size + label size:
   *   xs (rows in PressingMachineLr) — 12px icon, inherit text
   *   sm (DualSideSpark / SingleKpi / FourRings) — proportional icon, text-sm label
   *   md (PointTrendCard compact) — 16px icon, text-base label
   *   lg (VisualMarkingMachine center, PointTrendCard full) — 24-48px icon, text-xl label
   */
  size?: SensorErrorBadgeSize;
  /** Stack icon above label (true) vs inline (false). Default inline. */
  vertical?: boolean;
  /** Allow override of accent color (amber by default). */
  className?: string;
}

/**
 * Shared error indicator for sensors whose reading was rejected
 * (sentinel value, comms failure, gating block). Renders an amber
 * AlertTriangle + localized "感測器異常" label.
 *
 * Why amber, not red: red is reserved for UCL/LCL alarms (process out
 * of bounds). Amber signals "data unreliable — fix the sensor" so
 * operators can distinguish device failure from process failure.
 */
export function SensorErrorBadge({
  size = 'sm',
  vertical = false,
  className,
}: SensorErrorBadgeProps) {
  const { t } = useTranslation();

  const iconClass =
    size === 'xs' ? 'w-3 h-3' :
    size === 'sm' ? 'w-[0.7em] h-[0.7em]' :
    size === 'md' ? 'w-4 h-4' :
                    'w-12 h-12';
  const labelClass =
    size === 'xs' ? 'text-xs' :
    size === 'sm' ? 'text-sm' :
    size === 'md' ? 'text-base' :
                    'text-xl';

  return (
    <span
      className={cn(
        vertical
          ? 'flex flex-col items-center justify-center gap-2'
          : 'inline-flex items-center gap-1',
        'text-[var(--accent-yellow)] animate-pulse font-bold tracking-wide whitespace-nowrap',
        className
      )}
      title={t('common.sensorErrorTooltip')}
      role="status"
      aria-label={t('common.sensorError')}
    >
      <AlertTriangle className={cn(iconClass, 'shrink-0')} strokeWidth={2.5} />
      <span className={labelClass}>{t('common.sensorError')}</span>
    </span>
  );
}
