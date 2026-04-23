import { useTranslation } from 'react-i18next';

interface ImpactWarningBannerProps {
  errorCount: number;
  onManage: () => void;
}

export default function ImpactWarningBanner({ errorCount, onManage }: ImpactWarningBannerProps) {
  const { t } = useTranslation();
  if (errorCount === 0) return null;

  return (
    <div className="bg-[var(--accent-yellow)]/10 border-b border-[var(--accent-yellow)]/30 px-4 py-2 flex items-center justify-between text-sm">
      <span className="text-[var(--accent-yellow)]">
        {t('deviceConnections.impactWarning', { count: errorCount })}
      </span>
      <button
        onClick={onManage}
        className="text-[var(--accent-yellow)] underline hover:no-underline text-sm"
      >
        {t('deviceConnections.manageLink')}
      </button>
    </div>
  );
}
