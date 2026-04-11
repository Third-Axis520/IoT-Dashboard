// ─────────────────────────────────────────────────────────────────────────────
// TestDbFactory — 建立測試專用的 SQLite DbContext
// ─────────────────────────────────────────────────────────────────────────────
// 用途: 每個 integration test 取得獨立的 DB instance
// 特性:
//   - SQLite (file-based)，每個測試一個獨立 .db 檔
//   - EnsureCreated 後可立即使用
//   - 測試結束時 dispose 並刪除 db file
// ─────────────────────────────────────────────────────────────────────────────

using IoT.CentralApi.Data;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Tests._Shared;

public sealed class TestDbFactory : IAsyncDisposable
{
    public string DbPath { get; }
    public string ConnectionString => $"Data Source={DbPath}";

    public TestDbFactory()
    {
        DbPath = Path.Combine(Path.GetTempPath(), $"iottest_{Guid.NewGuid():N}.db");
    }

    public IoTDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<IoTDbContext>()
            .UseSqlite(ConnectionString)
            .Options;
        var ctx = new IoTDbContext(options);
        ctx.Database.EnsureCreated();
        return ctx;
    }

    public async ValueTask DisposeAsync()
    {
        if (File.Exists(DbPath))
        {
            try { File.Delete(DbPath); } catch { /* file lock OK */ }
        }
        await ValueTask.CompletedTask;
    }
}
