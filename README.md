# IoT Dashboard

A high-fidelity IIoT process control dashboard for factory floor monitoring. Built with React 19 + TypeScript (frontend) and .NET 9 C# (backend), featuring real-time SSE push, PLC register mapping, UCL/LCL alerting, and shoe-material presence detection.

## Architecture

```
PLC → OvenDataReceive → POST /api/data/ingest
  → DataIngestionService (HasMaterial detection, alert generation)
  → SQL Server (SensorReadings, SensorAlerts)
  → SSE push → React Dashboard
```

**Frontend:** React 19, TypeScript, Tailwind CSS 4, Vite 6, Recharts  
**Backend:** .NET 9, EF Core 9, SQL Server, SSE  
**Key features:** Real-time monitoring, PLC template system, register map, UCL/LCL limits, shoe-material presence (reg 40013), LTTB downsampling, OpenTelemetry

## Run Locally

**Prerequisites:** Node.js v18+, .NET 9 SDK, SQL Server

### Backend (port 5200)

```bash
cd backend
dotnet run
```

API available at `http://localhost:5200`  
Swagger UI at `http://localhost:5200/swagger` (development mode)

### Frontend (port 3000)

**Prerequisites:** Node.js (v18+)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) Create a `.env.local` file for environment variables:
   ```bash
   cp .env.example .env.local
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run clean` | Remove `dist/` directory |
| `npm run lint` | TypeScript type-checking (strict mode) |

## Backend API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/data/ingest` | Receive PLC sensor data (rate limited: 20 req/10s) |
| `GET /api/stream` | SSE real-time data stream |
| `GET /api/history/{assetCode}` | Historical data with LTTB downsampling |
| `GET /api/alerts` | Alert records (paginated) |
| `POST /api/alerts/{id}/acknowledge` | Acknowledge an alert |
| `GET/PUT /api/limits/{assetCode}` | UCL/LCL limit settings |
| `GET/POST/DELETE /api/register-map/{lineId}` | PLC register mapping |
| `GET/POST/PUT/DELETE /api/plc-templates` | PLC model templates |
| `GET/POST/PUT/DELETE /api/devices` | Device registration & binding |
| `GET /api/fas/validate/{assetCode}` | Validate asset code via FAS |
| `GET /api/maintenance/stats` | DB row counts |
| `DELETE /api/maintenance/sensor-readings` | Purge old readings (keepDays≥7) |
| `DELETE /api/maintenance/alerts` | Purge acknowledged alerts (keepDays≥30) |
