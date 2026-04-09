using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/data")]
public class DataIngestController(DataIngestionService ingestionService) : ControllerBase
{
    /// <summary>
    /// 接收 OvenDataReceive 推送的感測器資料。
    /// </summary>
    [EnableRateLimiting("ingest")]
    [HttpPost("ingest")]
    public async Task<IActionResult> Ingest([FromBody] IngestPayload payload)
    {
        if (string.IsNullOrWhiteSpace(payload.SerialNumber))
            return BadRequest("SerialNumber is required.");

        await ingestionService.ProcessAsync(payload);
        return Ok(new { received = payload.Sensors.Count });
    }
}
