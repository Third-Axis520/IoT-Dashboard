# Device Integration Wizard — Implementation Plan Part 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete the Device Integration Wizard: API controllers, background polling, frontend wizard UI, management pages, and E2E wiring.

**Prerequisite:** Part 1 (Tasks 1-15) completed. 52 tests green. 3 adapters registered.

**Spec reference:** `docs/superpowers/specs/2026-04-11-device-integration-wizard-design.md`

**Conventions:** See `CLAUDE.md` at project root. TDD, ≤300 lines C# / ≤250 lines React.

---

## Phase Overview

| Phase | Tasks | Deliverable |
|-------|-------|------------|
| 5. Discovery API | 16 | GET /api/protocols + POST /api/discovery/scan |
| 6. DeviceConnection | 17-18 | Entity + CRUD + atomic provision endpoint |
| 7. Background Polling | 19-20 | ConnectionState + PollingBackgroundService |
| 8. Impact + SSE | 21-22 | ImpactAnalyzer + SSE config-updated broadcast |
| 9. Diagnostics | 23 | GET /api/diagnostics/polling |
| 10. Frontend Infra | 24-26 | apiClient + Toast + ConfirmModal + useConfigSync |
| 11. Wizard Core | 27-29 | WizardContext + DynamicForm + Wizard shell |
| 12. Wizard Steps | 30-33 | Step1-7 complete |
| 13. Management | 34-35 | API helpers + DeviceConnectionsModal |
| 14. Wiring + E2E | 36-37 | App.tsx entry + E2E integration test |

---

## Task Details

### Task 16: ProtocolsController + DiscoveryController + tests

**Files:**
- Create: `backend/Dtos/ProtocolDtos.cs`
- Create: `backend/Dtos/DiscoveryDtos.cs`
- Create: `backend/Controllers/ProtocolsController.cs`
- Create: `backend/Controllers/DiscoveryController.cs`
- Create: `backend/Tests/Controllers/ProtocolsControllerTests.cs`
- Create: `backend/Tests/Controllers/DiscoveryControllerTests.cs`

**Key decisions:**
- Both controllers inject `IEnumerable<IProtocolAdapter>` to access all registered adapters
- `GET /api/protocols` returns `List<ProtocolDto>` with id, displayName, capabilities, configSchema
- `POST /api/discovery/scan` takes `ScanRequest { protocol, config }`, returns `ScanResponse { success, points?, error? }`
- Scan has 10s CancellationTokenSource timeout
- Unknown protocol → 404; validation fail → 400; adapter fail → map ErrorKind to HTTP status
- Tests: list returns 3 protocols, scan success (need ModbusTestServerFixture), scan unknown protocol → 404

**Commit:** `feat: ProtocolsController + DiscoveryController with tests`

---

### Task 17: DeviceConnection entity + DDL

**Files:**
- Create: `backend/Models/Entities/DeviceConnection.cs`
- Modify: `backend/Data/IoTDbContext.cs` (DbSet + FK config)
- Modify: `backend/Program.cs` (DDL inside test guard)

**Entity fields:** Id, Name(200), Protocol(50), ConfigJson(max), PollIntervalMs(int?), IsEnabled(bool), LastPollAt(DateTime?), LastPollError(string?500), ConsecutiveErrors(int), EquipmentTypeId(int FK), CreatedAt

