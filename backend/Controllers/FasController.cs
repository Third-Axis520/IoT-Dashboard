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
