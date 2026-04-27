namespace IoT.CentralApi.Adapters;

internal record ModbusTcpConfig(
    string Host,
    int Port,
    int UnitId,
    int StartAddress,
    int Count,
    string DataType,
    bool ByteSwap = false,
    double Scale = 1.0,
    string Function = "holding");
