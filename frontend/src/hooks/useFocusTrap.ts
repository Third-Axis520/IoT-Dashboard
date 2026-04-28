import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside a modal and handles ESC to close.
 * Usage: const ref = useFocusTrap<HTMLDivElement>(onClose);
 *        <div ref={ref} ...>
 *
 * The effect must run exactly once per modal mount: callers pass `onClose`
 * as an inline arrow which is recreated every render, so depending on it
 * would re-run the effect on every parent re-render and re-grab focus —
 * this stole the user's typing focus and jumped them back to the close
 * button on every SSE tick. We stash onClose in a ref so the effect deps
 * stay empty.
 */
export function useFocusTrap<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Remember and move focus to the first interactive element (typically
    // the close button) — only on initial mount, not on every re-render
    previousFocusRef.current = document.activeElement;
    const first = el.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = el!.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      // Restore focus to whatever was focused when the modal opened
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
    // Intentionally empty deps: onClose accessed via ref so updates don't
    // re-fire the focus-grab effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
