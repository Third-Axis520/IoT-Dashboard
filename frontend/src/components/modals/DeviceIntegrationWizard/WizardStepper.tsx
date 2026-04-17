import { useTranslation } from 'react-i18next';

interface WizardStepperProps {
  currentStep: number;
}

export default function WizardStepper({ currentStep }: WizardStepperProps) {
  const { t } = useTranslation();
  const STEP_LABELS = [
    t('wizard.step1'),
    t('wizard.step2'),
    t('wizard.step3'),
    t('wizard.step4'),
    t('wizard.step5'),
    t('wizard.step6'),
    t('wizard.step7'),
  ];

  return (
    <div className="flex items-center gap-1 px-6 py-3 border-b border-[var(--border-base)] overflow-x-auto">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < currentStep;
        const isActive = stepNum === currentStep;

        return (
          <div key={stepNum} className="flex items-center gap-1 shrink-0">
            {i > 0 && (
              <div className={`w-6 h-px ${isDone ? 'bg-[var(--accent-green)]' : 'bg-[var(--border-base)]'}`} />
            )}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--accent-green)]/15 text-[var(--accent-green)] font-semibold'
                  : isDone
                    ? 'text-[var(--accent-green)]'
                    : 'text-[var(--text-muted)]'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isDone
                  ? 'bg-[var(--accent-green)] text-[var(--bg-panel)]'
                  : isActive
                    ? 'bg-[var(--accent-green)] text-[var(--bg-panel)]'
                    : 'bg-[var(--border-base)] text-[var(--text-muted)]'
              }`}>
                {isDone ? '✓' : stepNum}
              </span>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
