import { useTranslation } from 'react-i18next';
import type { GatingState } from '../../types/gating';

interface GatingBadgeProps {
  state: GatingState;
}

const STATE_STYLES: Record<
  Exclude<GatingState, null>,
  { className: string; key: string }
> = {
  sampling:  { className: 'text-[var(--accent-green)]',  key: 'sensor.gating.sampling' },
  standby:   { className: 'text-[var(--text-muted)]',     key: 'sensor.gating.standby' },
  unhealthy: { className: 'text-amber-500',               key: 'sensor.gating.unhealthy' },
};

export function GatingBadge({ state }: GatingBadgeProps) {
  const { t } = useTranslation();
  if (state === null) return null;

  const { className, key } = STATE_STYLES[state];
  return (
    <span className={`text-xs ${className}`}>{t(key)}</span>
  );
}
