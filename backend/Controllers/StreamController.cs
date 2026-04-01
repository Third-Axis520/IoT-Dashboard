using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api")]
public class StreamController(SseHub sseHub) : ControllerBase
{
    /// <summary>
    /// SSE 串流端點，Dashboard 長連接訂閱即時資料。
    /// </summary>
    [HttpGet("stream")]
    public async Task Stream(CancellationToken ct)
    {
        var connectionId = Guid.NewGuid().ToString("N");

        Response.Headers["Content-Type"] = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no";
        Response.Headers["Connection"] = "keep-alive";

        await Response.Body.FlushAsync(ct);

        sseHub.AddConnection(connectionId, Response);

        try
        {
            // Heartbeat 每 15 秒一次，保持連線存活
            using var heartbeatTimer = new PeriodicTimer(TimeSpan.FromSeconds(15));
            while (!ct.IsCancellationRequested)
            {
                await heartbeatTimer.WaitForNextTickAsync(ct);
                await sseHub.SendHeartbeatAsync(ct);
            }
        }
        catch (OperationCanceledException)
        {
            // 客戶端斷線，正常結束
        }
        finally
        {
            sseHub.RemoveConnection(connectionId);
        }
    }
}
