# Error Handling Patterns

*Production-grade error handling strategies*

Beyond basic try-catch, C# developers use several patterns to handle errors gracefully. This lesson covers the patterns used in real-world production code.

## Guard Clauses

Validate inputs early and fail fast:

```csharp
public class UserService
{
    public User CreateUser(string name, string email, int age)
    {
        // Guard clauses at the top
        ArgumentNullException.ThrowIfNull(name);
        ArgumentNullException.ThrowIfNull(email);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(age);

        if (!email.Contains('@'))
            throw new ArgumentException("Invalid email format", nameof(email));

        // Happy path - clean and readable
        var user = new User(name, email, age);
        _repository.Save(user);
        return user;
    }
}
```

> **Tip:** Guard clauses eliminate deeply nested if-else blocks. Put all validation at the top of the method, then write the happy path without nesting.

## The Result Pattern

For operations where failure is expected (not exceptional):

```csharp
public readonly struct Result<T>
{
    public T? Value { get; }
    public string? Error { get; }
    public bool IsSuccess => Error is null;
    public bool IsFailure => !IsSuccess;

    private Result(T? value, string? error) => (Value, Error) = (value, error);

    public static Result<T> Ok(T value) => new(value, null);
    public static Result<T> Fail(string error) => new(default, error);

    public Result<TNew> Map<TNew>(Func<T, TNew> mapper) =>
        IsSuccess ? Result<TNew>.Ok(mapper(Value!)) : Result<TNew>.Fail(Error!);

    public Result<TNew> Bind<TNew>(Func<T, Result<TNew>> binder) =>
        IsSuccess ? binder(Value!) : Result<TNew>.Fail(Error!);
}
```

```csharp
public Result<User> Register(string email, string password)
{
    if (string.IsNullOrEmpty(email))
        return Result<User>.Fail("Email is required");

    if (password.Length < 8)
        return Result<User>.Fail("Password must be at least 8 characters");

    if (_repository.ExistsByEmail(email))
        return Result<User>.Fail("Email already registered");

    var user = new User(email, HashPassword(password));
    _repository.Save(user);
    return Result<User>.Ok(user);
}

// Usage - clean error handling without exceptions
var result = Register("alice@example.com", "secure123");
if (result.IsSuccess)
    Console.WriteLine($"Welcome, {result.Value.Email}!");
else
    Console.WriteLine($"Registration failed: {result.Error}");

// Chaining results
var greeting = Register(email, password)
    .Map(user => user.Email)
    .Map(email => $"Welcome, {email}!");
```

## Retry Pattern

For transient failures (network, database):

```csharp
public static async Task<T> RetryAsync<T>(
    Func<Task<T>> operation,
    int maxRetries = 3,
    TimeSpan? initialDelay = null)
{
    var delay = initialDelay ?? TimeSpan.FromSeconds(1);

    for (int attempt = 0; ; attempt++)
    {
        try
        {
            return await operation();
        }
        catch (Exception ex) when (attempt < maxRetries && IsTransient(ex))
        {
            Console.WriteLine($"Attempt {attempt + 1} failed, retrying in {delay}...");
            await Task.Delay(delay);
            delay *= 2; // Exponential backoff
        }
    }
}

static bool IsTransient(Exception ex) => ex is
    HttpRequestException or
    TimeoutException or
    IOException;

// Usage
var data = await RetryAsync(() => httpClient.GetStringAsync(url));
```

## Circuit Breaker

Prevent cascading failures:

```csharp
public class CircuitBreaker
{
    private int _failureCount;
    private DateTime? _openedAt;
    private readonly int _threshold;
    private readonly TimeSpan _resetTimeout;

    public CircuitBreaker(int threshold = 5, int resetSeconds = 30)
    {
        _threshold = threshold;
        _resetTimeout = TimeSpan.FromSeconds(resetSeconds);
    }

    public async Task<T> ExecuteAsync<T>(Func<Task<T>> operation)
    {
        if (_openedAt.HasValue)
        {
            if (DateTime.UtcNow - _openedAt.Value < _resetTimeout)
                throw new CircuitBrokenException("Circuit is open");

            _openedAt = null; // Try half-open
        }

        try
        {
            var result = await operation();
            _failureCount = 0;
            return result;
        }
        catch
        {
            _failureCount++;
            if (_failureCount >= _threshold)
                _openedAt = DateTime.UtcNow;
            throw;
        }
    }
}
```

> **Note:** In production, use a library like Polly for retry, circuit breaker, timeout, and other resilience patterns. It handles edge cases and is well-tested.

## Global Exception Handling

```csharp
// ASP.NET Core middleware
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
        var response = new { error = "An unexpected error occurred" };

        context.Response.StatusCode = exception switch
        {
            NotFoundException => 404,
            UnauthorizedException => 401,
            ValidationException => 400,
            _ => 500
        };

        await context.Response.WriteAsJsonAsync(response);
    });
});
```

> **Important:** Never expose internal exception details (stack traces, connection strings, etc.) to end users. Log the full details server-side and return a generic error message to the client.
