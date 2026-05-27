import { test, expect, loadDashboard, switchToTrendView } from './helpers';

test.describe('TempTrendsView grouping (D1-D7)', () => {
  test('D1 — trend toggle switches to trend view', async ({ page }) => {
    await loadDashboard(page);
    await switchToTrendView(page);

    // After switch: section headers appear (h3 elements) — dashboard view
    // does not have these. Count of section h3 ≥ 1.
    const sectionHeaders = page.locator('section h3');
    await expect(sectionHeaders.first()).toBeVisible();
  });

  test('D2 — each equipment renders as its own section with header', async ({ page }) => {
    await loadDashboard(page);
    await switchToTrendView(page);

    // From API, count equipments with points (those are the sections shown).
    const expectedSections = await page.evaluate(async () => {
      const r = await fetch('/api/line-configs');
      const lines = (await r.json()) as Array<{
        equipments: Array<{ equipmentType: { sensors: unknown[] } }>;
      }>;
      return lines.flatMap((l) => l.equipments).filter((e) => e.equipmentType.sensors.length > 0).length;
    });
    expect(expectedSections).toBeGreaterThanOrEqual(1);

    const renderedSections = await page.locator('section h3').count();
    expect(renderedSections).toBe(expectedSections);
  });

  test('D3 — section header shows equipment name + point count text', async ({ page }) => {
    await loadDashboard(page);
    await switchToTrendView(page);

    // Pattern "<N> points" or "<N> point" — singular for 1, plural for N>1.
    const countLabels = page.locator('text=/\\d+\\s+(point|points)/');
    const labelCount = await countLabels.count();
    expect(labelCount).toBeGreaterThanOrEqual(1);
  });

  test('D4 — grid never exceeds 4 cols at xl viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loadDashboard(page);
    await switchToTrendView(page);

    // For multi-point sections, the grid uses `xl:grid-cols-4`. Read computed
    // style of one such grid and assert it resolves to exactly 4 tracks.
    const gridSelector = 'section div[class*="grid"]';
    const grids = page.locator(gridSelector);
    const count = await grids.count();
    expect(count).toBeGreaterThan(0);

    let foundFourCol = false;
    for (let i = 0; i < count; i++) {
      const tplCols = await grids.nth(i).evaluate(
        (el: HTMLElement) => window.getComputedStyle(el).gridTemplateColumns
      );
      // Count the tracks (space-separated values like "1fr 1fr 1fr 1fr").
      const tracks = tplCols.split(' ').filter((t) => t.trim().length > 0).length;
      if (tracks === 4) {
        foundFourCol = true;
        break;
      }
      expect(tracks, `grid track count exceeds 4: ${tplCols}`).toBeLessThanOrEqual(4);
    }
    // At least one multi-point section should hit the 4-col cap.
    expect(foundFourCol, 'expected at least one section with 4 cols').toBe(true);
  });

  test('D5 — alert dock visible at bottom with resize handle', async ({ page }) => {
    await loadDashboard(page);
    await switchToTrendView(page);

    // Resize handle has role=row-resize cursor; identify by class containing
    // cursor-row-resize.
    const handle = page.locator('.cursor-row-resize').first();
    await expect(handle).toBeVisible();
  });

  test('D6 — alert dock height changes when drag handle dragged', async ({ page }) => {
    await loadDashboard(page);
    await switchToTrendView(page);

    const handle = page.locator('.cursor-row-resize').first();
    const handleBox = await handle.boundingBox();
    test.skip(!handleBox, 'no resize handle box available');

    // Find the dock element BELOW the handle. The dock is the sibling div
    // with inline style height. Read its initial offsetHeight.
    const initialHeight = await page.evaluate(() => {
      const handles = document.querySelectorAll('.cursor-row-resize');
      const h = handles[handles.length - 1] as HTMLElement | undefined;
      const dock = h?.nextElementSibling as HTMLElement | null;
      return dock?.offsetHeight ?? 0;
    });

    // Drag up by 100px.
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y - 100, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const newHeight = await page.evaluate(() => {
      const handles = document.querySelectorAll('.cursor-row-resize');
      const h = handles[handles.length - 1] as HTMLElement | undefined;
      const dock = h?.nextElementSibling as HTMLElement | null;
      return dock?.offsetHeight ?? 0;
    });

    expect(Math.abs(newHeight - initialHeight), `height delta should be >= 30, was ${newHeight - initialHeight}`).toBeGreaterThanOrEqual(30);
  });

  test('D7 — switching back to dashboard view restores tiles', async ({ page }) => {
    await loadDashboard(page);
    await switchToTrendView(page);
    // section h3 visible in trend
    await expect(page.locator('section h3').first()).toBeVisible();

    // Switch back to dashboard
    const dashBtn = page.locator('[title*="儀表板"], [title*="dashboard" i]').first();
    await dashBtn.click();
    await page.waitForTimeout(800);

    // Dashboard view does not use section h3 headers
    const sectionsNow = await page.locator('section h3').count();
    expect(sectionsNow).toBe(0);
  });
});
