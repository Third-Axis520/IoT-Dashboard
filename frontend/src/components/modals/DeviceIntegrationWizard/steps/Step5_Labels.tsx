import { useWizard } from '../WizardContext';
import PropertyTypePicker from '../PropertyTypePicker';

export default function Step5Labels() {
  const { state, dispatch } = useWizard();
  const selectedPoints = state.discoveryPoints
    .map((pt, i) => ({ pt, i }))
    .filter(({ i }) => state.selectedPointIndices.has(i));

  return (
    <div className="p-6">
      <h3 className="text-base font-medium mb-1">標籤與屬性</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        為每個資料點設定名稱、屬性類型與單位
      </p>

      <div className="space-y-4 max-h-[45vh] overflow-y-auto">
        {selectedPoints.map(({ pt, i }) => {
          const label = state.labels.get(i) ?? { name: pt.suggestedLabel ?? '', propertyTypeId: 0, unit: '' };

          return (
            <div key={i} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-400 mb-2 font-mono">
                位址: {pt.rawAddress} | 當前值: {pt.currentValue}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">名稱</label>
                  <input
                    type="text"
                    value={label.name}
                    onChange={(e) => dispatch({
                      type: 'SET_LABEL',
                      index: i,
                      label: { ...label, name: e.target.value },
                    })}
                    placeholder="溫度1"
                    className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">屬性類型</label>
                  <PropertyTypePicker
                    value={label.propertyTypeId}
                    onChange={(id, item) => dispatch({
                      type: 'SET_LABEL',
                      index: i,
                      label: { ...label, propertyTypeId: id, unit: item.defaultUnit || label.unit },
                    })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">單位</label>
                  <input
                    type="text"
                    value={label.unit}
                    onChange={(e) => dispatch({
                      type: 'SET_LABEL',
                      index: i,
                      label: { ...label, unit: e.target.value },
                    })}
                    placeholder="℃"
                    className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                  />
                </div>
              </div>
            </div>
          );
        })}
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
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          下一步
        </button>
      </div>
    </div>
  );
}
