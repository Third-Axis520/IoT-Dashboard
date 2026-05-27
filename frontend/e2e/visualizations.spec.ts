import { test, expect, loadDashboard } from './helpers';

test.describe('Visualization tiles by VisType (B1-B5)', () => {
  // Helper — get the list of (visType, name) from API.
  async function visTypeIndex(page: import('@playwright/test').Page) {
    return page.evaluate(async () => {
      const r = await fetch('/api/line-configs');
      const lines = (await r.json()) as Array<{
        equipments: Array<{ displayName: string | null; equipmentType: { name: string; visType: string } }>;
      }>;
      return lines.flatMap((l) =>
        l.equipments.map((e) => ({
          name: e.displayName ?? e.equipmentType.name,
          visType: e.equipmentType.visType,
        }))
      );
    });
  }

  test('B1 — single_kpi tile renders large numeric value with tabular-nums', async ({ page }) => {
    await loadDashboard(page);
    const tiles = await visTypeIndex(page);
    const singleKpi = tiles.filter((t) => t.visType === 'single_kpi');
    test.skip(singleKpi.length === 0, 'no single_kpi tiles in current line config');

    for (const t of singleKpi) {
      const tileHeader = page.getByText(t.name, { exact: false }).first();
      await expect(tileHeader).toBeVisible();
      // Big numeric: look for any element styled with tabular-nums or font-mono
      // anywhere in the document — single_kpi has exactly one giant value.
      const bigValue = page.locator('.tabular-nums, .font-mono').first();
      await expect(bigValue).toBeVisible();
    }
  });

  test('B2 — dual_side_spark tile renders multiple sensor values', async ({ page }) => {
    await loadDashboard(page);
    const tiles = await visTypeIndex(page);
    const dual = tiles.find((t) => t.visType === 'dual_side_spark');
    test.skip(!dual, 'no dual_side_spark tile in current line config');

    await expect(page.getByText(dual!.name, { exact: false }).first()).toBeVisible();
    // dual_side_spark renders 2+ sensor values in a stacked/grid layout —
    // at minimum we expect 2 numeric value nodes on the page.
    const numericValues = await page.locator('.tabular-nums, .font-mono').count();
    expect(numericValues).toBeGreaterThanOrEqual(2);
  });

  test('B3 — four_rings tile renders 4 gauge cells', async ({ page }) => {
    await loadDashboard(page);
    const tiles = await visTypeIndex(page);
    const four = tiles.find((t) => t.visType === 'four_rings');
    test.skip(!four, 'no four_rings tile in current line config');

    await expect(page.getByText(four!.name, { exact: false }).first()).toBeVisible();
    // FourRings uses a 2-col grid with 4 GaugeCell children. Each cell has
    // a name label + value + LCL/UCL footer. Look for the LCL/UCL "0" + "110"
    // type number pair which only appears in gauges.
    // Use the API to read sensor names + locate each as a tile-row.
    const sensorNames = await page.evaluate(async (eqName) => {
      const r = await fetch('/api/line-configs');
      const lines = (await r.json()) as Array<{
        equipments: Array<{ displayName: string | null; equipmentType: { name: string; sensors: Array<{ label: string }> } }>;
      }>;
      const eq = lines
        .flatMap((l) => l.equipments)
        .find((e) => (e.displayName ?? e.equipmentType.name) === eqName);
      return eq?.equipmentType.sensors.map((s) => s.label) ?? [];
    }, four!.name);

    expect(sensorNames.length).toBeGreaterThanOrEqual(4);
    for (const s of sensorNames.slice(0, 4)) {
      await expect(page.getByText(s, { exact: false }).first()).toBeVisible();
    }
  });

  test('B4 — pressing_machine_lr renders L/R 2-col layout', async ({ page }) => {
    await loadDashboard(page);
    const tiles = await visTypeIndex(page);
    const pressing = tiles.find((t) => t.visType === 'pressing_machine_lr');
    test.skip(!pressing, 'no pressing_machine_lr tile in current line config');

    await expect(page.getByText(pressing!.name, { exact: false }).first()).toBeVisible();
    // Tile body has explicit "左側" + "右側" labels for column headers.
    await expect(page.getByText('左側', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('右側', { exact: false }).first()).toBeVisible();
  });

  test('B5 — visual_marking_machine renders single large pressure value', async ({ page }) => {
    await loadDashboard(page);
    const tiles = await visTypeIndex(page);
    const marking = tiles.find((t) => t.visType === 'visual_marking_machine');
    test.skip(!marking, 'no visual_marking_machine tile in current line config');

    await expect(page.getByText(marking!.name, { exact: false }).first()).toBeVisible();
    // Tile shows label "壓力" (pressure) by spec.
    await expect(page.getByText(/壓力|Pressure/i).first()).toBeVisible();
  });
});
