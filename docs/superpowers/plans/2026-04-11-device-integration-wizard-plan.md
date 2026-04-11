# Device Integration Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個圖形化精靈，讓使用者選擇協議 (Modbus TCP / HTTP REST / Push Ingest) → 自動掃描設備 → 標籤資料點 → 一鍵建立 EquipmentType + DeviceConnection + 自動開始輪詢，全程零程式碼改動。

**Architecture:** 新增 `IProtocolAdapter` 策略介面 + 3 個 Adapter 實作 + `PollingBackgroundService` (IHostedService)，所有資料路徑共享既有的 `DataIngestionService` 消化線。新增 `PropertyType` (取代硬編碼 `Role`) 和 `DeviceConnection` (儲存連線設定)，配套 `ImpactAnalyzer` 處理跨實體影響。前端新增 7 步精靈、屬性管理、連線管理三個 Modal，配 `useConfigSync` hook 監聽 SSE 變更廣播。

**Tech Stack:**
- 後端：.NET 9, EF Core 9, FluentModbus, Microsoft.AspNetCore.Mvc.Testing, xUnit, FluentAssertions, WireMock.Net
- 前端：React 19, TypeScript 5.8, Vitest, React Testing Library
- 既有：SQL Server, OpenTelemetry, SSE Hub

**Spec reference:** `docs/superpowers/specs/2026-04-11-device-integration-wizard-design.md`

---

## Phase Overview

| Phase | 範圍 | Tasks | 可獨立交付 |
|-------|------|-------|----------|
| 1. Foundation | CLAUDE.md, 測試框架, _Template, NuGet | 1-4 | ✅ |
| 2. PropertyType | Entity, API, 管理頁, 遷移舊資料 | 5-8 | ✅ (補既有功能) |
| 3. Adapter Infra | IProtocolAdapter + Result + ConfigSchema | 9-10 | ⚠️ 必須跟 Phase 4 一起 |
| 4. Three Adapters | Push / Modbus / WebApi | 11-15 | ✅ (可用 curl 測試 discovery) |
| 5. Discovery API | ProtocolsController + DiscoveryController | 16-17 | ✅ |
| 6. DeviceConnection | Entity + CRUD + 原子 provision | 18-20 | ✅ |
| 7. Background Polling | ConnectionState + PollingBackgroundService | 21-22 | ✅ (Pull mode 端對端可運作) |
| 8. Impact + SSE | ImpactAnalyzer + SSE config-updated 廣播 | 23-24 | ✅ |
| 9. Diagnostics | DiagnosticsController | 25 | ✅ (後端完整可用) |
| 10. Frontend Infra | apiClient, Toast, ConfirmModal, useConfigSync | 26-29 | ✅ |
| 11. Wizard Core | WizardContext, DynamicForm, Shell | 30-32 | ⚠️ 需配 Phase 12 |
| 12. Wizard Steps | Step 1-7 | 33-37 | ✅ (端對端可走完精靈) |
| 13. Management Pages | PropertyTypesModal, DeviceConnectionsModal | 38-39 | ✅ |
| 14. E2E + Wiring | App.tsx 入口, E2E 測試 | 40-41 | ✅ Feature 完成 |

**完成 Phase 1-9 = 後端 v1 可用 (用 curl 操作)。完成 Phase 10-14 = 前端 UI v1 完成。**

---

## File Map

### 新建檔案

#### Backend
```
backend/
  CLAUDE.md                                       (Task 1)
  IoT.CentralApi.csproj                          (Task 4 - 加 NuGet)
  Adapters/
    README.md                                    (Task 1)
    _Template.cs                                 (Task 4)
    Contracts/
      IProtocolAdapter.cs                        (Task 9)
      Result.cs                                  (Task 9)
      ErrorKind.cs                               (Task 9)
      ConfigSchema.cs                            (Task 9)
      ConfigField.cs                             (Task 9)
      ValidationResult.cs                        (Task 9)
      DiscoveryResult.cs                         (Task 9)
      DiscoveredPoint.cs                         (Task 9)
      PollResult.cs                              (Task 9)
    PushIngestAdapter.cs                         (Task 11)
    PushIngestConfig.cs                          (Task 11)
    ModbusTcpAdapter.cs                          (Task 12)
    ModbusTcpConfig.cs                           (Task 12)
    WebApiAdapter.cs                             (Task 14)
    WebApiConfig.cs                              (Task 14)
  Models/
    Entities/
      README.md                                  (Task 5)
      PropertyType.cs                            (Task 5)
      DeviceConnection.cs                        (Task 18)
  Dtos/
    README.md                                    (Task 6)
    PropertyTypeDtos.cs                          (Task 6)
    DeviceConnectionDtos.cs                      (Task 19)
    DiscoveryDtos.cs                             (Task 17)
    ProtocolDtos.cs                              (Task 16)
    DiagnosticsDtos.cs                           (Task 25)
    ErrorResponse.cs                             (Task 9)
    ImpactDtos.cs                                (Task 23)
  Controllers/
    PropertyTypeController.cs                    (Task 6)
    DeviceConnectionController.cs                (Task 19)
    DiscoveryController.cs                       (Task 17)
    ProtocolsController.cs                       (Task 16)
    DiagnosticsController.cs                     (Task 25)
  Services/
    PollingBackgroundService.cs                  (Task 22)
    ConnectionState.cs                           (Task 21)
    ConnectionStateRegistry.cs                   (Task 21)
    ImpactAnalyzer.cs                            (Task 23)
    PollingLogs.cs                               (Task 22)
  Tests/
    IoT.CentralApi.Tests.csproj                  (Task 2)
    README.md                                    (Task 2)
    _Shared/
      IntegrationTestBase.cs                     (Task 2)
      TestDbFactory.cs                           (Task 2)
    Adapters/
      PushIngestAdapterTests.cs                  (Task 11)
      ModbusTcpAdapterTests.cs                   (Task 13)
      WebApiAdapterTests.cs                      (Task 15)
    Services/
      PollingBackgroundServiceTests.cs           (Task 22)
      ImpactAnalyzerTests.cs                     (Task 23)
      ConnectionStateTests.cs                    (Task 21)
    Controllers/
      PropertyTypeControllerTests.cs             (Task 6)
      DeviceConnectionControllerTests.cs         (Task 19)
      DiscoveryControllerTests.cs                (Task 17)
      ProtocolsControllerTests.cs                (Task 16)
      DiagnosticsControllerTests.cs              (Task 25)
    Integration/
      WizardE2EHappyPath.cs                      (Task 41)
      MigrationBackfillTests.cs                  (Task 8)
```

#### Frontend
```
frontend/
  vitest.config.ts                               (Task 3)
  src/
    lib/
      apiClient.ts                               (Task 26)
      apiPropertyTypes.ts                        (Task 7)
      apiDeviceConnections.ts                    (Task 38)
      apiDiscovery.ts                            (Task 36)
      apiProtocols.ts                            (Task 36)
      __tests__/
        apiClient.test.ts                        (Task 26)
    components/
      ui/
        Toast.tsx                                (Task 27)
        ConfirmModal.tsx                         (Task 28)
        ImpactWarningBanner.tsx                  (Task 28)
        __tests__/
          Toast.test.tsx                         (Task 27)
          ConfirmModal.test.tsx                  (Task 28)
      modals/
        PropertyTypesModal.tsx                   (Task 7)
        DeviceConnectionsModal.tsx               (Task 39)
        DeviceIntegrationWizard/
          README.md                              (Task 30)
          index.tsx                              (Task 32)
          WizardContext.tsx                      (Task 30)
          WizardStepper.tsx                      (Task 32)
          DynamicForm.tsx                        (Task 31)
          PropertyTypePicker.tsx                 (Task 36)
          steps/
            _StepTemplate.tsx                    (Task 4)
            Step1_Protocol.tsx                   (Task 33)
            Step2_Config.tsx                     (Task 33)
            Step3_Discovery.tsx                  (Task 34)
            Step3_PushSampling.tsx               (Task 34)
            Step4_SelectPoints.tsx               (Task 35)
            Step5_Labels.tsx                     (Task 36)
            Step6_Equipment.tsx                  (Task 37)
            Step7_Review.tsx                     (Task 37)
          __tests__/
            WizardContext.test.ts                (Task 30)
            DynamicForm.test.tsx                 (Task 31)
            Step1_Protocol.test.tsx              (Task 33)
            Step5_Labels.test.tsx                (Task 36)
    hooks/
      useConfigSync.ts                           (Task 29)
      useToast.ts                                (Task 27)
      __tests__/
        useConfigSync.test.ts                    (Task 29)
```

### 修改檔案

```
backend/
  Models/Entities.cs                             (Task 8 - 改 EquipmentTypeSensor)
  Data/IoTDbContext.cs                           (Task 5, 18 - 加 DbSet)
  Program.cs                                     (Task 5, 18, 21, 22 - 加 DI + DDL)
  Services/DataIngestionService.cs               (Task 8 - 改 GetMaterialDetectSensorIdAsync)
  Services/SseHub.cs                             (Task 24 - 加 BroadcastConfigAsync)

frontend/src/
  App.tsx                                        (Task 40 - 加精靈入口)
  package.json                                   (Task 3 - vitest 依賴)

CLAUDE.md                                        (Task 1 - 專案根)
.gitlab-ci.yml                                   (Task 41 - test stage)
```

---

## Conventions for All Tasks

**Backend C# style**:
- 全部 file-scoped namespace
- Primary constructor for Controllers/Services
- `record` for DTOs (immutable)
- `IDbContextFactory<IoTDbContext>` 不直接注入 DbContext
- 全部 async + CancellationToken

**Test naming**: `{ClassName}_{MethodName}_{Behavior}`
範例: `ModbusTcpAdapter_Discover_ReadsRegistersAndReturnsCurrentValues`

**Commit prefix**:
- `feat:` 新功能
- `test:` 只加測試
- `refactor:` 重構
- `chore:` 工具/依賴

**File size limits**:
- C# Controller/Service: 300 行
- React 元件: 250 行
- Entity/DTO: 150 行

---

# Phase 1 — Foundation (Tasks 1-4)

---

### Task 1: Create CLAUDE.md and Folder READMEs

建立給 AI 維護用的「第一張地圖」。所有未來的維護工作從這裡開始。

**Files:**
- Create: `CLAUDE.md` (專案根)
- Create: `backend/Adapters/README.md`
- Create: `backend/Models/Entities/README.md`
- Create: `backend/Dtos/README.md`

- [ ] **Step 1: Create `CLAUDE.md` at project root**

```bash
cd "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard"
```

Create file with content:

```markdown
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
```

- [ ] **Step 2: Create `backend/Adapters/README.md`**

```markdown
# Adapters

## 用途
協議插件 (Protocol Adapter)。每個 adapter 負責跟一種設備協議溝通，
把「掃描」和「讀取」抽象成統一介面 `IProtocolAdapter`。

## 關鍵檔案
- `Contracts/IProtocolAdapter.cs` — 介面契約 (不要動)
- `Contracts/Result.cs` — 統一錯誤回傳 (不要動)
- `_Template.cs` — 加新 adapter 的範本
- `PushIngestAdapter.cs` — 既有 push 流程的 adapter wrapper
- `ModbusTcpAdapter.cs` — Modbus TCP 實作
- `WebApiAdapter.cs` — HTTP REST 實作

## 如何新增一個 Adapter
1. 複製 `_Template.cs` 為 `<YourProtocol>Adapter.cs`
2. 改 class 名稱、`ProtocolId`、`DisplayName`
3. 設定 `SupportsDiscovery` / `SupportsLivePolling`
4. 在 `GetConfigSchema()` 宣告連線參數欄位
5. 實作 `ValidateConfig` / `DiscoverAsync` / `PollAsync`
6. 在 `Program.cs` 註冊：
   ```csharp
   builder.Services.AddSingleton<IProtocolAdapter, YourProtocolAdapter>();
   ```
7. 寫測試: `backend/Tests/Adapters/YourProtocolAdapterTests.cs`
8. 跑測試: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~YourProtocol"`

## 依賴
- `Models/Entities/DeviceConnection.cs` — 連線設定來自這裡
- `Services/DataIngestionService.cs` — Polling 後資料送進這裡處理
- `Services/PollingBackgroundService.cs` — 呼叫 PollAsync 的呼叫者

## 不要改動
- `Contracts/IProtocolAdapter.cs` — 改介面會影響所有 adapter，需要全部更新
- `Contracts/Result.cs` — 共用錯誤協定
- 各 adapter 的 `ProtocolId` 字串值 — 已存進 DB 的 DeviceConnection.Protocol
```

- [ ] **Step 3: Create `backend/Models/Entities/README.md`**

```markdown
# Models/Entities

## 用途
新 entity 集中地。每個 entity 一個檔案，方便 AI 維護時只載入需要的 context。

> 既有 entity 在父資料夾的 `Entities.cs` (不要再往那邊加新東西)

## 關鍵檔案
- `PropertyType.cs` — 屬性管理 (溫度/壓力/在位...)
- `DeviceConnection.cs` — 一次設備整合的連線設定 (協議+地址+輪詢間隔)

## 如何新增 entity
1. 在此資料夾建立 `<Name>.cs`
2. 在 `backend/Data/IoTDbContext.cs` 新增 DbSet:
   ```csharp
   public DbSet<YourEntity> YourEntities => Set<YourEntity>();
   ```
3. 在 `OnModelCreating` 加索引/FK 設定 (如需要)
4. 在 `Program.cs` 的 DB init 區塊加 `IF NOT EXISTS` 建表 SQL
5. 對應的 DTO 在 `backend/Dtos/<Name>Dtos.cs`
6. 對應的 Controller 在 `backend/Controllers/<Name>Controller.cs`

## Conventions
- 一個檔案一個 entity class
- 用 `[Required]`、`[MaxLength]` 等 DataAnnotations
- 導航屬性用 `null!` 初始化避免 nullable warning
- Primary key 慣例: `int Id` (除非有明確複合 key 需求)
```

- [ ] **Step 4: Create `backend/Dtos/README.md`**

```markdown
# Dtos

## 用途
DTO (Data Transfer Object) 集中地。每個 resource 一個檔案，內含該 resource 所有
讀取/請求/回應的 DTO records。

## 命名規則
- `{Name}Dto` — 讀取回應 (含 Id)
- `Save{Name}Request` — 創建請求
- `Update{Name}Request` — 更新請求 (如果跟 Save 不同)
- 子資源: `{Parent}{Child}Dto` (e.g. `EquipmentTypeSensorDto`)

## 慣例
- **全部用 `record`** (immutable, value-based equality, AI 友善)
- 用 DataAnnotation 做 input validation: `[Required]`, `[MaxLength]`, `[Range]`
- 一個檔案內可包含多個相關 DTO

