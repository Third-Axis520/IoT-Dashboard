# Dynamic Device System (Direction C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded frontend constants (`sensorConfig.ts`, `liveLineConfig.ts`, `templates.ts`) and the hardcoded `SensorId=40013` material-detect logic with a fully DB-backed system where equipment types, sensor roles, and production line layouts are managed via API.

**Architecture:** Four new SQL Server tables (`EquipmentTypes`, `EquipmentTypeSensors`, `LineConfigs`, `LineEquipments`) are added following the existing `IF NOT EXISTS` DDL pattern in `Program.cs`. Two new controllers expose full CRUD. The frontend loads structure on mount from API and eliminates `localStorage` for production-line state. `DataIngestionService` looks up the material-detect sensor ID from the DB instead of assuming `40013`.

**Tech Stack:** .NET 9 / EF Core 9 / SQL Server (backend); React 19 / TypeScript 5.8 (frontend). No new packages needed.

---

## File Map

### Backend — create / modify

| Action | File |
|--------|------|
| Modify | `backend/Models/Entities.cs` |
| Modify | `backend/Data/IoTDbContext.cs` |
| Modify | `backend/Program.cs` (DDL init block) |
| Modify | `backend/Services/DataIngestionService.cs` |
| **Create** | `backend/Controllers/EquipmentTypeController.cs` |
| **Create** | `backend/Controllers/LineConfigController.cs` |

### Frontend — create / modify

| Action | File |
|--------|------|
| Modify | `frontend/src/types/index.ts` |
| **Create** | `frontend/src/lib/apiLineConfig.ts` |
| Modify | `frontend/src/App.tsx` |
| Modify | `frontend/src/components/modals/AddDeviceModal.tsx` |

### Frontend — delete (after Task 7 passes)

| File | Reason |
|------|--------|
| `frontend/src/constants/sensorConfig.ts` | Replaced by `EquipmentTypeSensor.sensorId + label` |
| `frontend/src/constants/liveLineConfig.ts` | Replaced by `LineConfig` API |
| `frontend/src/constants/templates.ts` | Replaced by `EquipmentType` API |

---

## Task 1 — Backend: Four New Entities

**Files:**
- Modify: `backend/Models/Entities.cs`

- [ ] **Step 1: Add four new entity classes at the bottom of Entities.cs**

```csharp
// ── Direction-C: Dynamic Equipment System ─────────────────────────────────────

/// <summary>設備類型定義（取代前端 MachineTemplate）</summary>
public class EquipmentType
{
    public int Id { get; set; }
    [Required, MaxLength(100)] public string Name { get; set; } = "";
    /// <summary>前端 visType 字串：single_kpi | dual_side_spark | four_rings | molding_matrix | custom_grid</summary>
    [Required, MaxLength(50)] public string VisType { get; set; } = "single_kpi";
    [MaxLength(300)] public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<EquipmentTypeSensor> Sensors { get; set; } = [];
    public List<LineEquipment> LineEquipments { get; set; } = [];
}

/// <summary>屬於某設備類型的感測器定義</summary>
public class EquipmentTypeSensor
{
    public int Id { get; set; }
    public int EquipmentTypeId { get; set; }
    /// <summary>PLC 傳入的 SensorId（同 SensorReading.SensorId）</summary>
    public int SensorId { get; set; }
    /// <summary>前端 Point.id，如 "pt_mh_right"</summary>
    [Required, MaxLength(100)] public string PointId { get; set; } = "";
    [Required, MaxLength(100)] public string Label { get; set; } = "";
    [MaxLength(10)] public string Unit { get; set; } = "℃";
    /// <summary>"normal" 或 "material_detect"（取代硬編碼 40013）</summary>
    [MaxLength(20)] public string Role { get; set; } = "normal";
    public int SortOrder { get; set; }
    public EquipmentType EquipmentType { get; set; } = null!;
}

/// <summary>產線設定（取代前端 liveLineConfig.ts）</summary>
public class LineConfig
{
    public int Id { get; set; }
    [Required, MaxLength(100)] public string LineId { get; set; } = "";
    [Required, MaxLength(200)] public string Name { get; set; } = "";
    public DateTime UpdatedAt { get; set; }
    public List<LineEquipment> Equipments { get; set; } = [];
}

/// <summary>產線中的設備實例（一個 EquipmentType 綁定一個 AssetCode）</summary>
public class LineEquipment
{
    public int Id { get; set; }
    public int LineConfigId { get; set; }
    public int EquipmentTypeId { get; set; }
    [MaxLength(50)] public string? AssetCode { get; set; }
    [MaxLength(200)] public string? DisplayName { get; set; }
    public int SortOrder { get; set; }
    public LineConfig LineConfig { get; set; } = null!;
    public EquipmentType EquipmentType { get; set; } = null!;
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard\backend"
dotnet build --no-restore 2>&1 | tail -5
```
Expected: `Build succeeded.`

- [ ] **Step 3: Commit**

```bash
git add backend/Models/Entities.cs
git commit -m "feat: add EquipmentType/EquipmentTypeSensor/LineConfig/LineEquipment entities"
```

---

## Task 2 — Backend: DbContext + DB Init DDL

**Files:**
- Modify: `backend/Data/IoTDbContext.cs`
- Modify: `backend/Program.cs`

- [ ] **Step 1: Add DbSets to IoTDbContext.cs**

Add after the existing `DbSet` properties:

```csharp
public DbSet<EquipmentType>       EquipmentTypes       => Set<EquipmentType>();
public DbSet<EquipmentTypeSensor> EquipmentTypeSensors => Set<EquipmentTypeSensor>();
public DbSet<LineConfig>          LineConfigs          => Set<LineConfig>();
public DbSet<LineEquipment>       LineEquipments       => Set<LineEquipment>();
```

