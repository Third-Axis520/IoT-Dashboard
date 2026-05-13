import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { useWizard } from '../WizardContext';
import DynamicForm from '../DynamicForm';
import { fetchProtocol, type ProtocolItem } from '../../../../lib/apiProtocols';
import { POLL_INTERVAL_SECONDS } from '../../../../constants/pollIntervals';
import { fetchDeviceConnections } from '../../../../lib/apiDeviceConnections';

export default function Step2Config() {
  const { state, dispatch } = useWizard();
  const { t } = useTranslation();
  const [protocol, setProtocol] = useState<ProtocolItem | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sameHostCount, setSameHostCount] = useState(0);
  const configRef = useRef(state.config);
  configRef.current = state.config;

  useEffect(() => {
    if (state.protocol) {
      fetchProtocol(state.protocol).then(setProtocol);
    }
  }, [state.protocol]);

  // Detect existing connections to same host:port
  useEffect(() => {
    const host = state.config.host?.trim();
    const port = state.config.port?.trim() || '502';
    if (!host) { setSameHostCount(0); return; }

    let cancelled = false;
    fetchDeviceConnections()
      .then(list => {
        if (cancelled) return;
        const count = list.filter(c => {
          try {
            const cfg = JSON.parse(c.configJson) as { host?: string; port?: string | number };
            return cfg.host === host && String(cfg.port ?? '502') === port;
          } catch { return false; }
        }).length;
        setSameHostCount(count);
      })
      .catch(() => { /* ignore — hint is best-effort */ });
    return () => { cancelled = true; };
  }, [state.config.host, state.config.port]);

  // Initialize default values from schema — runs once when protocol loads
  useEffect(() => {
    if (!protocol) return;
    const current = configRef.current;
    const defaults: Record<string, string> = {};
    for (const f of protocol.configSchema.fields) {
      if (f.defaultValue && !current[f.name]) {
        defaults[f.name] = f.defaultValue;
      }
    }
    if (Object.keys(defaults).length > 0) {
      dispatch({ type: 'SET_CONFIG', config: { ...defaults, ...current } });
    }
  }, [protocol, dispatch]);

  const canProceed = state.connectionName.trim().length > 0;

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">{t('wizard.config.title')}</h3>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t('wizard.config.desc', { protocol: protocol?.displayName ?? state.protocol })}
      </p>

      {/* Connection name */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-[var(--text-main)] mb-1">
          {t('wizard.config.nameLabel')} <span className="text-[var(--accent-red)]">*</span>
        </label>
        <input
          type="text"
          value={state.connectionName}
          onChange={(e) => dispatch({ type: 'SET_CONNECTION_NAME', name: e.target.value })}
          placeholder={t('wizard.config.namePlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
        />
        {!canProceed && state.connectionName !== undefined && (
          <p className="text-xs text-[var(--accent-yellow)] mt-1">{t('wizard.config.nameHint')}</p>
        )}
      </div>

      {/* Poll interval — only for polling protocols */}
      {state.protocol !== 'push_ingest' && (
        <div className="mb-5">
          <label className="block text-sm font-medium text-[var(--text-main)] mb-1">
            {t('wizard.config.intervalLabel')}
          </label>
          <select
            value={state.pollIntervalMs / 1000}
            onChange={(e) =>
              dispatch({ type: 'SET_POLL_INTERVAL', ms: Number(e.target.value) * 1000 })
            }
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
          >
            {POLL_INTERVAL_SECONDS.map((s) => (
              <option key={s} value={s}>
                {t('wizard.config.intervalOption', { seconds: s })}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--text-muted)] mt-1">{t('wizard.config.intervalHint')}</p>
        </div>
      )}

      {/* Protocol-specific config */}
      {protocol && (
        <DynamicForm
          schema={protocol.configSchema.fields}
          values={state.config}
          onChange={(field, value) => dispatch({ type: 'UPDATE_CONFIG', field, value })}
        />
      )}

      {/* Same-host hint */}
      {sameHostCount > 0 && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/30 text-xs text-[var(--accent-yellow)]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {t('wizard.config.sameHostHint', {
              host: state.config.host,
              port: state.config.port || '502',
              count: sameHostCount,
            })}
          </span>
        </div>
      )}

      {/* Advanced collapsible */}
      <div className="mt-4 border-t border-[var(--border-base)] pt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen(o => !o)}
          className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {t('wizard.config.advancedTitle')}
          <span className="text-xs text-[var(--text-muted)] ml-2">— {t('wizard.config.advancedHint')}</span>
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-3 pl-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.isAlertEnabled}
                onChange={e => dispatch({
                  type: 'SET_ALERT_SETTINGS',
                  alertOnConsecutiveErrors: state.alertOnConsecutiveErrors,
                  alertCooldownSec: state.alertCooldownSec,
                  isAlertEnabled: e.target.checked,
                })}
              />
              <span className="text-[var(--text-main)]">{t('wizard.config.isAlertEnabled')}</span>
            </label>

            <div>
              <label className="block text-sm text-[var(--text-main)] mb-1">
                {t('wizard.config.alertOnConsecutiveErrors')}
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={state.alertOnConsecutiveErrors}
                onChange={e => dispatch({
                  type: 'SET_ALERT_SETTINGS',
                  alertOnConsecutiveErrors: Math.max(1, parseInt(e.target.value, 10) || 5),
                  alertCooldownSec: state.alertCooldownSec,
                  isAlertEnabled: state.isAlertEnabled,
                })}
                disabled={!state.isAlertEnabled}
                className="w-24 px-2 py-1 rounded border border-[var(--border-base)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm disabled:opacity-50"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('wizard.config.alertOnConsecutiveErrorsHelp')}</p>
            </div>

            <div>
              <label className="block text-sm text-[var(--text-main)] mb-1">
                {t('wizard.config.alertCooldownSec')}
              </label>
              <input
                type="number"
                min={0}
                max={86400}
                value={state.alertCooldownSec}
                onChange={e => dispatch({
                  type: 'SET_ALERT_SETTINGS',
                  alertOnConsecutiveErrors: state.alertOnConsecutiveErrors,
                  alertCooldownSec: Math.max(0, parseInt(e.target.value, 10) || 300),
                  isAlertEnabled: state.isAlertEnabled,
                })}
                disabled={!state.isAlertEnabled}
                className="w-24 px-2 py-1 rounded border border-[var(--border-base)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm disabled:opacity-50"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('wizard.config.alertCooldownSecHelp')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          className="px-4 py-2 rounded-lg border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
        >
          {t('common.previous')}
        </button>
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          disabled={!canProceed}
          className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent-green-hover)] transition-colors"
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}
