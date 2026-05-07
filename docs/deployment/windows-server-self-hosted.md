# Windows Server Self-Hosted 部署

把整個 IoT Dashboard（後端 + 前端 SPA）部署到一台 Windows Server，由 Kestrel 同時 serve API 與 SPA，無需 IIS / 反向代理。

## 已驗證環境
- **Server**：Windows Server，IP `192.168.6.23`
- **路徑**：`C:\Users\Administrator\Desktop\IoT\NB_C.C_Dashboard`
- **Port**：5200（單 port HTTP）
- **DB**：本機 SQL Server 2022，database `IoTControlChart`，Trusted Connection

---

## 前置條件（Server 端）

| 項目 | 確認方式 |
|------|---------|
| .NET 9 Runtime | `dotnet --list-runtimes` 至少看到 `Microsoft.AspNetCore.App 9.x.x` |
| SQL Server | `Get-Service MSSQLSERVER` 狀態 Running，預設 instance 即可 |
| administrator 帳號是 SQL sysadmin | 預設安裝是；若否需 `sp_addsrvrolemember 'sa', 'sysadmin'` |
| 防火牆已開 TCP 5200 inbound | `Get-NetFirewallRule -DisplayName 'IoT Dashboard 5200'` |

---

## 部署步驟（從 dev 機器執行）

### 1. 在 dev 機器 build 前端
```powershell
cd frontend
npm ci
npm run build
```
輸出在 `frontend/dist/`。

### 2. 在 dev 機器 publish 後端（含前端 dist）
```powershell
cd backend
dotnet publish -c Release -o ./publish
```
`IoT.CentralApi.csproj` 的 `IncludeFrontendDistInPublish` target 會自動把 `frontend/dist` 拷進 `publish/wwwroot/`。

### 3. 把 publish 目錄拷到 server

**方法 A：SMB（推薦）**
```powershell
# 在 dev 機開 PowerShell：
$pw = ConvertTo-SecureString '<admin-password>' -AsPlainText -Force
$cred = New-Object PSCredential('administrator', $pw)
New-SmbMapping -LocalPath 'Z:' -RemotePath '\\192.168.6.23\C$' -UserName 'administrator' -Password '<admin-password>'

# 再用 robocopy（注意 bash 要 MSYS_NO_PATHCONV=1）
robocopy "publish" "Z:\Users\Administrator\Desktop\IoT\NB_C.C_Dashboard\backend\publish" /E /R:2 /MT:16
```

**方法 B：RDP 拖拉** — 直接把 `publish/` zip 拖進 server。

### 4. 在 server 跑一次性 init（建 DB + 防火牆 + 啟動）
複製這支腳本到 `C:\Users\Administrator\Desktop\IoT\NB_C.C_Dashboard\deploy\init.ps1` 並用 elevated PowerShell 執行（或以 schtasks 從遠端觸發、`/RL HIGHEST`）：

```powershell
# Run as Administrator on server
$root = 'C:\Users\Administrator\Desktop\IoT\NB_C.C_Dashboard'

# 1) 防火牆
if (-not (Get-NetFirewallRule -DisplayName 'IoT Dashboard 5200' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'IoT Dashboard 5200' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5200
}

# 2) 建 DB（idempotent）
sqlcmd -E -S localhost -Q "IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'IoTControlChart') CREATE DATABASE [IoTControlChart];"

# 3) 啟動後端（首次 startup 會自動建 schema + seed PropertyTypes）
$exe = Join-Path $root 'backend\publish\IoT.CentralApi.exe'
Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -WindowStyle Hidden
```

### 5. 授予 SYSTEM 帳號 SQL Server sysadmin（Windows Service 必要）

> **一次性步驟**：Windows Service 以 `LocalSystem` 跑，需要有 SQL Server 存取權。

```powershell
# 在 server 上以 administrator 身分執行（或透過 RDP）
sqlcmd -E -S localhost -Q "EXEC sp_addsrvrolemember 'NT AUTHORITY\SYSTEM', 'sysadmin'"
```