- [ ] **Step 2: Add model configuration in OnModelCreating**

Add inside `OnModelCreating`, after existing configurations:

```csharp
// ── EquipmentType ─────────────────────────────────────────────────────────────
modelBuilder.Entity<EquipmentTypeSensor>()
    .HasIndex(s => new { s.EquipmentTypeId, s.SensorId })
    .IsUnique();

modelBuilder.Entity<EquipmentTypeSensor>()
    .HasOne(s => s.EquipmentType)
    .WithMany(et => et.Sensors)
    .HasForeignKey(s => s.EquipmentTypeId)
    .OnDelete(DeleteBehavior.Cascade);

// ── LineConfig ────────────────────────────────────────────────────────────────
modelBuilder.Entity<LineConfig>()
    .HasIndex(lc => lc.LineId)
    .IsUnique();

modelBuilder.Entity<LineEquipment>()
    .HasOne(le => le.LineConfig)
    .WithMany(lc => lc.Equipments)
    .HasForeignKey(le => le.LineConfigId)
    .OnDelete(DeleteBehavior.Cascade);

modelBuilder.Entity<LineEquipment>()
    .HasOne(le => le.EquipmentType)
    .WithMany(et => et.LineEquipments)
    .HasForeignKey(le => le.EquipmentTypeId)
    .OnDelete(DeleteBehavior.Restrict);
```

- [ ] **Step 3: Add IF NOT EXISTS DDL blocks to Program.cs**

Find the last `ExecuteSqlRawAsync` block in the DB init section of `Program.cs` and append after it:

```csharp
    // ── EquipmentTypes（Direction-C 動態設備系統）────────────────────────────
    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EquipmentTypes' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[EquipmentTypes] (
                [Id]          INT            IDENTITY(1,1) NOT NULL,
                [Name]        NVARCHAR(100)  NOT NULL,
                [VisType]     NVARCHAR(50)   NOT NULL,
                [Description] NVARCHAR(300)  NULL,
                [CreatedAt]   DATETIME2      NOT NULL,
                CONSTRAINT [PK_EquipmentTypes] PRIMARY KEY ([Id])
            );
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EquipmentTypeSensors' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[EquipmentTypeSensors] (
                [Id]              INT           IDENTITY(1,1) NOT NULL,
                [EquipmentTypeId] INT           NOT NULL,
                [SensorId]        INT           NOT NULL,
                [PointId]         NVARCHAR(100) NOT NULL,
                [Label]           NVARCHAR(100) NOT NULL,
                [Unit]            NVARCHAR(10)  NOT NULL DEFAULT N'℃',
                [Role]            NVARCHAR(20)  NOT NULL DEFAULT N'normal',
                [SortOrder]       INT           NOT NULL DEFAULT 0,
                CONSTRAINT [PK_EquipmentTypeSensors] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_EquipmentTypeSensors_EquipmentTypes]
                    FOREIGN KEY ([EquipmentTypeId]) REFERENCES [dbo].[EquipmentTypes]([Id]) ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX [IX_EquipmentTypeSensors_TypeId_SensorId]
                ON [dbo].[EquipmentTypeSensors] ([EquipmentTypeId], [SensorId]);
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LineConfigs' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[LineConfigs] (
                [Id]        INT           IDENTITY(1,1) NOT NULL,
                [LineId]    NVARCHAR(100) NOT NULL,
                [Name]      NVARCHAR(200) NOT NULL,
                [UpdatedAt] DATETIME2     NOT NULL,
                CONSTRAINT [PK_LineConfigs] PRIMARY KEY ([Id])
            );
            CREATE UNIQUE INDEX [IX_LineConfigs_LineId] ON [dbo].[LineConfigs] ([LineId]);
        END
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LineEquipments' AND schema_id = SCHEMA_ID('dbo'))
        BEGIN
            CREATE TABLE [dbo].[LineEquipments] (
                [Id]              INT           IDENTITY(1,1) NOT NULL,
                [LineConfigId]    INT           NOT NULL,
                [EquipmentTypeId] INT           NOT NULL,
                [AssetCode]       NVARCHAR(50)  NULL,
                [DisplayName]     NVARCHAR(200) NULL,
                [SortOrder]       INT           NOT NULL DEFAULT 0,
                CONSTRAINT [PK_LineEquipments] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_LineEquipments_LineConfigs]
                    FOREIGN KEY ([LineConfigId]) REFERENCES [dbo].[LineConfigs]([Id]) ON DELETE CASCADE,
                CONSTRAINT [FK_LineEquipments_EquipmentTypes]
                    FOREIGN KEY ([EquipmentTypeId]) REFERENCES [dbo].[EquipmentTypes]([Id])
            );
            CREATE INDEX [IX_LineEquipments_LineConfigId]
                ON [dbo].[LineEquipments] ([LineConfigId]);
        END
        """);
```

- [ ] **Step 4: Start the backend and verify tables are created**

```bash
cd "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard\backend"
dotnet run &
sleep 6
# Confirm new tables exist
curl -s http://localhost:5200/api/maintenance/stats
```
Expected: JSON response (backend started without error)

```bash
# Stop background process
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add backend/Data/IoTDbContext.cs backend/Program.cs
git commit -m "feat: register EquipmentType/LineConfig in DbContext + create tables on startup"
```

---

## Task 3 — Backend: EquipmentType CRUD API

**Files:**
- Create: `backend/Controllers/EquipmentTypeController.cs`

- [ ] **Step 1: Create EquipmentTypeController.cs**

