namespace IoT.CentralApi.Services;

public interface IIoTReceiverDataSource
{
    /// <summary>
    /// 從共用 DB 讀 IoTReceiverAPI 寫入的最新一筆 row（依 AssetCode + RecordTime DESC）。
    /// 回傳 Dictionary&lt;column, value&gt;，含 RecordTime；row 不存在時回 null。
    /// </summary>
    Task<IReadOnlyDictionary<string, object>?> ReadLatestRowAsync(
        string tableName,
        string assetCode,
        CancellationToken ct);
}
