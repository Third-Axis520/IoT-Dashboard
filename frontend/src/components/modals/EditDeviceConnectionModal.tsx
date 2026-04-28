import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import DynamicForm from './DeviceIntegrationWizard/DynamicForm';
import InlineErrorBanner from '../ui/InlineErrorBanner';
import { fetchProtocol, type ProtocolItem } from '../../lib/apiProtocols';
import { POLL_INTERVAL_SECONDS } from '../../constants/pollIntervals';
import {
  updateDeviceConnection,
  testDeviceConnection,
  type DeviceConnectionItem,
} from '../../lib/apiDeviceConnections';

interface Props {
  conn: DeviceConnectionItem;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditDeviceConnectionModal({ conn, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);

  const [protocol, setProtocol] = useState<ProtocolItem | null>(null);
  const [protocolError, setProtocolError] = useState<string | null>(null);
  const [name, setName] = useState(conn.name);
  const [pollIntervalMs, setPollIntervalMs] = useState(conn.pollIntervalMs ?? 5000);
  const initialConfig = useMemo<Record<string, string>>(() => {
    try { return JSON.parse(conn.configJson) as Record<string, string>; }
    catch { return {}; }
  }, [conn.configJson]);
  const [config, setConfig] = useState<Record<string, string>>(initialConfig);

  // Detect unsaved edits — Test button hits the backend with the *stored*
  // (not currently edited) config, so we warn the user when there are
  // pending edits that won't be reflected in the test.
  const isDirty =
    name !== conn.name ||
    pollIntervalMs !== (conn.pollIntervalMs ?? 5000) ||
    JSON.stringify(config) !== JSON.stringify(initialConfig);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadProtocol = useCallback(() => {
    setProtocolError(null);
    fetchProtocol(conn.protocol)
      .then(setProtocol)
      .catch(e => setProtocolError(e instanceof Error ? e.message : 'Network error'));
  }, [conn.protocol]);

  useEffect(() => { loadProtocol(); }, [loadProtocol]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateDeviceConnection(conn.id, {
        name: name.trim(),
        config: JSON.stringify(config),
        pollIntervalMs: conn.protocol === 'push_ingest' ? null : pollIntervalMs,
        isEnabled: conn.isEnabled,
      });
      setSaveSuccess(true);
      // Hold the green confirmation visible for ~1s before parent unmounts us
      setTimeout(() => onSaved(), 1000);
    } catch (e) {
      // Surface real backend message (e.g. 400 invalid_config) instead of generic
      setSaveError(e instanceof Error ? e.message : t('deviceConnections.connectFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const result = await testDeviceConnection(conn.id) as { success: boolean; error?: string };
      setTestMsg({
        ok: result.success,
        text: result.success ? t('deviceConnections.connectSuccess') : (result.error ?? t('deviceConnections.connectFailed')),
      });
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof Error ? err.message : t('deviceConnections.connectFailed') });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-conn-title"
    >
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-base)] shrink-0">
          <div>
            <h2 id="edit-conn-title" className="text-base font-semibold text-[var(--text-main)]">
              {t('deviceConnections.editTitle')}
            </h2>
            <span className="text-xs text-[var(--text-muted)]">{conn.protocol}</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5" aria-busy={saving || (!protocol && !protocolError)}>
          {/* Name */}
          <div>
            <label htmlFor="edit-conn-name" className="block text-sm font-medium text-[var(--text-main)] mb-1">
              {t('wizard.config.nameLabel')}
            </label>
            <input
              id="edit-conn-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
            />
          </div>

          {/* Poll interval */}
          {conn.protocol !== 'push_ingest' && (
            <div>
              <label htmlFor="edit-conn-interval" className="block text-sm font-medium text-[var(--text-main)] mb-1">
                {t('wizard.config.intervalLabel')}
              </label>
              <select
                id="edit-conn-interval"
                value={pollIntervalMs / 1000}
                onChange={(e) => setPollIntervalMs(Number(e.target.value) * 1000)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
              >
                {POLL_INTERVAL_SECONDS.map((s) => (
                  <option key={s} value={s}>{t('wizard.config.intervalOption', { seconds: s })}</option>
                ))}
              </select>
            </div>
          )}

          {/* Protocol-specific config */}
          {protocolError ? (
            <InlineErrorBanner
              message={t('common.loadFailed')}
              hint={`${protocolError} — ${t('common.loadFailedHint')}`}
              onRetry={loadProtocol}
            />
          ) : protocol ? (
            <DynamicForm
              schema={protocol.configSchema.fields}
              values={config}
              onChange={(field, value) => setConfig((prev) => ({ ...prev, [field]: value }))}
            />
          ) : (
            <div className="text-sm text-[var(--text-muted)]" role="status" aria-live="polite">{t('common.loading')}</div>
          )}

          {/* Save error banner — backend validation / network */}
          {saveError && (
            <InlineErrorBanner message={saveError} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-base)] shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <button
              onClick={handleTest}
              disabled={testing}
              title={isDirty ? t('deviceConnections.testDirtyHint') : t('deviceConnections.testHint')}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] disabled:opacity-50 transition-colors"
            >
              {testing ? t('deviceConnections.testing') : t('common.test')}
            </button>
            {isDirty && !testMsg && (
              <span className="text-xs text-[var(--accent-yellow)]" aria-live="polite">
                {t('deviceConnections.testDirtyWarning')}
              </span>
            )}
            {testMsg && (
              <span className={`text-xs ${testMsg.ok ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                {testMsg.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            {saveSuccess && (
              <span className="text-xs text-[var(--accent-green)]">
                {t('common.saved')}
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] font-medium disabled:opacity-40 hover:bg-[var(--accent-green-hover)] transition-colors"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
