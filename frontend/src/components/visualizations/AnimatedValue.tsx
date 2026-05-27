import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { PointStatus } from '../../types';
import { cn } from '../../utils/cn';
import { getStatusColor } from '../../constants/templates';

interface AnimatedValueProps {
  value: number;
  status: PointStatus;
  className?: string;
}

export const AnimatedValue = React.memo(function AnimatedValue({ value, status, className }: AnimatedValueProps) {
  const { t } = useTranslation();
  const [displayValue, setDisplayValue] = useState(value);
  const [isFlickering, setIsFlickering] = useState(false);

  useEffect(() => {
    if (value !== displayValue) {
      setIsFlickering(true);
      setDisplayValue(value);
      const timer = setTimeout(() => setIsFlickering(false), 150);
      return () => clearTimeout(timer);
    }
  }, [value, displayValue]);

  // Sensors flagged as offline (sentinel rejected, comms failure, gated off)
  // render a high-visibility error badge instead of the number. Operators on
  // the floor must immediately see "this data is wrong" rather than dismiss a
  // subtle em-dash as a stylistic choice. Amber + AlertTriangle icon + explicit
  // localized label "感測器異常" signal "needs attention but distinct from
  // a UCL/LCL alarm (which uses danger red)".
  if (status === 'offline') {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[var(--accent-yellow)] animate-pulse",
          className
        )}
        title={t('common.sensorErrorTooltip')}
        role="status"
        aria-label={t('common.sensorError')}
      >
        <AlertTriangle className="w-[0.7em] h-[0.7em] shrink-0" strokeWidth={2.5} />
        <span className="text-sm font-bold tracking-wide whitespace-nowrap">
          {t('common.sensorError')}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "font-mono font-bold transition-all duration-150 text-glow",
        isFlickering ? "brightness-125 scale-[1.02]" : "brightness-100 scale-100",
        className
      )}
      style={{ color: getStatusColor(status) }}
    >
      {value.toFixed(1)}
    </span>
  );
});
