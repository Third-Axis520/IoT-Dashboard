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
