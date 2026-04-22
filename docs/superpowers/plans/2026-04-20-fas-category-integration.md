# FAS Category Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "從 FAS 帶入" button to Wizard Step 6 that opens a searchable modal of FAS asset categories, auto-filling equipment name and description on selection.

**Architecture:** Extend existing `FasApiService` with `GetCategoriesAsync()`, add a `/api/fas/categories` endpoint to existing `FasController`, then build a `FasCategoryPickerModal` on the frontend wired into `Step6_Equipment`.

**Tech Stack:** .NET 9 (C#), WireMock.Net (backend tests), React 19 + TypeScript, react-i18next, Tailwind 4

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/Dtos/FasDtos.cs` | `FasCategoryDto` record |
| Modify | `backend/Services/FasApiService.cs` | Add `GetCategoriesAsync()` |
| Modify | `backend/Controllers/FasController.cs` | Add `GET /api/fas/categories` |
| Create | `backend/Tests/Controllers/FasControllerTests.cs` | Controller integration tests |
| Modify | `frontend/src/i18n/locales/zh-TW.ts` | Add 6 FAS i18n keys |
| Modify | `frontend/src/i18n/locales/zh-CN.ts` | Add 6 FAS i18n keys |
| Modify | `frontend/src/i18n/locales/en.ts` | Add 6 FAS i18n keys |
| Create | `frontend/src/lib/apiFas.ts` | `fetchFasCategories()` API helper |
| Create | `frontend/src/components/modals/DeviceIntegrationWizard/FasCategoryPickerModal.tsx` | Searchable category picker modal |
| Modify | `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step6_Equipment.tsx` | Add FAS button + wire modal |

---

## Task 1: Add FasCategoryDto

**Files:**
- Create: `backend/Dtos/FasDtos.cs`

- [ ] **Step 1: Create the DTO file**

```csharp
namespace IoT.CentralApi.Dtos;

public record FasCategoryDto(
    int Id,
    string CategoryCode,
    string CategoryName,
    string? Description
);
```

- [ ] **Step 2: Verify it builds**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/backend"
dotnet build --no-restore -v q
```

Expected: Build succeeded, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/Dtos/FasDtos.cs
git commit -m "feat(fas): add FasCategoryDto"
```

---

## Task 2: Add GetCategoriesAsync to FasApiService

**Files:**
- Modify: `backend/Services/FasApiService.cs`

The existing service already has `IHttpClientFactory` injected and uses named client `"FasApi"` (configured in `Program.cs` with base URL + `X-Api-Key` header). We just add a new method.

- [ ] **Step 1: Add a private inner class for deserialization and the public method**

In `FasApiService.cs`, after the existing `FasAssetItem` private class (line ~109), add:

```csharp
// FAS categories API 回傳格式
private class FasCategoryItem
{
    public int Id { get; set; }
    public int ParentID { get; set; }
    public string? CategoryCode { get; set; }
    public string? CategoryName { get; set; }
    public string? Description { get; set; }
}
```

Then add the public method after `GetAssetInfoAsync()`:

```csharp
/// <summary>
/// 取得 FAS 所有啟用的資產類別清單。
/// </summary>
public async Task<List<FasCategoryDto>?> GetCategoriesAsync()
{
    if (string.IsNullOrEmpty(_apiKey))
    {
        logger.LogWarning("FasApi:ApiKey is not configured — cannot fetch categories");
        return null;
    }

    try
    {
        var client = httpClientFactory.CreateClient("FasApi");
        var response = await client.GetAsync("api/external/categories");

        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
        {
            logger.LogError("FAS API returned 401 — check FasApi:ApiKey");
            throw new HttpRequestException("FAS authentication failed", null, System.Net.HttpStatusCode.Unauthorized);
        }

        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        var items = JsonSerializer.Deserialize<List<FasCategoryItem>>(json, _jsonOptions);

        return items?
            .Select(i => new FasCategoryDto(
                i.Id,
                i.CategoryCode ?? "",
                i.CategoryName ?? "",
                i.Description))
            .ToList() ?? [];
    }
    catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Unauthorized)
    {
        throw; // 讓 Controller 處理 401
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "FAS GetCategories failed");
        return null; // 連線失敗 → Controller 回 503
    }
}
```

- [ ] **Step 2: Verify it builds**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/backend"
dotnet build --no-restore -v q
```

