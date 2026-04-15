import { useState } from 'react';
import { useWizard } from '../WizardContext';
import { scanDiscovery } from '../../../../lib/apiDiscovery';

export default function Step3Discovery() {
  const { state, dispatch } = useWizard();
  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const isPush = state.protocol === 'push_ingest';

  async function handleScan() {
    setLoading(true);
    setScanError(null);
    try {
      const coercedConfig = Object.fromEntries(
        Object.entries(state.config).map(([k, v]) => {
          if (v === 'true') return [k, true];
          if (v === 'false') return [k, false];
          const n = Number(v);
          return [k, v !== '' && !isNaN(n) ? n : v];
        })
      );
      const configJson = JSON.stringify(coercedConfig);
      const result = await scanDiscovery(state.protocol!, configJson);
      if (result.success && result.points) {
        dispatch({ type: 'SET_DISCOVERY_RESULT', points: result.points });
      } else {
        setScanError(result.error ?? '掃描失敗');
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : '掃描失敗');
    } finally {
      setLoading(false);
    }
  }

  if (isPush) {
    // Push protocol: skip discovery, proceed with empty points
    return (
      <div className="p-6">
        <h3 className="text-base font-medium mb-1">推送設備</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          推送類型的設備會自動發送資料，不需要掃描。請直接進入下一步手動設定資料點。
        </p>

        <div className="flex justify-between mt-6">
          <button
            onClick={() => dispatch({ type: 'PREV_STEP' })}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            上一步
          </button>
          <button
            onClick={() => dispatch({ type: 'NEXT_STEP' })}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            下一步
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h3 className="text-base font-medium mb-1">掃描設備</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        連接設備並掃描可用的資料點
      </p>

      <button
        onClick={handleScan}
        disabled={loading}
        className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? '掃描中...' : '開始掃描'}
      </button>

      {scanError && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
          {scanError}
          <button onClick={handleScan} className="ml-3 underline hover:no-underline">
            重試
          </button>
        </div>
      )}

      {state.discoveryPoints.length > 0 && (
        <div className="mt-4">
          <div className="text-sm text-gray-500 mb-2">
            找到 {state.discoveryPoints.length} 個資料點
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-3">位址</th>
                  <th className="text-right py-2 px-3">當前值</th>
                  <th className="text-left py-2 px-3">型別</th>
                </tr>
              </thead>
              <tbody>
                {state.discoveryPoints.map((pt, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2 px-3 font-mono">{pt.rawAddress}</td>
                    <td className="py-2 px-3 text-right font-mono">{pt.currentValue}</td>
                    <td className="py-2 px-3 text-gray-500">{pt.dataType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          上一步
        </button>
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          disabled={state.discoveryPoints.length === 0}
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700"
        >
          下一步
        </button>
      </div>
    </div>
  );
}
