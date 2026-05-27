/**
 * E2E helpers — project-agnostic setup utilities used across spec files.
 *
 * Conventions:
 *   - All page navigations go through `loadDashboard` / `loadTrend` so the
 *     SSE-vs-networkidle quirk is handled in one place.
 *   - Always wire `page.on('pageerror')` via `installErrorListeners` — silent
 *     React errors inside ErrorBoundary are otherwise invisible to a test.
 *   - Assertions on live values are time-boxed (`expect.poll`) — SSE delivery
 *     is async and the first packet may take 1-3s after mount.
 */

import { test as base, expect, Page } from '@playwright/test';

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Recharts width(-1) warnings fire during initial layout — known noise.
        if (text.includes('width(-1)') || text.includes('height(-1)')) return;
        errors.push(`console.error: ${text}`);
      }
    });
    await use(errors);
  },
});

export { expect };

/**
 * Load the dashboard view at `/`. SSE long-poll prevents `networkidle`, so
 * we use `domcontentloaded` + a short settle window for React mount + first
 * SSE packet.
 */
export async function loadDashboard(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // First SSE packet usually arrives within 2-3s; give 4s for safety.
  await page.waitForTimeout(4000);
}

/**
 * Click the toolbar's trend-view toggle button. Resilient to either title or
 * visible text changing.
 */
export async function switchToTrendView(page: Page) {
  const btn = page
    .getByRole('button', { name: /趨勢|trend/i })
    .or(page.locator('[title*="趨勢"]'))
    .or(page.locator('[title*="trend" i]'))
    .first();
  await btn.click();
  await page.waitForTimeout(1500);
}

/**
 * Number of equipment tiles visible on the dashboard (calculated from the
 * loaded /api/line-configs payload — does NOT depend on a particular DOM
 * structure so the count is robust to UI rearrangements).
 */
export async function expectedEquipmentCount(page: Page): Promise<number> {
  const data = await page.evaluate(async () => {
    const r = await fetch('/api/line-configs');
    return r.json() as Promise<Array<{ equipments: unknown[] }>>;
  });
  return data.reduce((sum, line) => sum + (line.equipments?.length ?? 0), 0);
}

/**
 * Find an equipment tile by its visible name (best-effort regex match).
 */
export function tileByName(page: Page, name: string | RegExp) {
  return page
    .locator('div')
    .filter({ hasText: name })
    .filter({ has: page.locator('.tabular-nums, .font-mono') })
    .first();
}
