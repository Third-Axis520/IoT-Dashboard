using IoT.CentralApi.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Services;

public class SqlIoTReceiverDataSource(IDbContextFactory<IoTDbContext> dbFactory) : IIoTReceiverDataSource
{
    private static readonly HashSet<string> AllowedTables = new(StringComparer.Ordinal)
    {
        "PressingMachineRealTimeData",
        "VisualMarkingMachineRealTimeData",
    };

    public async Task<IReadOnlyDictionary<string, object>?> ReadLatestRowAsync(
        string tableName, string assetCode, CancellationToken ct)
    {
        if (!AllowedTables.Contains(tableName))
            throw new ArgumentException($"tableName '{tableName}' not allowed", nameof(tableName));

        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var conn = db.Database.GetDbConnection();
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT TOP 1 * FROM [dbo].[{tableName}] WHERE AssetCode = @assetCode ORDER BY RecordTime DESC";
        var p = cmd.CreateParameter();
        p.ParameterName = "@assetCode";
        p.Value = assetCode;
        cmd.Parameters.Add(p);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        var dict = new Dictionary<string, object>(reader.FieldCount, StringComparer.Ordinal);
        for (int i = 0; i < reader.FieldCount; i++)
        {
            var name = reader.GetName(i);
            dict[name] = reader.IsDBNull(i) ? DBNull.Value : reader.GetValue(i);
        }
        return dict;
    }
}
