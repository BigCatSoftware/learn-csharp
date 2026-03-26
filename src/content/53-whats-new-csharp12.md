# What's New in C# 12

C# 12, released with .NET 8 in November 2023, brought primary constructors to classes and structs, collection expressions, and several quality-of-life improvements. The theme of this release is reducing ceremony in everyday patterns.

---

## Primary Constructors for Classes and Structs

Primary constructors, previously available only on records, now work on any class or struct. Constructor parameters are available throughout the type body.

```csharp
// C# 11 — traditional constructor with field assignment
public class UserService
{
    private readonly ILogger<UserService> _logger;
    private readonly IUserRepository _repository;

    public UserService(ILogger<UserService> logger, IUserRepository repository)
    {
        _logger = logger;
        _repository = repository;
    }

    public async Task<User?> GetUser(int id)
    {
        _logger.LogInformation("Fetching user {Id}", id);
        return await _repository.FindByIdAsync(id);
    }
}

// C# 12 — primary constructor
public class UserService(ILogger<UserService> logger, IUserRepository repository)
{
    public async Task<User?> GetUser(int id)
    {
        logger.LogInformation("Fetching user {Id}", id);
        return await repository.FindByIdAsync(id);
    }
}
```

> **Warning:** Primary constructor parameters are **not** fields — they are captured as compiler-generated state. If you need a `readonly` field, assign the parameter to one explicitly:
> ```csharp
> public class Service(ILogger logger)
> {
>     private readonly ILogger _logger = logger; // now a proper readonly field
> }
> ```

### Primary Constructors on Structs

```csharp
public struct Distance(double meters)
{
    public double Meters => meters;
    public double Kilometers => meters / 1000.0;
    public double Miles => meters / 1609.344;
}

var d = new Distance(5000);
Console.WriteLine($"{d.Kilometers} km"); // 5 km
```

| Aspect | Record Primary Constructor | Class/Struct Primary Constructor |
|---|---|---|
| Auto-generates properties | Yes | No |
| Parameters are public | Yes (via properties) | No (private capture) |
| Value equality | Yes (records) | No |
| Deconstruct method | Yes | No |

---

## Collection Expressions

A unified syntax for creating arrays, lists, spans, and other collection types using `[...]` brackets.

```csharp
// C# 11 — different syntax for each collection type
int[] array = new int[] { 1, 2, 3 };
List<int> list = new List<int> { 1, 2, 3 };
Span<int> span = stackalloc int[] { 1, 2, 3 };
ImmutableArray<int> immutable = ImmutableArray.Create(1, 2, 3);

// C# 12 — unified collection expressions
int[] array = [1, 2, 3];
List<int> list = [1, 2, 3];
Span<int> span = [1, 2, 3];
ImmutableArray<int> immutable = [1, 2, 3];
```

### The Spread Operator (`..`)

Flatten collections into other collections:

```csharp
int[] first = [1, 2, 3];
int[] second = [4, 5, 6];

int[] combined = [..first, ..second];          // [1, 2, 3, 4, 5, 6]
int[] withExtra = [0, ..first, ..second, 7];   // [0, 1, 2, 3, 4, 5, 6, 7]

// Practical: building query parameters
List<string> baseParams = ["format=json", "v=2"];
List<string> authParams = [$"token={token}"];
List<string> allParams = [..baseParams, ..authParams, $"timestamp={DateTime.UtcNow:O}"];
```

### Empty Collections

```csharp
// Clean way to return empty collections
List<string> GetTags() => [];
int[] GetIds() => [];
```

> **Tip:** The compiler optimizes collection expressions. `int[] x = [];` reuses a cached empty array, and span-targeted expressions may use stack allocation.

---

## Inline Arrays

A way to create fixed-size, stack-allocated buffers without `unsafe` code.

```csharp
[InlineArray(8)]
public struct Buffer8<T>
{
    private T _element0;
}

// Usage — behaves like a fixed-size span
var buffer = new Buffer8<int>();
for (int i = 0; i < 8; i++)
    buffer[i] = i * 10;

// Can be sliced as a Span
Span<int> span = buffer;
Console.WriteLine(span[3]); // 30
```

> **Note:** Inline arrays are primarily used by runtime and library authors to avoid heap allocations for small, fixed-size buffers. The `[InlineArray(n)]` attribute tells the compiler to repeat the single field `n` times.

| Feature | `stackalloc` | Inline Array |
|---|---|---|
| Requires `unsafe` | Yes (or Span target) | No |
| Size | Runtime-determined | Compile-time fixed |
| Indexer/Span support | Via Span | Built-in |
| Usable in async methods | No | Yes |

---

## Optional Parameters in Lambda Expressions

Lambdas can now have default parameter values, just like regular methods.