Expected: Build succeeded, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/Services/FasApiService.cs
git commit -m "feat(fas): add GetCategoriesAsync to FasApiService"
```

---

## Task 3: Add GET /api/fas/categories endpoint

**Files:**
- Modify: `backend/Controllers/FasController.cs`

- [ ] **Step 1: Add the categories action**

Open `backend/Controllers/FasController.cs`. The file currently is:

```csharp
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/fas")]
public class FasController(FasApiService fasService) : ControllerBase
{
    /// <summary>驗證 AssetCode 是否存在於 FAS 系統</summary>
    [HttpGet("validate/{assetCode}")]
    public async Task<IActionResult> Validate(string assetCode)
    {
        var info = await fasService.GetAssetInfoAsync(assetCode);

        if (info == null)
            return NotFound(new { message = $"AssetCode '{assetCode}' not found in FAS." });

        return Ok(info);
    }
}
```

Replace with:

```csharp
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/fas")]
public class FasController(FasApiService fasService) : ControllerBase
{
    /// <summary>驗證 AssetCode 是否存在於 FAS 系統</summary>
    [HttpGet("validate/{assetCode}")]
    public async Task<IActionResult> Validate(string assetCode)
    {
        var info = await fasService.GetAssetInfoAsync(assetCode);

        if (info == null)
            return NotFound(new { message = $"AssetCode '{assetCode}' not found in FAS." });

        return Ok(info);
    }

    /// <summary>取得 FAS 資產類別清單（供精靈 Step 6 帶入）</summary>
    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories()
    {
        try
        {
            var categories = await fasService.GetCategoriesAsync();

            if (categories == null)
                return StatusCode(503, new { error = "FAS unavailable or API key not configured" });

            return Ok(categories);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Unauthorized)
        {
            return StatusCode(502, new { error = "FAS authentication failed" });
        }
    }
}
```

- [ ] **Step 2: Verify it builds**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/backend"
dotnet build --no-restore -v q
```

Expected: Build succeeded, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/Controllers/FasController.cs
git commit -m "feat(fas): add GET /api/fas/categories endpoint"
```

---

## Task 4: Backend controller tests

**Files:**
- Create: `backend/Tests/Controllers/FasControllerTests.cs`

These tests use `WebApplicationFactory` with a WireMock server substituted for the real FAS service.

- [ ] **Step 1: Write the test file**

```csharp
using System.Net;
using System.Net.Http.Json;
using IoT.CentralApi.Dtos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using IoT.CentralApi.Data;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace IoT.CentralApi.Tests.Controllers;

public class FasControllerTests : IAsyncDisposable
{
    private readonly WireMockServer _fas = WireMockServer.Start();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;
    private string _dbPath = null!;

