import React, { useState, useMemo } from 'react';
import { AlertTriangle, Bell, Calendar, ChevronDown } from 'lucide-react';
import type { AlertRecord } from '../../types';
import { cn } from '../../utils/cn';

interface AlertPanelProps {
  alerts: AlertRecord[];
  height: number;
  onToggleExpand: () => void;
}

export const AlertPanel = React.memo(function AlertPanel({ alerts, height, onToggleExpand }: AlertPanelProps) {
  const [dateFilter, setDateFilter] = useState('');

  const recentAlerts = alerts.slice(-10).reverse();

  const filteredAlerts = useMemo(() => {
    let filtered = [...alerts].reverse();
    if (dateFilter) {
      filtered = filtered.filter(a => {
        const d = new Date(a.time);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return dateStr === dateFilter;
      });
    }
    return filtered;
  }, [alerts, dateFilter]);

  if (height <= 80) {
    return (
      <div
        className="h-full w-full bg-[var(--bg-card)] flex items-center px-4 cursor-pointer hover:bg-[var(--border-base)] transition-colors overflow-hidden group"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3 text-[var(--accent-red)] font-bold shrink-0">
          <Bell className="w-5 h-5 animate-pulse" />
          <span className="hidden md:inline">REAL-TIME ALERTS</span>
        </div>
        <div className="w-px h-6 bg-[var(--border-base)] mx-4 shrink-0" />
        <div className="flex-1 overflow-hidden relative h-full flex items-center">
          {recentAlerts.length > 0 ? (
            <div className="flex gap-8 animate-marquee whitespace-nowrap items-center">
              {recentAlerts.map((a, i) => (
                <div key={`${a.id}-${i}`} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)] font-mono">{new Date(a.time).toLocaleTimeString()}</span>
                  <span className="text-sm font-bold text-[var(--text-main)]">
                    {a.eqName} <span className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--border-base)] px-1 rounded">{a.deviceId}</span> - {a.pointName}
                  </span>
                  <span className={cn("text-sm font-bold", a.status === 'danger' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-yellow)]')}>
                    {a.type} Violation: {a.value.toFixed(1)}
                  </span>
                </div>
              ))}
              {recentAlerts.map((a, i) => (
                <div key={`dup-${a.id}-${i}`} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)] font-mono">{new Date(a.time).toLocaleTimeString()}</span>
                  <span className="text-sm font-bold text-[var(--text-main)]">
                    {a.eqName} <span className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--border-base)] px-1 rounded">{a.deviceId}</span> - {a.pointName}
                  </span>
                  <span className={cn("text-sm font-bold", a.status === 'danger' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-yellow)]')}>
                    {a.type} Violation: {a.value.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">No recent alerts</span>
          )}
        </div>
        <div className="shrink-0 ml-4 text-xs text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors flex items-center gap-1">
          Drag up or click to expand <ChevronDown className="w-3 h-3 -rotate-180" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full glass-panel border-l-0">
      <div className="flex justify-between items-center p-3 border-b border-[var(--border-base)] shrink-0">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--accent-red)] text-glow" />
          <h2 className="text-lg font-bold text-[var(--text-main)]">Alert History</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[var(--bg-panel)] border border-[var(--border-input)] rounded-lg px-2 py-1">
            <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-main)] outline-none"
            />
          </div>
          {dateFilter && (
            <button onClick={() => setDateFilter('')} className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)]">
              Clear
            </button>
          )}
          <div className="text-xs text-[var(--text-muted)]">
            Total: <span className="text-[var(--text-main)] font-bold">{filteredAlerts.length}</span>
          </div>
          <button onClick={onToggleExpand} className="p-1.5 bg-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg transition-colors" aria-label="Toggle alert panel">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-0 min-h-0">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[var(--border-base)] sticky top-0 z-10">
            <tr>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Time</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Equipment</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Point</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Type</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Value</th>
              <th className="p-3 text-xs font-medium text-[var(--text-muted)]">Limit</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlerts.length > 0 ? filteredAlerts.map(alert => (
              <tr key={alert.id} className="border-b border-[var(--border-base)] hover:bg-[var(--border-base)]/50 transition-colors">
                <td className="p-3 text-xs text-[var(--text-main)] whitespace-nowrap">{new Date(alert.time).toLocaleString()}</td>
                <td className="p-3 text-xs text-[var(--text-main)]">
                  <div>{alert.eqName}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">{alert.deviceId}</div>
                </td>
                <td className="p-3 text-xs text-[var(--text-main)]">{alert.pointName}</td>
                <td className="p-3 text-xs">
                  <span className={cn(
                    "px-2 py-1 rounded text-[10px] font-bold",
                    alert.status === 'danger' ? "bg-[var(--accent-red)]/20 text-[var(--accent-red)]" : "bg-[var(--accent-yellow)]/20 text-[var(--accent-yellow)]"
                  )}>
                    {alert.type} {alert.status === 'danger' ? 'ALARM' : 'WARN'}
                  </span>
                </td>
                <td className={cn("p-3 text-xs font-mono font-bold", alert.status === 'danger' ? "text-[var(--accent-red)]" : "text-[var(--accent-yellow)]")}>
                  {alert.value.toFixed(1)}
                </td>
                <td className="p-3 text-xs font-mono text-[var(--text-muted)]">{alert.limit.toFixed(1)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="p-6 text-center text-xs text-[var(--text-muted)]">
                  No alerts found for the selected criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