```csharp
// C# 11 — lambdas could not have defaults
Func<string, int, string> repeat = (text, count) => string.Concat(Enumerable.Repeat(text, count));

// C# 12 — default values
var repeat = (string text, int count = 3) => string.Concat(Enumerable.Repeat(text, count));

Console.WriteLine(repeat("ha"));       // "hahaha"
Console.WriteLine(repeat("ha", 5));    // "hahahahaha"
```

### `params` in Lambdas

```csharp
var sum = (params int[] numbers) => numbers.Sum();

Console.WriteLine(sum(1, 2, 3));    // 6
Console.WriteLine(sum(10, 20));     // 30
```

> **Tip:** This feature is particularly useful with Minimal APIs, where route handlers are lambdas that benefit from optional parameters.

---

## Ref Readonly Parameters

A new way to pass values by reference without allowing modification, clarifying intent at the call site.

```csharp
// 'in' parameter — caller doesn't see the ref nature
void ProcessIn(in Guid id) { /* cannot modify id */ }

// 'ref readonly' parameter — caller must use 'ref' or 'in', making the ref explicit
void ProcessRefReadonly(ref readonly Guid id) { /* cannot modify id */ }

Guid orderId = Guid.NewGuid();

ProcessIn(orderId);                  // OK — 'in' is implicit
ProcessRefReadonly(ref orderId);     // OK — explicit ref
ProcessRefReadonly(in orderId);      // OK — explicit in
```

> **Important:** `ref readonly` differs from `in` in that it requires the caller to acknowledge the by-reference passing. This prevents accidental copies of large structs.

---

## Alias Any Type with `using`

Type aliases (previously limited to named types) now support tuples, arrays, pointers, and other types.

```csharp
// C# 11 — aliases only for named types
using StringList = System.Collections.Generic.List<string>;

// C# 12 — alias any type
using Point = (double X, double Y);
using Coordinate = (double Latitude, double Longitude);
using Matrix = double[,];
using Handler = System.Func<System.Threading.CancellationToken, System.Threading.Tasks.Task>;

// Usage
Point origin = (0.0, 0.0);
Coordinate london = (51.5074, -0.1278);

Handler shutdown = async (ct) =>
{
    await CleanupAsync(ct);
};
```

> **Tip:** This is excellent for domain modeling where tuples are used frequently. Instead of repeating `(string Name, int Age)` everywhere, alias it once.

---

## Default Lambda Parameters

Closely related to optional parameters, this feature lets you define defaults for lambda parameters that become part of the delegate's signature.

```csharp
var createGreeting = (string name, string greeting = "Hello") =>
    $"{greeting}, {name}!";

Console.WriteLine(createGreeting("Alice"));           // "Hello, Alice!"
Console.WriteLine(createGreeting("Bob", "Welcome"));  // "Welcome, Bob!"
```

---

## Interceptors (Experimental)

Interceptors allow a source generator to reroute a method call to a different implementation at compile time. They are marked experimental and require an opt-in flag.

```csharp
// In your .csproj:
// <Features>InterceptorsPreview</Features>

// Source generator output:
namespace GeneratedCode
{
    file static class Interceptors
    {
        [InterceptsLocation("Program.cs", line: 5, column: 9)]
        public static void InterceptedLog(this ILogger logger, string message)
        {
            // Optimized, AOT-friendly replacement
            Console.WriteLine($"[Intercepted] {message}");
        }
    }
}
```

> **Caution:** Interceptors are experimental and may change in future releases. They are primarily designed for source generators (like the logging and configuration generators in ASP.NET Core) to replace method calls with optimized versions. Do not use them in application code.

---

## Practical Example: Combining C# 12 Features

```csharp
using Coordinate = (double Lat, double Lon);

public class RouteCalculator(IDistanceService distanceService, ILogger<RouteCalculator> logger)
{
    public double CalculateTotalDistance(params Coordinate[] waypoints)
    {
        if (waypoints is [])
        {
            logger.LogWarning("No waypoints provided");
            return 0;
        }

        Coordinate[] pairs = [..waypoints];
        double total = 0;

        for (int i = 1; i < pairs.Length; i++)
        {
            total += distanceService.GetDistance(pairs[i - 1], pairs[i]);
        }

        logger.LogInformation("Route distance: {Distance:F2} km", total);
        return total;
    }
}
```

---

## Summary

| Feature | Boilerplate Removed |
|---|---|
| Primary constructors | Constructor + field declarations + assignments |
| Collection expressions | `new Type[] { }` / `new List<T> { }` ceremony |
| Spread operator (`..`) | Manual `AddRange` / `Concat` calls |
| Inline arrays | `unsafe` fixed buffers |
| Optional lambda params | Wrapper methods or null-checking in lambdas |
| `ref readonly` params | Ambiguity between `in` and `ref` |
| Type aliases for any type | Repeated complex tuple/delegate types |
| Interceptors | Runtime reflection (experimental) |

> **Tip:** C# 12 pairs with .NET 8 (LTS). Target `net8.0` or set `<LangVersion>12.0</LangVersion>`.
