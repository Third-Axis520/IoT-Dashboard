# IoT.CentralApi.Tests

xUnit test project for the IoT Central API backend.

## Run all tests
```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj
```

## Run specific tests
```bash
# Single test class
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~ModbusTcpAdapterTests"

# Single test method
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~Discover_ReadsRegisters"
```

## Folder structure
鏡像 `backend/` 下的對應結構：
- `Adapters/` ↔ `backend/Adapters/`
- `Services/` ↔ `backend/Services/`
- `Controllers/` ↔ `backend/Controllers/`
- `Integration/` — 跨層整合測試 (用 WebApplicationFactory)
- `_Shared/` — 共用測試基礎設施

## Test naming convention
`{ClassName}_{MethodName}_{Behavior}`

範例:
- `ModbusTcpAdapter_Discover_ReadsRegistersAndReturnsCurrentValues`
- `PropertyTypeController_Delete_Returns409WhenInUse`

## Test conventions
- 每個測試只驗一件事
- Arrange / Act / Assert 用空行分隔
- 用 `[Theory]` + `[InlineData]` 處理多組相似 case
- Integration test 繼承 `IntegrationTestBase` (in `_Shared/`)
- Adapter test 用各自的 Fixture (in `Adapters/_Fixtures/`)

## In-memory test DB
`IntegrationTestBase` 用 SQLite file 取代 SQL Server，每個測試獨立 DB file，
測試結束自動清理。
