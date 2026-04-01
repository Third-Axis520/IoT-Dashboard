using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/assets")]
public class AssetsController(FasApiService fasService) : ControllerBase
{
    /// <summary>取得 FAS 資產資訊（帶 24hr 快取）。</summary>
    [HttpGet("{assetCode}")]
    public async Task<IActionResult> Get(string assetCode)
    {
        var info = await fasService.GetAssetInfoAsync(assetCode);
        if (info == null)
            return NotFound(new { message = $"AssetCode '{assetCode}' not found in FAS." });

        return Ok(info);
    }
}
