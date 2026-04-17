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
    <div className="flex items-center gap-0.5 rounded-md border border-white/20 overflow-hidden">
      {LANGUAGES.map(lang => (
        <button
          key={lang.code}
          onClick={() => change(lang.code)}
          className={`px-2 py-1 text-xs font-medium transition-colors ${
            current === lang.code
              ? 'bg-white/20 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
