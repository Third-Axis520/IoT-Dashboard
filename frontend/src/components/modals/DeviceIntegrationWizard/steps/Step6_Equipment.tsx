import { useTranslation } from 'react-i18next';
import { useWizard } from '../WizardContext';

export default function Step6Equipment() {
  const { state, dispatch } = useWizard();
  const { t } = useTranslation();

  const VIS_TYPES = [
    { value: 'single_kpi', label: t('wizard.equipment.visSingleKpi'), desc: t('wizard.equipment.descSingleKpi') },
    { value: 'four_rings', label: t('wizard.equipment.visFourRings'), desc: t('wizard.equipment.descFourRings') },
    { value: 'dual_side_spark', label: t('wizard.equipment.visDualSide'), desc: t('wizard.equipment.descDualSide') },
    { value: 'custom_grid', label: t('wizard.equipment.visCustomGrid'), desc: t('wizard.equipment.descCustomGrid') },
  ];

  // Smart recommendation based on selected point count
  const pointCount = state.selectedPointIndices.size;
  const recommended = pointCount <= 2 ? 'single_kpi'
    : pointCount <= 4 ? 'four_rings'
    : pointCount <= 8 ? 'dual_side_spark'
    : 'custom_grid';

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">{t('wizard.equipment.title')}</h3>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t('wizard.equipment.desc')}
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-[var(--text-main)] mb-1">
            {t('wizard.equipment.typeNameLabel')} <span className="text-[var(--accent-red)]">*</span>
          </label>
          <input
            type="text"
            value={state.equipmentName}
            onChange={(e) => dispatch({
              type: 'SET_EQUIPMENT_INFO',
              name: e.target.value,
              visType: state.visType,
              description: state.description,
            })}
            placeholder={t('wizard.equipment.typeNamePlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-main)] mb-1">{t('wizard.equipment.descLabel')}</label>
          <input
            type="text"
            value={state.description}
            onChange={(e) => dispatch({
              type: 'SET_EQUIPMENT_INFO',
              name: state.equipmentName,
              visType: state.visType,
              description: e.target.value,
            })}
            placeholder={t('wizard.equipment.descPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-main)] mb-2">{t('wizard.equipment.visLabel')}</label>
          <div className="grid grid-cols-2 gap-3">
            {VIS_TYPES.map((vt) => (
              <button
                key={vt.value}
                onClick={() => dispatch({
                  type: 'SET_EQUIPMENT_INFO',
                  name: state.equipmentName,
                  visType: vt.value,
                  description: state.description,
                })}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  state.visType === vt.value
                    ? 'border-[var(--accent-green)] bg-[var(--accent-green)]/10'
                    : 'border-[var(--border-base)] hover:border-[var(--accent-green)]/50'
                }`}
              >
                <div className="font-semibold text-sm text-[var(--text-main)]">
                  {vt.label}
                  {vt.value === recommended && (
                    <span className="ml-2 text-xs text-[var(--accent-green)] font-normal">{t('wizard.equipment.recommended')}</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{vt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          className="px-4 py-2 rounded-lg border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
        >
          {t('common.previous')}
        </button>
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          disabled={!state.equipmentName.trim()}
          className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent-green-hover)] transition-colors"
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}
