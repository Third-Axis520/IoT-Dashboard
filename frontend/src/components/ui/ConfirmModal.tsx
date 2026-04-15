interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmText = '確認',
  cancelText = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-[var(--bg-root)]/80 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-base)] rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-[var(--text-main)] mb-2">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mb-6 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              variant === 'danger'
                ? 'bg-[var(--accent-red)] text-white hover:bg-[var(--accent-red)]/80'
                : 'bg-[var(--accent-green)] text-[var(--bg-panel)] hover:bg-[var(--accent-green-hover)]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