## 例子
```csharp
namespace IoT.CentralApi.Dtos;

public record PropertyTypeDto(
    int Id, string Key, string Name, string Icon,
    string DefaultUnit, double? DefaultUcl, double? DefaultLcl,
    string Behavior, bool IsBuiltIn, int SortOrder, DateTime CreatedAt);

public record SavePropertyTypeRequest(
    [Required, MaxLength(50)] string Key,
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(50)] string Icon,
    [MaxLength(20)] string DefaultUnit,
    double? DefaultUcl,
    double? DefaultLcl,
    [Required, MaxLength(20)] string Behavior,
    int SortOrder = 0);
```
```

- [ ] **Step 5: Verify all files exist and commit**

```bash
ls CLAUDE.md backend/Adapters/README.md backend/Models/Entities/README.md backend/Dtos/README.md
```

Expected: 4 files listed.

```bash
git add CLAUDE.md backend/Adapters/README.md backend/Models/Entities/README.md backend/Dtos/README.md
git commit -m "docs: add CLAUDE.md + folder READMEs for AI-friendly maintenance"
```

---

### Task 2: Backend Test Project Setup

建立 xUnit test project + IntegrationTestBase 共用類別。所有後續任務都會用到。

**Files:**
- Create: `backend/Tests/IoT.CentralApi.Tests.csproj`
- Create: `backend/Tests/README.md`
- Create: `backend/Tests/_Shared/IntegrationTestBase.cs`
- Create: `backend/Tests/_Shared/TestDbFactory.cs`
- Create: `backend/Tests/SmokeTest.cs` (用來確認測試框架本身可運作)

- [ ] **Step 1: Create test project file**

`backend/Tests/IoT.CentralApi.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
    <RootNamespace>IoT.CentralApi.Tests</RootNamespace>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.*" />
    <PackageReference Include="xunit" Version="2.9.*" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.*" />
    <PackageReference Include="FluentAssertions" Version="6.12.*" />
    <PackageReference Include="Moq" Version="4.20.*" />
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" Version="9.0.*" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="9.0.*" />
    <PackageReference Include="WireMock.Net" Version="1.6.*" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\IoT.CentralApi.csproj" />
  </ItemGroup>

  <ItemGroup>
    <Using Include="Xunit" />
    <Using Include="FluentAssertions" />
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Create `backend/Tests/README.md`**

```markdown
# IoT.CentralApi.Tests

xUnit test project for the IoT Central API backend.

## Run all tests
```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj
```

## Run specific tests
```bash
# Single test class
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~ModbusTcpAdapterTests"

# Single test method
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~Discover_ReadsRegisters"
```

## Folder structure
鏡像 `backend/` 下的對應結構：
- `Adapters/` ↔ `backend/Adapters/`
- `Services/` ↔ `backend/Services/`
- `Controllers/` ↔ `backend/Controllers/`
- `Integration/` — 跨層整合測試 (用 WebApplicationFactory)
- `_Shared/` — 共用測試基礎設施

## Test naming convention
`{ClassName}_{MethodName}_{Behavior}`

範例:
- `ModbusTcpAdapter_Discover_ReadsRegistersAndReturnsCurrentValues`
- `PropertyTypeController_Delete_Returns409WhenInUse`

## Test conventions
- 每個測試只驗一件事
- Arrange / Act / Assert 用空行分隔
- 用 `[Theory]` + `[InlineData]` 處理多組相似 case
- Integration test 繼承 `IntegrationTestBase` (in `_Shared/`)
- Adapter test 用各自的 Fixture (in `Adapters/_Fixtures/`)

## In-memory test DB
`IntegrationTestBase` 用 SQLite file 取代 SQL Server，每個測試獨立 DB file，
測試結束自動清理。
```

- [ ] **Step 3: Create `backend/Tests/_Shared/TestDbFactory.cs`**

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// TestDbFactory — 建立測試專用的 SQLite DbContext
// ─────────────────────────────────────────────────────────────────────────────
// 用途: 每個 integration test 取得獨立的 DB instance
// 特性:
//   - SQLite (file-based)，每個測試一個獨立 .db 檔
//   - EnsureCreated 後可立即使用
//   - 測試結束時 dispose 並刪除 db file
// ─────────────────────────────────────────────────────────────────────────────

using IoT.CentralApi.Data;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Tests._Shared;

public sealed class TestDbFactory : IAsyncDisposable
{
    public string DbPath { get; }
    public string ConnectionString => $"Data Source={DbPath}";

    public TestDbFactory()
    {
        DbPath = Path.Combine(Path.GetTempPath(), $"iottest_{Guid.NewGuid():N}.db");
    }

    public IoTDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<IoTDbContext>()
            .UseSqlite(ConnectionString)
            .Options;
        var ctx = new IoTDbContext(options);
        ctx.Database.EnsureCreated();
        return ctx;
    }

    public async ValueTask DisposeAsync()
    {
        if (File.Exists(DbPath))
        {
            try { File.Delete(DbPath); } catch { /* file lock OK */ }
        }
        await ValueTask.CompletedTask;
    }
}
```

- [ ] **Step 4: Create `backend/Tests/_Shared/IntegrationTestBase.cs`**

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// IntegrationTestBase — 共用基礎類別給所有 controller / integration tests
// ─────────────────────────────────────────────────────────────────────────────
// 提供:
//   - WebApplicationFactory 啟動完整後端 (in-memory)
//   - HttpClient 直接打 API
//   - SQLite 測試 DB (取代 SQL Server)
//   - WaitForConditionAsync 用於等待背景服務行為
//
// 使用方式:
//   public class MyControllerTests : IntegrationTestBase
//   {
//       [Fact]
//       public async Task SomeEndpoint_DoesSomething()
//       {
//           var resp = await Client.GetAsync("/api/whatever");
//           resp.StatusCode.Should().Be(HttpStatusCode.OK);
//       }
//   }
// ─────────────────────────────────────────────────────────────────────────────

using IoT.CentralApi.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace IoT.CentralApi.Tests._Shared;

public abstract class IntegrationTestBase : IAsyncLifetime
{
    protected WebApplicationFactory<Program> Factory = null!;
    protected HttpClient Client = null!;
    protected string DbPath = null!;

    public virtual async Task InitializeAsync()
    {
        DbPath = Path.Combine(Path.GetTempPath(), $"iottest_{Guid.NewGuid():N}.db");

        Factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    // 取代生產 DbContext 為 SQLite
                    var descriptor = services.FirstOrDefault(d =>
                        d.ServiceType == typeof(DbContextOptions<IoTDbContext>));
                    if (descriptor != null) services.Remove(descriptor);

                    var factoryDescriptor = services.FirstOrDefault(d =>
                        d.ServiceType == typeof(IDbContextFactory<IoTDbContext>));
                    if (factoryDescriptor != null) services.Remove(factoryDescriptor);

                    services.AddDbContextFactory<IoTDbContext>(opts =>
                        opts.UseSqlite($"Data Source={DbPath}"));
                });

                builder.ConfigureAppConfiguration(c =>
                {
                    c.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["WeChat:Enabled"] = "false",
                        ["FasApi:BaseUrl"] = "http://localhost:1",  // 避免真打 FAS
                        ["FasApi:ApiKey"] = "test-key",
                        ["ConnectionStrings:DefaultConnection"] = $"Data Source={DbPath}"
                    });
                });

                builder.UseEnvironment("Test");
            });

        Client = Factory.CreateClient();

        // 確保 DB schema 存在
        using var scope = Factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();
    }

    public virtual async Task DisposeAsync()
    {
        Client.Dispose();
        await Factory.DisposeAsync();
        if (File.Exists(DbPath))
        {
            try { File.Delete(DbPath); } catch { /* file lock OK */ }
        }
    }

    /// <summary>從 DI 容器拿一個獨立 DbContext (test 內部驗證 DB state 時用)</summary>
    protected async Task<IoTDbContext> CreateDbContextAsync()
    {
        var factory = Factory.Services.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        return await factory.CreateDbContextAsync();
    }

    /// <summary>等待非同步條件成立 (給背景服務測試用)</summary>
    protected static async Task WaitForConditionAsync(
        Func<Task<bool>> predicate,
        TimeSpan timeout,
        TimeSpan? pollInterval = null)
    {
        var interval = pollInterval ?? TimeSpan.FromMilliseconds(100);
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (await predicate()) return;
            await Task.Delay(interval);
        }
        throw new TimeoutException($"Condition not met within {timeout.TotalSeconds:F1}s");
    }
}
```

- [ ] **Step 5: Create smoke test to verify framework works**

`backend/Tests/SmokeTest.cs`:

```csharp
namespace IoT.CentralApi.Tests;

public class SmokeTest
{
    [Fact]
    public void Framework_Loads_AndAssertionsWork()
    {
        var sum = 1 + 1;
        sum.Should().Be(2);
    }

    [Theory]
    [InlineData(1, 1, 2)]
    [InlineData(2, 3, 5)]
    [InlineData(0, 0, 0)]
    public void Theory_Works(int a, int b, int expected)
    {
        (a + b).Should().Be(expected);
    }
}
```

- [ ] **Step 6: Build test project and run smoke test**

```bash
dotnet build backend/Tests/IoT.CentralApi.Tests.csproj
```

Expected: build success, 0 warnings, 0 errors.

```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~SmokeTest"
```

Expected: `Passed: 4` (1 fact + 3 theory rows)

- [ ] **Step 7: Commit**

```bash
git add backend/Tests/
git commit -m "test: add xUnit test project + IntegrationTestBase + smoke test"
```

---

### Task 3: Frontend Test Setup (Vitest)

**Files:**
- Create: `frontend/vitest.config.ts`
- Modify: `frontend/package.json`
- Create: `frontend/src/__tests__/smoke.test.ts`

- [ ] **Step 1: Install Vitest dependencies**

```bash
cd frontend
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @types/react@^19 @types/react-dom@^19
```

- [ ] **Step 2: Create `frontend/vitest.config.ts`**

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
```

- [ ] **Step 3: Create `frontend/vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Update `frontend/package.json` scripts**

Add to `"scripts"`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

- [ ] **Step 5: Create smoke test**

`frontend/src/__tests__/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Vitest smoke test', () => {
  it('framework loads and assertions work', () => {
    expect(1 + 1).toBe(2);
  });

  it.each([
    [1, 1, 2],
    [2, 3, 5],
    [0, 0, 0],
  ])('adds %i + %i = %i', (a, b, expected) => {
    expect(a + b).toBe(expected);
  });
});
```

- [ ] **Step 6: Run smoke test**

```bash
cd frontend && npm test
```

Expected: `Test Files  1 passed (1)`, `Tests  4 passed (4)`

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/vitest.setup.ts frontend/src/__tests__/smoke.test.ts
git commit -m "test: add Vitest + RTL setup with smoke test"
```

---

### Task 4: NuGet Dependencies + Adapter Template

加入 FluentModbus 套件，建立 Adapter 範本檔案。

**Files:**
- Modify: `backend/IoT.CentralApi.csproj`
- Create: `backend/Adapters/_Template.cs`
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/steps/_StepTemplate.tsx`

- [ ] **Step 1: Add FluentModbus to backend csproj**

Edit `backend/IoT.CentralApi.csproj`, add inside the existing `<ItemGroup>` containing `<PackageReference>` items:

```xml
<PackageReference Include="FluentModbus" Version="5.2.*" />
```

- [ ] **Step 2: Restore packages**

```bash
dotnet restore backend/IoT.CentralApi.csproj
```

Expected: restore success.

- [ ] **Step 3: Create `backend/Adapters/_Template.cs`**

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE: Protocol Adapter
// ─────────────────────────────────────────────────────────────────────────────
// To create a new adapter:
//   1. Copy this file to `<YourProtocol>Adapter.cs`
//   2. Rename class `TemplateAdapter` → `<YourProtocol>Adapter`
//   3. Implement DiscoverAsync, PollAsync, ValidateConfig
//   4. Define your config schema in GetConfigSchema()
//   5. Register in Program.cs:
//        builder.Services.AddSingleton<IProtocolAdapter, YourProtocolAdapter>();
//   6. Write tests in backend/Tests/Adapters/YourProtocolAdapterTests.cs
//
// DO NOT modify the IProtocolAdapter interface. If you need new methods,
// discuss with the team first — changes affect ALL adapters.
// ─────────────────────────────────────────────────────────────────────────────

using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Adapters;

public class TemplateAdapter : IProtocolAdapter
{
    public string ProtocolId => "template";
    public string DisplayName => "Template Protocol";
    public bool SupportsDiscovery => true;
    public bool SupportsLivePolling => true;

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField("host", "string", "主機位址",
                Required: true, Placeholder: "192.168.1.1"),
            new ConfigField("port", "number", "Port",
                Required: true, DefaultValue: "8080"),
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        // TODO: Parse configJson, check required fields
        throw new NotImplementedException();
    }

    public Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct)
    {
        // TODO: Connect to device, enumerate available data points
        throw new NotImplementedException();
    }

    public Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        // TODO: Read current values from device
        throw new NotImplementedException();
    }
}
```

> **Note**: This file will not compile until Task 9 creates `IProtocolAdapter` and supporting types. We're putting this skeleton in place because the README and conventions reference it. We'll re-enable in Task 9 (delete `throw new NotImplementedException();` lines is not needed - they're valid).

- [ ] **Step 4: Create wizard step template**

`frontend/src/components/modals/DeviceIntegrationWizard/steps/_StepTemplate.tsx`:

```tsx
// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE: Wizard Step Component
// ─────────────────────────────────────────────────────────────────────────────
// To create a new wizard step:
//   1. Copy this file to `Step{N}_{Name}.tsx`
//   2. Rename component `StepTemplate` → `Step{N}{Name}`
//   3. Use `useWizard()` to read/update shared state
//   4. Call `actions.next()` / `actions.prev()` for navigation
//   5. Add your step to the array in `index.tsx`
// ─────────────────────────────────────────────────────────────────────────────

import { useWizard } from '../WizardContext';

export function StepTemplate() {
  const { state, actions } = useWizard();

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">步驟標題</h2>

      <div className="mb-6">
        {/* 步驟內容 */}
      </div>

      <div className="flex justify-between">
        <button
          onClick={actions.prev}
          className="px-4 py-2 border rounded"
        >
          ← 上一步
        </button>
        <button
          onClick={actions.next}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          下一步 →
        </button>
      </div>
    </div>
  );
}
```

> **Note**: This file will not compile until Task 30 creates `WizardContext`. Same situation as `_Template.cs`.

- [ ] **Step 5: Verify build still works**

The backend won't compile until Task 9 (because `_Template.cs` references types that don't exist yet). Since this is a foundation task we accept this. Verify the csproj at least restores:

```bash
dotnet restore backend/IoT.CentralApi.csproj
```

Expected: restore success.

> **IMPORTANT**: Comment out the body of `_Template.cs` to keep build green:
> Edit `backend/Adapters/_Template.cs` to wrap the entire class definition in `/* */` block comment until Task 9 enables the contracts. Add `// Will be enabled in Task 9` comment.

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// (header comment as above)
// ─────────────────────────────────────────────────────────────────────────────

