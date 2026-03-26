# Exception Handling

*Structured error handling in C#*

Exceptions provide a structured, type-safe way to handle errors. When something goes wrong, an exception is thrown and propagates up the call stack until it's caught.

## Try-Catch-Finally

```csharp
try
{
    int result = 10 / 0;  // Throws DivideByZeroException
}
catch (DivideByZeroException ex)
{
    Console.WriteLine($"Cannot divide by zero: {ex.Message}");
}
catch (Exception ex)  // Catch-all (less specific last)
{
    Console.WriteLine($"Unexpected error: {ex.Message}");
}
finally
{
    // Always runs - cleanup code goes here
    Console.WriteLine("Cleanup complete");
}
```

> **Note:** The `finally` block always executes regardless of whether an exception was thrown. Use it for cleanup like closing connections or releasing resources.

## Exception Filters

```csharp
try
{
    var response = await httpClient.GetAsync(url);
}
catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
{
    Console.WriteLine("Resource not found");
}
catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.Unauthorized)
{
    Console.WriteLine("Authentication required");
}
catch (HttpRequestException ex)
{
    Console.WriteLine($"HTTP error: {ex.StatusCode}");
}
```

> **Tip:** Exception filters (`when`) are evaluated without unwinding the stack, making them great for logging without disrupting the exception flow.

## Custom Exceptions

```csharp
public class InsufficientFundsException : Exception
{
    public decimal Balance { get; }
    public decimal Amount { get; }

    public InsufficientFundsException(decimal balance, decimal amount)
        : base($"Insufficient funds. Balance: {balance:C}, Attempted: {amount:C}")
    {
        Balance = balance;
        Amount = amount;
    }

    public InsufficientFundsException(string message, Exception inner)
        : base(message, inner) { }
}

// Usage
public void Withdraw(decimal amount)
{
    if (amount > Balance)
        throw new InsufficientFundsException(Balance, amount);

    Balance -= amount;
}
```

## Using Statement (IDisposable)

```csharp
// Classic using statement
using (var reader = new StreamReader("file.txt"))
{
    string content = reader.ReadToEnd();
}  // reader.Dispose() called automatically

// Modern using declaration (C# 8+)
using var connection = new SqlConnection(connectionString);
connection.Open();
// Disposed at end of enclosing scope

// Async disposal
await using var stream = new FileStream("data.bin", FileMode.Open);
```

## Best Practices

```csharp
// DO: Catch specific exceptions
try { /* ... */ }
catch (FileNotFoundException ex) { /* handle missing file */ }
catch (UnauthorizedAccessException ex) { /* handle permissions */ }

// DON'T: Catch and swallow
try { /* ... */ }
catch { } // Silent failure - bugs hide here!

// DO: Preserve stack trace when re-throwing
try { /* ... */ }
catch (Exception ex)
{
    logger.LogError(ex, "Operation failed");
    throw;  // Preserves original stack trace
}

// DON'T: Re-throw incorrectly
try { /* ... */ }
catch (Exception ex)
{
    throw ex;  // WRONG: Resets stack trace!
}
```

> **Warning:** Never use `throw ex;` to re-throw an exception — it resets the stack trace, making debugging much harder. Always use `throw;` by itself to preserve the original stack trace.

## The Result Pattern (Alternative to Exceptions)

For expected failures, consider a Result type instead of exceptions:

```csharp
public record Result<T>
{
    public T? Value { get; }
    public string? Error { get; }
    public bool IsSuccess => Error is null;

    private Result(T value) => Value = value;
    private Result(string error) => Error = error;

    public static Result<T> Success(T value) => new(value);
    public static Result<T> Failure(string error) => new(error);
}

// Usage
public Result<User> FindUser(string email)
{
    var user = _db.Users.FirstOrDefault(u => u.Email == email);
    return user is not null
        ? Result<User>.Success(user)
        : Result<User>.Failure($"No user found with email {email}");
}

var result = FindUser("alice@example.com");
if (result.IsSuccess)
    Console.WriteLine($"Found: {result.Value.Name}");
else
    Console.WriteLine(result.Error);
```

> **Important:** Use exceptions for truly exceptional, unexpected situations. For expected failure cases (user not found, validation failed, etc.), consider returning result types or using nullable returns instead.