```csharp
using System.ComponentModel.DataAnnotations;
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

// ── DTOs ──────────────────────────────────────────────────────────────────────

public record EquipmentTypeSensorDto(
    int Id, int SensorId, string PointId,
    string Label, string Unit, string Role, int SortOrder);

public record EquipmentTypeDto(
    int Id, string Name, string VisType, string? Description,
    DateTime CreatedAt, List<EquipmentTypeSensorDto> Sensors);

public record SaveSensorRequest(
    [Range(1, int.MaxValue)] int SensorId,
    [Required, MaxLength(100)] string PointId,
    [Required, MaxLength(100)] string Label,
    [MaxLength(10)] string Unit = "℃",
    [MaxLength(20)] string Role = "normal",
    int SortOrder = 0);

public record SaveEquipmentTypeRequest(
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(50)] string VisType,
    [MaxLength(300)] string? Description,
    List<SaveSensorRequest> Sensors);

// ── Controller ────────────────────────────────────────────────────────────────

[ApiController]
[Route("api/equipment-types")]
public class EquipmentTypeController(
    IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var types = await db.EquipmentTypes
            .Include(et => et.Sensors.OrderBy(s => s.SortOrder))
            .OrderBy(et => et.CreatedAt)
            .ToListAsync();
        return Ok(types.Select(MapToDto));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetOne(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var et = await db.EquipmentTypes
            .Include(et => et.Sensors.OrderBy(s => s.SortOrder))
            .FirstOrDefaultAsync(et => et.Id == id);
        if (et == null) return NotFound();
        return Ok(MapToDto(et));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveEquipmentTypeRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var et = new EquipmentType
        {
            Name = req.Name,
            VisType = req.VisType,
            Description = req.Description,
            CreatedAt = DateTime.UtcNow,
            Sensors = req.Sensors.Select((s, i) => new EquipmentTypeSensor
            {
                SensorId = s.SensorId,
                PointId = s.PointId,
                Label = s.Label,
                Unit = s.Unit,
                Role = s.Role,
                SortOrder = s.SortOrder == 0 ? i : s.SortOrder,
            }).ToList(),
        };
        db.EquipmentTypes.Add(et);
        await db.SaveChangesAsync();

        var created = await db.EquipmentTypes
            .Include(x => x.Sensors.OrderBy(s => s.SortOrder))
            .FirstAsync(x => x.Id == et.Id);
        return Ok(MapToDto(created));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveEquipmentTypeRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var et = await db.EquipmentTypes
            .Include(x => x.Sensors)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (et == null) return NotFound();

        et.Name = req.Name;
        et.VisType = req.VisType;
        et.Description = req.Description;

        // Replace sensors entirely
        db.EquipmentTypeSensors.RemoveRange(et.Sensors);
        et.Sensors = req.Sensors.Select((s, i) => new EquipmentTypeSensor
        {
            EquipmentTypeId = id,
            SensorId = s.SensorId,
            PointId = s.PointId,
            Label = s.Label,
            Unit = s.Unit,
            Role = s.Role,
            SortOrder = s.SortOrder == 0 ? i : s.SortOrder,
        }).ToList();

        await db.SaveChangesAsync();

        var updated = await db.EquipmentTypes
            .Include(x => x.Sensors.OrderBy(s => s.SortOrder))
            .FirstAsync(x => x.Id == id);
        return Ok(MapToDto(updated));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var et = await db.EquipmentTypes
            .Include(x => x.LineEquipments)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (et == null) return NotFound();

        if (et.LineEquipments.Count > 0)
            return Conflict(new
            {
                error = "此設備類型已被產線配置使用，請先從產線中移除",
                usedByCount = et.LineEquipments.Count,
            });

        db.EquipmentTypes.Remove(et);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static EquipmentTypeDto MapToDto(EquipmentType et) => new(
        et.Id, et.Name, et.VisType, et.Description, et.CreatedAt,
        et.Sensors.Select(s => new EquipmentTypeSensorDto(
            s.Id, s.SensorId, s.PointId, s.Label, s.Unit, s.Role, s.SortOrder
        )).ToList());
}
```

- [ ] **Step 2: Start backend + smoke-test the API**

```bash
cd "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard\backend"
dotnet run &
sleep 6

# Create 後跟定型機 (four_rings, sensors 9-12 + 40013 as material_detect)
curl -s -X POST http://localhost:5200/api/equipment-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "後跟定型機",
    "visType": "four_rings",
    "description": "熱冷定型四點量測",
    "sensors": [
      {"sensorId":40013,"pointId":"pt_mat","label":"在位","unit":"","role":"material_detect","sortOrder":0},
      {"sensorId":9,"pointId":"pt_mh_right","label":"熱定型右","unit":"℃","role":"normal","sortOrder":1},
      {"sensorId":10,"pointId":"pt_mc_right","label":"冷定型右","unit":"℃","role":"normal","sortOrder":2},
      {"sensorId":11,"pointId":"pt_mh_left","label":"熱定型左","unit":"℃","role":"normal","sortOrder":3},
      {"sensorId":12,"pointId":"pt_mc_left","label":"冷定型左","unit":"℃","role":"normal","sortOrder":4}
    ]
  }'
```
Expected: JSON with `id: 1`, `sensors` array with 5 entries.

```bash
# List all
curl -s http://localhost:5200/api/equipment-types | python -m json.tool
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add backend/Controllers/EquipmentTypeController.cs
git commit -m "feat: EquipmentType CRUD API (/api/equipment-types)"
```

---

## Task 4 — Backend: LineConfig CRUD API

**Files:**
- Create: `backend/Controllers/LineConfigController.cs`

- [ ] **Step 1: Create LineConfigController.cs**

