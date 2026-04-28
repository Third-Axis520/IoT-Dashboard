import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizard } from '../WizardContext';
import DynamicForm from '../DynamicForm';
import { fetchProtocol, type ProtocolItem } from '../../../../lib/apiProtocols';
import { POLL_INTERVAL_SECONDS } from '../../../../constants/pollIntervals';

export default function Step2Config() {
  const { state, dispatch } = useWizard();
  const { t } = useTranslation();
  const [protocol, setProtocol] = useState<ProtocolItem | null>(null);
  const configRef = useRef(state.config);
  configRef.current = state.config;

  useEffect(() => {
    if (state.protocol) {
      fetchProtocol(state.protocol).then(setProtocol);
    }
  }, [state.protocol]);

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
