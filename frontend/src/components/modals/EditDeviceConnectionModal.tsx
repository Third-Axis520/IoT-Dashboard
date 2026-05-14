import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle, Lightbulb } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import DynamicForm from './DeviceIntegrationWizard/DynamicForm';
import AlertSettingsSection from './AlertSettingsSection';
import InlineErrorBanner from '../ui/InlineErrorBanner';
import { fetchProtocol, type ProtocolItem } from '../../lib/apiProtocols';
import { POLL_INTERVAL_SECONDS } from '../../constants/pollIntervals';
import {
  updateDeviceConnection,
  testDeviceConnection,
  fetchDeviceConnections,
  type DeviceConnectionItem,
} from '../../lib/apiDeviceConnections';
import {
  countSiblingsOnSameHost,
  getGatewayConcurrencyHints,
} from '../../lib/gatewayConcurrency';
import {
  fetchEquipmentTypeDetail,
  updateEquipmentType,
  type EquipmentTypeDetail,
} from '../../lib/apiEquipmentTypes';
import SensorManagementSection, { type SensorRow } from './SensorManagementSection';

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

  const [alertOnConsecutiveErrors, setAlertOnConsecutiveErrors] = useState(conn.alertOnConsecutiveErrors);
  const [alertCooldownSec, setAlertCooldownSec] = useState(conn.alertCooldownSec);
  const [isAlertEnabled, setIsAlertEnabled] = useState(conn.isAlertEnabled);

  const [sensors, setSensors] = useState<SensorRow[]>([]);
  const [initialSensors, setInitialSensors] = useState<SensorRow[]>([]);
  const [etMeta, setEtMeta] = useState<{ name: string; visType: string; description: string | null } | null>(null);
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [sensorsLoadError, setSensorsLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!conn.equipmentTypeId) return;
    let cancelled = false;
    setSensorsLoading(true);
    setSensorsLoadError(null);
    fetchEquipmentTypeDetail(conn.equipmentTypeId)
      .then((et: EquipmentTypeDetail) => {
        if (cancelled) return;
        const rows: SensorRow[] = et.sensors.map(s => ({
          sensorId: s.sensorId,
          pointId: s.pointId,
          rawAddress: s.rawAddress,
          label: s.label,
          unit: s.unit,
          propertyTypeId: s.propertyTypeId,
          sortOrder: s.sortOrder,
        }));
        setSensors(rows);
        setInitialSensors(rows);
        setEtMeta({ name: et.name, visType: et.visType, description: et.description });
      })
      .catch(e => {
        if (cancelled) return;
        setSensorsLoadError(e instanceof Error ? e.message : t('connectionSettings.sensors.loadFailed'));
      })
      .finally(() => { if (!cancelled) setSensorsLoading(false); });
    return () => { cancelled = true; };
  }, [conn.equipmentTypeId, t]);

  const sensorsChanged = JSON.stringify(sensors) !== JSON.stringify(initialSensors);

  const [sameHostCount, setSameHostCount] = useState(0);
  useEffect(() => {
    const host = config.host?.trim();
    const port = config.port?.trim() || '502';
    if (!host) { setSameHostCount(0); return; }
    let cancelled = false;
    fetchDeviceConnections()
      .then(list => {
        if (cancelled) return;
        setSameHostCount(countSiblingsOnSameHost(list, host, port, conn.id));
      })
      .catch(() => { /* best-effort hint */ });
    return () => { cancelled = true; };
  }, [config.host, config.port, conn.id]);

  const concurrencyHints = getGatewayConcurrencyHints(conn.protocol);
  const shouldSuggestLongerPoll =
    concurrencyHints !== null &&
    sameHostCount >= concurrencyHints.threshold &&
    pollIntervalMs < concurrencyHints.recommendedMs;

  // Detect unsaved edits — Test button hits the backend with the *stored*
  // (not currently edited) config, so we warn the user when there are
  // pending edits that won't be reflected in the test.
  const isDirty =
    name !== conn.name ||
    pollIntervalMs !== (conn.pollIntervalMs ?? 5000) ||
    JSON.stringify(config) !== JSON.stringify(initialConfig) ||
    alertOnConsecutiveErrors !== conn.alertOnConsecutiveErrors ||
    alertCooldownSec !== conn.alertCooldownSec ||
    isAlertEnabled !== conn.isAlertEnabled ||
    sensorsChanged;

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
        alertOnConsecutiveErrors,
        alertCooldownSec,
        isAlertEnabled,
      });
      // If user edited sensor labels, push the full-replace to /api/equipment-types.
      // The two PUTs are sequential (not transactional): partial failure surfaces in
      // saveError so the user can retry.
      if (sensorsChanged && conn.equipmentTypeId && etMeta) {
        await updateEquipmentType(conn.equipmentTypeId, {
          name: etMeta.name,
          visType: etMeta.visType,
          description: etMeta.description,
          sensors: sensors.map((s, i) => ({
            sensorId: s.sensorId,
            pointId: s.pointId,
            label: s.label,
            unit: s.unit,
            propertyTypeId: s.propertyTypeId,
            rawAddress: s.rawAddress,
            sortOrder: s.sortOrder === 0 ? i : s.sortOrder,
          })),
        });
      }
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
              {t('connectionSettings.nameLabel')}
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
                {t('connectionSettings.intervalLabel')}
              </label>
              <select
                id="edit-conn-interval"
                value={pollIntervalMs / 1000}
                onChange={(e) => setPollIntervalMs(Number(e.target.value) * 1000)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
              >
                {POLL_INTERVAL_SECONDS.map((s) => (
                  <option key={s} value={s}>{t('connectionSettings.intervalOption', { seconds: s })}</option>
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

          {/* Actionable poll-interval recommendation — same gating concurrency
              heuristic as the wizard, but excludes the connection being edited. */}
          {shouldSuggestLongerPoll && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 text-xs text-[var(--text-main)]">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-[var(--accent-green)]" />
              <div className="flex-1">
                <p className="mb-2" aria-live="polite">
                  {t('connectionSettings.pollSuggestionBanner', {
                    host: config.host,
                    port: config.port || '502',
                    count: sameHostCount,
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => setPollIntervalMs(concurrencyHints!.recommendedMs)}
                  aria-label={t('connectionSettings.pollSuggestionApply') + ' — ' + t('connectionSettings.intervalLabel')}
                  className="px-3 py-1 rounded border border-[var(--accent-green)] text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 transition-colors"
                >
                  {t('connectionSettings.pollSuggestionApply')}
                </button>
              </div>
            </div>
          )}

          {/* Falls back to textual sameHostHint when the actionable banner
              isn't applicable (count below threshold, or poll already ≥ 10s). */}
          {sameHostCount > 0 && !shouldSuggestLongerPoll && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/30 text-xs text-[var(--accent-yellow)]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {t('connectionSettings.sameHostHint', {
                  host: config.host,
                  port: config.port || '502',
                  count: sameHostCount,
                })}
              </span>
            </div>
          )}

          <AlertSettingsSection
            value={{ isAlertEnabled, alertOnConsecutiveErrors, alertCooldownSec }}
            onChange={next => {
              setIsAlertEnabled(next.isAlertEnabled);
              setAlertOnConsecutiveErrors(next.alertOnConsecutiveErrors);
              setAlertCooldownSec(next.alertCooldownSec);
            }}
          />

          {conn.equipmentTypeId !== null && (
            <SensorManagementSection
              sensors={sensors}
              onChange={setSensors}
              onAdd={drafts => {
                const maxId = sensors.reduce((m, s) => Math.max(m, s.sensorId), 0);
                // Pick a base above all current ids; fall back to a 7-digit random
                // floor so the first-ever sensor on a fresh ET still gets a sane id.
                const sensorIdBase = Math.max(
                  maxId + 1,
                  Math.floor(Math.random() * 8_900_000) + 1_000_000,
                );
                const maxSort = sensors.reduce((m, s) => Math.max(m, s.sortOrder), 0);
                const newRows: SensorRow[] = drafts.map((d, i) => ({
                  sensorId: sensorIdBase + i,
                  pointId: `pt_${d.rawAddress}`,
                  rawAddress: d.rawAddress,
                  label: d.label,
                  unit: d.unit,
                  propertyTypeId: d.propertyTypeId,
                  sortOrder: maxSort + i + 1,
                }));
                setSensors([...sensors, ...newRows]);
              }}
              protocol={conn.protocol}
              configJson={JSON.stringify(config)}
              loading={sensorsLoading}
              loadError={sensorsLoadError}
            />
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
            {saveSuccess ? (
              <span className="text-xs text-[var(--accent-green)]">
                {t('common.saved')}
              </span>
            ) : isDirty && !saving ? (
              <span className="text-xs text-[var(--accent-yellow)]" aria-label={t('common.unsavedChanges')}>
                <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-yellow)] mr-1.5 align-middle" />
                {t('common.unsavedChanges')}
              </span>
            ) : null}
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
