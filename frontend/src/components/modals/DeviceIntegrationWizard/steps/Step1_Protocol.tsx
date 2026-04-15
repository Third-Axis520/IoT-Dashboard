import { useEffect, useState } from 'react';
import { useWizard } from '../WizardContext';
import { fetchProtocols, type ProtocolItem } from '../../../../lib/apiProtocols';

const protocolIcons: Record<string, string> = {
  modbus_tcp: '🔌',
  web_api: '🌐',
  push_ingest: '📡',
};

export default function Step1Protocol() {
  const { state, dispatch } = useWizard();
  const [protocols, setProtocols] = useState<ProtocolItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProtocols()
      .then(setProtocols)
      .catch(() => dispatch({ type: 'SET_ERROR', error: '無法載入協議列表' }))
      .finally(() => setLoading(false));
  }, [dispatch]);

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">選擇通訊協議</h3>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        選擇設備使用的通訊方式
      </p>

      {loading ? (
        <div className="text-center py-8 text-[var(--text-muted)]">載入中...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {protocols.map((p) => (
            <button
              key={p.id}
              onClick={() => dispatch({ type: 'SELECT_PROTOCOL', protocol: p.id })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                state.protocol === p.id
                  ? 'border-[var(--accent-green)] bg-[var(--accent-green)]/10'
                  : 'border-[var(--border-base)] hover:border-[var(--accent-green)]/50'
              }`}
            >
              <div className="text-2xl mb-2">{protocolIcons[p.id] ?? '📦'}</div>
              <div className="font-semibold text-sm text-[var(--text-main)]">{p.displayName}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1 flex gap-2">
                {p.supportsDiscovery && <span>掃描</span>}
                {p.supportsLivePolling && <span>輪詢</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-6">
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          disabled={!state.protocol}
          className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent-green-hover)] transition-colors"
        >
          下一步
        </button>
      </div>
    </div>
  );
}
