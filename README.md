# IoT Dashboard

Factory-floor IIoT monitoring dashboard for shoe-manufacturing production lines. Built with React 19 + TypeScript (frontend) and .NET 9 C# (backend), featuring real-time SSE push, UCL/LCL alerting, and a pluggable protocol adapter system (Modbus TCP, WebAPI, Push, IoT Receiver shared-DB).

## Architecture

```
Modbus PLC (gateway 192.168.62.74)
  └─ ModbusTcpAdapter poll (every 2s)
       └─ DataIngestionService → SensorReadings → SSE → React tile

Vendor PLC (厚信)
  └─ POST /api/v1/... → IoTReceiverAPI (port 5101, sister service)
       └─ writes shared DB wide tables (PressingMachineRealTimeData, VisualMarkingMachineRealTimeData)
            └─ IoTReceiverDbAdapter poll (every 2s, raw SQL whitelist)
                 └─ DataIngestionService → SensorReadings → SSE → React tile
```

**Frontend:** React 19, TypeScript 5.8, Tailwind CSS 4, Vite 6, Recharts
**Backend:** .NET 9, EF Core 9, SQL Server, OpenTelemetry, FluentModbus, SSE
**Adapters:** `modbus_tcp`, `web_api`, `push_ingest`, `iot_receiver_db`

## Key features

- Real-time SSE push from all four adapters into a unified dashboard
- UCL / LCL editor with per-sensor alert thresholds; WeChat push alerts
- Visualization tiles: `single_kpi`, `dual_side_spark`, `four_rings`, `molding_matrix`, `custom_grid`, `pressing_machine_lr`, `visual_marking_machine`
- DrillDown trend modal (1h / 4h / 24h history with LTTB downsampling)
- Connection health watchdog + per-connection consecutive-error alerts
- FAS asset metadata integration (assetCode → assetName / department)
- Multi-language UI (zh-TW / zh-CN / EN)
- Light / dark theme, fullscreen mode, drag-to-reorder equipments

## Run locally

**Prerequisites:** Node.js 22 LTS, .NET 9 SDK, SQL Server (LocalDB or full)

### Backend (port 5200)

```bash
cd backend
dotnet run
```

Swagger UI at `http://localhost:5200/swagger` (development mode).
Health probe at `http://localhost:5200/health`.

### Frontend (port 5173 — Vite default)

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api/*` to the backend on `:5200`. Open `http://localhost:5173`.

## Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Production build to `frontend/dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Vitest + RTL test suite |

## Backend API endpoints

After Phase 2-4 of the 2026-05-26 spec, the self-service device-provisioning surface (wizard, gating, PLC template, register map, device CRUD) has been removed. Surviving endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | `{ status, service, timestamp }` |
| `/api/stream` | GET | SSE real-time data stream |
| `/api/history/{assetCode}` | GET | Historical data with LTTB downsampling |
| `/api/alerts` | GET | Alert records (paginated) |
| `/api/alerts/{id}/acknowledge` | POST | Acknowledge an alert |
| `/api/limits/{assetCode}` | GET / PUT | UCL/LCL limit settings |
| `/api/line-configs` | GET / POST / PUT / DELETE | Production line layout |
| `/api/equipment-types` | GET | EquipmentType + sensors (read-only) |
| `/api/property-types` | GET | PropertyType catalog (read-only) |
| `/api/device-connections` | GET | DeviceConnection list (read-only) |
| `/api/diagnostics/polling` | GET | Polling service diagnostics + connection health |
| `/api/fas/validate/{assetCode}` | GET | Validate asset code via FAS |
| `/api/maintenance/stats` | GET | DB row counts |
| `/api/maintenance/sensor-readings` | DELETE | Purge old readings (keepDays ≥ 7) |
| `/api/maintenance/alerts` | DELETE | Purge acknowledged alerts (keepDays ≥ 30) |
| `/api/data/ingest` | POST | Push-mode sensor data (rate limited 20/10s) |

## Adding a new device

There is no UI wizard anymore. Engineers add devices via the CLI seeder or by extending `DeviceSeeder.cs`:

```bash
dotnet run --project backend -- seed-pressing-machine <assetCode> "<displayName>" <lineConfigId>
dotnet run --project backend -- seed-marking-machine  <assetCode> "<displayName>" <lineConfigId>
```

Production auto-seeds the pressing + visual-marking devices on startup via `Program.cs` (idempotent — see the `FactoryAutoSeed` block).

For brand-new equipment types, add a corresponding `EquipmentType` seed method + frontend tile component in `frontend/src/components/visualizations/` and register it in `EquipmentCard.tsx`.

## CI/CD

GitLab CI/CD pipeline runs on `192.168.100.71` (project `keith.lee/iotcontrol`) using a shared shell-executor runner on the production host `192.168.6.23`. Each push to `main` runs:

```
test → build-frontend → build-backend → deploy → verify
```

`deploy` does `sc stop IoTDashboard` → robocopy `publish-out/` → `sc start IoTDashboard`. `verify` hits `/health` + `/api/line-configs` (Content-Type checked to defeat the SPA-fallback false-positive) and `/api/diagnostics/polling` to assert the background poller is alive.

Pipeline yaml: `.gitlab-ci.yml`.

## Production deployment

Self-hosted single-port Kestrel: serves both API and the built SPA on `192.168.6.23:5200`. The `IncludeFrontendDistInPublish` MSBuild target copies `frontend/dist/` into `wwwroot/` inside the publish output. Service name `IoTDashboard`, LocalSystem account.

End-to-end Windows Server steps (firewall, SQL bootstrap, sysadmin grant, service install): see [`docs/deployment/windows-server-self-hosted.md`](docs/deployment/windows-server-self-hosted.md).

### Cross-service rules (IoT-Dashboard ↔ IoTReceiverAPI)

Both services share `localhost / IoTControlChart` SQL Server on `192.168.6.23`:

- IoT-Dashboard **does not** add `PressingMachineRealTimeData` / `VisualMarkingMachineRealTimeData` / `AssetCodeAndPlantView` / `AssetSyncLog` / `IoTErrorLog` to its `DbContext` — those are IoTReceiverAPI's. Adding them would cause EF Core to fight over schema ownership.
- IoT-Dashboard reads those two wide tables via raw SQL through `IIoTReceiverDataSource` (table-name whitelist enforced).
- EF migrations are NOT used: schema management is via `EnsureCreatedAsync` + idempotent T-SQL in `Program.cs` startup.

## Project conventions

- C# files ≤ 300 lines, React files ≤ 250 lines
- All Services are Singleton
- DTOs are `record`s, not classes
- Controller primary constructor: `Controller(IDbContextFactory<IoTDbContext> dbFactory)`
- Adapters never throw — return `Result<T>.Fail(ErrorKind, message)`

See [`CLAUDE.md`](CLAUDE.md) for the full convention guide.
