import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { usePollingDiagnostics } from '../../hooks/usePollingDiagnostics';

export default function ConnectionHealthBadge() {
  const { t } = useTranslation();
  const { data } = usePollingDiagnostics();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!data) return null;

  const total = data.connections.length;
  const bad = data.connections.filter(c => c.status === 'error').length;
  const pollingDead = !data.polling.isRunning;

  let icon = <CheckCircle2 size={14} className="text-[var(--accent-green)]" />;
  let label = t('connectionHealth.badgeAllHealthy');
  let tone = 'border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10 text-[var(--accent-green)]';

  if (pollingDead) {
    icon = <AlertCircle size={14} className="text-[var(--accent-red)]" />;
    label = t('connectionHealth.pollingStopped');
    tone = 'border-[var(--accent-red)]/50 bg-[var(--accent-red)]/15 text-[var(--accent-red)]';
  } else if (total === 0) {
    icon = <Activity size={14} className="text-[var(--text-muted)]" />;
    label = t('connectionHealth.noConnections');
    tone = 'border-[var(--border-base)] bg-[var(--bg-panel)] text-[var(--text-muted)]';
  } else if (bad > 0) {
    icon = <AlertCircle size={14} className="text-[var(--accent-yellow)]" />;
    label = t('connectionHealth.badgeSomeUnhealthy', { bad, total });
    tone = 'border-[var(--accent-yellow)]/40 bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)]';
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition ${tone}`}
        aria-label={t('connectionHealth.popoverTitle')}
      >
        {icon}
        {label}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] shadow-lg z-50"
          role="dialog"
          aria-label={t('connectionHealth.popoverTitle')}
        >
          <div className="px-3 py-2 border-b border-[var(--border-base)] text-sm font-medium text-[var(--text-main)]">
            {t('connectionHealth.popoverTitle')}
          </div>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border-base)]">
            {pollingDead ? t('connectionHealth.pollingStopped') : t('connectionHealth.pollingHealthy')}
            {data.polling.lastTickAt && (
              <> · {t('connectionHealth.lastTickAt')}: {new Date(data.polling.lastTickAt).toLocaleTimeString()}</>
            )}
          </div>
          {data.connections.length === 0 ? (
            <div className="px-3 py-4 text-xs text-[var(--text-muted)]">
              {t('connectionHealth.noConnections')}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-base)]">
              {data.connections.map(c => (
                <li key={c.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-[var(--text-main)] truncate">{c.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                      c.status === 'error'
                        ? 'bg-[var(--accent-red)]/15 text-[var(--accent-red)]'
                        : c.status === 'disabled'
                        ? 'bg-[var(--bg-panel)] text-[var(--text-muted)]'
                        : 'bg-[var(--accent-green)]/15 text-[var(--accent-green)]'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  {c.consecutiveErrors > 0 && (
                    <div className="text-xs text-[var(--accent-red)] mt-0.5">
                      {t('connectionHealth.consecutiveErrors', { count: c.consecutiveErrors })}
                    </div>
                  )}
                  {c.lastErrorMessage && (
                    <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate" title={c.lastErrorMessage}>
                      {c.lastErrorMessage}
                    </div>
                  )}
                  {c.lastPollAt && (
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {t('connectionHealth.lastPollAt')}: {new Date(c.lastPollAt).toLocaleTimeString()}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
