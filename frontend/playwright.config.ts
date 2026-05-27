import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e config — runs against prod by default so tests cover real
 * data flowing from IoTReceiverAPI / Modbus polling. Override with
 * `E2E_BASE_URL=http://localhost:5173` for local dev runs.
 *
 * Specs live under `e2e/` (sibling to `src/`). Test files end in `.spec.ts`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false, // SSE streams + shared backend state → sequential is safer
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://192.168.6.23:5200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // SSE long-poll never goes idle; use `domcontentloaded` everywhere.
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
});
