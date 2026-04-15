import { useWizard } from '../WizardContext';
import PropertyTypePicker from '../PropertyTypePicker';

export default function Step5Labels() {
  const { state, dispatch } = useWizard();
  const selectedPoints = state.discoveryPoints
    .map((pt, i) => ({ pt, i }))
    .filter(({ i }) => state.selectedPointIndices.has(i));

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">標籤與屬性</h3>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        為每個資料點設定名稱、屬性類型與單位
      </p>

      <div className="space-y-4 max-h-[45vh] overflow-y-auto">
        {selectedPoints.map(({ pt, i }) => {
          const label = state.labels.get(i) ?? { name: pt.suggestedLabel ?? '', propertyTypeId: 0, unit: '' };

          return (
            <div key={i} className="p-3 rounded-lg border border-[var(--border-base)]">
              <div className="text-xs text-[var(--text-muted)] mb-2 font-mono">
                位址: {pt.rawAddress} | 當前值: {pt.currentValue}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">名稱</label>
                  <input
                    type="text"
                    value={label.name}
                    onChange={(e) => dispatch({
                      type: 'SET_LABEL',
                      index: i,
                      label: { ...label, name: e.target.value },
                    })}
                    placeholder="溫度1"
                    className="w-full px-2 py-1.5 rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">屬性類型</label>
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
                  <label className="block text-xs text-[var(--text-muted)] mb-1">單位</label>
                  <input
                    type="text"
                    value={label.unit}
                    onChange={(e) => dispatch({
                      type: 'SET_LABEL',
                      index: i,
                      label: { ...label, unit: e.target.value },
                    })}
                    placeholder="℃"
                    className="w-full px-2 py-1.5 rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
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
