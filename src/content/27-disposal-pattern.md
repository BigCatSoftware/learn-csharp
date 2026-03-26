# The Disposal Pattern

Managed memory in .NET is handled by the garbage collector, but many objects hold **unmanaged resources** — file handles, database connections, network sockets, OS handles — that the GC cannot clean up on its own. The disposal pattern gives you deterministic control over when these resources are released.

## IDisposable Basics

The `IDisposable` interface has a single method: `Dispose()`. Types that hold unmanaged resources or expensive managed resources should implement it.

```csharp
public class FileProcessor : IDisposable
{
    private StreamReader _reader;

    public FileProcessor(string path)
    {
        _reader = new StreamReader(path);
    }

    public string? ReadNextLine() => _reader.ReadLine();

    public void Dispose()
    {
        _reader?.Dispose();
    }
}
```

## The using Statement

The `using` statement guarantees `Dispose()` is called, even if an exception is thrown. It compiles to a `try/finally` block.

```csharp
// Classic using block
using (var processor = new FileProcessor("data.txt"))
{
    string? line;
    while ((line = processor.ReadNextLine()) is not null)
        Console.WriteLine(line);
} // Dispose() called here, even if an exception occurred

// C# 8.0 using declaration — disposes at end of enclosing scope
void ProcessFile()
{
    using var processor = new FileProcessor("data.txt");

    string? line;
    while ((line = processor.ReadNextLine()) is not null)
        Console.WriteLine(line);
} // Dispose() called here when the method returns
```

> **Tip:** Prefer `using` declarations (without braces) in modern C#. They reduce nesting and the resource is disposed when the enclosing scope ends.

## The Full Dispose Pattern

When your class directly holds unmanaged resources (not just other `IDisposable` objects), you need the full dispose pattern with a finalizer as a safety net.

```csharp
public class UnmanagedResourceHolder : IDisposable
{
    private IntPtr _handle;          // unmanaged resource
    private StreamWriter _writer;    // managed disposable resource
    private bool _disposed = false;

    public UnmanagedResourceHolder(string path)
    {
        _handle = NativeApi.OpenResource();
        _writer = new StreamWriter(path);
    }

    // Public Dispose — called by consumers
    public void Dispose()
    {
        Dispose(disposing: true);
        GC.SuppressFinalize(this);  // prevent finalizer from running
    }

    // Protected virtual — allows derived classes to extend cleanup
    protected virtual void Dispose(bool disposing)
    {
        if (_disposed) return;

        if (disposing)
        {
            // Free managed resources
            _writer?.Dispose();
        }

        // Free unmanaged resources (always, regardless of disposing flag)
        if (_handle != IntPtr.Zero)
        {
            NativeApi.CloseResource(_handle);
            _handle = IntPtr.Zero;
        }

        _disposed = true;
    }

    // Finalizer — safety net if Dispose() was never called
    ~UnmanagedResourceHolder()
    {
        Dispose(disposing: false);
    }

    private void ThrowIfDisposed()
    {
        if (_disposed)
            throw new ObjectDisposedException(nameof(UnmanagedResourceHolder));
    }
}
```

> **Important:** The `disposing` parameter distinguishes between deterministic disposal (`true` — safe to touch managed objects) and finalizer cleanup (`false` — managed objects may already be finalized, so only clean up unmanaged resources).

### When to Use the Full Pattern vs. the Simple Pattern

| Scenario | Pattern |
|---|---|
| Your class only wraps other `IDisposable` objects | Simple: just implement `Dispose()` and call inner `Dispose()` |
| Your class directly holds unmanaged resources (`IntPtr`, handles) | Full pattern with finalizer |
| Your class is sealed and wraps disposables | Simple pattern (no need for `virtual`) |
| Your class is unsealed and might be inherited | Full pattern with `protected virtual Dispose(bool)` |

## SafeHandle: The Modern Approach

Instead of writing finalizers yourself, prefer wrapping unmanaged resources in a `SafeHandle` subclass. The framework handles finalization for you.

```csharp
using Microsoft.Win32.SafeHandles;

public class SafeFileWrapper : IDisposable
{
    private readonly SafeFileHandle _handle;
    private bool _disposed;

    public SafeFileWrapper(string path)
    {
        var stream = new FileStream(path, FileMode.OpenOrCreate);
        _handle = stream.SafeFileHandle;
    }

    public void Dispose()
    {
        if (_disposed) return;

        _handle?.Dispose(); // SafeHandle manages its own finalization
        _disposed = true;
    }
}
```

> **Note:** `SafeHandle` inherits from `CriticalFinalizerObject`, which guarantees finalization even in extreme scenarios. Prefer it over raw `IntPtr` whenever possible.

## IAsyncDisposable

For resources that require async cleanup (e.g., flushing async streams, closing network connections gracefully), implement `IAsyncDisposable`.

```csharp
public class AsyncConnectionWrapper : IAsyncDisposable, IDisposable
{
    private DbConnection _connection;
    private bool _disposed;

    public AsyncConnectionWrapper(string connectionString)
    {
        _connection = new SqlConnection(connectionString);
    }

    public async Task OpenAsync()
    {
        await _connection.OpenAsync();
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;

        if (_connection is not null)
        {
            await _connection.CloseAsync();
            await _connection.DisposeAsync();
        }

        _disposed = true;
        GC.SuppressFinalize(this);
    }

    public void Dispose()
    {
        if (_disposed) return;

        _connection?.Dispose();
        _disposed = true;
        GC.SuppressFinalize(this);
    }
}

// Usage with await using
await using var conn = new AsyncConnectionWrapper(connString);
await conn.OpenAsync();
```

