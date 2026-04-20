import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFasCategories, type FasCategoryDto } from '../../../lib/apiFas';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (categoryName: string, description: string) => void;
}

export default function FasCategoryPickerModal({ open, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<FasCategoryDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setError(null);
    load();
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFasCategories();
      setCategories(data);
    } catch {
      setError(t('wizard.equipment.fasError'));
    } finally {
      setLoading(false);
    }
  }

  const filtered = categories.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.categoryCode.toLowerCase().includes(q) ||
      c.categoryName.toLowerCase().includes(q) ||
      (c.description?.toLowerCase().includes(q) ?? false)
    );
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-md mx-4 flex flex-col overflow-hidden"
        style={{ maxHeight: '70vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-base)]">
          <h2 className="text-base font-semibold text-[var(--text-main)]">
            {t('wizard.equipment.fasModalTitle')}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('wizard.equipment.fasSearch')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-main)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-[var(--text-muted)] text-sm">
              <svg className="animate-spin mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading…
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <p className="text-sm text-[var(--accent-red)] text-center">{error}</p>
              <button
                onClick={load}
                className="px-4 py-1.5 rounded-lg border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
              >
                {t('wizard.equipment.fasRetry')}
              </button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--text-muted)]">
              {t('wizard.equipment.fasEmpty')}
            </p>
          )}

          {!loading && !error && filtered.length > 0 && (
            <ul className="space-y-1 mt-1">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      onSelect(c.categoryName, c.description ?? '');
                      onClose();
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--accent-green)]/10 transition-colors"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-[var(--text-muted)] font-mono">{c.categoryCode}</span>
                      <span className="text-sm font-medium text-[var(--text-main)]">{c.categoryName}</span>
                    </div>
                    {c.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">{c.description}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
