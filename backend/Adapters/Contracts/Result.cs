namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// Adapter 方法的統一回傳型別。Adapter 絕不 throw（除了 OperationCanceledException）。
/// 所有例外包進 Result.Fail。
/// </summary>
public record Result<T>
{
    public bool IsSuccess { get; init; }
    public T? Value { get; init; }
    public string? ErrorMessage { get; init; }
    public ErrorKind ErrorKind { get; init; }

    public static Result<T> Ok(T value) => new()
    {
        IsSuccess = true,
        Value = value ?? throw new ArgumentNullException(nameof(value)),
        ErrorKind = ErrorKind.None
    };

    public static Result<T> Fail(ErrorKind kind, string message) => new()
    {
        IsSuccess = false,
        ErrorKind = kind,
        ErrorMessage = message
    };
}
