# IoT Dashboard — AI Maintenance Guide

## What this project is
工廠 IoT 監控儀表板。.NET 9 後端 + React 19 前端 + SQL Server。從 PLC 收集資料，
顯示在儀表板上，超過閾值產生告警，透過 SSE 即時推送給瀏覽器。

## Tech stack
- Backend: .NET 9, EF Core 9, ASP.NET Core, OpenTelemetry, FluentModbus
- Frontend: React 19, TypeScript 5.8, Vite 6, Tailwind 4, Recharts
- Database: SQL Server (LocalDB for dev)
- Test: xUnit + FluentAssertions (backend), Vitest + RTL (frontend)

## Before you change anything
1. 讀 `docs/superpowers/specs/` 下相關 spec
2. 讀要改的資料夾的 `README.md`
3. 跑既有測試確認當前狀態：`dotnet test backend/Tests/` 和 `cd frontend && npm test`

## Folder map
- `backend/Adapters/` — 協議插件 (Modbus/WebAPI/Push)
- `backend/Controllers/` — HTTP 端點
- `backend/Services/` — 業務邏輯 (全部 Singleton)
- `backend/Models/Entities.cs` — 既有 entity (勿再擴充)
- `backend/Models/Entities/` — 新 entity (一檔一類)
- `backend/Dtos/` — DTO 集中
- `backend/Tests/` — xUnit tests，鏡像 src 結構
- `frontend/src/components/modals/DeviceIntegrationWizard/` — 設備整合精靈
- `frontend/src/components/ui/` — 共用 UI (Toast/ConfirmModal/...)
- `frontend/src/lib/` — API 呼叫 helper
- `frontend/src/hooks/` — 共用 React hook

## Common tasks

### Add a new protocol adapter
See `backend/Adapters/README.md` — 複製 `_Template.cs`，rename，實作 3 個方法，
在 Program.cs 註冊 `services.AddSingleton<IProtocolAdapter, YourAdapter>();`

### Add a new API endpoint
1. 決定屬於哪個 Controller (或新建)
2. 定義 DTO 在 `backend/Dtos/{Resource}Dtos.cs`
3. 實作 action method (用 Primary Constructor 注入 IDbContextFactory)
4. 寫對應的 controller test
5. 更新 `frontend/src/lib/api{Resource}.ts`

### Add a new wizard step
See `frontend/src/components/modals/DeviceIntegrationWizard/README.md`

### Configure sensor gating (conditional sampling)

When a sensor should only record readings while another DI sensor is true (photo-eye style):

1. Both sensors must be configured in the system (each on its DeviceConnection / EquipmentType)
2. Open `LimitsSettingsModal` for the gated sensor's AssetCode
3. Expand the "條件採樣" section under that sensor's row
4. Pick the gating source from the dropdown (cross-AssetCode allowed)
5. Adjust DelayMs / MaxAgeMs as needed (defaults work for most cases)
6. Save — change is effective on next polling tick

See `docs/superpowers/specs/2026-04-27-sensor-gating-design.md` for design rationale and the A1+B1 coexistence with `material_detect`.

## Conventions
- C# 檔案 ≤ 300 行，React 檔案 ≤ 250 行，超過拆檔
- Controller primary constructor: `Controller(IDbContextFactory<IoTDbContext> dbFactory)`
- 所有 Service 都是 Singleton
- DTO 用 `record` 不用 `class`
- 命名:
  - Entity: `{Name}` (e.g. `PropertyType`)
  - DTO read: `{Name}Dto`
  - DTO request: `Save{Name}Request`
  - Controller: `{Name}Controller`
  - Adapter: `{Protocol}Adapter`
  - React Modal: `{Name}Modal.tsx`
  - Hook: `use{Name}.ts`
  - API helper: `api{Resource}.ts`

## Do not
- 不要往 `Models/Entities.cs` 加新東西 (已接近 300 行)
- 不要改 `IProtocolAdapter` 介面 (影響所有 adapter)
- 不要用 localStorage 存設定資料 (用後端 API)
- 不要硬編碼 SensorId (例如 40013)，用 PropertyType.Behavior 查
- 不要 throw 在 Adapter 內部 (用 Result<T>)

## Key documents
- `docs/superpowers/specs/` — 設計規格
- `docs/superpowers/plans/` — 實作計畫