namespace IoT.CentralApi.Adapters;

// Will be enabled in Task 9 once IProtocolAdapter contracts are defined.
/*
using IoT.CentralApi.Adapters.Contracts;

public class TemplateAdapter : IProtocolAdapter
{
    // ... (full content as in step 3)
}
*/
```

Same for `_StepTemplate.tsx` — wrap the React component in a multi-line string or comment until Task 30 creates `WizardContext`. Use:

```tsx
// Will be enabled in Task 30 once WizardContext is defined.
export {};
```

- [ ] **Step 6: Verify build**

```bash
dotnet build backend/IoT.CentralApi.csproj 2>&1 | tail -5
cd frontend && npx tsc --noEmit
```

Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add backend/IoT.CentralApi.csproj backend/Adapters/_Template.cs frontend/src/components/modals/DeviceIntegrationWizard/steps/_StepTemplate.tsx
git commit -m "chore: add FluentModbus + adapter/step template stubs"
```

---

# Phase 2 — PropertyType (Tasks 5-8)

---

### Task 5: PropertyType Entity + DbContext + DDL + Seed

**Files:**
- Create: `backend/Models/Entities/PropertyType.cs`
- Modify: `backend/Data/IoTDbContext.cs`
- Modify: `backend/Program.cs` (DDL + seed)

- [ ] **Step 1: Create `backend/Models/Entities/PropertyType.cs`**

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// PropertyType — 屬性類型 (溫度/壓力/在位...)
// ─────────────────────────────────────────────────────────────────────────────
// 用途:
//   取代 EquipmentTypeSensor 中硬編碼的 Role 欄位。
//   每個 sensor 都會關聯一個 PropertyType，描述該 sensor 的「語意類別」。
//
// Behavior 欄位的特殊作用:
//   - "normal"          — 一般數值，走 UCL/LCL 告警
//   - "material_detect" — 在位判斷，值=0 時 DataIngestionService 跳過所有告警
//   - "asset_code"      — 資產編號 (v2 會用 register 值當 assetCode)
//   - "state"           — 狀態碼
//   - "counter"         — 計數器，不做 UCL/LCL 比對
//
// 內建屬性 (IsBuiltIn=true) 不可刪除，Key/Behavior 不可改。
// ─────────────────────────────────────────────────────────────────────────────

using System.ComponentModel.DataAnnotations;

namespace IoT.CentralApi.Models;

public class PropertyType
{
    public int Id { get; set; }

    [Required, MaxLength(50)]
    public string Key { get; set; } = "";

    [Required, MaxLength(100)]
    public string Name { get; set; } = "";

    [Required, MaxLength(50)]
    public string Icon { get; set; } = "";

    [MaxLength(20)]
    public string DefaultUnit { get; set; } = "";

    public double? DefaultUcl { get; set; }
    public double? DefaultLcl { get; set; }

    [Required, MaxLength(20)]
    public string Behavior { get; set; } = "normal";

    public bool IsBuiltIn { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }
}
```

- [ ] **Step 2: Add DbSet to `backend/Data/IoTDbContext.cs`**

Find the section with `DbSet` declarations (after line ~17) and add:

```csharp
public DbSet<PropertyType> PropertyTypes => Set<PropertyType>();
```

In `OnModelCreating`, add (after the existing entity configurations):

```csharp
// PropertyType: Key 全域唯一
modelBuilder.Entity<PropertyType>()
    .HasIndex(pt => pt.Key)
    .IsUnique();
