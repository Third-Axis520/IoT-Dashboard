# FAS 資產類別整合設計（Option A — Step 6 輕量整合）

**日期：** 2026-04-20  
**功能：** 在 Device Integration Wizard Step 6 加入「從 FAS 帶入」按鈕，讓使用者從 FAS 資產類別清單選取，自動填入設備名稱與描述。

---

## 背景

FAS（Fix Assets Manager）是公司資產管理系統，URL 為 `https://portal.diamondgroup.com.tw/FAS`。  
外部 API 走 `X-Api-Key` 驗證，類別端點回傳約 273 筆記錄。  
Option A 為輕量整合：不改變精靈流程，僅在 Step 6 補充輔助查詢功能。

---

## 後端設計

### 環境變數

```
FAS__ApiKey=<key>
```

不放 `appsettings.json`，完全靠環境變數。後端啟動時若未設定，`/api/fas/categories` 回 `503`。

### DTO

新增 `backend/Dtos/FasDtos.cs`：

```csharp
namespace IoTDashboard.Dtos;

public record FasCategoryDto(
    int Id,
    string CategoryCode,
    string CategoryName,
    string? Description
);
```

### Controller

新增 `backend/Controllers/FasController.cs`：

- **端點：** `GET /api/fas/categories`
- **邏輯：**
  1. 讀 `IConfiguration["FAS:ApiKey"]`，若為空回 `503 Service Unavailable`（body: `{ "error": "FAS API key not configured" }`）
  2. 用 `IHttpClientFactory` 呼叫 `https://portal.diamondgroup.com.tw/FAS/api/external/categories`，帶 `X-Api-Key` header
  3. FAS 回 `200` → 反序列化，過濾欄位，回傳 `FasCategoryDto[]`
  4. FAS 連線失敗 / timeout → 回 `503`（body: `{ "error": "FAS unavailable" }`）
  5. FAS 回 `401` → 回 `502`（body: `{ "error": "FAS authentication failed" }`）
- **不快取**（FAS 本身有 10 分鐘快取）
- **Timeout：** 10 秒

`Program.cs` 補：`builder.Services.AddHttpClient();`（若尚未加）

---

## 前端設計

### API Helper

新增 `frontend/src/lib/apiFas.ts`：

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

### FasCategoryPickerModal

新增 `frontend/src/components/modals/DeviceIntegrationWizard/FasCategoryPickerModal.tsx`：

**Props：**
```typescript
interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (categoryName: string, description: string) => void;
}
```

**行為：**
1. `open` 變 `true` 時觸發 `fetchFasCategories()`
2. Loading 期間顯示 spinner
3. 失敗顯示錯誤訊息 + 「重試」按鈕
4. 成功顯示：
   - 搜尋框（即時過濾，比對 `categoryCode` + `categoryName` + `description`，大小寫不分）
   - 清單（虛擬捲動可選，273 筆用一般 overflow scroll 亦可）
   - 每列：`categoryCode`（灰色小字）+ `categoryName`（主文字）+ `description`（次行，若有）
5. 點選一列 → 呼叫 `onSelect(categoryName, description ?? '')` → Modal 關閉
6. 搜尋無結果 → 顯示「找不到符合的類別」empty state

### Step6_Equipment.tsx 修改

在「設備類型名稱」label 右側加小按鈕：

```
設備類型名稱 *    [🔍 從 FAS 帶入]
[___________________輸入框___________________]
```

- 按鈕點擊 → 開 `FasCategoryPickerModal`
- `onSelect` 收到資料後 dispatch `SET_EQUIPMENT_INFO`，帶入 `name` + `description`（`visType` 維持現有值）
- 使用者可忽略按鈕直接手動輸入，兩者並存

### i18n Keys

三個 locale 檔（`zh-TW.json` / `zh-CN.json` / `en.json`）補：

| Key | zh-TW | zh-CN | en |
|-----|-------|-------|-----|
| `wizard.equipment.fasButton` | 從 FAS 帶入 | 从 FAS 带入 | Import from FAS |
| `wizard.equipment.fasModalTitle` | 選擇資產類別 | 选择资产类别 | Select Asset Category |
| `wizard.equipment.fasSearch` | 搜尋類別名稱或編號… | 搜索类别名称或编号… | Search category name or code… |
| `wizard.equipment.fasEmpty` | 找不到符合的類別 | 找不到符合的类别 | No matching categories |
| `wizard.equipment.fasError` | 無法連線至 FAS，請稍後再試 | 无法连接至 FAS，请稍后再试 | Unable to connect to FAS |
| `wizard.equipment.fasRetry` | 重試 | 重试 | Retry |

---

## 錯誤處理

| 情境 | 行為 |
|------|------|
| `FAS__ApiKey` 未設定 | Modal 顯示錯誤，不影響精靈其他功能 |
| FAS 服務不可達 | Modal 顯示錯誤 + 重試按鈕 |
| FAS 回 401 | Modal 顯示錯誤（「FAS 驗證失敗，請聯絡管理員」） |
| 使用者不使用 FAS | 手動輸入，完全正常 |

---

## 不在範圍內

- 資產查詢（`/api/external/assets`）
- 類別階層顯示（`parentID`）
- FAS API Key 管理 UI
- 快取（FAS 已有 10 分鐘快取）
