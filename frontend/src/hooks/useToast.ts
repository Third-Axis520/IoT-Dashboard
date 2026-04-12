import { useState, useCallback, useRef } from 'react';

export type ToastLevel = 'success' | 'info' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  level: ToastLevel;
  message: string;
}

export function useToast(autoDismissMs = 4000) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((level: ToastLevel, message: string) => {
    const id = `toast_${++counterRef.current}`;
    setToasts((prev) => [...prev, { id, level, message }]);

    if (autoDismissMs > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, autoDismissMs);
    }
  }, [autoDismissMs]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
