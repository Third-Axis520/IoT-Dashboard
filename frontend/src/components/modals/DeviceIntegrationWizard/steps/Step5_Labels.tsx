import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizard } from '../WizardContext';
import PropertyTypePicker from '../PropertyTypePicker';
import { fetchPropertyTypes } from '../../../../lib/apiPropertyTypes';

export default function Step5Labels() {
  const { state, dispatch } = useWizard();
  const { t } = useTranslation();
  const selectedPoints = state.discoveryPoints
    .map((pt, i) => ({ pt, i }))
    .filter(({ i }) => state.selectedPointIndices.has(i));

  // Auto-default propertyTypeId based on the protocol's function code so users
  // don't have to pick "在位" for every one of 32 DI bits manually:
  //   discrete (FC02) → material_detect (在位)
  //   else            → temperature
  // Only fills in slots the user hasn't touched (label.propertyTypeId === 0).
  useEffect(() => {
    const isDiscrete = state.config?.function === 'discrete';
    const targetKey = isDiscrete ? 'material_detect' : 'temperature';
    fetchPropertyTypes().then((items) => {
      const target = items.find((t) => t.key === targetKey);
      if (!target) return;
      selectedPoints.forEach(({ i }) => {
        const existing = state.labels.get(i);
        if (existing && existing.propertyTypeId > 0) return;
        const fallback = existing ?? { name: state.discoveryPoints[i]?.suggestedLabel ?? '', propertyTypeId: 0, unit: '' };
        dispatch({
          type: 'SET_LABEL',
          index: i,
          label: { ...fallback, propertyTypeId: target.id, unit: fallback.unit || target.defaultUnit || '' },
        });
      });
    });
    // selectedPoints / state.labels intentionally not in deps: we only auto-fill once on entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.config?.function]);

  // Block Next when any selected point is missing its propertyTypeId
  const missingCount = selectedPoints.filter(({ i }) => {
    const lbl = state.labels.get(i);
    return !lbl || !lbl.propertyTypeId || lbl.propertyTypeId <= 0;
  }).length;
  const canProceed = missingCount === 0;

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">{t('wizard.labels.title')}</h3>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {t('wizard.labels.desc')}
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
                  <label className="block text-xs text-[var(--text-muted)] mb-1">{t('wizard.labels.colName')}</label>
                  <input
                    type="text"
                    value={label.name}
                    onChange={(e) => dispatch({
                      type: 'SET_LABEL',
                      index: i,
                      label: { ...label, name: e.target.value },
                    })}
                    placeholder={t('wizard.labels.namePlaceholder')}
                    className="w-full px-2 py-1.5 rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">{t('wizard.labels.colPropertyType')}</label>
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
                  <label className="block text-xs text-[var(--text-muted)] mb-1">{t('wizard.labels.colUnit')}</label>
                  <input
                    type="text"
                    value={label.unit}
                    onChange={(e) => dispatch({
                      type: 'SET_LABEL',
                      index: i,
                      label: { ...label, unit: e.target.value },
                    })}
                    placeholder={t('wizard.labels.unitPlaceholder')}
                    className="w-full px-2 py-1.5 rounded border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!canProceed && (
        <p className="text-xs text-[var(--accent-yellow)] mt-3">
          ⚠ 還有 {missingCount} 個點位未指定屬性類型，無法繼續。
        </p>
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
          className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--accent-green-hover)] transition-colors"
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}
