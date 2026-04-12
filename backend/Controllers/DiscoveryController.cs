using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/discovery")]
public class DiscoveryController(IEnumerable<IProtocolAdapter> adapters) : ControllerBase
{
    [HttpPost("scan")]
    public async Task<IActionResult> Scan([FromBody] ScanRequest request)
    {
        var adapter = adapters.FirstOrDefault(a => a.ProtocolId == request.Protocol);
        if (adapter == null)
            return NotFound(new ErrorResponse("unknown_protocol", $"協議 '{request.Protocol}' 不存在"));

        if (!adapter.SupportsDiscovery)
            return BadRequest(new ErrorResponse("no_discovery", $"協議 '{request.Protocol}' 不支援掃描"));

        var validation = adapter.ValidateConfig(request.Config);
        if (!validation.IsValid)
            return BadRequest(new ErrorResponse("invalid_config", validation.Error!));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cts.Token, HttpContext.RequestAborted);

        var result = await adapter.DiscoverAsync(request.Config, linked.Token);

        if (!result.IsSuccess)
        {
            var statusCode = result.ErrorKind switch
            {
                ErrorKind.InvalidConfig => 400,
                ErrorKind.Unauthorized => 401,
                ErrorKind.Transient => 502,
                ErrorKind.DeviceError => 502,
                _ => 500
            };
            return StatusCode(statusCode, new ScanResponse(false, null, result.ErrorMessage));
        }

        var points = result.Value!.Points.Select(p => new DiscoveredPointDto(
            RawAddress: p.RawAddress,
            CurrentValue: p.CurrentValue,
            DataType: p.DataType,
            SuggestedLabel: p.SuggestedLabel
        )).ToList();

        return Ok(new ScanResponse(true, points, null));
    }
}
