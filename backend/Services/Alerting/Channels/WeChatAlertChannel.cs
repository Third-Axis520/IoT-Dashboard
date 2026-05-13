using Microsoft.Extensions.Configuration;

namespace IoT.CentralApi.Services.Alerting.Channels;

/// <summary>
/// Opt-in WeChat channel. Disabled by default; flip via appsettings WeChat:Enabled = true.
/// </summary>
public class WeChatAlertChannel(WeChatService weChat, IConfiguration config) : IAlertChannel
{
    public string Name => "wechat";
    public bool IsEnabled => config.GetValue<bool>("WeChat:Enabled");

    public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct) =>
        weChat.SendConnectionAlertAsync(evt);
}
