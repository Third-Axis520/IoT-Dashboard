const STEP_LABELS = [
  '選擇協議',
  '連線設定',
  '掃描設備',
  '選擇資料點',
  '標籤屬性',
  '設備資訊',
  '確認建立',
];

interface WizardStepperProps {
  currentStep: number;
}

export default function WizardStepper({ currentStep }: WizardStepperProps) {
  return (
    <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < currentStep;
        const isActive = stepNum === currentStep;

        return (
          <div key={stepNum} className="flex items-center gap-1 shrink-0">
            {i > 0 && (
              <div className={`w-6 h-px ${isDone ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            )}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs whitespace-nowrap ${
                isActive
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold'
                  : isDone
                    ? 'text-blue-500'
                    : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isDone
                  ? 'bg-blue-500 text-white'
                  : isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
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