```csharp
using System.ComponentModel.DataAnnotations;
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

// ── DTOs ──────────────────────────────────────────────────────────────────────

public record LineEquipmentDto(
    int Id, int EquipmentTypeId, EquipmentTypeDto EquipmentType,
    string? AssetCode, string? DisplayName, int SortOrder);

public record LineConfigDto(
    int Id, string LineId, string Name,
    DateTime UpdatedAt, List<LineEquipmentDto> Equipments);

public record SaveLineEquipmentRequest(
    [Range(1, int.MaxValue)] int EquipmentTypeId,
    [MaxLength(50)] string? AssetCode,
    [MaxLength(200)] string? DisplayName,
    int SortOrder = 0);

public record SaveLineConfigRequest(
    [Required, MaxLength(200)] string Name,
    List<SaveLineEquipmentRequest> Equipments);

// ── Controller ────────────────────────────────────────────────────────────────

[ApiController]
[Route("api/line-configs")]
public class LineConfigController(
    IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var lines = await db.LineConfigs
            .Include(lc => lc.Equipments.OrderBy(le => le.SortOrder))
                .ThenInclude(le => le.EquipmentType)
                    .ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))
            .OrderBy(lc => lc.Id)
            .ToListAsync();
        return Ok(lines.Select(MapToDto));
    }

    [HttpGet("{lineId}")]
    public async Task<IActionResult> GetOne(string lineId)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var lc = await db.LineConfigs
            .Include(lc => lc.Equipments.OrderBy(le => le.SortOrder))
                .ThenInclude(le => le.EquipmentType)
                    .ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))
            .FirstOrDefaultAsync(lc => lc.LineId == lineId);
        if (lc == null) return NotFound();
        return Ok(MapToDto(lc));
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] SaveLineConfigRequest req,
        [FromQuery] string lineId = "")
    {
        if (string.IsNullOrWhiteSpace(lineId))
            lineId = $"line_{Guid.NewGuid():N}";

        await using var db = await dbFactory.CreateDbContextAsync();
        if (await db.LineConfigs.AnyAsync(lc => lc.LineId == lineId))
            return Conflict(new { error = $"LineId '{lineId}' 已存在" });

        var lc = new LineConfig
        {
            LineId = lineId,
            Name = req.Name,
            UpdatedAt = DateTime.UtcNow,
            Equipments = req.Equipments.Select((e, i) => new LineEquipment
            {
                EquipmentTypeId = e.EquipmentTypeId,
                AssetCode = e.AssetCode,
                DisplayName = e.DisplayName,
                SortOrder = e.SortOrder == 0 ? i : e.SortOrder,
            }).ToList(),
        };
        db.LineConfigs.Add(lc);
        await db.SaveChangesAsync();
        return Ok(await LoadFullAsync(db, lc.Id));
    }

    [HttpPut("{lineId}")]
    public async Task<IActionResult> Save(string lineId, [FromBody] SaveLineConfigRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var lc = await db.LineConfigs
            .Include(x => x.Equipments)
            .FirstOrDefaultAsync(x => x.LineId == lineId);

        if (lc == null)
        {
            // Upsert: create if not found
            lc = new LineConfig { LineId = lineId };
            db.LineConfigs.Add(lc);
        }
        else
        {
            db.LineEquipments.RemoveRange(lc.Equipments);
        }

        lc.Name = req.Name;
        lc.UpdatedAt = DateTime.UtcNow;
        lc.Equipments = req.Equipments.Select((e, i) => new LineEquipment
        {
            EquipmentTypeId = e.EquipmentTypeId,
            AssetCode = e.AssetCode,
            DisplayName = e.DisplayName,
            SortOrder = e.SortOrder == 0 ? i : e.SortOrder,
        }).ToList();

        await db.SaveChangesAsync();
        return Ok(await LoadFullAsync(db, lc.Id));
    }

    [HttpDelete("{lineId}")]
    public async Task<IActionResult> Delete(string lineId)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var lc = await db.LineConfigs.FirstOrDefaultAsync(x => x.LineId == lineId);
        if (lc == null) return NotFound();
        db.LineConfigs.Remove(lc);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static async Task<LineConfigDto> LoadFullAsync(IoTDbContext db, int id)
    {
        var lc = await db.LineConfigs
            .Include(x => x.Equipments.OrderBy(le => le.SortOrder))
                .ThenInclude(le => le.EquipmentType)
                    .ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))
            .FirstAsync(x => x.Id == id);
        return MapToDto(lc);
    }

    private static LineConfigDto MapToDto(LineConfig lc) => new(
        lc.Id, lc.LineId, lc.Name, lc.UpdatedAt,
        lc.Equipments.Select(le => new LineEquipmentDto(
            le.Id, le.EquipmentTypeId,
            EquipmentTypeController.MapToDtoPublic(le.EquipmentType),
            le.AssetCode, le.DisplayName, le.SortOrder
        )).ToList());
}
```

> **Note:** `EquipmentTypeController.MapToDto` must be made `internal static` and renamed to `MapToDtoPublic` so `LineConfigController` can call it. Edit `EquipmentTypeController.cs` line:
> ```csharp
> // Change:
> private static EquipmentTypeDto MapToDto(EquipmentType et) => ...
> // To:
> internal static EquipmentTypeDto MapToDtoPublic(EquipmentType et) => ...
> // And update all 3 call sites inside EquipmentTypeController to use MapToDtoPublic
> ```

- [ ] **Step 2: Smoke-test LineConfig API**

```bash
cd "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard\backend"
dotnet run &
sleep 6

# Create the live production line with 後跟定型機 (equipmentTypeId=1 from Task 3)
curl -s -X PUT "http://localhost:5200/api/line-configs/line_live" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "烤箱生產線",
    "equipments": [
      {"equipmentTypeId":1,"assetCode":null,"displayName":null,"sortOrder":0}
    ]
  }' | python -m json.tool
```
Expected: `lineId: "line_live"`, `equipments[0].equipmentType.name: "後跟定型機"`, `equipments[0].equipmentType.sensors` contains 5 entries.

