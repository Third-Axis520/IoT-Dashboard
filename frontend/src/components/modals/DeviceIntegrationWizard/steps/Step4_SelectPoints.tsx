import { useWizard } from '../WizardContext';

export default function Step4SelectPoints() {
  const { state, dispatch } = useWizard();
  const { discoveryPoints, selectedPointIndices } = state;

  const allSelected = selectedPointIndices.size === discoveryPoints.length;
  const noneSelected = selectedPointIndices.size === 0;

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">選擇資料點</h3>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        勾選要監控的資料點 (已選 {selectedPointIndices.size} / 共 {discoveryPoints.length})
      </p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => dispatch({ type: 'SELECT_ALL_POINTS' })}
          disabled={allSelected}
          className="px-3 py-1 text-xs rounded border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] disabled:opacity-40 transition-colors"
        >
          全選
        </button>
        <button
          onClick={() => dispatch({ type: 'DESELECT_ALL_POINTS' })}
          disabled={noneSelected}
          className="px-3 py-1 text-xs rounded border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] disabled:opacity-40 transition-colors"
        >
          取消全選
        </button>
      </div>

      <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--bg-card)]">
            <tr className="border-b border-[var(--border-base)]">
              <th className="w-10 py-2 px-3" />
              <th className="text-left py-2 px-3 text-[var(--text-muted)]">位址</th>
              <th className="text-right py-2 px-3 text-[var(--text-muted)]">當前值</th>
              <th className="text-left py-2 px-3 text-[var(--text-muted)]">型別</th>
              <th className="text-left py-2 px-3 text-[var(--text-muted)]">建議名稱</th>
            </tr>
          </thead>
          <tbody>
            {discoveryPoints.map((pt, i) => (
              <tr
                key={i}
                onClick={() => dispatch({ type: 'TOGGLE_POINT', index: i })}
                className={`border-b border-[var(--border-base)]/50 cursor-pointer hover:bg-[var(--border-base)]/50 transition-colors ${
                  selectedPointIndices.has(i) ? 'bg-[var(--accent-green)]/5' : ''
                }`}
              >
                <td className="py-2 px-3">
                  <input
                    type="checkbox"
                    checked={selectedPointIndices.has(i)}
                    onChange={() => dispatch({ type: 'TOGGLE_POINT', index: i })}
                    className="rounded"
                  />
                </td>
                <td className="py-2 px-3 font-mono text-[var(--text-main)]">{pt.rawAddress}</td>
                <td className="py-2 px-3 text-right font-mono text-[var(--text-main)]">{pt.currentValue}</td>
                <td className="py-2 px-3 text-[var(--text-muted)]">{pt.dataType}</td>
                <td className="py-2 px-3 text-[var(--text-muted)]">{pt.suggestedLabel ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          className="px-4 py-2 rounded-lg border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
        >
          上一步
        </button>
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          disabled={noneSelected}
          className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent-green-hover)] transition-colors"
        >
          下一步
        </button>
      </div>
    </div>
  );
}
