namespace IoT.CentralApi.Adapters;

internal record IoTReceiverDbConfig(
    string TableName,
    string AssetCode,
    int MaxAgeMs = 30000);