    private WebApplicationFactory<Program> BuildFactory(string? apiKey = "test-key")
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"iottest_{Guid.NewGuid():N}.db");

        return new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Test");
                builder.ConfigureServices(services =>
                {
                    services.AddDbContextFactory<IoTDbContext>(opts =>
                        opts.UseSqlite($"Data Source={_dbPath}"));
                });
                builder.ConfigureAppConfiguration(c =>
                {
                    c.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["FasApi:BaseUrl"] = _fas.Url + "/",
                        ["FasApi:ApiKey"] = apiKey ?? "",
                        ["WeChat:Enabled"] = "false",
                        ["Authentication:ApiKey"] = "test-api-key-123",
                        ["ConnectionStrings:DefaultConnection"] = $"Data Source={_dbPath}",
                    });
                });
            });
    }

    private static readonly string CategoriesJson = """
        [
            {"id":1,"parentID":0,"categoryCode":"A001","categoryName":"烘箱","description":"工業用烘箱"},
            {"id":2,"parentID":0,"categoryCode":"B002","categoryName":"壓縮機","description":null}
        ]
        """;

    [Fact]
    public async Task GetCategories_Returns200_WithCategoryList()
    {
        _fas.Given(Request.Create().WithPath("/api/external/categories").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody(CategoriesJson)
                .WithHeader("Content-Type", "application/json"));

        _factory = BuildFactory();
        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");

        using var scope = _factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();

        var response = await _client.GetAsync("/api/fas/categories");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var categories = await response.Content.ReadFromJsonAsync<FasCategoryDto[]>();
        categories.Should().HaveCount(2);
        categories![0].CategoryCode.Should().Be("A001");
        categories[0].CategoryName.Should().Be("烘箱");
        categories[0].Description.Should().Be("工業用烘箱");
        categories[1].CategoryCode.Should().Be("B002");
        categories[1].Description.Should().BeNull();
    }

    [Fact]
    public async Task GetCategories_Returns503_WhenFasUnreachable()
    {
        // No WireMock stub — connection will fail (pointing to running WireMock but no matching route = 404 equivalent)
        // Instead, point to a port nothing listens on
        _dbPath = Path.Combine(Path.GetTempPath(), $"iottest_{Guid.NewGuid():N}.db");
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Test");
                builder.ConfigureServices(services =>
                {
                    services.AddDbContextFactory<IoTDbContext>(opts =>
                        opts.UseSqlite($"Data Source={_dbPath}"));
                });
                builder.ConfigureAppConfiguration(c =>
                {
                    c.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["FasApi:BaseUrl"] = "http://localhost:1/",  // nothing listens here
                        ["FasApi:ApiKey"] = "test-key",
                        ["WeChat:Enabled"] = "false",
                        ["Authentication:ApiKey"] = "test-api-key-123",
                        ["ConnectionStrings:DefaultConnection"] = $"Data Source={_dbPath}",
                    });
                });
            });

        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");

        using var scope = _factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();

        var response = await _client.GetAsync("/api/fas/categories");

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task GetCategories_Returns503_WhenApiKeyEmpty()
    {
        _factory = BuildFactory(apiKey: "");
        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");

        using var scope = _factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();

        var response = await _client.GetAsync("/api/fas/categories");

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task GetCategories_Returns502_WhenFasReturns401()
    {
        _fas.Given(Request.Create().WithPath("/api/external/categories").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(401));

        _factory = BuildFactory();
        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");

        using var scope = _factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();

        var response = await _client.GetAsync("/api/fas/categories");

        response.StatusCode.Should().Be(HttpStatusCode.BadGateway);
    }

    public async ValueTask DisposeAsync()
    {
        _client?.Dispose();
        if (_factory != null) await _factory.DisposeAsync();
        _fas.Stop();
        _fas.Dispose();
        if (_dbPath != null && File.Exists(_dbPath))
        {
            try { File.Delete(_dbPath); } catch { /* file lock OK */ }
        }
    }
}
```

- [ ] **Step 2: Run the tests — expect them to pass**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/backend"
dotnet test Tests/ --filter "FasControllerTests" -v normal
```

Expected: 4 tests pass.

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
dotnet test Tests/ -v minimal
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/Tests/Controllers/FasControllerTests.cs
git commit -m "test(fas): add FasController categories endpoint tests"
```

---

## Task 5: Add i18n keys

**Files:**
- Modify: `frontend/src/i18n/locales/zh-TW.ts`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

In each file, find the `equipment:` section under `wizard:` and add 6 new keys after `recommended`.

- [ ] **Step 1: Update zh-TW.ts**

Find the `recommended: '推薦',` line inside `wizard > equipment` and add after it:

```typescript
      fasButton: '從 FAS 帶入',
      fasModalTitle: '選擇資產類別',
      fasSearch: '搜尋類別名稱或編號…',
      fasEmpty: '找不到符合的類別',
      fasError: '無法連線至 FAS，請稍後再試',
      fasRetry: '重試',
```

- [ ] **Step 2: Update zh-CN.ts**

Find the `recommended: '推荐',` line inside `wizard > equipment` and add after it:

```typescript
      fasButton: '从 FAS 带入',
      fasModalTitle: '选择资产类别',
      fasSearch: '搜索类别名称或编号…',
      fasEmpty: '找不到符合的类别',
      fasError: '无法连接至 FAS，请稍后再试',
      fasRetry: '重试',
```

- [ ] **Step 3: Update en.ts**

Find the `recommended: 'Recommended',` line inside `wizard > equipment` and add after it:

```typescript
      fasButton: 'Import from FAS',
      fasModalTitle: 'Select Asset Category',
      fasSearch: 'Search category name or code…',
      fasEmpty: 'No matching categories',
      fasError: 'Unable to connect to FAS, please try again later',
      fasRetry: 'Retry',
