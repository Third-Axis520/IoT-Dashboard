import React, { useState, useEffect } from 'react';
import type { PointStatus } from '../../types';
import { cn } from '../../utils/cn';
import { getStatusColor } from '../../constants/templates';

interface AnimatedValueProps {
  value: number;
  status: PointStatus;
  className?: string;
}

export const AnimatedValue = React.memo(function AnimatedValue({ value, status, className }: AnimatedValueProps) {
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
