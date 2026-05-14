import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Lightbulb } from 'lucide-react';
import { useWizard } from '../WizardContext';
import DynamicForm from '../DynamicForm';
import AlertSettingsSection from '../../AlertSettingsSection';
import { fetchProtocol, type ProtocolItem } from '../../../../lib/apiProtocols';
import { POLL_INTERVAL_SECONDS } from '../../../../constants/pollIntervals';
import { fetchDeviceConnections } from '../../../../lib/apiDeviceConnections';
import {
  countSiblingsOnSameHost,
  getGatewayConcurrencyHints,
} from '../../../../lib/gatewayConcurrency';

export default function Step2Config() {
  const { state, dispatch } = useWizard();
  const { t } = useTranslation();
  const [protocol, setProtocol] = useState<ProtocolItem | null>(null);
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
        setSameHostCount(countSiblingsOnSameHost(list, host, port));
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
  const concurrencyHints = getGatewayConcurrencyHints(state.protocol);
  const shouldSuggestLongerPoll =
    concurrencyHints !== null &&
    sameHostCount >= concurrencyHints.threshold &&
    state.pollIntervalMs < concurrencyHints.recommendedMs;

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">{t('wizard.config.title')}</h3>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t('wizard.config.desc', { protocol: protocol?.displayName ?? state.protocol })}
      </p>

      {/* Connection name */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-[var(--text-main)] mb-1">
          {t('connectionSettings.nameLabel')} <span className="text-[var(--accent-red)]">*</span>
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
            {t('connectionSettings.intervalLabel')}
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
                {t('connectionSettings.intervalOption', { seconds: s })}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--text-muted)] mt-1">{t('connectionSettings.intervalHint')}</p>
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

      {/* Actionable poll-interval recommendation — supersedes textual sameHostHint
          when concurrency is high enough to actually risk gateway issues. */}
      {shouldSuggestLongerPoll && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 text-xs text-[var(--text-main)]">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-[var(--accent-green)]" />
          <div className="flex-1">
            <p className="mb-2" aria-live="polite">
              {t('connectionSettings.pollSuggestionBanner', {
                host: state.config.host,
                port: state.config.port || '502',
                count: sameHostCount,
              })}
            </p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_POLL_INTERVAL', ms: concurrencyHints!.recommendedMs })}
              aria-label={t('connectionSettings.pollSuggestionApply') + ' — ' + t('connectionSettings.intervalLabel')}
              className="px-3 py-1 rounded border border-[var(--accent-green)] text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 transition-colors"
            >
              {t('connectionSettings.pollSuggestionApply')}
            </button>
          </div>
        </div>
      )}

      {/* Same-host hint — only shown when the actionable banner isn't (lower count
          OR user already chose ≥ 10s). Keeps the FYI without duplicate noise. */}
      {sameHostCount > 0 && !shouldSuggestLongerPoll && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md bg-[var(--accent-yellow)]/10 border border-[var(--accent-yellow)]/30 text-xs text-[var(--accent-yellow)]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {t('connectionSettings.sameHostHint', {
              host: state.config.host,
              port: state.config.port || '502',
              count: sameHostCount,
            })}
          </span>
        </div>
      )}

      <AlertSettingsSection
        value={{
          isAlertEnabled: state.isAlertEnabled,
          alertOnConsecutiveErrors: state.alertOnConsecutiveErrors,
          alertCooldownSec: state.alertCooldownSec,
        }}
        onChange={next => dispatch({
          type: 'SET_ALERT_SETTINGS',
          alertOnConsecutiveErrors: next.alertOnConsecutiveErrors,
          alertCooldownSec: next.alertCooldownSec,
          isAlertEnabled: next.isAlertEnabled,
        })}
      />

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
