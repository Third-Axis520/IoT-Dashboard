import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Calendar, X } from 'lucide-react';
import type { AlertRecord } from '../../types';
import { cn } from '../../utils/cn';

interface Props {
  alerts: AlertRecord[];
}

/**
 * Toolbar bell button + dropdown panel for browsing the full alert
 * history. Replaces the bottom-docked Alert History panel from the
 * previous Trend view layout.
 *
 * Why a popover (not a modal): operators glance at alert history mid-task
 * without losing the trend chart context. Click-outside / Escape closes.
 */
export const AlertBell = React.memo(function AlertBell({ alerts }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    let f = [...alerts].reverse();
    if (dateFilter) {
      f = f.filter(a => {
        const d = new Date(a.time);
        const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return s === dateFilter;
      });
    }
    return f;
  }, [alerts, dateFilter]);

  const dangerCount = useMemo(() => alerts.filter(a => a.status === 'danger').length, [alerts]);
  const hasAlerts = alerts.length > 0;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-md transition-colors relative',
          hasAlerts
            ? 'text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10'
            : 'text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10'
        )}
        title={t('app.alertHistory', { defaultValue: 'Alert History' })}
        aria-label={t('app.alertHistory', { defaultValue: 'Alert History' })}
        aria-expanded={open}
        data-testid="alert-bell"
      >
        <Bell className={cn('w-4 h-4', dangerCount > 0 && 'animate-pulse')} />
        {hasAlerts && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent-red)] text-white text-[10px] font-bold flex items-center justify-center leading-none"
            aria-label={`${alerts.length} alerts`}
          >
            {alerts.length > 99 ? '99+' : alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[min(96vw,640px)] max-h-[min(80vh,560px)] bg-[var(--bg-card)] border border-[var(--border-base)] rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Alert history"
        >
          <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--border-base)] shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[var(--accent-red)]" />
              <h2 className="text-sm font-bold text-[var(--text-main)]">
                {t('app.alertHistory', { defaultValue: 'Alert History' })}
              </h2>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                {filtered.length} / {alerts.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-[var(--bg-panel)] border border-[var(--border-input)] rounded px-2 py-0.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="bg-transparent text-xs text-[var(--text-main)] outline-none w-[130px]"
                  aria-label="Filter by date"
                />
              </div>
              {dateFilter && (
                <button
                  onClick={() => setDateFilter('')}
                  className="text-[11px] text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)]"
                >
                  {t('common.cancel')}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded transition-colors"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[var(--border-base)]/70 backdrop-blur-sm sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide">Time</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide">Equipment</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide">Point</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide text-right">Value</th>
                  <th className="px-3 py-2 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide text-right">Limit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map(a => (
                  <tr
                    key={a.id}
                    className="border-b border-[var(--border-base)]/40 hover:bg-[var(--border-base)]/30 transition-colors"
                  >
                    <td className="px-3 py-2 text-[11px] text-[var(--text-main)] whitespace-nowrap font-mono">
                      {new Date(a.time).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[var(--text-main)]">
                      <div>{a.eqName}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">{a.deviceId}</div>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[var(--text-main)]">{a.pointName}</td>
                    <td className="px-3 py-2 text-[11px]">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-bold',
                        a.status === 'danger'
                          ? 'bg-[var(--accent-red)]/20 text-[var(--accent-red)]'
                          : 'bg-[var(--accent-yellow)]/20 text-[var(--accent-yellow)]'
                      )}>
                        {a.type} {a.status === 'danger' ? 'ALARM' : 'WARN'}
                      </span>
                    </td>
                    <td className={cn(
                      'px-3 py-2 text-[11px] font-mono font-bold text-right',
                      a.status === 'danger' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-yellow)]'
                    )}>
                      {a.value.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono text-[var(--text-muted)] text-right">
                      {a.limit.toFixed(1)}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">
                      {hasAlerts ? 'No alerts match this date.' : 'No alerts yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});
