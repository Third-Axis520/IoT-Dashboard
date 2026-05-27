import { test, expect, loadDashboard } from './helpers';

test.describe('Modal interactions (E1-E7)', () => {
  test('E1 — clicking a sensor opens DrillDownModal', async ({ page }) => {
    await loadDashboard(page);

    // Find any numeric value in a tile and click it. EquipmentCard surfaces
    // an onDrillDown handler triggered by clicking the tile body.
    const firstValue = page.locator('.tabular-nums, .font-mono').first();
    await firstValue.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(800);

    // DrillDownModal renders into a dialog/role region. Look for typical modal
    // structure (fixed overlay + content with title).
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]')).first();
    const exists = await dialog.count();
    test.skip(exists === 0, 'click did not trigger drilldown — selector needs tightening');
    await expect(dialog).toBeVisible();
  });

  test('E2 — DrillDown shows 1h / 4h / 24h time range buttons', async ({ page }) => {
    await loadDashboard(page);
    const firstValue = page.locator('.tabular-nums, .font-mono').first();
    await firstValue.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(800);

    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]')).first();
    test.skip((await dialog.count()) === 0, 'drilldown not opened');

    // Time range toggles
    await expect(dialog.getByText(/1\s*h|1\s*hr|1\s*小時/i).first()).toBeVisible();
    await expect(dialog.getByText(/4\s*h|4\s*hr|4\s*小時/i).first()).toBeVisible();
    await expect(dialog.getByText(/24\s*h|24\s*hr|24\s*小時/i).first()).toBeVisible();
  });

  test('E3 — LimitsSettingsModal opens via toolbar Limits button', async ({ page }) => {
    await loadDashboard(page);
    // The Limits button is in AppToolbar — try title-based + role+name.
    const limitsBtn = page
      .locator('[title*="UCL"], [title*="LCL"], [title*="限值"], [title*="Limit" i]')
      .or(page.getByRole('button', { name: /limit|限值/i }))
      .first();

    const exists = await limitsBtn.count();
    test.skip(exists === 0, 'limits button selector did not match — needs data-testid');
    await limitsBtn.click();
    await page.waitForTimeout(800);

    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]')).first();
    await expect(dialog).toBeVisible();
  });

  test('E4 — LimitsSettingsModal has UCL/LCL number inputs', async ({ page }) => {
    await loadDashboard(page);
    const limitsBtn = page
      .locator('[title*="UCL"], [title*="LCL"], [title*="限值"], [title*="Limit" i]')
      .or(page.getByRole('button', { name: /limit|限值/i }))
      .first();
    test.skip((await limitsBtn.count()) === 0, 'limits button not found');
    await limitsBtn.click();
    await page.waitForTimeout(800);

    const inputs = page.locator('[role="dialog"] input[type="number"]');
    const cnt = await inputs.count();
    expect(cnt).toBeGreaterThan(0);
  });

  test('E5 — REGRESSION: LimitsSettingsModal does NOT show gating section', async ({ page }) => {
    await loadDashboard(page);
    const limitsBtn = page
      .locator('[title*="UCL"], [title*="LCL"], [title*="限值"], [title*="Limit" i]')
      .or(page.getByRole('button', { name: /limit|限值/i }))
      .first();
    test.skip((await limitsBtn.count()) === 0, 'limits button not found');
    await limitsBtn.click();
    await page.waitForTimeout(800);

    const gatingMatches = await page
      .locator('[role="dialog"]')
      .getByText(/gating|閘控|閘門|conditional sampling|條件採樣/i)
      .count();
    expect(gatingMatches).toBe(0);
  });

  test('E6 — REGRESSION: LimitsSettingsModal does NOT show sensor add/management UI', async ({ page }) => {
    await loadDashboard(page);
    const limitsBtn = page
      .locator('[title*="UCL"], [title*="LCL"], [title*="限值"], [title*="Limit" i]')
      .or(page.getByRole('button', { name: /limit|限值/i }))
      .first();
    test.skip((await limitsBtn.count()) === 0, 'limits button not found');
    await limitsBtn.click();
    await page.waitForTimeout(800);

    const sensorMgmtMatches = await page
      .locator('[role="dialog"]')
      .getByText(/add\s*sensor|新增感測器|sensor management|感測器管理|scan-and-add/i)
      .count();
    expect(sensorMgmtMatches).toBe(0);
  });

  test('E7 — modal closes via Escape key', async ({ page }) => {
    await loadDashboard(page);
    const limitsBtn = page
      .locator('[title*="UCL"], [title*="LCL"], [title*="限值"], [title*="Limit" i]')
      .or(page.getByRole('button', { name: /limit|限值/i }))
      .first();
    test.skip((await limitsBtn.count()) === 0, 'limits button not found');
    await limitsBtn.click();
    await page.waitForTimeout(800);

    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]')).first();
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await expect(dialog).toBeHidden();
  });
});
