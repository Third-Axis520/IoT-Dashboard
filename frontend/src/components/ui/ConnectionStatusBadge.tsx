import { cn } from '../../utils/cn';
import type { ConnectionStatus } from '../../hooks/useLiveData';

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  error?: string | null;
}

export function ConnectionStatusBadge({ status, error }: ConnectionStatusBadgeProps) {
  const dotClass = cn('w-2 h-2 rounded-full flex-shrink-0', {
    'bg-[var(--accent-blue)] animate-pulse':  status === 'connecting',
    'bg-[var(--accent-green)]':               status === 'connected',
    'bg-[var(--accent-red)] animate-pulse':   status === 'error',
    'bg-[var(--text-muted)]':                 status === 'offline',
  });

  const textClass = cn('font-mono font-bold text-glow', {
    'text-[var(--accent-blue)]':  status === 'connecting',
    'text-[var(--accent-green)]': status === 'connected',
    'text-[var(--accent-red)]':   status === 'error',
    'text-[var(--text-muted)]':   status === 'offline',
  });

  const label = {
    connecting: '連接中...',
    connected:  '即時串流',
    error:      error ?? '連線中斷',
    offline:    '離線',
  }[status];

  return (
    <div className="flex items-center gap-2" title={error ?? label}>
      <div className={dotClass} />
      <span className="text-[var(--text-muted)]">串流:</span>
      <span className={textClass}>{label}</span>
    </div>
  );
}
