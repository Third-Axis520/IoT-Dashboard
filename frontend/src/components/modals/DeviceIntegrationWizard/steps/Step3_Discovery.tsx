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
    return (
      <div className="p-6">
        <h3 className="text-base font-medium text-[var(--text-main)] mb-1">推送設備</h3>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          推送類型的設備會自動發送資料，不需要掃描。請直接進入下一步手動設定資料點。
        </p>

        <div className="flex justify-between mt-6">
          <button
            onClick={() => dispatch({ type: 'PREV_STEP' })}
            className="px-4 py-2 rounded-lg border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
          >
            上一步
          </button>
          <button
            onClick={() => dispatch({ type: 'NEXT_STEP' })}
            className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium hover:bg-[var(--accent-green-hover)] transition-colors"
          >
            下一步
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">掃描設備</h3>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        連接設備並掃描可用的資料點
      </p>

      <button
        onClick={handleScan}
        disabled={loading}
        className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium hover:bg-[var(--accent-green-hover)] disabled:opacity-50 transition-colors"
      >
        {loading ? '掃描中...' : '開始掃描'}
      </button>

      {scanError && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/30 text-[var(--accent-red)] text-sm">
          <p className="font-medium">{scanError}</p>
          <p className="text-xs mt-2 opacity-80">
            請確認：1) IP 位址與 Port 是否正確　2) 設備是否已開機並連接網路　3) 防火牆是否允許連線
          </p>
          <button onClick={handleScan} className="mt-2 text-xs underline hover:no-underline">
            重試
          </button>
        </div>
      )}

      {state.discoveryPoints.length > 0 && (
        <div className="mt-4">
          <div className="text-sm text-[var(--text-muted)] mb-2">
            找到 {state.discoveryPoints.length} 個資料點
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-base)]">
                  <th className="text-left py-2 px-3 text-[var(--text-muted)]">位址</th>
                  <th className="text-right py-2 px-3 text-[var(--text-muted)]">當前值</th>
                  <th className="text-left py-2 px-3 text-[var(--text-muted)]">型別</th>
                </tr>
              </thead>
              <tbody>
                {state.discoveryPoints.map((pt, i) => (
                  <tr key={i} className="border-b border-[var(--border-base)]/50">
                    <td className="py-2 px-3 font-mono text-[var(--text-main)]">{pt.rawAddress}</td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--text-main)]">{pt.currentValue}</td>
                    <td className="py-2 px-3 text-[var(--text-muted)]">{pt.dataType}</td>
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
          className="px-4 py-2 rounded-lg border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
        >
          上一步
        </button>
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          disabled={state.discoveryPoints.length === 0}
          className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent-green-hover)] transition-colors"
        >
          下一步
        </button>
      </div>
    </div>
  );
}
