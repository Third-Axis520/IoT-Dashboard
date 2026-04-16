import { useEffect, useState } from 'react';
import { useWizard } from '../WizardContext';
import DynamicForm from '../DynamicForm';
import { fetchProtocol, type ProtocolItem } from '../../../../lib/apiProtocols';

export default function Step2Config() {
  const { state, dispatch } = useWizard();
  const [protocol, setProtocol] = useState<ProtocolItem | null>(null);

  useEffect(() => {
    if (state.protocol) {
      fetchProtocol(state.protocol).then(setProtocol);
    }
  }, [state.protocol]);

  // Initialize default values from schema
  useEffect(() => {
    if (!protocol) return;
    const defaults: Record<string, string> = {};
    for (const f of protocol.configSchema.fields) {
      if (f.defaultValue && !state.config[f.name]) {
        defaults[f.name] = f.defaultValue;
      }
    }
    if (Object.keys(defaults).length > 0) {
      dispatch({ type: 'SET_CONFIG', config: { ...defaults, ...state.config } });
    }
  }, [protocol, dispatch, state.config]);

  const canProceed = state.connectionName.trim().length > 0;

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">連線設定</h3>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        輸入 {protocol?.displayName ?? state.protocol} 的連線參數
      </p>

      {/* Connection name */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-[var(--text-main)] mb-1">
          連線名稱 <span className="text-[var(--accent-red)]">*</span>
        </label>
        <input
          type="text"
          value={state.connectionName}
          onChange={(e) => dispatch({ type: 'SET_CONNECTION_NAME', name: e.target.value })}
          placeholder="例如：A棟 Modbus 主機"
          className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
        />
        {!canProceed && state.connectionName !== undefined && (
          <p className="text-xs text-[var(--accent-yellow)] mt-1">請輸入連線名稱以繼續</p>
        )}
      </div>

      {/* Poll interval — only for polling protocols */}
      {state.protocol !== 'push_ingest' && (
        <div className="mb-5">
          <label className="block text-sm font-medium text-[var(--text-main)] mb-1">
            輪詢間隔
          </label>
          <select
            value={state.pollIntervalMs / 1000}
            onChange={(e) =>
              dispatch({ type: 'SET_POLL_INTERVAL', ms: Number(e.target.value) * 1000 })
            }
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
          >
            {[1, 2, 5, 10, 30, 60].map((s) => (
              <option key={s} value={s}>
                {s} 秒
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--text-muted)] mt-1">每隔多久向設備讀取一次資料</p>
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
          上一步
        </button>
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          disabled={!canProceed}
          className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent-green-hover)] transition-colors"
        >
          下一步
        </button>
      </div>
    </div>
  );
}
