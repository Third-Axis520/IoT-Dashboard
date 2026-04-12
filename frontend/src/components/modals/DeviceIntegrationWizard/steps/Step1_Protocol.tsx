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
      <h3 className="text-base font-medium mb-1">選擇通訊協議</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        選擇設備使用的通訊方式
      </p>

      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {protocols.map((p) => (
            <button
              key={p.id}
              onClick={() => dispatch({ type: 'SELECT_PROTOCOL', protocol: p.id })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                state.protocol === p.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
              }`}
            >
              <div className="text-2xl mb-2">{protocolIcons[p.id] ?? '📦'}</div>
              <div className="font-semibold text-sm">{p.displayName}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex gap-2">
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
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700"
        >
          下一步
        </button>
      </div>
    </div>
  );
}