### 6. 安裝 Windows Service（取代舊的 Task Scheduler）

```powershell
$exe = 'C:\Users\Administrator\Desktop\IoT\NB_C.C_Dashboard\backend\publish\IoT.CentralApi.exe'

# 建立 Service（以 LocalSystem 執行，開機自動啟動）
sc.exe create IoTDashboard binPath= $exe DisplayName= "IoT Dashboard" start= auto obj= "LocalSystem"

# 設定 Failure Recovery：失敗後分別等 60s / 30s / 30s 重啟，計數每天重置
sc.exe failure IoTDashboard reset= 86400 actions= restart/60000/restart/30000/restart/30000

# 啟動
sc.exe start IoTDashboard
```

### 7. 驗證
- `http://192.168.6.23:5200/api/protocols` → 回 JSON 陣列（3 個 protocol）
- `http://192.168.6.23:5200/` → 回 dashboard SPA
- `sc.exe query IoTDashboard` → `STATE: 4 RUNNING`

---

## 後續維護

### 更新部署
1. dev 機器 `npm run build` + `dotnet publish`
2. **先停 Service**：`sc.exe \\192.168.6.23 stop IoTDashboard`（否則 .exe 鎖檔）
3. Robocopy 新 publish 到 server
4. **重啟 Service**：`sc.exe \\192.168.6.23 start IoTDashboard`

### 管理 Service（遠端）
```powershell
sc.exe \\192.168.6.23 query IoTDashboard    # 查狀態
sc.exe \\192.168.6.23 stop IoTDashboard     # 停止
sc.exe \\192.168.6.23 start IoTDashboard    # 啟動
sc.exe \\192.168.6.23 delete IoTDashboard   # 移除（需先 stop）
```

### 查看 backend log
- Windows Service 模式下，logs 寫入 Windows Event Log（Application，Source: IoT.CentralApi）
- 查詢：`wevtutil qe Application /r:192.168.6.23 /u:administrator /p:<password> /c:50 /q:"*[System[Provider[@Name='IoT.CentralApi']]]" /f:text`

### CORS 設定
單 port 同源所以本身**不需要 CORS**。如果之後拆成不同 origin（例如 IIS 反代），要在 `appsettings.json` 加：
```json
"Cors": { "Origins": ["http://your-frontend-host"] }
```

---

## 常見問題

| 症狀 | 原因 | 解法 |
|------|-----|------|
| `http://192.168.6.23:5200/` 回 404，但 `/api/*` 正常 | `wwwroot` 沒有 SPA 檔案 | 確認 publish 含 `wwwroot/index.html`，沒有的話重新 `dotnet publish` |
| backend 啟動 crash 提示 index 已存在 | 舊版 bootstrap bug（已修） | 確認部署的是含 commit `f219de5` 之後的版本 |
| Service 啟動失敗（1069 Logon failure） | 嘗試用 administrator 跑但無 Log on as service 權限 | 改用 `LocalSystem`：`sc.exe config IoTDashboard obj= LocalSystem` |
| Service 啟動失敗（1053 timeout），Event Log 顯示 `CREATE DATABASE` 拒絕 | `LocalSystem` 沒有 SQL sysadmin | 執行步驟 5 的 `sp_addsrvrolemember` |
| 開不了 SQL connection | SQL Server 服務沒跑 | `sc.exe \\192.168.6.23 start MSSQLSERVER` |

---

## 為什麼選 Kestrel 直接 serve SPA

| 替代方案 | 原因不選 |
|---------|---------|
| IIS 反代到 Kestrel | 多一層維護、URL Rewrite + ARR 模組要另裝 |
| nginx for Windows | 第三方、Windows Server 上不主流 |
| 兩個 port + CORS | 需設定 CORS、客戶可能跨網段 origin 列不完 |
| **Kestrel 同源 serve（現方案）** | ✅ 單一 port、零 CORS、單一 Process 管理 |

如未來需要 HTTPS 才上反向代理。