```bash
# List all lines
curl -s http://localhost:5200/api/line-configs | python -m json.tool
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add backend/Controllers/LineConfigController.cs backend/Controllers/EquipmentTypeController.cs
git commit -m "feat: LineConfig CRUD API (/api/line-configs) + expose EquipmentTypeController.MapToDtoPublic"
```

---

## Task 5 — Backend: Dynamic Material-Detect in DataIngestionService

**Files:**
- Modify: `backend/Services/DataIngestionService.cs`

**Context:** Lines 73-79 and 96 have `40013` hardcoded. We replace these with a DB lookup that finds which sensorId in this asset's equipment type has `Role = "material_detect"`.

- [ ] **Step 1: Add cache field + helper method to DataIngestionService**

Add these two members right after the `_lastStatus` and `_lock` fields (around line 25-26):

```csharp
// Cache: assetCode → materialDetect SensorId (null = no material-detect sensor)
private readonly ConcurrentDictionary<string, int?> _materialDetectCache = new();
```

Add this private helper method at the end of the class, before the closing `}`:

```csharp
private async Task<int?> GetMaterialDetectSensorIdAsync(string assetCode, IoTDbContext db)
{
    if (_materialDetectCache.TryGetValue(assetCode, out var cached))
        return cached;

    var sensorId = await db.LineEquipments
        .Where(le => le.AssetCode == assetCode)
        .SelectMany(le => le.EquipmentType.Sensors)
        .Where(s => s.Role == "material_detect")
        .Select(s => (int?)s.SensorId)
        .FirstOrDefaultAsync();

    _materialDetectCache[assetCode] = sensorId;
    return sensorId;
}
```

- [ ] **Step 2: Replace the hardcoded 40013 checks**

Find and replace the three hardcoded references in `ProcessAsync`:

**Replace lines 72-75** (shoeSensor block):
```csharp
// OLD:
var shoeSensor = payload.Sensors.FirstOrDefault(s => s.Id == 40013);
bool? hasMaterialNullable = shoeSensor != null ? shoeSensor.Value == 1 : null;
bool hasMaterial = hasMaterialNullable ?? true;

// NEW:
var matSensorId = await GetMaterialDetectSensorIdAsync(assetCode, db);
var shoeSensor = matSensorId.HasValue
    ? payload.Sensors.FirstOrDefault(s => s.Id == matSensorId.Value)
    : null;
bool? hasMaterialNullable = shoeSensor != null ? shoeSensor.Value == 1 : null;
bool hasMaterial = hasMaterialNullable ?? true;
```

**Replace line 79** (filter out material-detect sensor from readings):
```csharp
// OLD:
var readings = payload.Sensors
    .Where(s => s.Id != 40013)

// NEW:
var readings = payload.Sensors
    .Where(s => !matSensorId.HasValue || s.Id != matSensorId.Value)
```

**Replace line 96** (skip material-detect in alert loop):
```csharp
// OLD:
if (sensor.Id == 40013) continue;

// NEW:
if (matSensorId.HasValue && sensor.Id == matSensorId.Value) continue;
```

- [ ] **Step 3: Verify the old test still works**

```bash
cd "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard\backend"
dotnet run &
sleep 6

# Push data for TEST-001 (bound to TEST-ASSET-01, no equipment type → matSensorId=null → defaults to hasMaterial=true)
curl -s -X POST http://localhost:5200/api/data/ingest \
  -H "Content-Type: application/json" \
  -d '{"serialNumber":"TEST-001","timestamp":1712726500000,"isConnected":true,"sensors":[{"id":40001,"value":160.0}]}'

curl -s "http://localhost:5200/api/history/TEST-ASSET-01?sensorId=40001&maxPoints=10" | python -m json.tool
kill %1
```
Expected: the new reading (160.0) appears in history. No crash.

- [ ] **Step 4: Commit**

```bash
git add backend/Services/DataIngestionService.cs
git commit -m "feat: dynamic material-detect sensor lookup (replaces hardcoded SensorId 40013)"
```

---

## Task 6 — Frontend: API Types + Mapping Helpers

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/lib/apiLineConfig.ts`

- [ ] **Step 1: Add API response types to types/index.ts**

Append to the end of `frontend/src/types/index.ts`:

```typescript
// ── Direction-C: API response types ──────────────────────────────────────────

export interface ApiEquipmentTypeSensor {
  id: number;
  sensorId: number;
  pointId: string;
  label: string;
  unit: string;
  role: 'normal' | 'material_detect';
  sortOrder: number;
}

export interface ApiEquipmentType {
  id: number;
  name: string;
  /** Matches VisType union */
  visType: string;
  description: string | null;
  createdAt: string;
  sensors: ApiEquipmentTypeSensor[];
}

export interface ApiLineEquipment {
  id: number;
  equipmentTypeId: number;
  equipmentType: ApiEquipmentType;
  assetCode: string | null;
  displayName: string | null;
  sortOrder: number;
}

export interface ApiLineConfig {
  id: number;
  lineId: string;
  name: string;
  updatedAt: string;
  equipments: ApiLineEquipment[];
}

/** Extended Equipment — includes materialDetectSensorId for useLiveData */
export interface Equipment {
  id: string;
  deviceId: string;
  templateId: string;
  name: string;
  visType: VisType;
  points: Point[];
  /** SensorId that acts as "material present" flag; undefined = always has material */
  materialDetectSensorId?: number;
}
```

> **Note:** The `Equipment` interface re-declaration merges with the existing one. In TypeScript you cannot declare two interfaces with the same name in the same file unless you use declaration merging (they must be in the same scope). Instead, **edit the existing `Equipment` interface** (around line 46) to add the `materialDetectSensorId?: number` field to it, and remove the duplicate declaration above.

The correct approach: edit the existing interface:
```typescript
export interface Equipment {
  id: string;
  deviceId: string;
  templateId: string;
  name: string;
  visType: VisType;
  points: Point[];
  materialDetectSensorId?: number;   // ← add this line only
}
```

And append only the `ApiEquipmentTypeSensor`, `ApiEquipmentType`, `ApiLineEquipment`, `ApiLineConfig` types.

- [ ] **Step 2: Create frontend/src/lib/apiLineConfig.ts**

```typescript
import type {
  ApiEquipmentType, ApiLineConfig,
  Equipment, MachineTemplate, Point, ProductionLine, VisType,
} from '../types';

