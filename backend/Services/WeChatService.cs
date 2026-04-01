using IoT.CentralApi.Models;

namespace IoT.CentralApi.Services;

/// <summary>
/// 企業微信通知服務。
/// MVP：Console.Log + 寫入 Logs/WeChatPending.txt
/// 取得 Webhook URL 後，將 Enabled 設為 true 並填入 WebhookUrl。
/// </summary>
public class WeChatService(IConfiguration config, ILogger<WeChatService> logger)
{
    private readonly bool _enabled = config.GetValue<bool>("WeChat:Enabled");
    private readonly string? _webhookUrl = config["WeChat:WebhookUrl"];
    private readonly string _logPath = Path.Combine("Logs", "WeChatPending.txt");

    public async Task SendAlertAsync(SensorAlert alert, string assetName)
    {
        var severity = alert.Severity == "danger" ? "🔴 危險" : "🟡 警告";
        var direction = alert.AlertType == "UCL" ? "超過上限" : "低於下限";

        var text = $"[{severity}] {assetName} | 感測器 {alert.SensorId} {alert.SensorName}\n" +
                   $"目前值：{alert.Value:F1}  {direction}：{alert.LimitValue:F1}\n" +
                   $"時間：{alert.Timestamp:yyyy-MM-dd HH:mm:ss}";

        logger.LogWarning("[WeChat Mock] {Text}", text);

        // 寫入 pending log
        Directory.CreateDirectory("Logs");
        await File.AppendAllTextAsync(_logPath, $"{DateTime.UtcNow:O} | {text}\n---\n");

        if (_enabled && !string.IsNullOrWhiteSpace(_webhookUrl))
        {
            // TODO: POST to WeChat Work Webhook
            // var payload = new { msgtype = "markdown", markdown = new { content = text } };
            // await _httpClient.PostAsJsonAsync(_webhookUrl, payload);
        }
    }
}
