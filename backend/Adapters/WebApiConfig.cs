namespace IoT.CentralApi.Adapters;

internal record WebApiConfig(
    string Url,
    string Method,
    Dictionary<string, string>? Headers,
    string JsonPathRoot,
    string KeyField = "name",
    string ValueField = "value");
