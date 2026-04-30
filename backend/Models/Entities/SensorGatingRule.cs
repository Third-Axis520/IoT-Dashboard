using System.ComponentModel.DataAnnotations;

namespace IoT.CentralApi.Models;

public class SensorGatingRule
{
    public int Id { get; set; }

    [Required, MaxLength(50)]
    public string GatedAssetCode { get; set; } = "";

    public int GatedSensorId { get; set; }

    [Required, MaxLength(50)]
    public string GatingAssetCode { get; set; } = "";

    public int GatingSensorId { get; set; }

    public int DelayMs { get; set; } = 0;
    // Default 10000ms — must be >= DI source pollIntervalMs (typically 5000ms)
    // or every gated sensor will be filtered as Stale most of the time.
    public int MaxAgeMs { get; set; } = 10000;

    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