```

- [ ] **Step 3: Add IF NOT EXISTS DDL + seed in Program.cs**

Find the DB init region in `backend/Program.cs` (search for `EnsureCreatedAsync`). After the last `ExecuteSqlRawAsync` block (around line 240, after the `RegisterMapProfiles` ALTER), add:

```csharp
    // ── PropertyTypes (Device Integration Wizard 用) ─────────────────────────
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PropertyTypes' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[PropertyTypes] (
                [Id]          INT            IDENTITY(1,1) NOT NULL,
                [Key]         NVARCHAR(50)   NOT NULL,
                [Name]        NVARCHAR(100)  NOT NULL,
                [Icon]        NVARCHAR(50)   NOT NULL,
                [DefaultUnit] NVARCHAR(20)   NOT NULL DEFAULT N'',
                [DefaultUcl]  FLOAT          NULL,
                [DefaultLcl]  FLOAT          NULL,
                [Behavior]    NVARCHAR(20)   NOT NULL DEFAULT N'normal',
                [IsBuiltIn]   BIT            NOT NULL DEFAULT 0,
                [SortOrder]   INT            NOT NULL DEFAULT 0,
                [CreatedAt]   DATETIME2      NOT NULL,
                CONSTRAINT [PK_PropertyTypes] PRIMARY KEY ([Id])
            );
            CREATE UNIQUE INDEX [IX_PropertyTypes_Key] ON [dbo].[PropertyTypes] ([Key]);
        END
        """);

    // Seed 8 內建屬性 (僅當表為空時)
    if (!await ctx.PropertyTypes.AnyAsync())
    {
        var now = DateTime.UtcNow;
        ctx.PropertyTypes.AddRange(
            new PropertyType { Key = "temperature",     Name = "溫度",     Icon = "thermometer",  DefaultUnit = "℃",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 1, CreatedAt = now },
            new PropertyType { Key = "pressure",        Name = "壓力",     Icon = "gauge",        DefaultUnit = "kPa",  Behavior = "normal",          IsBuiltIn = true, SortOrder = 2, CreatedAt = now },
            new PropertyType { Key = "humidity",        Name = "濕度",     Icon = "droplets",     DefaultUnit = "%",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 3, CreatedAt = now },
            new PropertyType { Key = "flow",            Name = "流量",     Icon = "waves",        DefaultUnit = "L/min",Behavior = "normal",          IsBuiltIn = true, SortOrder = 4, CreatedAt = now },
            new PropertyType { Key = "counter",         Name = "計數器",   Icon = "hash",         DefaultUnit = "count",Behavior = "counter",         IsBuiltIn = true, SortOrder = 5, CreatedAt = now },
            new PropertyType { Key = "state",           Name = "狀態",     Icon = "activity",     DefaultUnit = "",     Behavior = "state",           IsBuiltIn = true, SortOrder = 6, CreatedAt = now },
            new PropertyType { Key = "asset_code",      Name = "資產編號", Icon = "tag",          DefaultUnit = "",     Behavior = "asset_code",      IsBuiltIn = true, SortOrder = 7, CreatedAt = now },
            new PropertyType { Key = "material_detect", Name = "在位",     Icon = "check-circle", DefaultUnit = "",     Behavior = "material_detect", IsBuiltIn = true, SortOrder = 8, CreatedAt = now }
        );
        await ctx.SaveChangesAsync();
    }
```

Make sure `using IoT.CentralApi.Models;` is at the top of `Program.cs` (it should already be there from existing code).

- [ ] **Step 4: Build to verify no errors**

```bash
powershell -Command "Stop-Process -Name 'IoT.CentralApi' -Force -ErrorAction SilentlyContinue"
dotnet build backend/IoT.CentralApi.csproj 2>&1 | tail -5
```

Expected: build success.

- [ ] **Step 5: Run backend and verify table created + seed**

```bash
cd backend && dotnet run &>/dev/null &
sleep 8
curl -s http://localhost:5200/api/maintenance/stats
```

Expected: existing maintenance stats endpoint responds (proves backend started).

```bash
# Verify seed via direct SQL (or use API in Task 6)
# For now, just confirm backend starts without error.
powershell -Command "Stop-Process -Name 'IoT.CentralApi' -Force -ErrorAction SilentlyContinue"
```

- [ ] **Step 6: Commit**

```bash
git add backend/Models/Entities/PropertyType.cs backend/Data/IoTDbContext.cs backend/Program.cs
git commit -m "feat: add PropertyType entity + DDL + seed 8 builtin properties"
```

---

### Task 6: PropertyType API + Tests

**Files:**
- Create: `backend/Dtos/PropertyTypeDtos.cs`
- Create: `backend/Controllers/PropertyTypeController.cs`
- Create: `backend/Tests/Controllers/PropertyTypeControllerTests.cs`

- [ ] **Step 1: Create DTOs**

`backend/Dtos/PropertyTypeDtos.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace IoT.CentralApi.Dtos;

public record PropertyTypeDto(
    int Id,
    string Key,
    string Name,
    string Icon,
    string DefaultUnit,
    double? DefaultUcl,
    double? DefaultLcl,
    string Behavior,
    bool IsBuiltIn,
    int SortOrder,
    DateTime CreatedAt);

public record SavePropertyTypeRequest(
    [Required, MaxLength(50)] string Key,
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(50)] string Icon,
    [MaxLength(20)] string DefaultUnit = "",
    double? DefaultUcl = null,
    double? DefaultLcl = null,
    [Required, MaxLength(20)] string Behavior = "normal",
    int SortOrder = 0);

public record UpdatePropertyTypeRequest(
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(50)] string Icon,
    [MaxLength(20)] string DefaultUnit = "",
    double? DefaultUcl = null,
    double? DefaultLcl = null,
    int SortOrder = 0);
```

> **Note**: `UpdatePropertyTypeRequest` 不含 `Key` 和 `Behavior` — 內建屬性這兩個欄位不可改，自訂屬性也鎖住以避免引用混亂。

- [ ] **Step 2: Write failing controller test**

`backend/Tests/Controllers/PropertyTypeControllerTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Tests._Shared;

namespace IoT.CentralApi.Tests.Controllers;

public class PropertyTypeControllerTests : IntegrationTestBase
{
    [Fact]
    public async Task GetAll_ReturnsSeededBuiltInProperties()
    {
        var response = await Client.GetAsync("/api/property-types");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var properties = await response.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        properties.Should().NotBeNull();
        properties!.Should().HaveCount(8);
        properties.Should().Contain(p => p.Key == "temperature" && p.Name == "溫度");
        properties.Should().Contain(p => p.Key == "material_detect" && p.Behavior == "material_detect");
    }

    [Fact]
    public async Task Create_AddsCustomPropertyType()
    {
        var request = new SavePropertyTypeRequest(
            Key: "current",
            Name: "電流",
            Icon: "zap",
            DefaultUnit: "A",
            DefaultUcl: 100,
            DefaultLcl: 0,
            Behavior: "normal",
            SortOrder: 100);

        var response = await Client.PostAsJsonAsync("/api/property-types", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var created = await response.Content.ReadFromJsonAsync<PropertyTypeDto>();
        created.Should().NotBeNull();
        created!.Key.Should().Be("current");
        created.IsBuiltIn.Should().BeFalse();
    }

    [Fact]
    public async Task Create_ReturnsConflict_WhenKeyAlreadyExists()
    {
        var request = new SavePropertyTypeRequest(
            Key: "temperature",  // 已存在的 builtin key
            Name: "溫度2",
            Icon: "thermometer",
            Behavior: "normal");

        var response = await Client.PostAsJsonAsync("/api/property-types", request);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Update_ChangesName_ButNotKey()
    {
        // Arrange — 先建立一個自訂屬性
        var createReq = new SavePropertyTypeRequest("voltage", "電壓", "zap", "V", null, null, "normal", 0);
        var createResp = await Client.PostAsJsonAsync("/api/property-types", createReq);
        var created = await createResp.Content.ReadFromJsonAsync<PropertyTypeDto>();

        // Act — 改名
        var updateReq = new UpdatePropertyTypeRequest("輸入電壓", "zap", "V", 240, 200, 0);
        var updateResp = await Client.PutAsJsonAsync($"/api/property-types/{created!.Id}", updateReq);

        // Assert
        updateResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await updateResp.Content.ReadFromJsonAsync<PropertyTypeDto>();
        updated!.Name.Should().Be("輸入電壓");
        updated.Key.Should().Be("voltage");  // Key 不變
    }

    [Fact]
    public async Task Delete_BuiltInProperty_Returns409()
    {
        // 先取得 temperature 的 id
        var listResp = await Client.GetAsync("/api/property-types");
        var list = await listResp.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        var tempId = list!.First(p => p.Key == "temperature").Id;

        var response = await Client.DeleteAsync($"/api/property-types/{tempId}");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Delete_CustomProperty_Succeeds_WhenNotInUse()
    {
        // Arrange
        var createReq = new SavePropertyTypeRequest("torque", "扭力", "wrench", "Nm", null, null, "normal", 0);
        var createResp = await Client.PostAsJsonAsync("/api/property-types", createReq);
        var created = await createResp.Content.ReadFromJsonAsync<PropertyTypeDto>();

        // Act
        var deleteResp = await Client.DeleteAsync($"/api/property-types/{created!.Id}");

        // Assert
        deleteResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var afterResp = await Client.GetAsync($"/api/property-types/{created.Id}");
        afterResp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~PropertyTypeControllerTests"
```

Expected: All 6 tests FAIL with `404 NotFound` (no controller exists yet).

- [ ] **Step 4: Implement `backend/Controllers/PropertyTypeController.cs`**

```csharp
using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/property-types")]
public class PropertyTypeController(IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var items = await db.PropertyTypes
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.Id)
            .ToListAsync();
        return Ok(items.Select(MapToDto));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetOne(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var item = await db.PropertyTypes.FindAsync(id);
        return item == null ? NotFound() : Ok(MapToDto(item));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SavePropertyTypeRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();

        if (await db.PropertyTypes.AnyAsync(p => p.Key == req.Key))
            return Conflict(new { error = $"Key '{req.Key}' 已存在" });

        var entity = new PropertyType
        {
            Key = req.Key,
            Name = req.Name,
            Icon = req.Icon,
            DefaultUnit = req.DefaultUnit,
            DefaultUcl = req.DefaultUcl,
            DefaultLcl = req.DefaultLcl,
            Behavior = req.Behavior,
            IsBuiltIn = false,  // API 建立的一律不是 builtin
            SortOrder = req.SortOrder,
            CreatedAt = DateTime.UtcNow,
        };

        db.PropertyTypes.Add(entity);
        await db.SaveChangesAsync();
        return Ok(MapToDto(entity));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdatePropertyTypeRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var entity = await db.PropertyTypes.FindAsync(id);
        if (entity == null) return NotFound();

        entity.Name = req.Name;
        entity.Icon = req.Icon;
        entity.DefaultUnit = req.DefaultUnit;
        entity.DefaultUcl = req.DefaultUcl;
        entity.DefaultLcl = req.DefaultLcl;
        entity.SortOrder = req.SortOrder;

        await db.SaveChangesAsync();
        return Ok(MapToDto(entity));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var entity = await db.PropertyTypes.FindAsync(id);
        if (entity == null) return NotFound();

        if (entity.IsBuiltIn)
            return Conflict(new { error = "內建屬性不可刪除" });

        // Task 23 的 ImpactAnalyzer 會在這裡檢查是否被引用
        // 暫時先只擋 builtin

        db.PropertyTypes.Remove(entity);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static PropertyTypeDto MapToDto(PropertyType e) => new(
        e.Id, e.Key, e.Name, e.Icon, e.DefaultUnit,
        e.DefaultUcl, e.DefaultLcl, e.Behavior, e.IsBuiltIn,
        e.SortOrder, e.CreatedAt);
}
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~PropertyTypeControllerTests"
```

Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/Dtos/PropertyTypeDtos.cs backend/Controllers/PropertyTypeController.cs backend/Tests/Controllers/PropertyTypeControllerTests.cs
git commit -m "feat: add PropertyType CRUD API + tests"
```

---

### Task 7: PropertyTypes Frontend (apiPropertyTypes + Modal)

**Files:**
- Create: `frontend/src/lib/apiPropertyTypes.ts`
- Create: `frontend/src/components/modals/PropertyTypesModal.tsx`

- [ ] **Step 1: Create API helper**

`frontend/src/lib/apiPropertyTypes.ts`:

```typescript
export interface PropertyType {
  id: number;
  key: string;
  name: string;
  icon: string;
  defaultUnit: string;
  defaultUcl: number | null;
  defaultLcl: number | null;
  behavior: 'normal' | 'material_detect' | 'asset_code' | 'state' | 'counter';
  isBuiltIn: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface SavePropertyTypeRequest {
  key: string;
  name: string;
  icon: string;
  defaultUnit?: string;
  defaultUcl?: number | null;
  defaultLcl?: number | null;
  behavior: PropertyType['behavior'];
  sortOrder?: number;
}

export interface UpdatePropertyTypeRequest {
  name: string;
  icon: string;
  defaultUnit?: string;
  defaultUcl?: number | null;
  defaultLcl?: number | null;
  sortOrder?: number;
}

export async function fetchPropertyTypes(): Promise<PropertyType[]> {
  const res = await fetch('/api/property-types');
  if (!res.ok) throw new Error(`GET /api/property-types → ${res.status}`);
  return res.json();
}

export async function createPropertyType(req: SavePropertyTypeRequest): Promise<PropertyType> {
  const res = await fetch('/api/property-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `POST /api/property-types → ${res.status}`);
  }
  return res.json();
}

export async function updatePropertyType(id: number, req: UpdatePropertyTypeRequest): Promise<PropertyType> {
  const res = await fetch(`/api/property-types/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`PUT /api/property-types/${id} → ${res.status}`);
  return res.json();
}

export async function deletePropertyType(id: number): Promise<void> {
  const res = await fetch(`/api/property-types/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `DELETE /api/property-types/${id} → ${res.status}`);
  }
}
```

- [ ] **Step 2: Create PropertyTypesModal component**

`frontend/src/components/modals/PropertyTypesModal.tsx`:

```tsx
// ─────────────────────────────────────────────────────────────────────────────
// PropertyTypesModal — 屬性管理頁
// ─────────────────────────────────────────────────────────────────────────────
// 用途: 列出/新增/編輯/刪除 PropertyType (屬性類別)
// 內建屬性 (isBuiltIn=true) 不可刪、Key/Behavior 不可改，只能改 Name/Icon/Unit/UCL/LCL
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2 } from 'lucide-react';
import {
  fetchPropertyTypes,
  createPropertyType,
  updatePropertyType,
  deletePropertyType,
  type PropertyType,
} from '../../lib/apiPropertyTypes';

interface Props {
  onClose: () => void;
}

type EditState =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; id: number };

const BEHAVIORS = [
  { value: 'normal', label: '一般數值（走 UCL/LCL 告警）' },
  { value: 'material_detect', label: '在位偵測（值=0 時跳過告警）' },
  { value: 'asset_code', label: '資產編號' },
  { value: 'state', label: '狀態' },
  { value: 'counter', label: '計數器（不做 UCL/LCL）' },
] as const;

export function PropertyTypesModal({ onClose }: Props) {
  const [items, setItems] = useState<PropertyType[]>([]);
  const [edit, setEdit] = useState<EditState>({ mode: 'list' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await fetchPropertyTypes());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('確定刪除此屬性？')) return;
    try {
      await deletePropertyType(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-base)] border border-[var(--border-base)] rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-[var(--border-base)]">
          <h2 className="text-lg font-semibold">屬性管理</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 text-red-200 rounded">
              {error}
            </div>
          )}

          {edit.mode === 'list' && (
            <PropertyList
              items={items}
              loading={loading}
              onCreate={() => setEdit({ mode: 'create' })}
              onEdit={(id) => setEdit({ mode: 'edit', id })}
              onDelete={handleDelete}
            />
          )}

          {edit.mode === 'create' && (
            <PropertyForm
              onCancel={() => setEdit({ mode: 'list' })}
              onSave={async (req) => {
                try {
                  await createPropertyType(req);
                  setEdit({ mode: 'list' });
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          )}

          {edit.mode === 'edit' && (
            <PropertyForm
              initial={items.find((p) => p.id === edit.id)}
              onCancel={() => setEdit({ mode: 'list' })}
              onSave={async (_, updateReq) => {
                try {
                  await updatePropertyType(edit.id, updateReq!);
                  setEdit({ mode: 'list' });
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PropertyList({
  items,
  loading,
  onCreate,
  onEdit,
  onDelete,
}: {
  items: PropertyType[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-4">
        <span className="text-sm text-[var(--text-muted)]">共 {items.length} 個屬性</span>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]/50 rounded text-sm"
        >
          <Plus size={16} /> 新增屬性
        </button>
      </div>

      {loading ? (
        <div className="text-center text-[var(--text-muted)] py-8">載入中...</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-base)] text-left text-[var(--text-muted)]">
              <th className="p-2">名稱</th>
              <th className="p-2">Key</th>
              <th className="p-2">單位</th>
              <th className="p-2">Behavior</th>
              <th className="p-2">類型</th>
              <th className="p-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border-base)]/50">
                <td className="p-2">{p.name}</td>
                <td className="p-2 font-mono text-xs text-[var(--text-muted)]">{p.key}</td>
                <td className="p-2">{p.defaultUnit || '—'}</td>
                <td className="p-2 text-xs">{p.behavior}</td>
                <td className="p-2">
                  {p.isBuiltIn ? (
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">內建</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs">自訂</span>
                  )}
                </td>
                <td className="p-2 text-right">
                  <button
                    onClick={() => onEdit(p.id)}
                    className="p-1 hover:bg-white/10 rounded"
                    title="編輯"
                  >
                    <Edit2 size={14} />
                  </button>
                  {!p.isBuiltIn && (
                    <button
                      onClick={() => onDelete(p.id)}
                      className="p-1 hover:bg-red-500/20 rounded ml-1"
                      title="刪除"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PropertyForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: PropertyType;
  onCancel: () => void;
  onSave: (createReq: any, updateReq?: any) => Promise<void>;
}) {
  const isEdit = !!initial;
  const [key, setKey] = useState(initial?.key ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'tag');
  const [unit, setUnit] = useState(initial?.defaultUnit ?? '');
  const [ucl, setUcl] = useState<string>(initial?.defaultUcl?.toString() ?? '');
  const [lcl, setLcl] = useState<string>(initial?.defaultLcl?.toString() ?? '');
  const [behavior, setBehavior] = useState(initial?.behavior ?? 'normal');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit) {
      await onSave(null, {
        name,
        icon,
        defaultUnit: unit,
        defaultUcl: ucl ? Number(ucl) : null,
        defaultLcl: lcl ? Number(lcl) : null,
        sortOrder: initial!.sortOrder,
      });
    } else {
      await onSave({
        key,
        name,
        icon,
        defaultUnit: unit,
        defaultUcl: ucl ? Number(ucl) : null,
        defaultLcl: lcl ? Number(lcl) : null,
        behavior,
        sortOrder: 100,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-md font-semibold">{isEdit ? '編輯屬性' : '新增屬性'}</h3>

      {!isEdit && (
        <Field label="Key (機器識別碼，不可改)" required>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-base)] rounded px-3 py-2"
            placeholder="current"
          />
        </Field>
      )}

      <Field label="名稱" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full bg-[var(--bg-elevated)] border border-[var(--border-base)] rounded px-3 py-2"
        />
      </Field>

      <Field label="Icon (lucide-react 圖示名)">
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="w-full bg-[var(--bg-elevated)] border border-[var(--border-base)] rounded px-3 py-2"
        />
      </Field>

      <Field label="預設單位">
        <input
          type="text"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="w-full bg-[var(--bg-elevated)] border border-[var(--border-base)] rounded px-3 py-2"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="預設 UCL">
          <input
            type="number"
            value={ucl}
            onChange={(e) => setUcl(e.target.value)}
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-base)] rounded px-3 py-2"
          />
        </Field>
        <Field label="預設 LCL">
          <input
            type="number"
            value={lcl}
            onChange={(e) => setLcl(e.target.value)}
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-base)] rounded px-3 py-2"
          />
        </Field>
      </div>

      {!isEdit && (
        <Field label="Behavior">
          <select
            value={behavior}
            onChange={(e) => setBehavior(e.target.value as PropertyType['behavior'])}
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-base)] rounded px-3 py-2"
          >
            {BEHAVIORS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-[var(--border-base)] rounded"
        >
          取消
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-[var(--accent-primary)]/30 border border-[var(--accent-primary)] rounded"
        >
          儲存
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm text-[var(--text-muted)] mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </div>
      {children}
    </label>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Start backend (`cd backend && dotnet run`) and frontend (`cd frontend && npm run dev`). The modal isn't wired into App yet (Task 40), so for now just verify the file builds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/apiPropertyTypes.ts frontend/src/components/modals/PropertyTypesModal.tsx
git commit -m "feat: PropertyType frontend (apiPropertyTypes + PropertyTypesModal)"
```

---

### Task 8: Migrate EquipmentTypeSensor.Role → PropertyTypeId + RawAddress

把既有的硬編碼 `Role` 欄位換成 `PropertyTypeId` FK，新增 `RawAddress` 欄位。同時更新 `DataIngestionService` 的 material_detect 查詢邏輯。

**Files:**
- Modify: `backend/Models/Entities.cs` (EquipmentTypeSensor class)
- Modify: `backend/Data/IoTDbContext.cs` (FK 設定)
- Modify: `backend/Program.cs` (DDL migration)
- Modify: `backend/Services/DataIngestionService.cs` (查詢條件)
- Create: `backend/Tests/Integration/MigrationBackfillTests.cs`

- [ ] **Step 1: Modify EquipmentTypeSensor entity**

In `backend/Models/Entities.cs`, find the `EquipmentTypeSensor` class. Replace the `Role` property + add new fields:

```csharp
public class EquipmentTypeSensor
{
    public int Id { get; set; }
    public int EquipmentTypeId { get; set; }
    public int SensorId { get; set; }
    [Required, MaxLength(100)] public string PointId { get; set; } = "";
    [Required, MaxLength(100)] public string Label { get; set; } = "";
    [MaxLength(10)] public string Unit { get; set; } = "℃";
    public int SortOrder { get; set; }

    // 移除: [MaxLength(20)] public string Role { get; set; } = "normal";
    // 新增:
    public int PropertyTypeId { get; set; }
    public PropertyType PropertyType { get; set; } = null!;
    [MaxLength(100)] public string? RawAddress { get; set; }

    public EquipmentType EquipmentType { get; set; } = null!;
}
```

- [ ] **Step 2: Add FK config in `IoTDbContext.OnModelCreating`**

```csharp
// EquipmentTypeSensor → PropertyType FK
modelBuilder.Entity<EquipmentTypeSensor>()
    .HasOne(s => s.PropertyType)
    .WithMany()
    .HasForeignKey(s => s.PropertyTypeId)
    .OnDelete(DeleteBehavior.Restrict);  // 引用中的屬性不可刪
```

- [ ] **Step 3: Add migration DDL in Program.cs**

After the PropertyTypes seed block (added in Task 5), add:

```csharp
    // Migration: EquipmentTypeSensors.Role → PropertyTypeId
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND name = 'PropertyTypeId'
        )
        BEGIN
            ALTER TABLE [dbo].[EquipmentTypeSensors] ADD [PropertyTypeId] INT NULL;
            ALTER TABLE [dbo].[EquipmentTypeSensors] ADD [RawAddress] NVARCHAR(100) NULL;
        END
        """);

    // 把舊 Role 對應到新 PropertyTypeId
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND name = 'Role'
        )
        BEGIN
            UPDATE ets
            SET ets.PropertyTypeId = pt.Id
            FROM [dbo].[EquipmentTypeSensors] ets
            INNER JOIN [dbo].[PropertyTypes] pt ON pt.[Key] = 'material_detect'
            WHERE ets.Role = 'material_detect' AND ets.PropertyTypeId IS NULL;

            UPDATE ets
            SET ets.PropertyTypeId = pt.Id
            FROM [dbo].[EquipmentTypeSensors] ets
            INNER JOIN [dbo].[PropertyTypes] pt ON pt.[Key] = 'temperature'
            WHERE ets.Role = 'normal' AND ets.PropertyTypeId IS NULL;
        END
        """);

    // 任何 PropertyTypeId 還是 NULL 的，預設給 temperature
    await ctx.Database.ExecuteSqlRawAsync("""
        UPDATE [dbo].[EquipmentTypeSensors]
        SET PropertyTypeId = (SELECT Id FROM [dbo].[PropertyTypes] WHERE [Key] = 'temperature')
        WHERE PropertyTypeId IS NULL;
        """);

    // 改為 NOT NULL + 加 FK + 砍掉舊 Role 欄位
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND name = 'PropertyTypeId'
        )
        AND NOT EXISTS (
            SELECT 1 FROM sys.foreign_keys
            WHERE name = 'FK_EquipmentTypeSensors_PropertyTypes'
        )
        BEGIN
            ALTER TABLE [dbo].[EquipmentTypeSensors] ALTER COLUMN [PropertyTypeId] INT NOT NULL;
            ALTER TABLE [dbo].[EquipmentTypeSensors]
                ADD CONSTRAINT FK_EquipmentTypeSensors_PropertyTypes
                FOREIGN KEY (PropertyTypeId) REFERENCES [dbo].[PropertyTypes](Id);
            CREATE INDEX IX_EquipmentTypeSensors_PropertyTypeId
                ON [dbo].[EquipmentTypeSensors] (PropertyTypeId);
        END
        """);

    // 砍掉舊 Role 欄位
    await ctx.Database.ExecuteSqlRawAsync("""
        IF EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('dbo.EquipmentTypeSensors') AND name = 'Role'
        )
        BEGIN
            ALTER TABLE [dbo].[EquipmentTypeSensors] DROP COLUMN Role;
        END
        """);