/** Convert API equipment type → MachineTemplate (for AddDeviceModal picker) */
export function apiTypeToTemplate(et: ApiEquipmentType): MachineTemplate {
  return {
    id: String(et.id),
    name: et.name,
    visType: et.visType as VisType,
    points: et.sensors
      .filter(s => s.role !== 'material_detect')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(s => ({
        name: s.label,
        type: 'temperature' as const,
        defaultUcl: 200,
        defaultLcl: 0,
        defaultBase: 100,
      })),
  };
}

/** Convert API line equipment → frontend Equipment */
function apiLineEquipmentToEquipment(le: ApiLineConfig['equipments'][number]): Equipment {
  const normalSensors = le.equipmentType.sensors
    .filter(s => s.role !== 'material_detect')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const matDetect = le.equipmentType.sensors.find(s => s.role === 'material_detect');

  const points: Point[] = normalSensors.map(s => ({
    id: s.pointId,
    name: s.label,
    type: 'temperature' as const,
    value: 0,
    unit: s.unit,
    status: 'offline' as const,
    history: [],
    ucl: 0,
    lcl: 0,
    sensorId: s.sensorId,
  }));

  return {
    id: `le_${le.id}`,
    deviceId: le.assetCode ?? '',
    templateId: String(le.equipmentTypeId),
    name: le.displayName ?? le.equipmentType.name,
    visType: le.equipmentType.visType as VisType,
    points,
    materialDetectSensorId: matDetect?.sensorId,
  };
}

/** Convert API LineConfig → frontend ProductionLine */
export function apiLineConfigToProductionLine(lc: ApiLineConfig): ProductionLine {
  return {
    id: lc.lineId,
    name: lc.name,
    equipments: lc.equipments
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(apiLineEquipmentToEquipment),
  };
}

// ── API calls ──────────────────────────────────────────────────────────────────

export async function fetchEquipmentTypes(): Promise<ApiEquipmentType[]> {
  const res = await fetch('/api/equipment-types');
  if (!res.ok) throw new Error(`GET /api/equipment-types → ${res.status}`);
  return res.json();
}

export async function fetchLineConfigs(): Promise<ApiLineConfig[]> {
  const res = await fetch('/api/line-configs');
  if (!res.ok) throw new Error(`GET /api/line-configs → ${res.status}`);
  return res.json();
}

