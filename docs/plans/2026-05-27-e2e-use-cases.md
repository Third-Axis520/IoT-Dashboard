# E2E Coverage — Use Case Catalog (2026-05-27)

Comprehensive Playwright e2e coverage for IoT-Dashboard. Tests target prod
(`http://192.168.6.23:5200`) for real data flow; override via
`E2E_BASE_URL` for local runs.

Grouped by feature area. ~40 cases. Each line is one `test('...')`.

---

## A. Dashboard smoke (`dashboard.spec.ts`)

| # | Case | Asserts |
|---|------|---------|
| A1 | Dashboard loads at `/` without console errors | `pageErrors.length === 0` |
| A2 | `/health` returns `{ status: ok, service: IoTDashboard }` | JSON shape |
| A3 | `/api/diagnostics/polling` shows ≥6 active connections, `isRunning=true` | JSON |
| A4 | AppToolbar visible with line selector | `getByRole('button', { name: /C 棟 LeanA/ })` |
| A5 | AppToolbar shows view toggle (dashboard / trend) | both buttons present |
| A6 | AppToolbar **does NOT** show「增加產線」(regression) | `getByText` count = 0 |
| A7 | 6 equipment tiles rendered | DOM count matches `/api/line-configs` |
| A8 | ConnectionHealthBadge visible | role=button or aria-label |

## B. Visualization tiles by VisType (`visualizations.spec.ts`)

| # | Case | Asserts |
|---|------|---------|
| B1 | `single_kpi` (加硫機 / 冷凍機) renders big numeric value | numeric text + `.tabular-nums` |
| B2 | `dual_side_spark` (烘箱) renders ≥2 values | multiple value nodes |
| B3 | `four_rings` (冷熱定型機) renders 4 gauge cells | 4 `.gauge` or 4 sensor name labels |
| B4 | `pressing_machine_lr` (壓合機) renders L/R 2-col layout | "左側" + "右側" labels |
| B5 | `visual_marking_machine` (劃線機) renders single pressure value | 1 large numeric |

## C. FourRings new design (`four-rings.spec.ts`)

| # | Case | Asserts |
|---|------|---------|
| C1 | 4 gauge cells visible inside 冷熱定型機 tile | count = 4 |
| C2 | Each cell shows: name + value + unit + LCL/UCL labels | text content per cell |
| C3 | Gauge marker is positioned proportional to value | computed `left` style ∈ [0%, 100%] |
| C4 | Value color reflects status (green/yellow/red) | CSS color |
| C5 | When value > UCL, delta label `+X.X<unit> ▸` visible | regex match |
| C6 | When value < LCL, delta label `◂ X.X<unit>` visible (skip if no such data) | skip-on-data |
| C7 | Out-of-band marker has `animate-pulse` class | DOM class check |

## D. TempTrendsView grouping (`trend-view.spec.ts`)

| # | Case | Asserts |
|---|------|---------|
| D1 | Trend toggle switches to trend view | URL or DOM state change |
| D2 | Each equipment renders as a section with header | section role + h3 |
| D3 | Section header shows name + deviceId badge + N points | text content |
| D4 | Grid never exceeds 4 columns at xl viewport | computed grid-template-columns |
| D5 | Single-point equipments span 2 cols at md+ | width compared to multi-card row |
| D6 | Alert dock visible at bottom | bottom panel locator |
| D7 | Alert dock height changes when drag handle dragged | height delta ≥ 30px |

## E. Modal interactions (`modals.spec.ts`)

| # | Case | Asserts |
|---|------|---------|
| E1 | Click a sensor → DrillDownModal opens | dialog role |
| E2 | DrillDown shows 1h/4h/24h time range buttons | 3 buttons |
| E3 | LimitsSettingsModal opens via toolbar Limits button | dialog |
| E4 | LimitsSettingsModal has UCL/LCL number inputs per sensor | input count > 0 |
| E5 | LimitsSettingsModal **does NOT** have gating section (regression) | no `gating` text |
| E6 | LimitsSettingsModal **does NOT** have sensor add panel (regression) | no `SensorAddPanel` markers |
| E7 | Closing modal returns focus to opener button | accessibility |

## F. SSE live data (`sse.spec.ts`)

| # | Case | Asserts |
|---|------|---------|
| F1 | A modbus sensor value changes within 10s of mount | poll value, compare snapshots |
| F2 | iot_receiver_db sensor value changes within 10s | same |
| F3 | Connection health badge stays `healthy` over 10s | no state regression |

## G. Theme + i18n (`theme-language.spec.ts`)

| # | Case | Asserts |
|---|------|---------|
| G1 | Theme toggle switches between dark and light class | `<html>` or body class |
| G2 | Theme persists across reload via localStorage | reload + assert |
| G3 | Language switcher present in toolbar | locator |
| G4 | Switching to English changes UI labels (`儀表板` → `Dashboard`) | text change |

## H. Accessibility (`a11y.spec.ts`)

| # | Case | Asserts |
|---|------|---------|
| H1 | Dashboard passes axe-core scan (no critical/serious violations) | AxeBuilder.analyze() |
| H2 | Trend view passes axe-core scan | same |
| H3 | LimitsSettingsModal passes axe-core scan when open | same |
| H4 | All toolbar buttons have accessible name | `getByRole('button')` all have name |

## I. Stripped-API regression (`stripped-api.spec.ts`)

Phase 2-4 removed many controllers; SPA fallback should serve `index.html` (status 200 with HTML) for the removed paths, NOT the old JSON responses. These tests catch a regression if someone accidentally restores a controller.

| # | Case | Asserts |
|---|------|---------|
| I1 | `GET /api/discovery` returns HTML (SPA fallback) | response content-type |
| I2 | `GET /api/sensor-gating` returns HTML | same |
| I3 | `GET /api/protocols` returns HTML | same |
| I4 | `GET /api/plc-templates` returns HTML | same |
| I5 | `GET /api/register-map` returns HTML | same |
| I6 | `GET /api/line-configs` returns JSON (still alive) | content-type application/json |
| I7 | `GET /api/diagnostics/polling` returns JSON with `polling.isRunning` | shape check |

---

## Mutation tests — DEFERRED

Tests that **modify prod state** (UCL/LCL edit, alert ack) are skipped in this
pass with `test.skip` + inline TODO. Acceptable for read-only baseline; pick
up when there's a dedicated dev DB or restore-after pattern.

## Total

~40 tests across 9 spec files. Time budget: ~2-3 hours including iteration.

## Selector strategy

Per skill guide: `getByRole > getByText > getByLabel > getByTestId > CSS`.
`data-testid` only added when nothing else works AND change is justified.

## Mandatory practices observed

- ✅ `page.on('pageerror')` wired via `helpers.ts` test fixture
- ✅ Tests assert outcomes after user actions (behavior, not implementation)
- ✅ axe-core a11y assertions on every view
- ✅ Skipped tests have `test.skip` + inline TODO explaining unblock