**FK:** DeviceConnection → EquipmentType, OnDelete SetNull (so deleting equipment doesn't cascade-delete the connection config)

**Commit:** `feat: DeviceConnection entity + DDL`

---

### Task 18: DeviceConnectionController + atomic provision + tests

**Files:**
- Create: `backend/Dtos/DeviceConnectionDtos.cs`
- Create: `backend/Controllers/DeviceConnectionController.cs`
- Create: `backend/Tests/Controllers/DeviceConnectionControllerTests.cs`

**Key endpoints:**
- `GET /api/device-connections` — list all (include EquipmentType name)
- `GET /api/device-connections/{id}` — detail (include EquipmentType + Sensors)
- `POST /api/device-connections` — **atomic provision**: create DeviceConnection + EquipmentType + Sensors in one transaction. Request shape: `{ name, protocol, config, pollIntervalMs, isEnabled, equipmentType: { name, visType, description, sensors: [...] } }`
- `PUT /api/device-connections/{id}` — edit name/config/pollInterval/isEnabled (NOT sensors)
- `DELETE /api/device-connections/{id}?cascade=true` — delete connection, optionally cascade to EquipmentType
- `POST /api/device-connections/{id}/test` — run adapter.DiscoverAsync with current config

**Tests:** 7-8 integration tests covering CRUD + atomic provision + test connection

**Commit:** `feat: DeviceConnectionController with atomic provision + tests`

---

### Task 19: ConnectionState + PollingBackgroundService

**Files:**
- Create: `backend/Services/ConnectionState.cs`
- Create: `backend/Services/ConnectionStateRegistry.cs`
- Create: `backend/Services/PollingBackgroundService.cs`
- Create: `backend/Services/PollingLogs.cs`
- Create: `backend/Tests/Services/ConnectionStateTests.cs`
- Modify: `backend/Program.cs` (AddHostedService)

**ConnectionState:** per-connection in-memory state tracking ConsecutiveErrors, NextPollAt, LastErrorKind. Methods: RecordSuccess(), RecordFailure(ErrorKind, msg), ScheduleNext(baseIntervalMs), ShouldSkip(). Circuit breaker: ≥3 errors → 30s slow retry.

**ConnectionStateRegistry:** `ConcurrentDictionary<int, ConnectionState>` wrapper. Injected as Singleton.

**PollingBackgroundService:** IHostedService. Every 1s: load enabled pull-mode DeviceConnections, for each: check ShouldSkip → adapter.PollAsync → convert to IngestPayload → DataIngestionService.ProcessAsync. Update DB (LastPollAt/LastPollError/ConsecutiveErrors).

**Key:** Poll results are converted to `IngestPayload` and fed into existing `DataIngestionService.ProcessAsync()`, reusing all alert/SSE/WeChat logic.

**Conversion:** For each entry in `PollResult.Values`, map `RawAddress → SensorId` using the connection's EquipmentType.Sensors (which have both RawAddress and SensorId).

**Tests:** 6 unit tests for ConnectionState (record success resets errors, backoff calculation, circuit breaker threshold, schedule next timing)

**Commit:** `feat: ConnectionState + PollingBackgroundService`

---

### Task 20: Polling integration test

**Files:**
- Create: `backend/Tests/Integration/PollingIntegrationTests.cs`

**Test:** Create DeviceConnection (modbus_tcp) + EquipmentType via API → start ModbusTestServer → wait up to 10s → verify SensorReadings appear in DB.

**Commit:** `test: polling integration test with in-memory Modbus server`

---

### Task 21: ImpactAnalyzer + integration

**Files:**
- Create: `backend/Services/ImpactAnalyzer.cs`
- Create: `backend/Dtos/ImpactDtos.cs`
- Create: `backend/Tests/Services/ImpactAnalyzerTests.cs`
- Modify: `backend/Controllers/PropertyTypeController.cs` (use ImpactAnalyzer in Delete)
- Modify: `backend/Controllers/DeviceConnectionController.cs` (use ImpactAnalyzer in Delete)
- Modify: `backend/Program.cs` (register Singleton)

**ImpactResult:** `{ requiresConfirmation, impact: { severity, title, message, affected } }`

**Flow:** Controller calls ImpactAnalyzer → if block/warning and no `?force=true` → return 409 with ImpactResult. With `?force=true` → proceed.

**Tests:** 4 tests (PropertyType in use → block, not in use → silent, DeviceConnection with EquipmentType on line → warning)

**Commit:** `feat: ImpactAnalyzer for cross-entity impact detection`

---

### Task 22: SSE config-updated broadcast

**Files:**
- Modify: `backend/Services/SseHub.cs` (add BroadcastConfigAsync method)
- Modify: `backend/Controllers/PropertyTypeController.cs` (inject SseHub, broadcast on CUD)
- Modify: `backend/Controllers/DeviceConnectionController.cs` (broadcast on CUD)
- Modify: `backend/Controllers/EquipmentTypeController.cs` (broadcast on CUD)
- Modify: `backend/Controllers/LineConfigController.cs` (broadcast on CUD)

**New SSE event:** `event: config-updated\ndata: {"entity":"property_type","id":5,"action":"updated"}`

**Commit:** `feat: SSE config-updated broadcast for cross-client sync`

---

### Task 23: DiagnosticsController

**Files:**
- Create: `backend/Dtos/DiagnosticsDtos.cs`
- Create: `backend/Controllers/DiagnosticsController.cs`
- Create: `backend/Tests/Controllers/DiagnosticsControllerTests.cs`

**Endpoint:** `GET /api/diagnostics/polling` → returns `{ polling: { isRunning, activeConnections, lastTickAt }, connections: [{ id, name, protocol, status, consecutiveErrors, lastPollAt, lastErrorMessage }] }`

**Reads from:** ConnectionStateRegistry + DeviceConnections DB

**Tests:** 2 tests (returns polling status, includes connection health)

**Commit:** `feat: DiagnosticsController for polling health`

---

### Task 24: apiClient.ts + ApiError

**Files:**
- Create: `frontend/src/lib/apiClient.ts`
- Create: `frontend/src/lib/__tests__/apiClient.test.ts`

**apiCall<T>(url, options):** unified fetch wrapper. Throws `ApiError` on non-ok response. ApiError has `response: { code, message, details }` + `status: number`.

**Tests:** 3 tests (success returns data, error throws ApiError, network error handled)

**Commit:** `feat: apiClient.ts unified fetch wrapper`

---

### Task 25: Toast + ConfirmModal + ImpactWarningBanner

**Files:**
- Create: `frontend/src/components/ui/Toast.tsx`
- Create: `frontend/src/hooks/useToast.ts`
- Create: `frontend/src/components/ui/ConfirmModal.tsx`
- Create: `frontend/src/components/ui/ImpactWarningBanner.tsx`

**Toast:** 4 levels (success/info/warning/error), auto-dismiss configurable, stacks vertically

**ConfirmModal:** generic confirm/cancel dialog, accepts title + message + onConfirm + onCancel

**ImpactWarningBanner:** persistent top banner showing connection failure count, links to management page

**Commit:** `feat: Toast + ConfirmModal + ImpactWarningBanner UI components`

---

### Task 26: useConfigSync hook

**Files:**
- Create: `frontend/src/hooks/useConfigSync.ts`
- Create: `frontend/src/hooks/__tests__/useConfigSync.test.ts`

**Hook:** Listens to existing SSE `/api/stream` for `config-updated` events. Calls provided callback with `(entity, id, action)`. Consumers use this to refetch relevant data.

**Tests:** 2 tests (fires callback on config-updated event, ignores other event types)

**Commit:** `feat: useConfigSync hook for SSE config change listening`

---

### Task 27: WizardContext (pure reducer) + tests

**Files:**
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/WizardContext.tsx`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/__tests__/WizardContext.test.ts`

**State shape:** `{ step: 1-7, protocol: string|null, config: Record<string,string>, connectionName: string, discoveryPoints: DiscoveredPoint[], selectedPointIndices: Set<number>, labels: Map<number, { name, propertyTypeId, unit }>, equipmentName: string, visType: string, description: string, error: string|null }`

**Actions:** SELECT_PROTOCOL, UPDATE_CONFIG, SET_CONNECTION_NAME, SET_DISCOVERY_RESULT, TOGGLE_POINT, SET_LABEL, SET_EQUIPMENT_INFO, NEXT_STEP, PREV_STEP, RESET

**Tests:** 10 tests covering all state transitions, validation (can't advance without protocol), back preserves state

**Commit:** `feat: WizardContext pure reducer + 10 tests`

---

### Task 28: DynamicForm component + tests

**Files:**
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/DynamicForm.tsx`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/__tests__/DynamicForm.test.tsx`

**Props:** `{ schema: ConfigField[], values: Record<string,string>, onChange: (field, value) => void }`

**Renders:** string → text input, number → number input, enum → select dropdown, boolean → checkbox. Required fields marked with `*`.

**Tests:** 4 tests (renders all field types, enum shows options, fires onChange, required marked)

**Commit:** `feat: DynamicForm component for protocol-specific config forms`

---

### Task 29: Wizard shell (index + stepper + README)

**Files:**
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/index.tsx`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/WizardStepper.tsx`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/README.md`

**index.tsx:** Modal container, WizardProvider wrapping, step routing (switch on state.step → render correct Step component). Props: `{ onClose: () => void }`.

**WizardStepper:** Horizontal step indicator showing 7 steps with active/done/pending states.

**README:** How to add a new step, component structure, state management explanation.

**Commit:** `feat: Wizard shell + stepper + README`

---

### Task 30: Step1_Protocol + Step2_Config

**Files:**
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step1_Protocol.tsx`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step2_Config.tsx`

**Step1:** Fetch `/api/protocols`, render 3 cards (icon + name + capabilities). Click selects protocol.

**Step2:** Render DynamicForm with selected protocol's configSchema + connection name input.

**Commit:** `feat: Wizard Step1 (protocol selection) + Step2 (config form)`

---

### Task 31: Step3_Discovery + Step3_PushSampling

**Files:**
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step3_Discovery.tsx`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step3_PushSampling.tsx`

**Step3_Discovery:** For scan protocols. "掃描" button → POST `/api/discovery/scan` → loading spinner → results table (address, value, dataType). Error → red box with message + retry.

**Step3_PushSampling:** For push_ingest. Opens EventSource `/api/stream`, filters by SN from config, accumulates sensors in table. "樣本已足夠" button to proceed.

**Step3 routing:** In parent (index.tsx step routing), check `protocol === 'push_ingest'` → render PushSampling, else → Discovery.

**Commit:** `feat: Wizard Step3 (discovery scan + push SSE sampling)`

---

### Task 32: Step4_SelectPoints + Step5_Labels

**Files:**
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step4_SelectPoints.tsx`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step5_Labels.tsx`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/PropertyTypePicker.tsx`

**Step4:** Checkbox table from discoveryPoints. Toolbar: select all / none / hide zeros. Counter "已選 N / 共 M".

**Step5:** For each selected point: name input + PropertyTypePicker dropdown + unit input. PropertyTypePicker fetches `/api/property-types`, shows dropdown with icon + name. Selecting a property auto-fills unit from defaultUnit. Warning box when behavior=material_detect selected.

**PropertyTypePicker:** Reusable dropdown component. Props: `{ value: number, onChange: (id) => void }`. Fetches + caches property types.

**Commit:** `feat: Wizard Step4 (select points) + Step5 (labels) + PropertyTypePicker`

---

### Task 33: Step6_Equipment + Step7_Review

**Files:**
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step6_Equipment.tsx`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step7_Review.tsx`

**Step6:** Equipment name input + description input + visType card picker (single_kpi / four_rings / dual_side_spark / custom_grid). Smart recommendation based on selected point count.

**Step7:** Full summary of connection + equipment + sensors. "建立" button → POST `/api/device-connections` with the assembled payload. Success → toast + close wizard. Failure → error display, stay on step.

**Commit:** `feat: Wizard Step6 (equipment info) + Step7 (review & submit)`

---

### Task 34: API helpers (protocols + discovery + connections)

**Files:**
- Create: `frontend/src/lib/apiProtocols.ts`
- Create: `frontend/src/lib/apiDiscovery.ts`
- Create: `frontend/src/lib/apiDeviceConnections.ts`

**Types + functions matching backend DTOs.** Used by wizard steps and management modal.

**Commit:** `feat: frontend API helpers for protocols, discovery, device connections`

---

### Task 35: DeviceConnectionsModal

**Files:**
- Create: `frontend/src/components/modals/DeviceConnectionsModal.tsx`

**List view:** Table with connection name, protocol, status badge (🟢healthy / 🔴error / ⚪disabled), lastPollAt, actions (edit/test/delete).

**Status:** Fetches from `/api/diagnostics/polling` to get real-time health.

**Actions:** Enable/disable toggle, test connection button, delete with ConfirmModal.

**Commit:** `feat: DeviceConnectionsModal management page`

---

### Task 36: App.tsx wizard entry + wiring

**Files:**
- Modify: `frontend/src/App.tsx`

**Changes:**
- Import DeviceIntegrationWizard, PropertyTypesModal, DeviceConnectionsModal
- Add state: `showWizard`, `showPropertyTypes`, `showConnections`
- Change "+ 新增設備" button to dropdown: "🧙 整合新設備" → wizard, "📋 加入既有類型" → existing AddDeviceModal
- Add toolbar buttons: "屬性管理" → PropertyTypesModal, "連線管理" → DeviceConnectionsModal
- Wire useConfigSync to refetch line configs when config-updated events arrive

**Commit:** `feat: wire wizard + management modals into App.tsx`

---

### Task 37: E2E integration test

**Files:**
- Create: `backend/Tests/Integration/WizardE2EHappyPath.cs`

**Test:** POST `/api/device-connections` (atomic provision with modbus_tcp config) → verify DeviceConnection + EquipmentType + Sensors in DB → start ModbusTestServer → wait for polling → verify SensorReadings written → verify can GET `/api/diagnostics/polling` and see healthy status.

**Commit:** `test: E2E wizard happy path (provision → poll → readings)`

---

## Self-Review

**Spec coverage:**
- ✅ Section 1 Architecture: adapters (Part 1) + polling (Task 19-20)
- ✅ Section 2 Data Model: PropertyType (Part 1) + DeviceConnection (Task 17)
- ✅ Section 3 API: all endpoints covered (Tasks 16, 18, 23)
- ✅ Section 3.5 Impact: ImpactAnalyzer (Task 21) + SSE broadcast (Task 22)
- ✅ Section 4 Wizard UX: all 7 steps (Tasks 27-33)
- ✅ Section 4.5 AI-Friendly: CLAUDE.md + READMEs (Part 1) + Wizard README (Task 29)
- ✅ Section 5 Error Handling: Result<T> (Part 1) + ConnectionState circuit breaker (Task 19) + ErrorResponse (Part 1)
- ✅ Section 6 Testing: all tasks have test requirements

**Placeholder scan:** No TBD/TODO tokens. All tasks have file lists and key decisions.

**Type consistency:** DTOs reference established types from Part 1 (EquipmentTypeDto, PropertyTypeDto).
