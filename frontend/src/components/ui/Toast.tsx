import type { ToastItem } from '../../hooks/useToast';

const levelStyles: Record<string, string> = {
  success: 'bg-[var(--accent-green)] text-[var(--bg-panel)]',
  info: 'bg-[var(--accent-blue)] text-[var(--bg-panel)]',
  warning: 'bg-[var(--accent-yellow)] text-[var(--bg-panel)]',
  error: 'bg-[var(--accent-red)] text-white',
};

const levelIcons: Record<string, string> = {
  success: '✓',
  info: 'ℹ',
  warning: '⚠',
  error: '✕',
};

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[280px] max-w-[420px] animate-[slideIn_0.2s_ease-out] ${levelStyles[t.level]}`}
        >
          <span className="text-lg shrink-0">{levelIcons[t.level]}</span>
          <span className="flex-1 text-sm font-medium">{t.message}</span>
          <button
            onClick={() => onRemove(t.id)}
            className="ml-2 opacity-70 hover:opacity-100 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
