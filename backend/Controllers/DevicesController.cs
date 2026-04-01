using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/devices")]
public class DevicesController(
    IDbContextFactory<IoTDbContext> dbFactory,
    FasApiService fasService) : ControllerBase
{
    // GetAll 結果快取 30 秒，避免 10s 輪詢反覆打 FAS API
    private static List<DeviceDto>? _cachedList;
    private static DateTime _cacheExpiry = DateTime.MinValue;
    private static readonly TimeSpan ListCacheTtl = TimeSpan.FromSeconds(30);

    /// <summary>手動預先登記設備（設備尚未連線時使用）</summary>
    [HttpPost]
    public async Task<IActionResult> Register([FromBody] RegisterDeviceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.SerialNumber))
            return BadRequest("SerialNumber is required.");

        await using var db = await dbFactory.CreateDbContextAsync();

        var existing = await db.Devices
            .FirstOrDefaultAsync(d => d.SerialNumber == request.SerialNumber);

        if (existing != null)
            return Conflict(new { message = $"設備 '{request.SerialNumber}' 已存在。", device = MapToDto(existing, null) });

        var now = DateTime.UtcNow;
        var device = new Device
        {
            SerialNumber = request.SerialNumber,
            FriendlyName = request.FriendlyName,
            FirstSeen = now,
            LastSeen = now
        };
        db.Devices.Add(device);
        await db.SaveChangesAsync();

        _cachedList = null; // 強制下次 GetAll 重新載入
        return Ok(MapToDto(device, null));
    }

    /// <summary>列出所有設備（含未綁定）</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        if (_cachedList != null && DateTime.UtcNow < _cacheExpiry)
            return Ok(_cachedList);

        await using var db = await dbFactory.CreateDbContextAsync();
        var devices = await db.Devices
            .OrderByDescending(d => d.LastSeen)
            .ToListAsync();

        var result = new List<DeviceDto>();
        foreach (var d in devices)
        {
            AssetInfoDto? assetInfo = d.AssetCode != null
                ? await fasService.GetAssetInfoAsync(d.AssetCode)
                : null;
            result.Add(MapToDto(d, assetInfo));
        }

        _cachedList = result;
        _cacheExpiry = DateTime.UtcNow.Add(ListCacheTtl);
        return Ok(result);
    }

    /// <summary>綁定 SerialNumber → AssetCode</summary>
    [HttpPost("{serialNumber}/bind")]
    public async Task<IActionResult> Bind(string serialNumber, [FromBody] BindDeviceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.AssetCode))
            return BadRequest("AssetCode is required.");

        await using var db = await dbFactory.CreateDbContextAsync();
        var device = await db.Devices
            .FirstOrDefaultAsync(d => d.SerialNumber == serialNumber);

        if (device == null)
            return NotFound($"Device '{serialNumber}' not found.");

        device.AssetCode = request.AssetCode;
        device.FriendlyName = request.FriendlyName;
        await db.SaveChangesAsync();

        _cachedList = null;
        var assetInfo = await fasService.GetAssetInfoAsync(request.AssetCode);
        return Ok(MapToDto(device, assetInfo));
    }

    /// <summary>解除綁定</summary>
    [HttpDelete("{serialNumber}/bind")]
    public async Task<IActionResult> Unbind(string serialNumber)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var device = await db.Devices
            .FirstOrDefaultAsync(d => d.SerialNumber == serialNumber);

        if (device == null)
            return NotFound($"Device '{serialNumber}' not found.");

        device.AssetCode = null;
        device.FriendlyName = null;
        await db.SaveChangesAsync();

        _cachedList = null;
        return NoContent();
    }

    private static DeviceDto MapToDto(Device d, AssetInfoDto? assetInfo) => new()
    {
        Id = d.Id,
        SerialNumber = d.SerialNumber,
        IpAddress = d.IpAddress,
        AssetCode = d.AssetCode,
        FriendlyName = d.FriendlyName,
        AssetName = assetInfo?.AssetName ?? assetInfo?.NickName,
        DepartmentName = assetInfo?.DepartmentName,
        FirstSeen = d.FirstSeen,
        LastSeen = d.LastSeen
    };
}
