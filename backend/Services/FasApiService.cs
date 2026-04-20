using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace IoT.CentralApi.Services;

/// <summary>
/// FAS 資產系統 API 客戶端，帶 24hr DB 快取。
/// </summary>
public class FasApiService(
    IHttpClientFactory httpClientFactory,
    IDbContextFactory<IoTDbContext> dbFactory,
    IConfiguration config,
    ILogger<FasApiService> logger)
{
    private readonly string _baseUrl = config["FasApi:BaseUrl"] ?? "https://portal.diamondgroup.com.tw/FAS/";
    private readonly string _apiKey = config["FasApi:ApiKey"] ?? "";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromHours(24);

    // 記憶體內 negative cache：FAS 返回 404 的 AssetCode → 快取到期時間（5 分鐘）
    private static readonly TimeSpan NegativeCacheTtl = TimeSpan.FromMinutes(5);
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTime> _negativeCacheUntil = new();

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    /// <summary>
    /// 以 AssetCode 查詢資產資訊。先查 DB 快取，超過 24hr 才打 FAS API。
    /// </summary>
    public async Task<AssetInfoDto?> GetAssetInfoAsync(string assetCode)
    {
        // 1. 檢查 negative cache（避免對自訂/不存在的資產碼重複打 FAS）
        if (_negativeCacheUntil.TryGetValue(assetCode, out var negExpiry) && DateTime.UtcNow < negExpiry)
            return null;

        await using var db = await dbFactory.CreateDbContextAsync();

        // 2. 查 DB 快取
        var cached = await db.AssetCaches.FindAsync(assetCode);
        if (cached != null && DateTime.UtcNow - cached.LastUpdated < CacheTtl)
        {
            return MapToDto(cached);
        }

        // 3. 打 FAS API
        try
        {
            var client = httpClientFactory.CreateClient("FasApi");
            var response = await client.GetAsync($"api/external/assets?serno={Uri.EscapeDataString(assetCode)}");

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("FAS API returned {StatusCode} for AssetCode={AssetCode}", response.StatusCode, assetCode);
                // 快取 negative result（5 分鐘），避免每次輪詢都打 FAS
                _negativeCacheUntil[assetCode] = DateTime.UtcNow.Add(NegativeCacheTtl);
                return cached != null ? MapToDto(cached) : null;
            }

            var json = await response.Content.ReadAsStringAsync();
            var items = JsonSerializer.Deserialize<List<FasAssetItem>>(json, _jsonOptions);
            var item = items?.FirstOrDefault();

            if (item == null)
            {
                logger.LogWarning("FAS API returned empty result for AssetCode={AssetCode}", assetCode);
                return null;
            }

            // 更新快取
            if (cached == null)
            {
                cached = new AssetCache { AssetCode = assetCode };
                db.AssetCaches.Add(cached);
            }

            cached.AssetName = item.AssetName;
            cached.NickName = item.NickName;
            cached.DepartmentName = item.DepartmentName;
            cached.SupplierName = item.SupplierName;
            cached.Spec = item.Spec;
            cached.LastUpdated = DateTime.UtcNow;

            await db.SaveChangesAsync();

            logger.LogInformation("FAS asset cached: {AssetCode} → {AssetName}", assetCode, item.AssetName);
            return MapToDto(cached);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "FAS API error for AssetCode={AssetCode}", assetCode);
            return cached != null ? MapToDto(cached) : null;
        }
    }

    private static AssetInfoDto MapToDto(AssetCache c) => new()
    {
        AssetCode = c.AssetCode,
        AssetName = c.AssetName,
        NickName = c.NickName,
        DepartmentName = c.DepartmentName,
        SupplierName = c.SupplierName,
        Spec = c.Spec
    };

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

    // FAS API 回傳格式
    private class FasAssetItem
    {
        public string? Serno { get; set; }
        public string? AssetName { get; set; }
        public string? NickName { get; set; }
        public string? DepartmentName { get; set; }
        public string? SupplierName { get; set; }
        public string? Spec { get; set; }
    }

    private class FasCategoryItem
    {
        public int Id { get; set; }
        public int ParentID { get; set; }
        public string? CategoryCode { get; set; }
        public string? CategoryName { get; set; }
        public string? Description { get; set; }
    }
}