```

- [ ] **Step 4: Update DataIngestionService.GetMaterialDetectSensorIdAsync**

In `backend/Services/DataIngestionService.cs`, find the `GetMaterialDetectSensorIdAsync` method (added in Direction-C). Update the LINQ query:

```csharp
private async Task<int?> GetMaterialDetectSensorIdAsync(string assetCode, IoT.CentralApi.Data.IoTDbContext db)
{
    if (_materialDetectCache.TryGetValue(assetCode, out var cached))
        return cached;

    var sensorId = await db.LineEquipments
        .Where(le => le.AssetCode == assetCode)
        .SelectMany(le => le.EquipmentType.Sensors)
        // 改前: .Where(s => s.Role == "material_detect")
        .Where(s => s.PropertyType.Behavior == "material_detect")
        .Select(s => (int?)s.SensorId)
        .FirstOrDefaultAsync();

    _materialDetectCache[assetCode] = sensorId;
    return sensorId;
}
```

- [ ] **Step 5: Update existing EquipmentTypeController and LineConfigController DTOs**

The existing `EquipmentTypeController.cs` and `LineConfigController.cs` use the old `Role` field in their DTOs. We need to add `propertyTypeId` and `rawAddress` to those DTOs.

Edit `backend/Controllers/EquipmentTypeController.cs`:

Find:
```csharp
public record EquipmentTypeSensorDto(
    int Id, int SensorId, string PointId,
    string Label, string Unit, string Role, int SortOrder);
```

Replace with:
```csharp
public record EquipmentTypeSensorDto(
    int Id, int SensorId, string PointId,
    string Label, string Unit, int PropertyTypeId, string? RawAddress, int SortOrder);
```

Find:
```csharp
public record SaveSensorRequest(
    [Range(1, int.MaxValue)] int SensorId,
    [Required, MaxLength(100)] string PointId,
    [Required, MaxLength(100)] string Label,
    [MaxLength(10)] string Unit = "℃",
    [MaxLength(20)] string Role = "normal",
    int SortOrder = 0);
```

Replace with:
```csharp
public record SaveSensorRequest(
    [Range(1, int.MaxValue)] int SensorId,
    [Required, MaxLength(100)] string PointId,
    [Required, MaxLength(100)] string Label,
    [MaxLength(10)] string Unit,
    int PropertyTypeId,
    string? RawAddress = null,
    int SortOrder = 0);
```

Update `MapToDtoPublic` and the mapping inside `Create`/`Update`:

```csharp
internal static EquipmentTypeDto MapToDtoPublic(EquipmentType et) => new(
    et.Id, et.Name, et.VisType, et.Description, et.CreatedAt,
    et.Sensors.Select(s => new EquipmentTypeSensorDto(
        s.Id, s.SensorId, s.PointId, s.Label, s.Unit,
        s.PropertyTypeId, s.RawAddress, s.SortOrder
    )).ToList());
```

In `Create`:
```csharp
Sensors = req.Sensors.Select((s, i) => new EquipmentTypeSensor
{
    SensorId = s.SensorId,
    PointId = s.PointId,
    Label = s.Label,
    Unit = s.Unit,
    PropertyTypeId = s.PropertyTypeId,
    RawAddress = s.RawAddress,
    SortOrder = s.SortOrder == 0 ? i : s.SortOrder,
}).ToList(),
```

Same in `Update`:
```csharp
et.Sensors = req.Sensors.Select((s, i) => new EquipmentTypeSensor
{
    EquipmentTypeId = id,
    SensorId = s.SensorId,
    PointId = s.PointId,
    Label = s.Label,
    Unit = s.Unit,
    PropertyTypeId = s.PropertyTypeId,
    RawAddress = s.RawAddress,
    SortOrder = s.SortOrder == 0 ? i : s.SortOrder,
}).ToList();
```

Add `.Include(et => et.Sensors).ThenInclude(s => s.PropertyType)` to all queries that load sensors (so the FK is hydrated).

In `GetAll`, `GetOne`, `Create`, `Update`:
```csharp
var types = await db.EquipmentTypes
    .Include(et => et.Sensors.OrderBy(s => s.SortOrder))
        .ThenInclude(s => s.PropertyType)
    .OrderBy(et => et.CreatedAt)
    .ToListAsync();
```

- [ ] **Step 6: Update LineConfigController similarly**

In `backend/Controllers/LineConfigController.cs`, find `GetAll`, `GetOne`, `LoadFullAsync`. Add `.ThenInclude(s => s.PropertyType)` after `.ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))`.

Example for `GetAll`:
```csharp
var lines = await db.LineConfigs
    .Include(lc => lc.Equipments.OrderBy(le => le.SortOrder))
        .ThenInclude(le => le.EquipmentType)
            .ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))
                .ThenInclude(s => s.PropertyType)
    .OrderBy(lc => lc.Id)
    .ToListAsync();
```

Apply to `GetOne` and `LoadFullAsync` too.

- [ ] **Step 7: Write migration backfill test**

`backend/Tests/Integration/MigrationBackfillTests.cs`:

```csharp
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using IoT.CentralApi.Tests._Shared;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Tests.Integration;

public class MigrationBackfillTests : IntegrationTestBase
{
    [Fact]
    public async Task Startup_SeedsBuiltInPropertyTypes()
    {
        await using var db = await CreateDbContextAsync();
        var props = await db.PropertyTypes.ToListAsync();

        props.Should().HaveCount(8);
        props.Should().Contain(p => p.Key == "temperature" && p.IsBuiltIn);
        props.Should().Contain(p => p.Key == "material_detect" && p.Behavior == "material_detect");
    }

    [Fact]
    public async Task EquipmentTypeSensor_CanBeCreated_WithPropertyTypeId()
    {
        await using var db = await CreateDbContextAsync();

        var temp = await db.PropertyTypes.FirstAsync(p => p.Key == "temperature");

        var et = new EquipmentType
        {
            Name = "Test EQ",
            VisType = "single_kpi",
            CreatedAt = DateTime.UtcNow,
            Sensors = new List<EquipmentTypeSensor>
            {
                new()
                {
                    SensorId = 9001,
                    PointId = "pt_t1",
                    Label = "Temp",
                    Unit = "℃",
                    PropertyTypeId = temp.Id,
                    RawAddress = "40001",
                    SortOrder = 0
                }
            }
        };

        db.EquipmentTypes.Add(et);
        await db.SaveChangesAsync();

        var loaded = await db.EquipmentTypes
            .Include(e => e.Sensors)
                .ThenInclude(s => s.PropertyType)
            .FirstAsync(e => e.Id == et.Id);

        loaded.Sensors.Should().HaveCount(1);
        loaded.Sensors[0].PropertyType.Key.Should().Be("temperature");
        loaded.Sensors[0].RawAddress.Should().Be("40001");
    }
}
```

- [ ] **Step 8: Build + run tests**

```bash
powershell -Command "Stop-Process -Name 'IoT.CentralApi' -Force -ErrorAction SilentlyContinue"
dotnet build backend/IoT.CentralApi.csproj 2>&1 | tail -5
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~MigrationBackfillTests"
```

Expected: build success, both tests pass.

Also verify existing PropertyType controller tests still pass:
```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~PropertyTypeControllerTests"
```

Expected: 6/6 pass.

- [ ] **Step 9: Smoke test backend startup against real DB**

```bash
cd backend && dotnet run &>/dev/null &
sleep 8
curl -s http://localhost:5200/api/property-types | python -m json.tool | head -20
curl -s http://localhost:5200/api/equipment-types | python -m json.tool | head -30
powershell -Command "Stop-Process -Name 'IoT.CentralApi' -Force -ErrorAction SilentlyContinue"
```

Expected:
- `/api/property-types` returns 8 builtins
- `/api/equipment-types` returns existing 6 types with `propertyTypeId` field populated (not null)

- [ ] **Step 10: Commit**

```bash
git add backend/Models/Entities.cs backend/Data/IoTDbContext.cs backend/Program.cs backend/Services/DataIngestionService.cs backend/Controllers/EquipmentTypeController.cs backend/Controllers/LineConfigController.cs backend/Tests/Integration/MigrationBackfillTests.cs
git commit -m "feat: migrate EquipmentTypeSensor.Role → PropertyTypeId + RawAddress"
```

---

# Phase 3 — Adapter Infrastructure (Tasks 9-10)

---

### Task 9: IProtocolAdapter Interface + Result + Supporting Types

定義整個 adapter 系統的契約。所有後續 adapter 都依賴這個 task 的型別。

**Files:**
- Create: `backend/Adapters/Contracts/IProtocolAdapter.cs`
- Create: `backend/Adapters/Contracts/Result.cs`
- Create: `backend/Adapters/Contracts/ErrorKind.cs`
- Create: `backend/Adapters/Contracts/ConfigSchema.cs`
- Create: `backend/Adapters/Contracts/ConfigField.cs`
- Create: `backend/Adapters/Contracts/ValidationResult.cs`
- Create: `backend/Adapters/Contracts/DiscoveryResult.cs`
- Create: `backend/Adapters/Contracts/DiscoveredPoint.cs`
- Create: `backend/Adapters/Contracts/PollResult.cs`
- Create: `backend/Dtos/ErrorResponse.cs`
- Modify: `backend/Adapters/_Template.cs` (un-comment)

- [ ] **Step 1: ErrorKind enum**

`backend/Adapters/Contracts/ErrorKind.cs`:

```csharp
namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// Adapter 操作失敗的分類。決定 PollingBackgroundService 的重試策略：
///   - Transient: 自動退避重試
///   - Permanent (InvalidConfig/Unauthorized/UnknownProtocol): 進入斷路器，30 秒慢重試
///   - DeviceError: 視 ErrorMessage 內容處理（通常 transient）
///   - Bug: 記 log，不影響其他 connection
/// </summary>
public enum ErrorKind
{
    None = 0,
    Transient,
    InvalidConfig,
    DeviceError,
    Unauthorized,
    UnknownProtocol,
    Bug,
}
```

- [ ] **Step 2: Result<T> record**

`backend/Adapters/Contracts/Result.cs`:

```csharp
namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// Adapter 方法的統一回傳型別。**Adapter 絕不 throw**，所有例外狀況包進 Result.Fail。
/// 唯一例外: OperationCanceledException 仍可往上拋（呼叫端用 CancellationToken 取消時用）。
/// </summary>
public record Result<T>
{
    public bool IsSuccess { get; init; }
    public T? Value { get; init; }
    public string? ErrorMessage { get; init; }
    public ErrorKind ErrorKind { get; init; }

    public static Result<T> Ok(T value) => new()
    {
        IsSuccess = true,
        Value = value,
        ErrorKind = ErrorKind.None
    };

    public static Result<T> Fail(ErrorKind kind, string message) => new()
    {
        IsSuccess = false,
        ErrorKind = kind,
        ErrorMessage = message
    };
}
```

- [ ] **Step 3: ConfigField + ConfigSchema**

`backend/Adapters/Contracts/ConfigField.cs`:

```csharp
namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// 一個 config 欄位的描述。前端用這個資訊動態渲染 wizard Step 2 的表單。
/// </summary>
/// <param name="Name">欄位 key (e.g. "host")</param>
/// <param name="Type">"string" | "number" | "enum" | "boolean"</param>
/// <param name="Label">給用戶看的標籤 (e.g. "IP 位址")</param>
/// <param name="Required">是否必填</param>
/// <param name="DefaultValue">預設值（字串型式）</param>
/// <param name="Placeholder">輸入框 placeholder</param>
/// <param name="Options">當 Type="enum" 時的選項列表</param>
/// <param name="Min">當 Type="number" 時的最小值</param>
/// <param name="Max">當 Type="number" 時的最大值</param>
public record ConfigField(
    string Name,
    string Type,
    string Label,
    bool Required = false,
    string? DefaultValue = null,
    string? Placeholder = null,
    string[]? Options = null,
    double? Min = null,
    double? Max = null);
```

`backend/Adapters/Contracts/ConfigSchema.cs`:

```csharp
namespace IoT.CentralApi.Adapters.Contracts;

public record ConfigSchema
{
    public List<ConfigField> Fields { get; init; } = new();
}
```

- [ ] **Step 4: ValidationResult**

`backend/Adapters/Contracts/ValidationResult.cs`:

```csharp
namespace IoT.CentralApi.Adapters.Contracts;

public record ValidationResult
{
    public bool IsValid { get; init; }
    public string? Error { get; init; }

    public static ValidationResult Valid() => new() { IsValid = true };
    public static ValidationResult Invalid(string error) => new() { IsValid = false, Error = error };
}
```

- [ ] **Step 5: DiscoveredPoint + DiscoveryResult**

`backend/Adapters/Contracts/DiscoveredPoint.cs`:

```csharp
namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// Discovery 階段回傳的單一資料點。
/// </summary>
/// <param name="RawAddress">設備端原始地址 (Modbus: "40001"，WebAPI: "$.data.temp1")</param>
/// <param name="CurrentValue">當前值（discover 當下抓到的）</param>
/// <param name="DataType">資料型態（顯示用）</param>
/// <param name="SuggestedLabel">建議的標籤名稱（如果 adapter 能猜出）</param>
public record DiscoveredPoint(
    string RawAddress,
    double CurrentValue,
    string DataType,
    string? SuggestedLabel = null);
```

`backend/Adapters/Contracts/DiscoveryResult.cs`:

```csharp
namespace IoT.CentralApi.Adapters.Contracts;

public record DiscoveryResult(List<DiscoveredPoint> Points);
```

- [ ] **Step 6: PollResult**

`backend/Adapters/Contracts/PollResult.cs`:

```csharp
namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// Poll 階段回傳的當前讀值集合。Key = RawAddress，Value = 讀到的數值。
/// PollingBackgroundService 會把這個轉成 IngestPayload 後丟給 DataIngestionService。
/// </summary>
public record PollResult(
    Dictionary<string, double> Values,
    DateTime Timestamp);
```

- [ ] **Step 7: IProtocolAdapter interface**

`backend/Adapters/Contracts/IProtocolAdapter.cs`:

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// IProtocolAdapter — 協議適配器契約
// ─────────────────────────────────────────────────────────────────────────────
// 每個協議實作此介面 (Modbus TCP / WebAPI / Push Ingest...)
//
// 規則:
//   1. 絕不 throw exception (除了 OperationCanceledException)
//   2. 所有失敗包進 Result<T>.Fail，含 ErrorKind 和訊息
//   3. ProtocolId 不可改 (已存進 DB 的 DeviceConnection.Protocol)
//   4. ConfigSchema 是給前端動態渲染表單用的契約
//
// 註冊方式 (Program.cs):
//   builder.Services.AddSingleton<IProtocolAdapter, YourAdapter>();
//
// PollingBackgroundService 透過 IEnumerable<IProtocolAdapter> 取得全部 adapter，
// 再用 ProtocolId 字串比對找對應的那個。
// ─────────────────────────────────────────────────────────────────────────────

namespace IoT.CentralApi.Adapters.Contracts;

public interface IProtocolAdapter
{
    /// <summary>機器識別碼，e.g. "modbus_tcp"。存進 DB 後不可改。</summary>
    string ProtocolId { get; }

    /// <summary>顯示名稱，e.g. "Modbus TCP"。</summary>
    string DisplayName { get; }

    /// <summary>是否支援後端主動掃描。Push 協議為 false。</summary>
    bool SupportsDiscovery { get; }

    /// <summary>是否支援後端定時輪詢。Push 協議為 false。</summary>
    bool SupportsLivePolling { get; }

    /// <summary>取得 config 欄位 schema (給前端動態生成表單)。</summary>
    ConfigSchema GetConfigSchema();

    /// <summary>驗證 config JSON 是否合法。</summary>
    ValidationResult ValidateConfig(string configJson);

    /// <summary>連接設備並回傳所有可讀的資料點 (一次性掃描)。</summary>
    Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct);

    /// <summary>讀取當前所有資料點的值 (背景輪詢時呼叫)。</summary>
    Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct);
}
```

