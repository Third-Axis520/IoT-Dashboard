import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface InlineErrorBannerProps {
  /** Main error message (already translated, or pass i18n-translated text) */
  message: string;
  /** Optional secondary hint shown below the message */
  hint?: string;
  /** If provided, renders a retry link/button beneath */
  onRetry?: () => void;
  /** Optional override for the retry button label (defaults to common.retry) */
  retryLabel?: string;
  /** Visual severity. Defaults to 'error' (red). 'warning' uses yellow. */
  severity?: 'error' | 'warning';
  /** Extra wrapper class for spacing in callers */
  className?: string;
}

export default function InlineErrorBanner({
  message,
  hint,
  onRetry,
  retryLabel,
  severity = 'error',
  className = '',
}: InlineErrorBannerProps) {
  const { t } = useTranslation();

  const tone =
    severity === 'warning'
      ? 'bg-[var(--accent-yellow)]/10 border-[var(--accent-yellow)]/30 text-[var(--accent-yellow)]'
      : 'bg-[var(--accent-red)]/10 border-[var(--accent-red)]/30 text-[var(--accent-red)]';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`px-4 py-3 rounded-lg border text-sm ${tone} ${className}`}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-medium">{message}</p>
          {hint && <p className="text-xs mt-1.5 opacity-80">{hint}</p>}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-xs underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-current rounded"
            >
              {retryLabel ?? t('common.retry')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