## Common Mistakes

### Mistake 1: Not Disposing Database Connections

```csharp
// BAD: Connection never disposed — connection pool exhaustion
public List<User> GetUsers()
{
    var conn = new SqlConnection(connectionString);
    conn.Open();
    var cmd = new SqlCommand("SELECT * FROM Users", conn);
    var reader = cmd.ExecuteReader();

    var users = new List<User>();
    while (reader.Read())
        users.Add(MapUser(reader));

    return users; // conn is never closed!
}

// GOOD: using ensures cleanup
public List<User> GetUsers()
{
    using var conn = new SqlConnection(connectionString);
    conn.Open();

    using var cmd = new SqlCommand("SELECT * FROM Users", conn);
    using var reader = cmd.ExecuteReader();

    var users = new List<User>();
    while (reader.Read())
        users.Add(MapUser(reader));

    return users;
} // reader, cmd, and conn all disposed here
```

### Mistake 2: Not Disposing HttpClient per-request

```csharp
// BAD: Creating and disposing HttpClient per request causes socket exhaustion
public async Task<string> FetchDataBad(string url)
{
    using var client = new HttpClient();          // don't do this!
    return await client.GetStringAsync(url);
}

// GOOD: Use IHttpClientFactory or a shared static instance
private static readonly HttpClient _client = new();

public async Task<string> FetchDataGood(string url)
{
    return await _client.GetStringAsync(url);
}
```

> **Warning:** `HttpClient` is an exception to the typical disposal pattern. Disposing it per request does not immediately release the underlying socket, causing port exhaustion under load. Use `IHttpClientFactory` or a single shared instance.

### Mistake 3: Forgetting to Dispose in Exception Paths

```csharp
// BAD: If Open() succeeds but Execute() throws, connection leaks
public void Execute()
{
    var conn = new SqlConnection(connectionString);
    conn.Open();
    RunQuery(conn);     // if this throws, conn is never closed
    conn.Dispose();
}

// GOOD: using handles all paths
public void Execute()
{
    using var conn = new SqlConnection(connectionString);
    conn.Open();
    RunQuery(conn); // if this throws, conn is still disposed
}
```

## Implementing a Custom Resource Manager

Here is a realistic example of a class that manages a temporary directory and cleans it up on disposal.

```csharp
public sealed class TempDirectoryScope : IDisposable
{
    public string Path { get; }
    private bool _disposed;

    public TempDirectoryScope(string? prefix = null)
    {
        string name = prefix ?? "tmp";
        Path = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(),
            $"{name}_{Guid.NewGuid():N}");

        Directory.CreateDirectory(Path);
    }

    public string GetFilePath(string fileName)
    {
        ThrowIfDisposed();
        return System.IO.Path.Combine(Path, fileName);
    }

    public StreamWriter CreateFile(string fileName)
    {
        ThrowIfDisposed();
        return new StreamWriter(GetFilePath(fileName));
    }

    public void Dispose()
    {
        if (_disposed) return;

        try
        {
            if (Directory.Exists(Path))
                Directory.Delete(Path, recursive: true);
        }
        catch (IOException)
        {
            // Best-effort cleanup. Log in production code.
        }

        _disposed = true;
    }

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
    }
}

// Usage
using (var scope = new TempDirectoryScope("build"))
{
    using var writer = scope.CreateFile("output.txt");
    writer.WriteLine("Temporary data...");
} // directory and all files deleted here
```

## Implementing a Connection Pool Wrapper

```csharp
public sealed class PooledConnection : IAsyncDisposable
{
    private readonly ConnectionPool _pool;
    private DbConnection? _inner;

    internal PooledConnection(ConnectionPool pool, DbConnection inner)
    {
        _pool = pool;
        _inner = inner;
    }

    public DbConnection Connection => _inner
        ?? throw new ObjectDisposedException(nameof(PooledConnection));

    public async ValueTask DisposeAsync()
    {
        if (_inner is not null)
        {
            await _pool.ReturnAsync(_inner);  // return to pool instead of closing
            _inner = null;
        }
    }
}

// Usage
await using var pooled = await pool.RentAsync();
var cmd = pooled.Connection.CreateCommand();
cmd.CommandText = "SELECT 1";
await cmd.ExecuteScalarAsync();
// Connection returned to pool, not closed
```

## Disposal Checklist

> **Caution:** Before shipping code that manages resources, verify these points:

1. Every `IDisposable` local variable is wrapped in a `using` statement.
2. Classes that own disposable fields implement `IDisposable` themselves.
3. Unsealed classes use the `protected virtual Dispose(bool)` pattern.
4. Finalizers only clean up unmanaged resources and never touch managed objects.
5. `GC.SuppressFinalize(this)` is called in `Dispose()` when a finalizer exists.
6. `ObjectDisposedException` is thrown from methods called after disposal.
7. Async resources use `IAsyncDisposable` and `await using`.

## Key Takeaways

1. `IDisposable` provides deterministic cleanup of unmanaged and expensive managed resources.
2. The `using` statement/declaration ensures `Dispose()` is always called.
3. Use the full dispose pattern (with finalizer) only when directly holding unmanaged resources.
4. Prefer `SafeHandle` over raw `IntPtr` for unmanaged handles.
5. `IAsyncDisposable` handles cleanup that involves async I/O.
6. Always dispose database connections, file streams, and HTTP responses promptly.
