import AxeBuilder from '@axe-core/playwright';
import { test, expect, loadDashboard, switchToTrendView } from './helpers';

/**
 * Accessibility scans via axe-core. We fail on `critical` and `serious`
 * impact levels — `moderate`/`minor` are reported but not treated as hard
 * regressions (industry consensus for legacy SPAs entering a11y journey).
 *
 * Previously had `color-contrast` filtered as a known issue (28 nodes in
 * LimitsSettingsModal + 1 in trend view). Fixed in commit 8564ffe by
 * bumping --accent-red from #FF1744 to #FF3D5C and dropping opacity-60
 * on sensor-id badges. Filter now removed so future regressions trip.
 */

const ACCEPTABLE_IMPACTS: Array<'critical' | 'serious'> = ['critical', 'serious'];

function blockingViolations(violations: Array<{ id: string; impact: string | undefined; help: string; nodes: unknown[] }>) {
  return violations.filter((v) =>
    ACCEPTABLE_IMPACTS.includes((v.impact as 'critical' | 'serious') ?? 'minor')
  );
}

test.describe('Accessibility (H1-H4)', () => {
  test('H1 — dashboard passes critical+serious axe scan', async ({ page }) => {
    await loadDashboard(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blockers = blockingViolations(results.violations);
    expect(
      blockers,
      'critical/serious a11y violations:\n' +
        blockers.map((b) => `  - ${b.id}: ${b.help} (${b.nodes.length} nodes)`).join('\n')
    ).toEqual([]);
  });

  test('H2 — trend view passes critical+serious axe scan', async ({ page }) => {
    await loadDashboard(page);
    await switchToTrendView(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blockers = blockingViolations(results.violations);
    expect(
      blockers,
      'trend-view critical/serious a11y:\n' +
        blockers.map((b) => `  - ${b.id}: ${b.help} (${b.nodes.length} nodes)`).join('\n')
    ).toEqual([]);
  });

  test('H3 — modal passes critical+serious axe scan when open', async ({ page }) => {
    await loadDashboard(page);

    // Open limits modal.
    const limitsBtn = page
      .locator('[title*="UCL"], [title*="LCL"], [title*="限值"], [title*="Limit" i]')
      .or(page.getByRole('button', { name: /limit|限值/i }))
      .first();
    test.skip((await limitsBtn.count()) === 0, 'limits button not found');
    await limitsBtn.click();
    await page.waitForTimeout(800);

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blockers = blockingViolations(results.violations);
    expect(
      blockers,
      'modal critical/serious a11y:\n' +
        blockers.map((b) => `  - ${b.id}: ${b.help} (${b.nodes.length} nodes)`).join('\n')
    ).toEqual([]);
  });

  test('H4 — all top-bar buttons have an accessible name', async ({ page }) => {
    await loadDashboard(page);

    // Read everything in one page.evaluate so we don't pay round-trip cost
    // per button AND can filter on `getBoundingClientRect()` synchronously
    // (the previous Playwright-side `boundingBox()` loop timed out on hidden
    // buttons that take >10s to resolve their box).
    const namelessButtons = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]) {
        const r = el.getBoundingClientRect();
        // Only consider visible buttons in the top 120px of the viewport.
        if (r.width === 0 || r.height === 0 || r.y > 120) continue;
        const name =
          el.getAttribute('aria-label')
          ?? el.getAttribute('title')
          ?? (el.textContent ?? '').trim();
        if (!name || name.length === 0) {
          out.push(el.outerHTML.slice(0, 150));
        }
      }
      return out;
    });

    expect(
      namelessButtons,
      'top-bar buttons missing aria-label/title/text:\n' + namelessButtons.join('\n')
    ).toEqual([]);
  });
});