export async function saveLineConfig(
  lineId: string,
  name: string,
  equipments: Array<{ equipmentTypeId: number; assetCode?: string; displayName?: string; sortOrder: number }>
): Promise<ApiLineConfig> {
  const res = await fetch(`/api/line-configs/${lineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, equipments }),
  });
  if (!res.ok) throw new Error(`PUT /api/line-configs/${lineId} → ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard\frontend"
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/apiLineConfig.ts
git commit -m "feat: add API types + apiLineConfig mapping helpers"
```

---

## Task 7 — Frontend: App.tsx — Load Structure from API

**Files:**
- Modify: `frontend/src/App.tsx`

**Context:** The goal is to replace the initial state from constants with API calls on mount. The `data` state (runtime sensor values) continues to be managed by `setData` / `useLiveData`. Structural changes (add/remove equipment) now go through the API + re-fetch.

- [ ] **Step 1: Replace constant imports with API imports**

At the top of `App.tsx`, remove:
```typescript
import { INITIAL_TEMPLATES } from './constants/templates';
import { LIVE_LINE, LIVE_LINE_ID } from './constants/liveLineConfig';
```

Add:
```typescript
import {
  fetchEquipmentTypes,
  fetchLineConfigs,
  apiTypeToTemplate,
  apiLineConfigToProductionLine,
  saveLineConfig,
} from './lib/apiLineConfig';
import type { ApiEquipmentType, ApiLineConfig } from './types';
```

- [ ] **Step 2: Replace the initial state values**

Find and change:
```typescript
// OLD:
const [templates, setTemplates] = useState<MachineTemplate[]>(INITIAL_TEMPLATES);
const [data, setData] = useState<ProductionLine[]>(() => { ... localStorage ... });
const [activeLineId, setActiveLineId] = useState<string>(() => { ... });

// NEW:
const [templates, setTemplates] = useState<MachineTemplate[]>([]);
const [data, setData] = useState<ProductionLine[]>([]);
const [activeLineId, setActiveLineId] = useState<string>('');
// Raw API data (needed to reconstruct PUT payloads for line edits)
const [apiLineConfigs, setApiLineConfigs] = useState<ApiLineConfig[]>([]);
const [apiEquipmentTypes, setApiEquipmentTypes] = useState<ApiEquipmentType[]>([]);
```

- [ ] **Step 3: Add initial load useEffect**

Add this `useEffect` near the top of the component (after the state declarations, before other effects):

```typescript
useEffect(() => {
  async function loadConfig() {
    try {
      const [types, lines] = await Promise.all([
        fetchEquipmentTypes(),
        fetchLineConfigs(),
      ]);
      setApiEquipmentTypes(types);
      setApiLineConfigs(lines);
      setTemplates(types.map(apiTypeToTemplate));
      const productionLines = lines.map(apiLineConfigToProductionLine);
      setData(productionLines);
      if (productionLines.length > 0) {
        setActiveLineId(prev => prev || productionLines[0].id);
      }
    } catch (err) {
      console.error('Failed to load config from API:', err);
    }
  }
  loadConfig();
}, []);
```

- [ ] **Step 4: Update "Add equipment to line" handler**

Find the handler that adds a new equipment to the current production line (currently does a `setData` + localStorage). Replace it with an API call:

```typescript
// Find the handler — it likely calls setData with a new equipment created from a template.
// Replace the body with:
async function handleAddEquipment(
  lineId: string,
  equipmentTypeId: number,
  assetCode: string,
  displayName: string
) {
  const lineConfig = apiLineConfigs.find(lc => lc.lineId === lineId);
  if (!lineConfig) return;

  const updatedEquipments = [
    ...lineConfig.equipments.map((le, i) => ({
      equipmentTypeId: le.equipmentTypeId,
      assetCode: le.assetCode ?? undefined,
      displayName: le.displayName ?? undefined,
      sortOrder: i,
    })),
    {
      equipmentTypeId,
      assetCode: assetCode || undefined,
      displayName: displayName || undefined,
      sortOrder: lineConfig.equipments.length,
    },
  ];

  const updated = await saveLineConfig(lineId, lineConfig.name, updatedEquipments);
  setApiLineConfigs(prev => prev.map(lc => lc.lineId === lineId ? updated : lc));
  setData(prev => prev.map(line =>
    line.id === lineId ? apiLineConfigToProductionLine(updated) : line
  ));
}
```

> The exact handler name and call site depends on `AddDeviceModal`'s callback prop. Search for the call that currently does `setData(prev => [...prev, newEquipment])` and update it accordingly.

- [ ] **Step 5: Remove localStorage persistence for data**

Find any `useEffect` that calls `localStorage.setItem` with the production line data and remove it (or comment it out). The data now comes from the DB.

- [ ] **Step 6: Verify the app loads**

```bash
# Start backend
cd "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard\backend" && dotnet run &
sleep 5
# Start frontend
cd "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard\frontend" && npm run dev
```

Open `http://localhost:5173`. The dashboard should load (empty or with the 烤箱生產線 if created in Task 4).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: App.tsx loads ProductionLine structure from API (replaces constants + localStorage)"
```

---

## Task 8 — Frontend: AddDeviceModal — Pick Equipment Type from API

**Files:**
- Modify: `frontend/src/components/modals/AddDeviceModal.tsx`

**Context:** The modal's Step 1 currently lets users pick from `templates` (prop from App). With the new system, `templates` comes from the API (via `apiTypeToTemplate`), so the picker already shows equipment types. The main change: when the user confirms, instead of calling a `setData`-only handler, call the `handleAddEquipment` function wired in Task 7, passing the `equipmentTypeId`.

- [ ] **Step 1: Pass equipmentTypeId through the modal's confirm callback**

In `AddDeviceModal.tsx`, locate the `onConfirm` / `onAdd` callback and its invocation. Update it to include the numeric `equipmentTypeId` (currently it likely only passes the template `id` string).

Find the template selection state:
```typescript
const [selectedTemplate, setSelectedTemplate] = useState<MachineTemplate | null>(null);
```

When calling the parent callback on confirm, add `equipmentTypeId: Number(selectedTemplate.id)`:
```typescript
// Find the onConfirm call and ensure it includes:
onConfirm({
  // ... existing fields ...
  equipmentTypeId: Number(selectedTemplate!.id),  // numeric ID for API
  assetCode: boundAssetCode,
  displayName: deviceName,
});
```

- [ ] **Step 2: Wire the callback in App.tsx**

Find where `<AddDeviceModal>` is rendered in `App.tsx`. Update the `onConfirm` prop to call `handleAddEquipment`:

```typescript
<AddDeviceModal
  ...
  onConfirm={({ equipmentTypeId, assetCode, displayName }) =>
    handleAddEquipment(activeLineId, equipmentTypeId, assetCode, displayName)
  }
/>
```

- [ ] **Step 3: Verify end-to-end**

1. Open the app
2. Click "Add Device"
3. Pick "後跟定型機" from the template list
4. Set an assetCode and confirm
5. Verify the equipment appears on the dashboard AND in the DB:
```bash
curl -s http://localhost:5200/api/line-configs/line_live | python -m json.tool
```
Expected: the new `LineEquipment` entry appears with the correct `assetCode`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/modals/AddDeviceModal.tsx
git commit -m "feat: AddDeviceModal uses API equipment types; add-to-line persists via API"
```

---

## Task 9 — Seed the Live Production Line Data

This task migrates the existing hardcoded `LIVE_LINE` config into the DB so the app runs correctly with real data.

- [ ] **Step 1: Seed equipment types via API**

```bash
# 高速加熱定型機 (single_kpi, sensor 1)
curl -s -X POST http://localhost:5200/api/equipment-types \
  -H "Content-Type: application/json" \
  -d '{"name":"高速加熱定型機","visType":"single_kpi","description":null,"sensors":[{"sensorId":40013,"pointId":"pt_mat","label":"在位","unit":"","role":"material_detect","sortOrder":0},{"sensorId":1,"pointId":"pt_vul_temp","label":"設備溫度","unit":"℃","role":"normal","sortOrder":1}]}'

# 藥水箱 (dual_side_spark, sensors 2-3)
curl -s -X POST http://localhost:5200/api/equipment-types \
  -H "Content-Type: application/json" \
  -d '{"name":"藥水箱","visType":"dual_side_spark","description":null,"sensors":[{"sensorId":40013,"pointId":"pt_mat","label":"在位","unit":"","role":"material_detect","sortOrder":0},{"sensorId":2,"pointId":"pt_chem_top","label":"大底溫度","unit":"℃","role":"normal","sortOrder":1},{"sensorId":3,"pointId":"pt_chem_bot","label":"鞋面溫度","unit":"℃","role":"normal","sortOrder":2}]}'

# 一次膠 (dual_side_spark, sensors 4-5)
curl -s -X POST http://localhost:5200/api/equipment-types \
  -H "Content-Type: application/json" \
  -d '{"name":"一次膠","visType":"dual_side_spark","description":null,"sensors":[{"sensorId":40013,"pointId":"pt_mat","label":"在位","unit":"","role":"material_detect","sortOrder":0},{"sensorId":4,"pointId":"pt_g1_top","label":"大底溫度","unit":"℃","role":"normal","sortOrder":1},{"sensorId":5,"pointId":"pt_g1_bot","label":"鞋面溫度","unit":"℃","role":"normal","sortOrder":2}]}'

# 二次膠 (dual_side_spark, sensors 6-7)
curl -s -X POST http://localhost:5200/api/equipment-types \
  -H "Content-Type: application/json" \
  -d '{"name":"二次膠","visType":"dual_side_spark","description":null,"sensors":[{"sensorId":40013,"pointId":"pt_mat","label":"在位","unit":"","role":"material_detect","sortOrder":0},{"sensorId":6,"pointId":"pt_g2_top","label":"大底溫度","unit":"℃","role":"normal","sortOrder":1},{"sensorId":7,"pointId":"pt_g2_bot","label":"鞋面溫度","unit":"℃","role":"normal","sortOrder":2}]}'

# 冷凍機 (single_kpi, sensor 8)
curl -s -X POST http://localhost:5200/api/equipment-types \
  -H "Content-Type: application/json" \
  -d '{"name":"冷凍機","visType":"single_kpi","description":null,"sensors":[{"sensorId":40013,"pointId":"pt_mat","label":"在位","unit":"","role":"material_detect","sortOrder":0},{"sensorId":8,"pointId":"pt_frz_temp","label":"設備溫度","unit":"℃","role":"normal","sortOrder":1}]}'

# 後跟定型機 already created in Task 3 (id=1) — skip if already exists
```

- [ ] **Step 2: Get the equipment type IDs**

```bash
curl -s http://localhost:5200/api/equipment-types | python -m json.tool
```
Note the IDs for: 高速加熱定型機, 藥水箱, 一次膠, 二次膠, 冷凍機, 後跟定型機.

- [ ] **Step 3: Create the live production line**

Replace `<id_vul>` etc. with the actual IDs from Step 2:

```bash
curl -s -X PUT "http://localhost:5200/api/line-configs/line_live" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "烤箱生產線",
    "equipments": [
      {"equipmentTypeId":<id_vul>,"assetCode":null,"displayName":null,"sortOrder":0},
      {"equipmentTypeId":<id_chem>,"assetCode":null,"displayName":null,"sortOrder":1},
      {"equipmentTypeId":<id_g1>,"assetCode":null,"displayName":null,"sortOrder":2},
      {"equipmentTypeId":<id_g2>,"assetCode":null,"displayName":null,"sortOrder":3},
      {"equipmentTypeId":<id_frz>,"assetCode":null,"displayName":null,"sortOrder":4},
      {"equipmentTypeId":<id_mold>,"assetCode":null,"displayName":null,"sortOrder":5}
    ]
  }' | python -m json.tool
```

- [ ] **Step 4: Verify dashboard shows all 6 equipment cards**

Open `http://localhost:5173`. All 6 equipment cards should appear in the correct `visType` layout.

- [ ] **Step 5: Delete the old constants files**

```bash
rm frontend/src/constants/sensorConfig.ts
rm frontend/src/constants/liveLineConfig.ts
rm frontend/src/constants/templates.ts
```

Fix any remaining import errors (`npx tsc --noEmit`), then commit.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: seed production line into DB + remove hardcoded constants"
```

---

## Verification (End-to-End)

After all tasks complete, run this full test:

```bash
# 1. Ensure backend running
curl -s http://localhost:5200/api/maintenance/stats

# 2. Equipment types exist
curl -s http://localhost:5200/api/equipment-types | python -m json.tool

# 3. Line config exists with all 6 equipments
curl -s http://localhost:5200/api/line-configs/line_live | python -m json.tool

# 4. Push data with material_detect sensor
curl -s -X POST http://localhost:5200/api/data/ingest \
  -H "Content-Type: application/json" \
  -d '{"serialNumber":"TEST-001","timestamp":1712726600000,"isConnected":true,"sensors":[{"id":40013,"value":0},{"id":40001,"value":999.0}]}'

# 5. No alert should appear (40013=0 → no material)
curl -s "http://localhost:5200/api/alerts?assetCode=TEST-ASSET-01" | python -m json.tool

# 6. Frontend shows 6 cards loaded from API (open browser: http://localhost:5173)
```

---

## Self-Review

**Spec coverage:**
- ✅ EquipmentType + sensors stored in DB (Tasks 1-2)
- ✅ EquipmentType CRUD API (Task 3)
- ✅ LineConfig CRUD API (Task 4)
- ✅ DataIngestionService dynamic material_detect (Task 5)
- ✅ Frontend types + mapping (Task 6)
- ✅ App.tsx loads from API (Task 7)
- ✅ AddDeviceModal persists via API (Task 8)
- ✅ Existing live line data seeded (Task 9)
- ✅ Old constants deleted (Task 9)

**Type consistency check:**
- `EquipmentTypeDto` defined in `EquipmentTypeController.cs` and referenced by `LineConfigController.cs` via `MapToDtoPublic`
- `apiLineConfigToProductionLine` returns `ProductionLine` using the updated `Equipment` interface (with `materialDetectSensorId`)
- `SaveLineEquipmentRequest.EquipmentTypeId` (int) matches the `equipmentTypeId: Number(selectedTemplate.id)` in `AddDeviceModal`
