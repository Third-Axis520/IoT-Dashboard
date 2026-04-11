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
