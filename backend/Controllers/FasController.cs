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
