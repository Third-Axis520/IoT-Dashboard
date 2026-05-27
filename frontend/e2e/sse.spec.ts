import { test, expect, loadDashboard } from './helpers';

test.describe('SSE live data flow (F1-F3)', () => {
  test('F1 — at least one sensor value changes within 12s of mount', async ({ page }) => {
    await loadDashboard(page);

    // Snapshot all numeric values on screen.
    async function snapshot(): Promise<string[]> {
      return page.evaluate(() =>
        Array.from(document.querySelectorAll('.tabular-nums, .font-mono'))
          .map((el) => (el as HTMLElement).textContent ?? '')
          .filter((s) => /^[\-+\d.]/.test(s))
      );
    }

    const before = await snapshot();
    expect(before.length, 'expected ≥ 3 numeric values on dashboard mount').toBeGreaterThan(3);

    // Poll up to 12s for ANY value to change.
    await expect
      .poll(
        async () => {
          const now = await snapshot();
          // Compare element-wise; return true if any index changed.
          return now.some((v, i) => before[i] !== undefined && v !== before[i]);
        },
        { timeout: 12_000, intervals: [1000, 1000, 1000, 1500, 2000, 2500] }
      )
      .toBe(true);
  });

  test('F2 — polling diagnostics shows all 6 connections healthy over time', async ({ request }) => {
    // Hit /api/diagnostics/polling twice with 6s gap; expect both healthy.
    const first = await request.get('/api/diagnostics/polling');
    const a = await first.json();
    expect(a.polling.activeConnections).toBeGreaterThanOrEqual(6);
    expect(a.connections.every((c: { status: string }) => c.status === 'healthy')).toBe(true);

    await new Promise((r) => setTimeout(r, 6000));

    const second = await request.get('/api/diagnostics/polling');
    const b = await second.json();
    expect(b.polling.activeConnections).toBeGreaterThanOrEqual(6);
    expect(b.connections.every((c: { status: string }) => c.status === 'healthy')).toBe(true);

    // lastPollAt should advance for at least one Modbus connection.
    const moved = a.connections.some((aConn: { id: number; lastPollAt: string }) => {
      const bConn = b.connections.find((bc: { id: number }) => bc.id === aConn.id);
      return bConn && aConn.lastPollAt !== bConn.lastPollAt;
    });
    expect(moved, 'no connection lastPollAt advanced over 6s — polling may be stuck').toBe(true);
  });

  test('F3 — connection health badge does not regress to error over 5s', async ({ page, pageErrors }) => {
    await loadDashboard(page);
    await page.waitForTimeout(5000);
    expect(pageErrors, `unexpected console errors over 5s: ${pageErrors.join('\n')}`).toEqual([]);
  });
});