- [ ] **Step 8: ErrorResponse DTO**

`backend/Dtos/ErrorResponse.cs`:

```csharp
namespace IoT.CentralApi.Dtos;

/// <summary>
/// 統一錯誤回應格式。所有 controller 在錯誤時回傳這個結構。
/// 前端用 code 欄位決定 UI 處理 (toast / modal / inline / banner)。
/// </summary>
public record ErrorResponse(
    string Code,
    string Message,
    object? Details = null);
```

- [ ] **Step 9: Re-enable `_Template.cs`**

Edit `backend/Adapters/_Template.cs` and remove the comment wrappers added in Task 4. The file should now be:

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE: Protocol Adapter
// ─────────────────────────────────────────────────────────────────────────────
// (header as before — see Task 4)
// ─────────────────────────────────────────────────────────────────────────────

using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Adapters;

public class TemplateAdapter : IProtocolAdapter
{
    public string ProtocolId => "template";
    public string DisplayName => "Template Protocol";
    public bool SupportsDiscovery => true;
    public bool SupportsLivePolling => true;

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField("host", "string", "主機位址",
                Required: true, Placeholder: "192.168.1.1"),
            new ConfigField("port", "number", "Port",
                Required: true, DefaultValue: "8080"),
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        return ValidationResult.Invalid("Template adapter not implemented");
    }

    public Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct)
    {
        return Task.FromResult(Result<DiscoveryResult>.Fail(
            ErrorKind.UnknownProtocol, "Template adapter not implemented"));
    }

    public Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        return Task.FromResult(Result<PollResult>.Fail(
            ErrorKind.UnknownProtocol, "Template adapter not implemented"));
    }
}
```

> **Important**: Comment out the `[Singleton]` registration — we don't want the template registered. We'll add an `[Obsolete]` attribute to make it clear this is just a reference.

Add `[Obsolete("Template only — copy this file to create a new adapter")]` above the class.

- [ ] **Step 10: Build to verify all contracts compile**

```bash
powershell -Command "Stop-Process -Name 'IoT.CentralApi' -Force -ErrorAction SilentlyContinue"
dotnet build backend/IoT.CentralApi.csproj 2>&1 | tail -5
```

Expected: build success.

- [ ] **Step 11: Commit**

```bash
git add backend/Adapters/Contracts/ backend/Adapters/_Template.cs backend/Dtos/ErrorResponse.cs
git commit -m "feat: IProtocolAdapter contracts + Result<T> + supporting types"
```

---

### Task 10: Wire up `_StepTemplate.tsx` Placeholder

Foundation cleanup: ensure `_StepTemplate.tsx` is ready (full content) but not breaking the build.

**Files:**
- Modify: `frontend/src/components/modals/DeviceIntegrationWizard/steps/_StepTemplate.tsx`

- [ ] **Step 1: Keep template stubbed but documented**

Since `WizardContext` still doesn't exist (created in Task 30), keep the template as a documentation-only file:

```tsx
// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE: Wizard Step Component
// ─────────────────────────────────────────────────────────────────────────────
// To create a new wizard step:
//   1. Copy this file to `Step{N}_{Name}.tsx`
//   2. Rename component `StepTemplate` → `Step{N}{Name}`
//   3. Use `useWizard()` hook (defined in WizardContext.tsx) to read/update state
//   4. Call `actions.next()` / `actions.prev()` for navigation
//   5. Add your step to the steps array in `index.tsx`
//
// EXAMPLE STRUCTURE (uncomment and adapt):
//
// import { useWizard } from '../WizardContext';
//
// export function StepTemplate() {
//   const { state, actions } = useWizard();
//
//   return (
//     <div className="p-6">
//       <h2 className="text-lg font-semibold mb-4">步驟標題</h2>
//
//       <div className="mb-6">
//         {/* 步驟內容 */}
//       </div>
//
//       <div className="flex justify-between">
//         <button onClick={actions.prev} className="px-4 py-2 border rounded">
//           ← 上一步
//         </button>
//         <button onClick={actions.next} className="px-4 py-2 bg-blue-500 text-white rounded">
//           下一步 →
//         </button>
//       </div>
//     </div>
//   );
// }
// ─────────────────────────────────────────────────────────────────────────────

export {};
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/modals/DeviceIntegrationWizard/steps/_StepTemplate.tsx
git commit -m "docs: clarify _StepTemplate.tsx as documentation stub until WizardContext lands"
```

---

# Phase 4 — Three Adapters (Tasks 11-15)

---

### Task 11: PushIngestAdapter (Simplest)

最簡單的 adapter — 不掃描、不輪詢，只是宣告自己存在。

**Files:**
- Create: `backend/Adapters/PushIngestConfig.cs`
- Create: `backend/Adapters/PushIngestAdapter.cs`
- Create: `backend/Tests/Adapters/PushIngestAdapterTests.cs`
- Modify: `backend/Program.cs` (DI 註冊)

- [ ] **Step 1: Write failing test**

`backend/Tests/Adapters/PushIngestAdapterTests.cs`:

```csharp
using System.Text.Json;
using IoT.CentralApi.Adapters;
using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Tests.Adapters;

public class PushIngestAdapterTests
{
    private readonly PushIngestAdapter _sut = new();

    [Fact]
    public void ProtocolId_IsPushIngest()
    {
        _sut.ProtocolId.Should().Be("push_ingest");
    }

