import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { X } from 'lucide-react';
import {
  fetchPollingDiagnostics,
  fetchDeviceConnections,
  updateDeviceConnection,
  deleteDeviceConnection,
  testDeviceConnection,
  type PollingDiagnostics,
  type DeviceConnectionItem,
} from '../../lib/apiDeviceConnections';
import ConfirmModal from '../ui/ConfirmModal';

interface DeviceConnectionsModalProps {
  onClose: () => void;
}

export default function DeviceConnectionsModal({ onClose }: DeviceConnectionsModalProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);

  const statusBadge: Record<string, { color: string; label: string }> = {
    healthy: { color: 'bg-[var(--accent-green)]', label: t('deviceConnections.statusOk') },
    error: { color: 'bg-[var(--accent-red)]', label: t('deviceConnections.statusError') },
    disabled: { color: 'bg-[var(--text-muted)]/50', label: t('deviceConnections.statusDisabled') },
  };

  const [diag, setDiag] = useState<PollingDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; msg: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [fullConns, setFullConns] = useState<DeviceConnectionItem[]>([]);
  const [editingInterval, setEditingInterval] = useState<{ id: number; value: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [diagData, fullData] = await Promise.all([
        fetchPollingDiagnostics(),
        fetchDeviceConnections(),
      ]);
      setDiag(diagData);
      setFullConns(fullData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(id: number, currentEnabled: boolean) {
    const full = fullConns.find((c) => c.id === id);
    if (!full) return;
    await updateDeviceConnection(id, {
      name: full.name,
      config: full.configJson,
      pollIntervalMs: full.pollIntervalMs,
      isEnabled: !currentEnabled,
    });
    await load();
  }

  async function handleTest(id: number) {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await testDeviceConnection(id) as { success: boolean; error?: string };
      setTestResult({
        id,
        ok: result.success,
        msg: result.success ? t('deviceConnections.connectSuccess') : (result.error ?? t('deviceConnections.connectFailed')),
      });
    } catch (err) {
      setTestResult({ id, ok: false, msg: err instanceof Error ? err.message : t('deviceConnections.connectFailed') });
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteDeviceConnection(deleteTarget.id, true);
    setDeleteTarget(null);
    await load();
  }

  async function handleIntervalBlur(id: number) {
    if (!editingInterval || editingInterval.id !== id) return;
    const full = fullConns.find((c) => c.id === id);
    if (!full) { setEditingInterval(null); return; }
    const ms = Math.max(500, Math.round(Number(editingInterval.value)) * 1000);
    await updateDeviceConnection(id, {
      name: full.name,
      config: full.configJson,
      pollIntervalMs: ms,
      isEnabled: full.isEnabled,
    });
    setEditingInterval(null);
    await load();
  }

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dc-modal-title"
    >
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-base)] shrink-0">
          <div>
            <h2 id="dc-modal-title" className="text-lg font-semibold text-[var(--text-main)]">{t('deviceConnections.title')}</h2>
            {diag && (
              <span className="text-xs text-[var(--text-muted)]">
                {t('deviceConnections.statusInfo', {
                  status: diag.polling.isRunning ? '運行中' : '停止',
                  count: diag.polling.activeConnections,
                })}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-[var(--text-muted)]">{t('common.loading')}</div>
          ) : !diag || diag.connections.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)]">{t('deviceConnections.noConnections')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-base)] text-left text-[var(--text-muted)]">
                  <th className="py-2 px-2 font-medium">{t('deviceConnections.colName')}</th>
                  <th className="py-2 px-2 font-medium">{t('deviceConnections.colProtocol')}</th>
                  <th className="py-2 px-2 font-medium">{t('deviceConnections.colStatus')}</th>
                  <th className="py-2 px-2 font-medium">{t('deviceConnections.colError')}</th>
                  <th className="py-2 px-2 font-medium">{t('deviceConnections.colInterval')}</th>
                  <th className="py-2 px-2 font-medium text-right">{t('deviceConnections.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {diag.connections.map((conn) => {
                  const badge = statusBadge[conn.status] ?? statusBadge.disabled;
                  const isEnabled = conn.status !== 'disabled';

                  return (
                    <tr key={conn.id} className="border-b border-[var(--border-base)]/50">
                      <td className="py-2 px-2 font-medium text-[var(--text-main)]">{conn.name}</td>
                      <td className="py-2 px-2 text-[var(--text-muted)]">{conn.protocol}</td>
                      <td className="py-2 px-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-main)]">
                          <span className={`w-2 h-2 rounded-full ${badge.color}`} />
                          {badge.label}
                          {conn.consecutiveErrors > 0 && (
                            <span className="text-[var(--accent-red)]">({conn.consecutiveErrors})</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-[var(--text-muted)] max-w-[200px] truncate">
                        {conn.lastErrorMessage ?? '-'}
                      </td>
                      <td className="py-2 px-2">
                        {(() => {
                          const full = fullConns.find((c) => c.id === conn.id);
                          if (!full || full.pollIntervalMs === null)
                            return <span className="text-xs text-[var(--text-muted)]">-</span>;
                          const isEditing = editingInterval?.id === conn.id;
                          if (isEditing) {
                            return (
                              <input
                                type="number"
                                min={1}
                                max={3600}
                                autoFocus
                                value={editingInterval.value}
                                onChange={(e) => setEditingInterval({ id: conn.id, value: e.target.value })}
                                onBlur={() => handleIntervalBlur(conn.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                  if (e.key === 'Escape') setEditingInterval(null);
                                }}
                                className="w-14 px-1 py-0.5 text-xs rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] outline-none focus:border-[var(--accent-blue)]"
                              />
                            );
                          }
                          return (
                            <button
                              onClick={() =>
                                setEditingInterval({ id: conn.id, value: String(full.pollIntervalMs! / 1000) })
                              }
                              title={t('deviceConnections.intervalHint')}
                              className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-panel)] text-[var(--text-muted)] hover:bg-[var(--accent-blue)]/10 hover:text-[var(--accent-blue)] transition-colors cursor-pointer"
                            >
                              {full.pollIntervalMs / 1000}s
                            </button>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleToggle(conn.id, isEnabled)}
                            className="px-2 py-1 text-xs rounded border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
                          >
                            {isEnabled ? t('common.disable') : t('common.enable')}
                          </button>
                          <button
                            onClick={() => handleTest(conn.id)}
                            disabled={testingId === conn.id}
                            className="px-2 py-1 text-xs rounded border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] disabled:opacity-50 transition-colors"
                          >
                            {testingId === conn.id ? t('deviceConnections.testing') : t('common.test')}
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ id: conn.id, name: conn.name })}
                            className="px-2 py-1 text-xs rounded border border-[var(--accent-red)]/30 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                        {testResult?.id === conn.id && (
                          <div className={`text-xs mt-1 ${testResult.ok ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                            {testResult.msg}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmModal
          title={t('deviceConnections.deleteTitle')}
          message={t('deviceConnections.deleteConfirm', { name: deleteTarget.name })}
          confirmText={t('common.delete')}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
