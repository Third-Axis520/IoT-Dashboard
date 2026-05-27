import { test, expect } from './helpers';

/**
 * Phase 2-4 of the 2026-05-26 spec removed 6 self-service controllers. After
 * deletion the routes fall through to MapFallbackToFile and Kestrel serves
 * the SPA shell (HTML, 200). These tests catch a regression — if someone
 * accidentally restores one of the removed controllers, the response shape
 * here would change back to JSON.
 *
 * Conversely, surviving controllers must keep returning JSON.
 */

const REMOVED_ROUTES = [
  '/api/discovery',
  '/api/sensor-gating',
  '/api/protocols',
  '/api/plc-templates',
  '/api/register-map',
  '/api/devices',
];

const KEPT_ROUTES = [
  '/health',
  '/api/line-configs',
  '/api/equipment-types',
  '/api/property-types',
  '/api/diagnostics/polling',
];

test.describe('Stripped controller regression (I1-I7)', () => {
  for (const route of REMOVED_ROUTES) {
    test(`removed route ${route} now falls through to SPA (HTML)`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(200);
      const contentType = res.headers()['content-type'] ?? '';
      expect(
        contentType,
        `${route} should serve SPA HTML (text/html) — JSON response means controller was restored`
      ).toMatch(/text\/html/);

      const body = await res.text();
      expect(body).toContain('<!doctype html>');
    });
  }

  for (const route of KEPT_ROUTES) {
    test(`kept route ${route} still returns JSON`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(200);
      const contentType = res.headers()['content-type'] ?? '';
      expect(
        contentType,
        `${route} should return application/json — HTML means controller is broken`
      ).toMatch(/application\/json/);
    });
  }

  test('iot_receiver_db protocol is registered (4 adapters total)', async ({ request }) => {
    // /api/protocols is gone, but /api/diagnostics/polling lists every active
    // connection — count the distinct protocols there.
    const res = await request.get('/api/diagnostics/polling');
    const body = await res.json();
    const protocols = new Set(body.connections.map((c: { protocol: string }) => c.protocol));
    expect(protocols.has('modbus_tcp'), 'modbus_tcp missing').toBe(true);
    expect(protocols.has('iot_receiver_db'), 'iot_receiver_db missing').toBe(true);
  });
});
