import { useWizard } from '../WizardContext';

export default function Step4SelectPoints() {
  const { state, dispatch } = useWizard();
  const { discoveryPoints, selectedPointIndices } = state;

  const allSelected = selectedPointIndices.size === discoveryPoints.length;
  const noneSelected = selectedPointIndices.size === 0;

  return (
    <div className="p-6">
      <h3 className="text-base font-medium mb-1">選擇資料點</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        勾選要監控的資料點 (已選 {selectedPointIndices.size} / 共 {discoveryPoints.length})
      </p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => dispatch({ type: 'SELECT_ALL_POINTS' })}
          disabled={allSelected}
          className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
        >
          全選
        </button>
        <button
          onClick={() => dispatch({ type: 'DESELECT_ALL_POINTS' })}
          disabled={noneSelected}
          className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
        >
          取消全選
        </button>
      </div>

      <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white dark:bg-gray-800">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="w-10 py-2 px-3" />
              <th className="text-left py-2 px-3">位址</th>
              <th className="text-right py-2 px-3">當前值</th>
              <th className="text-left py-2 px-3">型別</th>
              <th className="text-left py-2 px-3">建議名稱</th>
            </tr>
          </thead>
          <tbody>
            {discoveryPoints.map((pt, i) => (
              <tr
                key={i}
                onClick={() => dispatch({ type: 'TOGGLE_POINT', index: i })}
                className={`border-b border-gray-100 dark:border-gray-700/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 ${
                  selectedPointIndices.has(i) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
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
                <td className="py-2 px-3 font-mono">{pt.rawAddress}</td>
                <td className="py-2 px-3 text-right font-mono">{pt.currentValue}</td>
                <td className="py-2 px-3 text-gray-500">{pt.dataType}</td>
                <td className="py-2 px-3 text-gray-500">{pt.suggestedLabel ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          上一步
        </button>
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          disabled={noneSelected}
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700"
        >
          下一步
        </button>
      </div>
    </div>
  );
}
