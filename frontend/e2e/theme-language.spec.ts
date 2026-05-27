import { test, expect, loadDashboard } from './helpers';

test.describe('Theme + i18n (G1-G4)', () => {
  // The theme + language controls live inside a hover-only dropdown attached to
  // a Settings cog button. CSS-only `group-hover:visible` — so we must hover
  // the parent group element first.
  async function openPreferencesDropdown(page: import('@playwright/test').Page) {
    // The Settings cog button has aria-label = t('app.systemSettings').
    //   zh-TW → 系統設定  /  en → System Settings
    // NOTE: there is ALSO a "限值設定" button that matches /設定/, so we need
    // a more specific match. Use the system/系統 prefix or the literal title.
    const settingsBtn = page
      .locator('button[aria-label="系統設定"], button[aria-label="系统设置"], button[aria-label="System Settings"]')
      .first();
    // Hover the parent .group container so the CSS group-hover triggers
    // reliably even when headless Chromium is finicky about hover events.
    await settingsBtn.hover();
    await page.waitForTimeout(300);
  }

  test('G1 — theme buttons switch between dark and light mode', async ({ page }) => {
    await loadDashboard(page);
    await openPreferencesDropdown(page);

    // App.tsx puts theme-light on the .app-container div (not html/body),
    // so check the presence of that class anywhere in the doc.
    async function hasLightTheme() {
      return page.evaluate(() => document.querySelector('.theme-light') !== null);
    }
    expect(await hasLightTheme(), 'dashboard should start in dark mode').toBe(false);

    await page.locator('button', { hasText: /淺色|浅色|Light/i }).first().click();
    await page.waitForTimeout(400);

    expect(await hasLightTheme(), 'theme-light should be applied after click').toBe(true);
  });

  test('G2 — theme preference persists across reload', async ({ page }) => {
    await loadDashboard(page);
    await openPreferencesDropdown(page);
    await page.locator('button', { hasText: /淺色|浅色|Light/i }).first().click();
    await page.waitForTimeout(400);

    const themeAfter = await page.evaluate(() => localStorage.getItem('iot-theme'));
    expect(themeAfter).toBe('light');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const themeAfterReload = await page.evaluate(() => localStorage.getItem('iot-theme'));
    expect(themeAfterReload).toBe('light');
  });

  test('G3 — language switcher inside preferences dropdown shows 3 locale buttons', async ({ page }) => {
    await loadDashboard(page);
    await openPreferencesDropdown(page);

    // LanguageSwitcher labels per i18n/index.ts: 繁中 / 简中 / EN
    await expect(page.locator('button', { hasText: /^繁中$/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /^简中$/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /^EN$/ })).toBeVisible();
  });

  test('G4 — clicking EN switches the dashboard view-toggle title to English', async ({ page }) => {
    await loadDashboard(page);
    await openPreferencesDropdown(page);

    // Reset to zh-TW first so the test is deterministic across runs.
    await page.locator('button', { hasText: /^繁中$/ }).click();
    await page.waitForTimeout(400);

    await openPreferencesDropdown(page);
    await page.locator('button', { hasText: /^EN$/ }).click();
    await page.waitForTimeout(800);

    // The dashboard view toggle's title attribute now contains "Dashboard"
    // (was 儀表板 / 仪表板 before).
    const dashBtn = page.locator('[title*="Dashboard" i]').first();
    await expect(dashBtn).toBeVisible();
  });
});
