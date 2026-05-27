import { test, expect, loadDashboard, expectedEquipmentCount } from './helpers';

test.describe('Dashboard smoke (A1-A8)', () => {
  test('A1 — dashboard loads at / without console errors', async ({ page, pageErrors }) => {
    await loadDashboard(page);
    expect(pageErrors, `unexpected errors: ${pageErrors.join('\n')}`).toEqual([]);
  });

  test('A2 — /health returns ok + service=IoTDashboard', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('IoTDashboard');
    expect(body.timestamp).toBeTruthy();
  });

  test('A3 — diagnostics shows polling alive + >= 6 connections', async ({ request }) => {
    const res = await request.get('/api/diagnostics/polling');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.polling.isRunning).toBe(true);
    expect(body.polling.activeConnections).toBeGreaterThanOrEqual(6);
    expect(Array.isArray(body.connections)).toBe(true);
    expect(body.connections.length).toBeGreaterThanOrEqual(6);
  });

  test('A4 — AppToolbar shows the active line selector', async ({ page }) => {
    await loadDashboard(page);
    // Line button: contains the active line name from /api/line-configs
    await expect(page.locator('button').filter({ hasText: /C 棟 LeanA|LeanA/i }).first()).toBeVisible();
  });

  test('A5 — AppToolbar shows both view toggles (dashboard / trend)', async ({ page }) => {
    await loadDashboard(page);
    // The toggle buttons have title="儀表板" / title="趨勢圖" (i18n) — pattern-match
    const dashBtn = page.locator('[title*="儀表板"], [title*="dashboard" i]').first();
    const trendBtn = page.locator('[title*="趨勢"], [title*="trend" i]').first();
    await expect(dashBtn).toBeVisible();
    await expect(trendBtn).toBeVisible();
  });

  test('A6 — REGRESSION: AppToolbar does NOT contain 增加產線', async ({ page }) => {
    await loadDashboard(page);
    // Open the line-picker dropdown so the menu contents are queryable.
    const lineBtn = page.locator('button').filter({ hasText: /LeanA/i }).first();
    await lineBtn.click().catch(() => {});
    await page.waitForTimeout(300);

    const addLineMatches = await page
      .locator('text=/增加產線|增加产线|新增產線|Add line/i')
      .count();
    expect(addLineMatches).toBe(0);
  });

  test('A7 — 6 equipment tiles rendered on dashboard', async ({ page }) => {
    await loadDashboard(page);
    const expectedCount = await expectedEquipmentCount(page);
    expect(expectedCount).toBeGreaterThanOrEqual(6);

    // EquipmentCard tiles use `data-testid` is absent, but each tile renders
    // a sensor name from /api/line-configs. Use the API to know the names and
    // assert each is visible.
    const data = await page.evaluate(async () => {
      const r = await fetch('/api/line-configs');
      const lines = (await r.json()) as Array<{ equipments: Array<{ displayName: string | null; equipmentType: { name: string } }> }>;
      return lines.flatMap((l) => l.equipments.map((e) => e.displayName ?? e.equipmentType.name));
    });

    for (const name of data) {
      if (!name) continue;
      // Tile header shows equipment name — use a permissive search since
      // EquipmentCard may wrap the name with badges / icons.
      await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
    }
  });

  test('A8 — ConnectionHealthBadge is visible', async ({ page }) => {
    await loadDashboard(page);
    await expect(page.getByTestId('connection-health-badge')).toBeVisible();
  });
});
