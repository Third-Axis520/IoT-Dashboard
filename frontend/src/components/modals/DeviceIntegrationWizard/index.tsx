import { useTranslation } from 'react-i18next';
import { WizardProvider, useWizard } from './WizardContext';
import WizardStepper from './WizardStepper';
import Step1Protocol from './steps/Step1_Protocol';
import Step2Config from './steps/Step2_Config';
import Step3Discovery from './steps/Step3_Discovery';
import Step4SelectPoints from './steps/Step4_SelectPoints';
import Step5Labels from './steps/Step5_Labels';
import Step6Equipment from './steps/Step6_Equipment';
import Step7Review, { type WizardSuccessInfo } from './steps/Step7_Review';

interface DeviceIntegrationWizardProps {
  onClose: () => void;
  onSuccess?: (info: WizardSuccessInfo) => void;
}

function WizardContent({ onClose, onSuccess }: DeviceIntegrationWizardProps) {
  const { state } = useWizard();
  const { t } = useTranslation();

  const stepComponent = (() => {
    switch (state.step) {
      case 1: return <Step1Protocol />;
      case 2: return <Step2Config />;
      case 3: return <Step3Discovery />;
      case 4: return <Step4SelectPoints />;
      case 5: return <Step5Labels />;
      case 6: return <Step6Equipment />;
      case 7: return <Step7Review onClose={onClose} onSuccess={onSuccess} />;
      default: return null;
    }
  })();

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-base)]">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">{t('wizard.title')}</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Stepper */}
        <WizardStepper currentStep={state.step} />

        {/* Error banner */}
        {state.error && (
          <div className="mx-6 mt-4 px-4 py-2 rounded-lg bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/30 text-[var(--accent-red)] text-sm">
            {state.error}
          </div>
        )}

        {/* Step content */}
        <div className="flex-1 overflow-y-auto">
          {stepComponent}
        </div>
      </div>
    </div>
  );
}

export default function DeviceIntegrationWizard(props: DeviceIntegrationWizardProps) {
  return (
    <WizardProvider>
      <WizardContent {...props} />
    </WizardProvider>
  );
}