    [Fact]
    public void DisplayName_IsHumanReadable()
    {
        _sut.DisplayName.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void SupportsDiscovery_IsFalse()
    {
        _sut.SupportsDiscovery.Should().BeFalse();
    }

    [Fact]
    public void SupportsLivePolling_IsFalse()
    {
        _sut.SupportsLivePolling.Should().BeFalse();
    }

    [Fact]
    public void GetConfigSchema_ContainsSerialNumberField()
    {
        var schema = _sut.GetConfigSchema();
        schema.Fields.Should().Contain(f => f.Name == "serialNumber" && f.Required);
    }

    [Fact]
    public void ValidateConfig_AcceptsValidJson()
    {
        var json = JsonSerializer.Serialize(new { serialNumber = "OVEN-42" });
        var result = _sut.ValidateConfig(json);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ValidateConfig_RejectsMissingSerialNumber()
    {
        var json = JsonSerializer.Serialize(new { });
        var result = _sut.ValidateConfig(json);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateConfig_RejectsInvalidJson()
    {
        var result = _sut.ValidateConfig("not a json");
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task DiscoverAsync_ReturnsUnknownProtocol()
    {
        var json = JsonSerializer.Serialize(new { serialNumber = "OVEN-42" });
        var result = await _sut.DiscoverAsync(json, CancellationToken.None);
        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.UnknownProtocol);
    }

    [Fact]
    public async Task PollAsync_ReturnsUnknownProtocol()
    {
        var json = JsonSerializer.Serialize(new { serialNumber = "OVEN-42" });
        var result = await _sut.PollAsync(json, CancellationToken.None);
        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.UnknownProtocol);
    }
}
```

- [ ] **Step 2: Run test, verify they fail**

```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~PushIngestAdapterTests"
```

Expected: All FAIL with "PushIngestAdapter not found".

- [ ] **Step 3: Create config record**

`backend/Adapters/PushIngestConfig.cs`:

```csharp
namespace IoT.CentralApi.Adapters;

internal record PushIngestConfig(string SerialNumber);
```

- [ ] **Step 4: Implement adapter**

`backend/Adapters/PushIngestAdapter.cs`:

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// PushIngestAdapter — 外部推送協議的 adapter
// ─────────────────────────────────────────────────────────────────────────────
// 此 adapter 不主動連線、不輪詢。實際資料由外部程式 (e.g. OvenDataReceive)
// POST 到 /api/data/ingest，由 DataIngestionService 處理。
//
// PollingBackgroundService 會跳過 protocol="push_ingest" 的 connection。
//
// Discovery 在前端透過 SSE 監聽 /api/stream 過濾 SN 來實現 (不走 DiscoverAsync)。
// ─────────────────────────────────────────────────────────────────────────────

using System.Text.Json;
using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Adapters;

public class PushIngestAdapter : IProtocolAdapter
{
    public string ProtocolId => "push_ingest";
    public string DisplayName => "外部推送";
    public bool SupportsDiscovery => false;
    public bool SupportsLivePolling => false;

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField(
                Name: "serialNumber",
                Type: "string",
                Label: "設備序號 (SN)",
                Required: true,
                Placeholder: "OVEN-42")
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        try
        {
            var config = JsonSerializer.Deserialize<PushIngestConfig>(configJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (config == null || string.IsNullOrWhiteSpace(config.SerialNumber))
                return ValidationResult.Invalid("serialNumber 不能為空");

            return ValidationResult.Valid();
        }
        catch (JsonException ex)
        {
            return ValidationResult.Invalid($"Config JSON 格式錯誤: {ex.Message}");
        }
    }

    public Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct)
    {
        return Task.FromResult(Result<DiscoveryResult>.Fail(
            ErrorKind.UnknownProtocol,
            "Push 模式不支援後端 discovery；請用前端 SSE 監聽即時樣本"));
    }

    public Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        return Task.FromResult(Result<PollResult>.Fail(
            ErrorKind.UnknownProtocol,
            "Push 模式不支援後端 polling；資料由外部 POST /api/data/ingest 推進來"));
    }
}
```

- [ ] **Step 5: Register in Program.cs**

In `backend/Program.cs`, find the application services registration block (search for `AddSingleton<DataIngestionService>`). Add immediately above or below:

```csharp
// ── Protocol Adapters ─────────────────────────────────────────────────────
builder.Services.AddSingleton<IProtocolAdapter, PushIngestAdapter>();
```

Add `using IoT.CentralApi.Adapters;` and `using IoT.CentralApi.Adapters.Contracts;` at the top of `Program.cs` if not already there.

- [ ] **Step 6: Run tests, verify they pass**

```bash
powershell -Command "Stop-Process -Name 'IoT.CentralApi' -Force -ErrorAction SilentlyContinue"
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~PushIngestAdapterTests"
```

Expected: All 10 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/Adapters/PushIngestAdapter.cs backend/Adapters/PushIngestConfig.cs backend/Tests/Adapters/PushIngestAdapterTests.cs backend/Program.cs
git commit -m "feat: PushIngestAdapter (no-op for already-pushed devices)"
```

---

### Task 12: ModbusTcpAdapter Implementation

**Files:**
- Create: `backend/Adapters/ModbusTcpConfig.cs`
- Create: `backend/Adapters/ModbusTcpAdapter.cs`
- Modify: `backend/Program.cs` (DI 註冊)

- [ ] **Step 1: Create config record**

`backend/Adapters/ModbusTcpConfig.cs`:

```csharp
namespace IoT.CentralApi.Adapters;

internal record ModbusTcpConfig(
    string Host,
    int Port,
    int UnitId,
    int StartAddress,
    int Count,
    string DataType);  // "uint16" | "int16" | "uint32" | "int32" | "float32"
```

- [ ] **Step 2: Implement adapter**

`backend/Adapters/ModbusTcpAdapter.cs`:

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// ModbusTcpAdapter — Modbus TCP 協議的 adapter
// ─────────────────────────────────────────────────────────────────────────────
// 用 FluentModbus 連 PLC TCP port，讀 holding registers (function code 03)。
// 支援 uint16/int16/uint32/int32/float32 五種資料型態。
//
// Modbus 暫存器地址規範:
//   - Modbus protocol 用 0-based offset (0~65535)
//   - "40001" 是慣用的 1-based holding register 標記，對應 offset 0
//   - StartAddress = 40001 表示從 holding register offset 0 開始
//
// 這個 adapter 把 40001-based 地址自動轉成 0-based offset。
//
// 依賴:
//   - FluentModbus NuGet (5.x)
//
// 測試:
//   - backend/Tests/Adapters/ModbusTcpAdapterTests.cs
//   - 用 FluentModbus.ModbusTcpServer 啟動 in-memory fake server
// ─────────────────────────────────────────────────────────────────────────────

using System.Net.Sockets;
using System.Text.Json;
using FluentModbus;
using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Adapters;

public class ModbusTcpAdapter : IProtocolAdapter
{
    public string ProtocolId => "modbus_tcp";
    public string DisplayName => "Modbus TCP";
    public bool SupportsDiscovery => true;
    public bool SupportsLivePolling => true;

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField("host", "string", "IP 位址",
                Required: true, Placeholder: "192.168.1.50"),
            new ConfigField("port", "number", "Port",
                Required: true, DefaultValue: "502", Min: 1, Max: 65535),
            new ConfigField("unitId", "number", "Unit ID",
                Required: true, DefaultValue: "1", Min: 0, Max: 255),
            new ConfigField("startAddress", "number", "起始位址",
                Required: true, DefaultValue: "40001"),
            new ConfigField("count", "number", "讀取數量",
                Required: true, DefaultValue: "20", Min: 1, Max: 125),
            new ConfigField("dataType", "enum", "資料型態",
                Required: true, DefaultValue: "uint16",
                Options: new[] { "uint16", "int16", "uint32", "int32", "float32" })
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        try
        {
            var config = ParseConfig(configJson);
            if (string.IsNullOrWhiteSpace(config.Host))
                return ValidationResult.Invalid("host 不能為空");
            if (config.Port < 1 || config.Port > 65535)
                return ValidationResult.Invalid("port 必須介於 1-65535");
            if (config.UnitId < 0 || config.UnitId > 255)
                return ValidationResult.Invalid("unitId 必須介於 0-255");
            if (config.Count < 1 || config.Count > 125)
                return ValidationResult.Invalid("count 必須介於 1-125");
            if (!IsValidDataType(config.DataType))
                return ValidationResult.Invalid($"不支援的 dataType: {config.DataType}");
            return ValidationResult.Valid();
        }
        catch (JsonException ex)
        {
            return ValidationResult.Invalid($"Config JSON 格式錯誤: {ex.Message}");
        }
    }

    public async Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct)
    {
        return await ReadAsync(configJson, ct, isDiscover: true);
    }

    public async Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        var read = await ReadAsync(configJson, ct, isDiscover: false);
        if (!read.IsSuccess)
            return Result<PollResult>.Fail(read.ErrorKind, read.ErrorMessage!);

        var values = read.Value!.Points.ToDictionary(p => p.RawAddress, p => p.CurrentValue);
        return Result<PollResult>.Ok(new PollResult(values, DateTime.UtcNow));
    }

    /// <summary>共用的 Modbus TCP 讀取邏輯，給 Discover 和 Poll 都用</summary>
    private async Task<Result<DiscoveryResult>> ReadAsync(string configJson, CancellationToken ct, bool isDiscover)
    {
        ModbusTcpConfig config;
        try
        {
            config = ParseConfig(configJson);
        }
        catch (JsonException ex)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.InvalidConfig, $"Config JSON 格式錯誤: {ex.Message}");
        }

        ModbusTcpClient? client = null;
        try
        {
            client = new ModbusTcpClient
            {
                ConnectTimeout = 5000,
                ReadTimeout = 5000,
                WriteTimeout = 5000,
            };

            client.Connect(new System.Net.IPEndPoint(
                System.Net.IPAddress.Parse(config.Host), config.Port));

            // Modbus 40001-based → 0-based offset
            int offset = config.StartAddress - 40001;
            if (offset < 0) offset = config.StartAddress;  // 已經是 0-based

            int registerCount = config.DataType is "uint32" or "int32" or "float32"
                ? config.Count * 2
                : config.Count;

            var raw = client.ReadHoldingRegisters<short>((byte)config.UnitId, offset, registerCount);
            var points = ParseRegisters(raw, config);

            return Result<DiscoveryResult>.Ok(new DiscoveryResult(points));
        }
        catch (OperationCanceledException) { throw; }
        catch (FormatException ex)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.InvalidConfig, $"IP 位址格式錯誤: {ex.Message}");
        }
        catch (SocketException ex)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.Transient, $"連線失敗 {config.Host}:{config.Port} — {ex.Message}");
        }
        catch (TimeoutException)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.Transient, $"連線逾時 {config.Host}:{config.Port}");
        }
        catch (ModbusException ex)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.DeviceError, $"Modbus 協議錯誤: {ex.Message}");
        }
        catch (Exception ex)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.Bug, $"未預期錯誤 ({ex.GetType().Name}): {ex.Message}");
        }
        finally
        {
            try { client?.Disconnect(); } catch { /* ignore */ }
        }
    }

    private static List<DiscoveredPoint> ParseRegisters(Span<short> raw, ModbusTcpConfig config)
    {
        var points = new List<DiscoveredPoint>();
        int wordsPerValue = config.DataType is "uint32" or "int32" or "float32" ? 2 : 1;
        int valueCount = raw.Length / wordsPerValue;

        for (int i = 0; i < valueCount; i++)
        {
            int wordIndex = i * wordsPerValue;
            double value = config.DataType switch
            {
                "uint16" => (ushort)raw[wordIndex],
                "int16" => raw[wordIndex],
                "uint32" => ((uint)((ushort)raw[wordIndex]) << 16) | (uint)((ushort)raw[wordIndex + 1]),
                "int32" => (int)(((uint)((ushort)raw[wordIndex]) << 16) | (uint)((ushort)raw[wordIndex + 1])),
                "float32" => BitConverter.Int32BitsToSingle(
                    (int)(((uint)((ushort)raw[wordIndex]) << 16) | (uint)((ushort)raw[wordIndex + 1]))),
                _ => 0
            };

            string address = (config.StartAddress + i).ToString();
            points.Add(new DiscoveredPoint(address, value, config.DataType));
        }

        return points;
    }

    private static ModbusTcpConfig ParseConfig(string json)
    {
        var config = JsonSerializer.Deserialize<ModbusTcpConfig>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        return config ?? throw new JsonException("Config 為 null");
    }

    private static bool IsValidDataType(string dt) =>
        dt is "uint16" or "int16" or "uint32" or "int32" or "float32";
}
```

- [ ] **Step 3: Register in Program.cs**

```csharp
builder.Services.AddSingleton<IProtocolAdapter, ModbusTcpAdapter>();
```

- [ ] **Step 4: Build to verify**

```bash
powershell -Command "Stop-Process -Name 'IoT.CentralApi' -Force -ErrorAction SilentlyContinue"
dotnet build backend/IoT.CentralApi.csproj 2>&1 | tail -5
```

Expected: build success.

- [ ] **Step 5: Commit**

```bash
git add backend/Adapters/ModbusTcpConfig.cs backend/Adapters/ModbusTcpAdapter.cs backend/Program.cs
git commit -m "feat: ModbusTcpAdapter using FluentModbus"
```

---

### Task 13: ModbusTcpAdapter Tests with In-Memory Server

用 FluentModbus 自帶的 `ModbusTcpServer` 啟動 fake device，做完整的 unit test。

**Files:**
- Create: `backend/Tests/Adapters/_Fixtures/ModbusTestServerFixture.cs`
- Create: `backend/Tests/Adapters/ModbusTcpAdapterTests.cs`

- [ ] **Step 1: Create test server fixture**

`backend/Tests/Adapters/_Fixtures/ModbusTestServerFixture.cs`:

```csharp
using System.Net;
using System.Net.Sockets;
using FluentModbus;

namespace IoT.CentralApi.Tests.Adapters._Fixtures;

/// <summary>
/// Spins up an in-memory Modbus TCP server for testing.
/// Pre-populates holding registers for predictable test data.
///
/// Usage:
///   await using var fixture = await ModbusTestServerFixture.StartAsync();
///   var port = fixture.Port;
///   // ... call adapter with localhost:port ...
/// </summary>
public sealed class ModbusTestServerFixture : IAsyncDisposable
{
    public int Port { get; private set; }
    public ModbusTcpServer Server { get; private set; } = null!;

    public static async Task<ModbusTestServerFixture> StartAsync()
    {
        var fixture = new ModbusTestServerFixture
        {
            Port = GetFreePort(),
        };

        fixture.Server = new ModbusTcpServer
        {
            EnableRaisingEvents = false,
        };
        fixture.Server.Start(IPAddress.Loopback, fixture.Port);

        await Task.Delay(100);  // 給 server 一點時間 ready
        return fixture;
    }

    public void SetRegister(int offset, short value)
    {
        var registers = Server.GetHoldingRegisters();
        registers[offset] = value;
    }

    public ValueTask DisposeAsync()
    {
        try { Server?.Stop(); } catch { }
        return ValueTask.CompletedTask;
    }

    private static int GetFreePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}
```

- [ ] **Step 2: Create adapter test file**

`backend/Tests/Adapters/ModbusTcpAdapterTests.cs`:

```csharp
using System.Text.Json;
using IoT.CentralApi.Adapters;
using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Tests.Adapters._Fixtures;

namespace IoT.CentralApi.Tests.Adapters;

public class ModbusTcpAdapterTests
{
    private readonly ModbusTcpAdapter _sut = new();

    [Fact]
    public void ProtocolId_IsModbusTcp()
    {
        _sut.ProtocolId.Should().Be("modbus_tcp");
    }

    [Fact]
    public void GetConfigSchema_ContainsRequiredFields()
    {
        var schema = _sut.GetConfigSchema();
        schema.Fields.Select(f => f.Name).Should().Contain(new[] {
            "host", "port", "unitId", "startAddress", "count", "dataType"
        });
    }

    [Theory]
    [InlineData(0)]
    [InlineData(70000)]
    [InlineData(-1)]
    public void ValidateConfig_RejectsInvalidPort(int port)
    {
        var json = JsonSerializer.Serialize(new
        {
            host = "192.168.1.1", port, unitId = 1,
            startAddress = 40001, count = 1, dataType = "uint16"
        });
        var result = _sut.ValidateConfig(json);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateConfig_RejectsCountAbove125()
    {
        var json = JsonSerializer.Serialize(new
        {
            host = "192.168.1.1", port = 502, unitId = 1,
            startAddress = 40001, count = 200, dataType = "uint16"
        });
        var result = _sut.ValidateConfig(json);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateConfig_RejectsInvalidDataType()
    {
        var json = JsonSerializer.Serialize(new
        {
            host = "192.168.1.1", port = 502, unitId = 1,
            startAddress = 40001, count = 1, dataType = "double64"
        });
        var result = _sut.ValidateConfig(json);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateConfig_AcceptsValidConfig()
    {
        var json = JsonSerializer.Serialize(new
        {
            host = "192.168.1.1", port = 502, unitId = 1,
            startAddress = 40001, count = 20, dataType = "uint16"
        });
        var result = _sut.ValidateConfig(json);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Discover_ReadsRegistersAndReturnsCurrentValues()
    {
        // Arrange
        await using var fixture = await ModbusTestServerFixture.StartAsync();
        fixture.SetRegister(0, 155);  // 40001
        fixture.SetRegister(1, 60);   // 40002
        fixture.SetRegister(2, 23);   // 40003

        var config = JsonSerializer.Serialize(new
        {
            host = "127.0.0.1", port = fixture.Port, unitId = 1,
            startAddress = 40001, count = 3, dataType = "uint16"
        });

        // Act
        var result = await _sut.DiscoverAsync(config, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value!.Points.Should().HaveCount(3);
        result.Value!.Points[0].RawAddress.Should().Be("40001");
        result.Value!.Points[0].CurrentValue.Should().Be(155);
        result.Value!.Points[1].CurrentValue.Should().Be(60);
        result.Value!.Points[2].CurrentValue.Should().Be(23);
    }

    [Fact]
    public async Task Poll_ReturnsValuesKeyedByRawAddress()
    {
        await using var fixture = await ModbusTestServerFixture.StartAsync();
        fixture.SetRegister(0, 100);
        fixture.SetRegister(1, 200);

        var config = JsonSerializer.Serialize(new
        {
            host = "127.0.0.1", port = fixture.Port, unitId = 1,
            startAddress = 40001, count = 2, dataType = "uint16"
        });

        var result = await _sut.PollAsync(config, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Values.Should().HaveCount(2);
        result.Value!.Values["40001"].Should().Be(100);
        result.Value!.Values["40002"].Should().Be(200);
    }

    [Fact]
    public async Task Discover_ReturnsTransientError_WhenHostUnreachable()
    {
        var config = JsonSerializer.Serialize(new
        {
            host = "127.0.0.1", port = 1, unitId = 1,
            startAddress = 40001, count = 1, dataType = "uint16"
        });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        var result = await _sut.DiscoverAsync(config, cts.Token);

        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().BeOneOf(ErrorKind.Transient, ErrorKind.Bug);
        result.ErrorMessage.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Discover_ReturnsInvalidConfig_WhenJsonMalformed()
    {
        var result = await _sut.DiscoverAsync("not a json", CancellationToken.None);
        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.InvalidConfig);
    }

    [Fact]
    public async Task Discover_ReturnsInvalidConfig_WhenIpMalformed()
    {
        var config = JsonSerializer.Serialize(new
        {
            host = "not.an.ip", port = 502, unitId = 1,
            startAddress = 40001, count = 1, dataType = "uint16"
        });
        var result = await _sut.DiscoverAsync(config, CancellationToken.None);
        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.InvalidConfig);
    }
}
```

- [ ] **Step 3: Run Modbus tests**

```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~ModbusTcpAdapterTests"
```

Expected: All ~12 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/Tests/Adapters/_Fixtures/ModbusTestServerFixture.cs backend/Tests/Adapters/ModbusTcpAdapterTests.cs
git commit -m "test: ModbusTcpAdapter unit tests with in-memory ModbusTcpServer"
```

---

### Task 14: WebApiAdapter Implementation

讀 HTTP REST endpoint 回傳的 JSON。

**Files:**
- Create: `backend/Adapters/WebApiConfig.cs`
- Create: `backend/Adapters/WebApiAdapter.cs`
- Modify: `backend/Program.cs` (DI 註冊)

- [ ] **Step 1: Add JsonPath dependency**

The WebApi adapter needs JSONPath query support. Add to `backend/IoT.CentralApi.csproj`:

```xml
<PackageReference Include="Newtonsoft.Json" Version="13.0.*" />
```

(Newtonsoft.Json includes `JObject.SelectTokens` which is the easiest JSONPath in .NET)

```bash
dotnet restore backend/IoT.CentralApi.csproj
```

- [ ] **Step 2: Create config record**

`backend/Adapters/WebApiConfig.cs`:

```csharp
namespace IoT.CentralApi.Adapters;

internal record WebApiConfig(
    string Url,
    string Method,                          // "GET" | "POST"
    Dictionary<string, string>? Headers,
    string JsonPathRoot,                    // 例: "$.data.sensors"
    string KeyField = "name",               // 每個 sensor object 的 key 欄位
    string ValueField = "value");           // 每個 sensor object 的值欄位
```

- [ ] **Step 3: Implement adapter**

`backend/Adapters/WebApiAdapter.cs`:

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// WebApiAdapter — HTTP REST API 協議 adapter
// ─────────────────────────────────────────────────────────────────────────────
// 從 REST endpoint 讀 JSON，用 JSONPath 抽取要監測的欄位。
//
// 預期的 JSON 格式 (用戶可透過 KeyField/ValueField 自訂):
//   {
//     "data": {
//       "sensors": [
//         { "name": "temp1", "value": 155.3 },
//         { "name": "humid1", "value": 60.1 }
//       ]
//     }
//   }
//
// JsonPathRoot = "$.data.sensors" 會把整個陣列當作 sensor list
// KeyField = "name" → RawAddress = sensor.name
// ValueField = "value" → CurrentValue = sensor.value
//
// 依賴: Newtonsoft.Json (for JSONPath support via SelectTokens)
// ─────────────────────────────────────────────────────────────────────────────

using System.Net.Http.Headers;
using System.Text.Json;
using IoT.CentralApi.Adapters.Contracts;
using Newtonsoft.Json.Linq;

namespace IoT.CentralApi.Adapters;

public class WebApiAdapter : IProtocolAdapter
{
    private readonly IHttpClientFactory _httpFactory;

    public WebApiAdapter(IHttpClientFactory httpFactory)
    {
        _httpFactory = httpFactory;
    }

    public string ProtocolId => "web_api";
    public string DisplayName => "HTTP REST API";
    public bool SupportsDiscovery => true;
    public bool SupportsLivePolling => true;

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField("url", "string", "URL", Required: true,
                Placeholder: "http://192.168.1.10:8080/api/sensors"),
            new ConfigField("method", "enum", "HTTP Method",
                DefaultValue: "GET", Options: new[] { "GET", "POST" }),
            new ConfigField("jsonPathRoot", "string", "JSON 根路徑",
                Required: true, Placeholder: "$.data.sensors", DefaultValue: "$"),
            new ConfigField("keyField", "string", "Key 欄位名稱",
                DefaultValue: "name", Placeholder: "name"),
            new ConfigField("valueField", "string", "Value 欄位名稱",
                DefaultValue: "value", Placeholder: "value"),
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        try
        {
            var config = ParseConfig(configJson);
            if (string.IsNullOrWhiteSpace(config.Url))
                return ValidationResult.Invalid("url 不能為空");
            if (!Uri.TryCreate(config.Url, UriKind.Absolute, out _))
                return ValidationResult.Invalid($"url 格式錯誤: {config.Url}");
            if (config.Method is not ("GET" or "POST"))
                return ValidationResult.Invalid($"不支援的 method: {config.Method}");
            return ValidationResult.Valid();
        }
        catch (JsonException ex)
        {
            return ValidationResult.Invalid($"Config JSON 格式錯誤: {ex.Message}");
        }
    }

    public async Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct)
    {
        return await ReadAsync(configJson, ct);
    }

    public async Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        var read = await ReadAsync(configJson, ct);
        if (!read.IsSuccess)
            return Result<PollResult>.Fail(read.ErrorKind, read.ErrorMessage!);

        var values = read.Value!.Points.ToDictionary(p => p.RawAddress, p => p.CurrentValue);
        return Result<PollResult>.Ok(new PollResult(values, DateTime.UtcNow));
    }

    private async Task<Result<DiscoveryResult>> ReadAsync(string configJson, CancellationToken ct)
    {
        WebApiConfig config;
        try
        {
            config = ParseConfig(configJson);
        }
        catch (JsonException ex)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.InvalidConfig, $"Config JSON 格式錯誤: {ex.Message}");
        }

        try
        {
            var http = _httpFactory.CreateClient("WebApiAdapter");
            http.Timeout = TimeSpan.FromSeconds(10);

            var request = new HttpRequestMessage(
                config.Method == "POST" ? HttpMethod.Post : HttpMethod.Get,
                config.Url);

            if (config.Headers != null)
            {
                foreach (var kv in config.Headers)
                    request.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
            }

            using var response = await http.SendAsync(request, ct);

            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                return Result<DiscoveryResult>.Fail(
                    ErrorKind.Unauthorized, "認證失敗 (401)");

            if (!response.IsSuccessStatusCode)
                return Result<DiscoveryResult>.Fail(
                    ErrorKind.DeviceError,
                    $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}");

            var body = await response.Content.ReadAsStringAsync(ct);
            var json = JToken.Parse(body);
            var rootTokens = json.SelectTokens(config.JsonPathRoot).ToList();

            if (rootTokens.Count == 0)
                return Result<DiscoveryResult>.Fail(
                    ErrorKind.DeviceError,
                    $"JSON 路徑 '{config.JsonPathRoot}' 找不到資料");

            var points = ExtractPoints(rootTokens, config);
            return Result<DiscoveryResult>.Ok(new DiscoveryResult(points));
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.Transient, $"請求逾時: {config.Url}");
        }
        catch (OperationCanceledException) { throw; }
        catch (HttpRequestException ex)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.Transient, $"連線失敗: {ex.Message}");
        }
        catch (Newtonsoft.Json.JsonException ex)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.DeviceError, $"回應 JSON 解析失敗: {ex.Message}");
        }
        catch (Exception ex)
        {
            return Result<DiscoveryResult>.Fail(
                ErrorKind.Bug, $"未預期錯誤 ({ex.GetType().Name}): {ex.Message}");
        }
    }

    private static List<DiscoveredPoint> ExtractPoints(List<JToken> rootTokens, WebApiConfig config)
    {
        var points = new List<DiscoveredPoint>();

        foreach (var root in rootTokens)
        {
            if (root is JArray array)
            {
                foreach (var item in array)
                {
                    var key = item[config.KeyField]?.ToString();
                    var valueToken = item[config.ValueField];
                    if (key != null && valueToken != null && double.TryParse(valueToken.ToString(), out var v))
                    {
                        points.Add(new DiscoveredPoint(key, v, "number"));
                    }
                }
            }
            else if (root is JObject obj)
            {
                foreach (var prop in obj.Properties())
                {
                    if (double.TryParse(prop.Value.ToString(), out var v))
                    {
                        points.Add(new DiscoveredPoint(prop.Name, v, "number"));
                    }
                }
            }
        }

        return points;
    }

    private static WebApiConfig ParseConfig(string json)
    {
        var config = JsonSerializer.Deserialize<WebApiConfig>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        return config ?? throw new JsonException("Config 為 null");
    }
}
```

- [ ] **Step 4: Register HttpClient + adapter in Program.cs**

In `backend/Program.cs`, after the existing `AddHttpClient` for FasApi, add:

```csharp
// HttpClient for WebApiAdapter
builder.Services.AddHttpClient("WebApiAdapter", client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});

builder.Services.AddSingleton<IProtocolAdapter, WebApiAdapter>();
```

- [ ] **Step 5: Build to verify**

```bash
powershell -Command "Stop-Process -Name 'IoT.CentralApi' -Force -ErrorAction SilentlyContinue"
dotnet build backend/IoT.CentralApi.csproj 2>&1 | tail -5
```

Expected: build success.

- [ ] **Step 6: Commit**

```bash
git add backend/Adapters/WebApiAdapter.cs backend/Adapters/WebApiConfig.cs backend/IoT.CentralApi.csproj backend/Program.cs
git commit -m "feat: WebApiAdapter for HTTP REST + JSONPath polling"
```

---

### Task 15: WebApiAdapter Tests with WireMock

**Files:**
- Create: `backend/Tests/Adapters/_Fixtures/HttpMockFixture.cs`
- Create: `backend/Tests/Adapters/WebApiAdapterTests.cs`

- [ ] **Step 1: Create HttpMockFixture**

`backend/Tests/Adapters/_Fixtures/HttpMockFixture.cs`:

```csharp
using WireMock.Server;

namespace IoT.CentralApi.Tests.Adapters._Fixtures;

/// <summary>
/// 啟動 WireMock.Net 伺服器當測試用的 fake HTTP API
/// </summary>
public sealed class HttpMockFixture : IAsyncDisposable
{
    public WireMockServer Server { get; }
    public string BaseUrl => Server.Url!;

    public HttpMockFixture()
    {
        Server = WireMockServer.Start();
    }

    public ValueTask DisposeAsync()
    {
        Server.Stop();
        Server.Dispose();
        return ValueTask.CompletedTask;
    }
}
```

- [ ] **Step 2: Create WebApiAdapter test**

`backend/Tests/Adapters/WebApiAdapterTests.cs`:

```csharp
using System.Text.Json;
using IoT.CentralApi.Adapters;
using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Tests.Adapters._Fixtures;
using Microsoft.Extensions.DependencyInjection;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;

namespace IoT.CentralApi.Tests.Adapters;

public class WebApiAdapterTests
{
    private static WebApiAdapter CreateAdapter()
    {
        var services = new ServiceCollection();
        services.AddHttpClient("WebApiAdapter");
        var sp = services.BuildServiceProvider();
        return new WebApiAdapter(sp.GetRequiredService<IHttpClientFactory>());
    }

    [Fact]
    public void ProtocolId_IsWebApi()
    {
        var sut = CreateAdapter();
        sut.ProtocolId.Should().Be("web_api");
    }

    [Fact]
    public void GetConfigSchema_ContainsRequiredFields()
    {
        var sut = CreateAdapter();
        var schema = sut.GetConfigSchema();
        schema.Fields.Should().Contain(f => f.Name == "url" && f.Required);
        schema.Fields.Should().Contain(f => f.Name == "jsonPathRoot");
    }

    [Fact]
    public void ValidateConfig_RejectsInvalidUrl()
    {
        var sut = CreateAdapter();
        var json = JsonSerializer.Serialize(new
        {
            url = "not a url", method = "GET", jsonPathRoot = "$"
        });
        var result = sut.ValidateConfig(json);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Discover_ReadsJsonArrayAndExtractsPoints()
    {
        // Arrange
        await using var fixture = new HttpMockFixture();
        fixture.Server
            .Given(Request.Create().WithPath("/api/sensors").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""
                {
                  "data": {
                    "sensors": [
                      { "name": "temp1", "value": 155.3 },
                      { "name": "humid1", "value": 60.1 }
                    ]
                  }
                }
                """));

        var sut = CreateAdapter();
        var config = JsonSerializer.Serialize(new
        {
            url = $"{fixture.BaseUrl}/api/sensors",
            method = "GET",
            jsonPathRoot = "$.data.sensors",
            keyField = "name",
            valueField = "value"
        });

        // Act
        var result = await sut.DiscoverAsync(config, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value!.Points.Should().HaveCount(2);
        result.Value!.Points.Should().Contain(p => p.RawAddress == "temp1" && p.CurrentValue == 155.3);
        result.Value!.Points.Should().Contain(p => p.RawAddress == "humid1" && p.CurrentValue == 60.1);
    }

    [Fact]
    public async Task Discover_ReturnsUnauthorized_When401()
    {
        await using var fixture = new HttpMockFixture();
        fixture.Server
            .Given(Request.Create().WithPath("/api/sensors").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(401));

        var sut = CreateAdapter();
        var config = JsonSerializer.Serialize(new
        {
            url = $"{fixture.BaseUrl}/api/sensors",
            method = "GET",
            jsonPathRoot = "$"
        });

        var result = await sut.DiscoverAsync(config, CancellationToken.None);
        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.Unauthorized);
    }

    [Fact]
    public async Task Discover_ReturnsDeviceError_WhenJsonPathNotFound()
    {
        await using var fixture = new HttpMockFixture();
        fixture.Server
            .Given(Request.Create().WithPath("/api/sensors").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithBody("""{"different": "structure"}"""));

        var sut = CreateAdapter();
        var config = JsonSerializer.Serialize(new
        {
            url = $"{fixture.BaseUrl}/api/sensors",
            method = "GET",
            jsonPathRoot = "$.data.sensors",
            keyField = "name",
            valueField = "value"
        });

        var result = await sut.DiscoverAsync(config, CancellationToken.None);
        result.IsSuccess.Should().BeFalse();
        result.ErrorKind.Should().Be(ErrorKind.DeviceError);
    }

    [Fact]
    public async Task Poll_ReturnsValuesKeyedByName()
    {
        await using var fixture = new HttpMockFixture();
        fixture.Server
            .Given(Request.Create().WithPath("/api/poll").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithBody("""
                {
                  "sensors": [
                    { "name": "t1", "value": 100 },
                    { "name": "t2", "value": 200 }
                  ]
                }
                """));

        var sut = CreateAdapter();
        var config = JsonSerializer.Serialize(new
        {
            url = $"{fixture.BaseUrl}/api/poll",
            method = "GET",
            jsonPathRoot = "$.sensors",
            keyField = "name",
            valueField = "value"
        });

        var result = await sut.PollAsync(config, CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
        result.Value!.Values.Should().ContainKey("t1").WhoseValue.Should().Be(100);
        result.Value!.Values.Should().ContainKey("t2").WhoseValue.Should().Be(200);
    }
}
```

- [ ] **Step 3: Run tests**

```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~WebApiAdapterTests"
```

Expected: All ~7 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/Tests/Adapters/_Fixtures/HttpMockFixture.cs backend/Tests/Adapters/WebApiAdapterTests.cs
git commit -m "test: WebApiAdapter unit tests with WireMock.Net"
```

---

> **PLAN CONTINUES IN PHASE 5 (Tasks 16-41).**
>
> **PAUSING HERE FOR PLAN REVIEW.** This file is already 2000+ lines covering Phases 1-4 (Tasks 1-15). The remaining 26 tasks (Phases 5-14) follow the same structure and patterns:
>
> - **Phase 5** (Tasks 16-17): ProtocolsController + DiscoveryController + tests
> - **Phase 6** (Tasks 18-20): DeviceConnection entity + CRUD + atomic provision endpoint
> - **Phase 7** (Tasks 21-22): ConnectionState + PollingBackgroundService
> - **Phase 8** (Tasks 23-24): ImpactAnalyzer + SSE config-updated broadcast
> - **Phase 9** (Task 25): DiagnosticsController
> - **Phase 10** (Tasks 26-29): apiClient + Toast/ConfirmModal + useConfigSync hook
> - **Phase 11** (Tasks 30-32): WizardContext + DynamicForm + Wizard shell
> - **Phase 12** (Tasks 33-37): Wizard Steps 1-7
> - **Phase 13** (Tasks 38-39): apiDeviceConnections + DeviceConnectionsModal
> - **Phase 14** (Tasks 40-41): App.tsx wiring + E2E test + CI updates
>
> **Reason for pausing**: A complete plan covering all 41 tasks at this level of detail would be ~6000-8000 lines, which is hard to navigate as a single document. The remaining phases should be written as a **second plan file** (`2026-04-11-device-integration-wizard-plan-part2.md`) once Phases 1-4 have been executed and validated.

---

## Self-Review (Phases 1-4)

**1. Spec coverage**:
- ✅ Phase 1 (Tasks 1-4): CLAUDE.md, READMEs, _Templates, test infrastructure, NuGet
- ✅ Phase 2 (Tasks 5-8): PropertyType entity + API + frontend modal + EquipmentTypeSensor migration
- ✅ Phase 3 (Tasks 9-10): IProtocolAdapter contracts + supporting types
- ✅ Phase 4 (Tasks 11-15): All 3 adapters with unit tests

**Spec sections covered**:
- Section 1 Architecture: ✅ IProtocolAdapter contracts + 3 adapter implementations
- Section 2 Data Model: ✅ PropertyType entity + EquipmentTypeSensor migration
- Section 3 API: ⏸ Partial — DTOs in place, controllers in Phase 5+
- Section 3.5 Impact: ⏸ Phase 8
- Section 4 Wizard UX: ⏸ Phase 11-12
- Section 4.5 AI-Friendly: ✅ CLAUDE.md, READMEs, _Templates, file size limits documented
- Section 5 Error Handling: ✅ Result<T>, ErrorKind, ErrorResponse contracts; full impl in Phase 7+
- Section 6 Testing: ✅ xUnit + Vitest setup, IntegrationTestBase, fixture patterns

**2. Placeholder scan**:
- ✅ No "TODO", "TBD", or "implement later" tokens (except inside `_Template.cs` which is intentionally placeholder)
- ✅ All test code is complete and runnable
- ✅ All implementation code is complete

**3. Type consistency**:
- ✅ `PropertyType` entity, `PropertyTypeDto`, `SavePropertyTypeRequest` all use same field names
- ✅ `IProtocolAdapter`, `Result<T>`, `ErrorKind`, `DiscoveryResult`, `PollResult` cross-referenced correctly
- ✅ `EquipmentTypeSensor.PropertyTypeId` matches `PropertyType.Id` (int FK)
- ✅ `DiscoveredPoint.RawAddress` (string) consistent across Modbus/WebApi adapters

---

## Plan complete (Phases 1-4 of 14). Ready to execute.

**To continue beyond Phase 4**, request a follow-up plan file covering Phases 5-14 once these phases are complete and committed.

**Two execution options for Phases 1-4:**

**1. Subagent-Driven (recommended)** — 我為每個 task 派一個獨立 subagent，task 之間 review，快速迭代

**2. Inline Execution** — 在本 session 依序執行 task，可以隨時暫停 review

**Which approach?**
