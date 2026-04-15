using IoT.CentralApi.Dtos;

namespace IoT.CentralApi.Middleware;

public class ApiKeyMiddleware(RequestDelegate next, IConfiguration config, IHostEnvironment env)
{
    private const string HeaderName = "X-Api-Key";

    public async Task InvokeAsync(HttpContext context)
    {
        if (env.IsDevelopment())
        {
            await next(context);
            return;
        }

        var expectedKey = config["Authentication:ApiKey"];
        if (string.IsNullOrEmpty(expectedKey))
        {
            await next(context);
            return;
        }

        if (!context.Request.Headers.TryGetValue(HeaderName, out var providedKey)
            || providedKey != expectedKey)
        {
            context.Response.StatusCode = 401;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(
                new ErrorResponse("unauthorized", "Missing or invalid API key."));
            return;
        }

        await next(context);
    }
}
