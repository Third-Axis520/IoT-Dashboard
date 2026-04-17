import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhTW from './locales/zh-TW';
import zhCN from './locales/zh-CN';
import en from './locales/en';

export const LANGUAGES = [
  { code: 'zh-TW', label: '繁中' },
  { code: 'zh-CN', label: '简中' },
  { code: 'en',    label: 'EN'   },
] as const;

export type LangCode = typeof LANGUAGES[number]['code'];

const saved = localStorage.getItem('iot-lang') as LangCode | null;
const validCodes = LANGUAGES.map(l => l.code);
const defaultLng: LangCode = (saved && validCodes.includes(saved)) ? saved : 'zh-TW';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-TW': { translation: zhTW },
      'zh-CN': { translation: zhCN },
      'en':    { translation: en },
    },
    lng: defaultLng,
    fallbackLng: 'zh-TW',
    interpolation: { escapeValue: false },
  });

export default i18n;