```

- [ ] **Step 4: Run i18n completeness test**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npm test -- --reporter=verbose src/__tests__/i18n.test.ts
```

Expected: 2 tests pass (zh-CN and en have all keys from zh-TW).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/zh-TW.ts frontend/src/i18n/locales/zh-CN.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add FAS category picker keys to all locales"
```

---

## Task 6: Create apiFas.ts

**Files:**
- Create: `frontend/src/lib/apiFas.ts`

- [ ] **Step 1: Create the file**

```typescript
export interface FasCategoryDto {
  id: number;
  categoryCode: string;
  categoryName: string;
  description: string | null;
}

export async function fetchFasCategories(): Promise<FasCategoryDto[]> {
  const res = await fetch('/api/fas/categories');
  if (!res.ok) throw new Error(`FAS error: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/apiFas.ts
git commit -m "feat(fas): add apiFas.ts API helper"
```

---

## Task 7: Create FasCategoryPickerModal

**Files:**
- Create: `frontend/src/components/modals/DeviceIntegrationWizard/FasCategoryPickerModal.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFasCategories, type FasCategoryDto } from '../../../lib/apiFas';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (categoryName: string, description: string) => void;
}

export default function FasCategoryPickerModal({ open, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<FasCategoryDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setError(null);
    load();
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFasCategories();
      setCategories(data);
    } catch {
      setError(t('wizard.equipment.fasError'));
    } finally {
      setLoading(false);
    }
  }

  const filtered = categories.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.categoryCode.toLowerCase().includes(q) ||
      c.categoryName.toLowerCase().includes(q) ||
      (c.description?.toLowerCase().includes(q) ?? false)
    );
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-md mx-4 flex flex-col overflow-hidden"
        style={{ maxHeight: '70vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-base)]">
          <h2 className="text-base font-semibold text-[var(--text-main)]">
            {t('wizard.equipment.fasModalTitle')}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('wizard.equipment.fasSearch')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-main)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-[var(--text-muted)] text-sm">
              <svg className="animate-spin mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading…
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <p className="text-sm text-[var(--accent-red)] text-center">{error}</p>
              <button
                onClick={load}
                className="px-4 py-1.5 rounded-lg border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
              >
                {t('wizard.equipment.fasRetry')}
              </button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--text-muted)]">
              {t('wizard.equipment.fasEmpty')}
            </p>
          )}

          {!loading && !error && filtered.length > 0 && (
            <ul className="space-y-1 mt-1">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      onSelect(c.categoryName, c.description ?? '');
                      onClose();
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--accent-green)]/10 transition-colors"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-[var(--text-muted)] font-mono">{c.categoryCode}</span>
                      <span className="text-sm font-medium text-[var(--text-main)]">{c.categoryName}</span>
                    </div>
                    {c.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">{c.description}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/modals/DeviceIntegrationWizard/FasCategoryPickerModal.tsx
git commit -m "feat(fas): add FasCategoryPickerModal component"
```

---

## Task 8: Update Step6_Equipment.tsx

**Files:**
- Modify: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step6_Equipment.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizard } from '../WizardContext';
import FasCategoryPickerModal from '../FasCategoryPickerModal';

export default function Step6Equipment() {
  const { state, dispatch } = useWizard();
  const { t } = useTranslation();
  const [fasOpen, setFasOpen] = useState(false);

  const VIS_TYPES = [
    { value: 'single_kpi', label: t('wizard.equipment.visSingleKpi'), desc: t('wizard.equipment.descSingleKpi') },
    { value: 'four_rings', label: t('wizard.equipment.visFourRings'), desc: t('wizard.equipment.descFourRings') },
    { value: 'dual_side_spark', label: t('wizard.equipment.visDualSide'), desc: t('wizard.equipment.descDualSide') },
    { value: 'custom_grid', label: t('wizard.equipment.visCustomGrid'), desc: t('wizard.equipment.descCustomGrid') },
  ];

  const pointCount = state.selectedPointIndices.size;
  const recommended = pointCount <= 2 ? 'single_kpi'
    : pointCount <= 4 ? 'four_rings'
    : pointCount <= 8 ? 'dual_side_spark'
    : 'custom_grid';

  function handleFasSelect(categoryName: string, description: string) {
    dispatch({
      type: 'SET_EQUIPMENT_INFO',
      name: categoryName,
      visType: state.visType,
      description,
    });
  }

  return (
    <div className="p-6">
      <h3 className="text-base font-medium text-[var(--text-main)] mb-1">{t('wizard.equipment.title')}</h3>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t('wizard.equipment.desc')}
      </p>

      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-[var(--text-main)]">
              {t('wizard.equipment.typeNameLabel')} <span className="text-[var(--accent-red)]">*</span>
            </label>
            <button
              type="button"
              onClick={() => setFasOpen(true)}
              className="text-xs text-[var(--accent-green)] hover:underline flex items-center gap-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              {t('wizard.equipment.fasButton')}
            </button>
          </div>
          <input
            type="text"
            value={state.equipmentName}
            onChange={(e) => dispatch({
              type: 'SET_EQUIPMENT_INFO',
              name: e.target.value,
              visType: state.visType,
              description: state.description,
            })}
            placeholder={t('wizard.equipment.typeNamePlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-main)] mb-1">{t('wizard.equipment.descLabel')}</label>
          <input
            type="text"
            value={state.description}
            onChange={(e) => dispatch({
              type: 'SET_EQUIPMENT_INFO',
              name: state.equipmentName,
              visType: state.visType,
              description: e.target.value,
            })}
            placeholder={t('wizard.equipment.descPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-main)] mb-2">{t('wizard.equipment.visLabel')}</label>
          <div className="grid grid-cols-2 gap-3">
            {VIS_TYPES.map((vt) => (
              <button
                key={vt.value}
                onClick={() => dispatch({
                  type: 'SET_EQUIPMENT_INFO',
                  name: state.equipmentName,
                  visType: vt.value,
                  description: state.description,
                })}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  state.visType === vt.value
                    ? 'border-[var(--accent-green)] bg-[var(--accent-green)]/10'
                    : 'border-[var(--border-base)] hover:border-[var(--accent-green)]/50'
                }`}
              >
                <div className="font-semibold text-sm text-[var(--text-main)]">
                  {vt.label}
                  {vt.value === recommended && (
                    <span className="ml-2 text-xs text-[var(--accent-green)] font-normal">{t('wizard.equipment.recommended')}</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{vt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => dispatch({ type: 'PREV_STEP' })}
          className="px-4 py-2 rounded-lg border border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-base)] transition-colors"
        >
          {t('common.previous')}
        </button>
        <button
          onClick={() => dispatch({ type: 'NEXT_STEP' })}
          disabled={!state.equipmentName.trim()}
          className="px-5 py-2 rounded-lg bg-[var(--accent-green)] text-[var(--bg-panel)] text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent-green-hover)] transition-colors"
        >
          {t('common.next')}
        </button>
      </div>

      <FasCategoryPickerModal
        open={fasOpen}
        onClose={() => setFasOpen(false)}
        onSelect={handleFasSelect}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard/frontend"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run frontend tests**

```bash
npm test -- --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/modals/DeviceIntegrationWizard/steps/Step6_Equipment.tsx
git commit -m "feat(fas): wire FasCategoryPickerModal into Step6_Equipment"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| `GET /api/fas/categories` backend endpoint | Task 3 |
| FAS 不可達 → 503 | Task 2 + Task 4 (test) |
| FAS 401 → 502 | Task 2 + Task 4 (test) |
| `FasApi:ApiKey` 未設定 → 503 | Task 2 + Task 4 (test) |
| `FasCategoryDto` with id/categoryCode/categoryName/description | Task 1 |
| `fetchFasCategories()` API helper | Task 6 |
| `FasCategoryPickerModal` with loading/error/retry/search/empty | Task 7 |
| Step 6 button → modal → dispatch SET_EQUIPMENT_INFO | Task 8 |
| i18n keys in all 3 locales | Task 5 |
| i18n completeness test passes | Task 5 step 4 |

All requirements covered. ✓

**Type consistency check:**
- `FasCategoryDto` defined in Task 1 (C#) and Task 6 (`apiFas.ts`), used consistently in Task 7 and 8.
- `fetchFasCategories()` returns `Promise<FasCategoryDto[]>` — matches usage in `FasCategoryPickerModal`.
- `onSelect(categoryName: string, description: string)` — matches `handleFasSelect` in Step 6.
- `SET_EQUIPMENT_INFO` dispatch shape matches `WizardContext.tsx` action type.
