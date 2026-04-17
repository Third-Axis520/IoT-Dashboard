import { describe, it, expect } from 'vitest';
import zhTW from '../i18n/locales/zh-TW';
import zhCN from '../i18n/locales/zh-CN';
import en from '../i18n/locales/en';

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null
      ? collectKeys(v as Record<string, unknown>, full)
      : [full];
  });
}

describe('i18n locale completeness', () => {
  const baseKeys = collectKeys(zhTW as unknown as Record<string, unknown>);

  it('zh-CN has all keys from zh-TW', () => {
    const keys = collectKeys(zhCN as unknown as Record<string, unknown>);
    expect(keys.sort()).toEqual(baseKeys.sort());
  });

  it('en has all keys from zh-TW', () => {
    const keys = collectKeys(en as unknown as Record<string, unknown>);
    expect(keys.sort()).toEqual(baseKeys.sort());
  });
});
