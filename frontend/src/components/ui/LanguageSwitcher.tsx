import { useTranslation } from 'react-i18next';
import { LANGUAGES, type LangCode } from '../../i18n';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language as LangCode;

  function change(code: LangCode) {
    i18n.changeLanguage(code);
    localStorage.setItem('iot-lang', code);
  }

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-[var(--border-base)] overflow-hidden">
      {LANGUAGES.map(lang => (
        <button
          key={lang.code}
          onClick={() => change(lang.code)}
          className={`px-2 py-1 text-xs font-medium transition-colors ${
            current === lang.code
              ? 'bg-[var(--border-base)] text-[var(--text-main)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)]/50'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
