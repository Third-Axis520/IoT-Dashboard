import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

  const statusBadge: Record<string, { color: string; label: string }> = {
    healthy: { color: 'bg-green-500', label: t('deviceConnections.statusOk') },
    error: { color: 'bg-red-500', label: t('deviceConnections.statusError') },
    disabled: { color: 'bg-gray-400', label: t('deviceConnections.statusDisabled') },
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
    <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold">{t('deviceConnections.title')}</h2>
            {diag && (
              <span className="text-xs text-gray-400">
                {t('deviceConnections.statusInfo', {
                  status: diag.polling.isRunning ? '運行中' : '停止',
                  count: diag.polling.activeConnections,
                })}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-400">{t('common.loading')}</div>
          ) : !diag || diag.connections.length === 0 ? (
            <div className="text-center py-8 text-gray-400">{t('deviceConnections.noConnections')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="py-2 px-2">{t('deviceConnections.colName')}</th>
                  <th className="py-2 px-2">{t('deviceConnections.colProtocol')}</th>
                  <th className="py-2 px-2">{t('deviceConnections.colStatus')}</th>
                  <th className="py-2 px-2">{t('deviceConnections.colError')}</th>
                  <th className="py-2 px-2">{t('deviceConnections.colInterval')}</th>
                  <th className="py-2 px-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {diag.connections.map((conn) => {
                  const badge = statusBadge[conn.status] ?? statusBadge.disabled;
                  const isEnabled = conn.status !== 'disabled';

                  return (
                    <tr key={conn.id} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="py-2 px-2 font-medium">{conn.name}</td>
                      <td className="py-2 px-2 text-gray-500">{conn.protocol}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs`}>
                          <span className={`w-2 h-2 rounded-full ${badge.color}`} />
                          {badge.label}
                          {conn.consecutiveErrors > 0 && (
                            <span className="text-red-400">({conn.consecutiveErrors})</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-400 max-w-[200px] truncate">
                        {conn.lastErrorMessage ?? '-'}
                      </td>
                      <td className="py-2 px-2">
                        {(() => {
                          const full = fullConns.find((c) => c.id === conn.id);
                          if (!full || full.pollIntervalMs === null)
                            return <span className="text-xs text-gray-400">-</span>;
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
                                className="w-14 px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none"
                              />
                            );
                          }
                          return (
                            <button
                              onClick={() =>
                                setEditingInterval({ id: conn.id, value: String(full.pollIntervalMs! / 1000) })
                              }
                              title={t('deviceConnections.intervalHint')}
                              className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 transition-colors cursor-pointer"
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
                            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            {isEnabled ? t('common.disable') : t('common.enable')}
                          </button>
                          <button
                            onClick={() => handleTest(conn.id)}
                            disabled={testingId === conn.id}
                            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                          >
                            {testingId === conn.id ? t('deviceConnections.testing') : t('common.test')}
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ id: conn.id, name: conn.name })}
                            className="px-2 py-1 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                        {testResult?.id === conn.id && (
                          <div className={`text-xs mt-1 ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
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
