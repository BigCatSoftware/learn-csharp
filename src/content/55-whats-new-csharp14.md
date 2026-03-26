# What's New in C# 14

C# 14, released with .NET 10 in 2025, introduced the most significant change to the extension method system since C# 3.0. Extension blocks replace the old static-class-based extension method pattern with a first-class language construct, and the release includes several other refinements to properties, generics, and null handling.

---

## Extension Members (Extension Blocks)

The flagship feature of C# 14 replaces the awkward `static class` convention for extension methods with dedicated `extension` blocks. Extensions can now include methods, properties, indexers, and operators.

### Before: Old Extension Methods (C# 3 through C# 13)

```csharp
// The old way — static class with static methods and 'this' parameter
public static class StringExtensions
{
    public static bool IsNullOrWhiteSpace(this string? s) =>
        string.IsNullOrWhiteSpace(s);

    public static string Truncate(this string s, int maxLength) =>
        s.Length <= maxLength ? s : s[..maxLength] + "...";

    public static int WordCount(this string s) =>
        s.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
}
```

### After: Extension Blocks (C# 14)

```csharp
// The new way — extension block with natural syntax
public extension StringExtensions for string
{
    public bool IsNullOrWhiteSpace => string.IsNullOrWhiteSpace(this);

    public string Truncate(int maxLength) =>
        this.Length <= maxLength ? this : this[..maxLength] + "...";

    public int WordCount =>
        this.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
}

// Usage is identical
string name = "Hello, World!";
Console.WriteLine(name.WordCount);       // 2
Console.WriteLine(name.Truncate(5));     // "Hello..."
Console.WriteLine(name.IsNullOrWhiteSpace); // false
```

> **Important:** Inside an extension block, `this` refers to the instance being extended. There is no `this` parameter — you write instance-style code directly.

### Extension Properties

Previously impossible, extension properties are now a reality.

```csharp
public extension NumericExtensions for int
{
    public bool IsEven => this % 2 == 0;
    public bool IsPositive => this > 0;
    public int Squared => this * this;
    public string Ordinal => this switch
    {
        _ when this % 100 is 11 or 12 or 13 => $"{this}th",
        _ when this % 10 is 1 => $"{this}st",
        _ when this % 10 is 2 => $"{this}nd",
        _ when this % 10 is 3 => $"{this}rd",
        _ => $"{this}th"
    };
}

Console.WriteLine(42.IsEven);     // True
Console.WriteLine(7.Squared);     // 49
Console.WriteLine(3.Ordinal);     // "3rd"
Console.WriteLine(11.Ordinal);    // "11th"
```

### Generic Extension Blocks

```csharp
public extension EnumerableExtensions<T> for IEnumerable<T>
{
    public bool IsEmpty => !this.Any();

    public IEnumerable<T> WhereNotNull() where T : class =>
        this.Where(item => item is not null)!;

    public string JoinWith(string separator) =>
        string.Join(separator, this);
}

var names = new List<string?> { "Alice", null, "Bob", null, "Charlie" };
Console.WriteLine(names.IsEmpty);                          // False
Console.WriteLine(names.WhereNotNull().JoinWith(", "));    // Alice, Bob, Charlie
```

### Extension Blocks for Interfaces

```csharp
public extension DisposableExtensions for IDisposable
{
    public void DisposeAndLog(ILogger logger)
    {
        logger.LogDebug("Disposing {Type}", this.GetType().Name);
        this.Dispose();
    }
}
```

> **Tip:** Extension blocks can contain multiple members for the same type. Group related extensions together in a single block instead of scattering static methods across utility classes.

### Migration Guide

| Aspect | Old Syntax | New Syntax |
|---|---|---|
| Declaration | `public static class Ext` | `public extension Ext for T` |
| Method | `public static R Method(this T t, ...)` | `public R Method(...)` |
| Property | Not possible | `public R Prop => ...` |
| Indexer | Not possible | `public R this[int i] => ...` |
| Operator | Not possible (directly) | `public static R operator +(...)` |
| Reference to instance | `t` parameter | `this` keyword |
| Static members | Same class | Separate static extension |

> **Note:** Old-style extension methods continue to work. Migration is optional and can be done incrementally. The compiler resolves both styles using the same rules.

---

## Extension Operators

Extension blocks can now define operators for types you do not own.

```csharp
public extension VectorOperators for Vector2
{
    public static Vector2 operator *(Vector2 v, double scalar) =>
        new(v.X * scalar, v.Y * scalar);

    public static Vector2 operator *(double scalar, Vector2 v) =>
        v * scalar;
}

var velocity = new Vector2(3, 4);
var doubled = velocity * 2.0;        // (6, 8)
var tripled = 3.0 * velocity;        // (9, 12)
```

> **Warning:** Extension operators have lower priority than type-defined operators. If the type already defines an operator, the extension version will not be called.

---

## The `field` Keyword in Properties

The `field` keyword provides access to the compiler-generated backing field of an auto-property, eliminating the need for a manual backing field in many cases.

```csharp
// C# 13 — must declare a backing field for validation
public class Temperature
{
    private double _celsius;

    public double Celsius
    {
        get => _celsius;
        set
        {
            if (value < -273.15)
                throw new ArgumentOutOfRangeException(nameof(value));
            _celsius = value;
        }
    }
}

// C# 14 — field keyword replaces the manual backing field
public class Temperature
{
    public double Celsius
    {
        get;
        set
        {
            if (value < -273.15)
                throw new ArgumentOutOfRangeException(nameof(value));
            field = value;
        }
    }
}
```

### Lazy Initialization Pattern

```csharp
public class AppConfig
{
    public string ConnectionString
    {
        get => field ??= LoadFromEnvironment();
    }

    private static string LoadFromEnvironment() =>
        Environment.GetEnvironmentVariable("CONNECTION_STRING")
        ?? throw new InvalidOperationException("CONNECTION_STRING not set");
}
```

### Property Change Notification

```csharp
public class ObservableModel : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    public string Name
    {
        get;
        set
        {
            if (field != value)
            {
                field = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Name)));
            }
        }
    } = "";
}
```

> **Tip:** The `field` keyword turns many two-field-plus-property patterns into a single auto-property with custom logic. It is particularly useful for validation, change notification, and lazy initialization.

---

## Unbound Generic Types in `nameof`

The `nameof` operator now accepts open generic types without specifying type arguments.

```csharp
// C# 13 — must provide a type argument
string name1 = nameof(List<int>);    // "List"

// C# 14 — unbound generic type
string name2 = nameof(List<>);       // "List"
string name3 = nameof(Dictionary<,>); // "Dictionary"
```

```csharp
// Practical: logging and diagnostics
public class ServiceRegistry
{
    public void Register<TService, TImpl>() where TImpl : TService
    {
        Console.WriteLine($"Registered {nameof(TService)} -> {typeof(TImpl).Name}");
    }

    public void LogRegisteredTypes()
    {
        // Reference the open generic type in diagnostics
        Console.WriteLine($"Registry supports {nameof(IRepository<>)} pattern");
    }
}
```

---

## First-Class Span Support

C# 14 improves implicit conversions between `Span<T>`, `ReadOnlySpan<T>`, arrays, and strings, making span-based APIs easier to call.

```csharp
// Implicit conversions are now more natural
void Process(ReadOnlySpan<char> data) { }

string text = "Hello";
char[] chars = ['H', 'e', 'l', 'l', 'o'];

// All of these now work without explicit conversion
Process(text);              // string -> ReadOnlySpan<char>
Process(chars);             // char[] -> ReadOnlySpan<char>
Process("literal");         // string literal -> ReadOnlySpan<char>

// Overload resolution prefers Span-based overloads
void Write(ReadOnlySpan<byte> data) => Console.WriteLine("Span overload");
void Write(byte[] data) => Console.WriteLine("Array overload");

byte[] buffer = [1, 2, 3];
Write(buffer);  // Calls Span overload (preferred)
```

> **Note:** This improvement primarily affects overload resolution. The compiler now considers `ReadOnlySpan<T>` overloads as better matches when implicit conversions are available, encouraging stack-friendly patterns.

---

## Null-Conditional Assignment (`?.=`)

Assign to a property or field only if the receiver is not null, in a single expression.

```csharp
// C# 13 — null check then assign
if (customer is not null)
{
    customer.LastVisit = DateTime.UtcNow;
}

// or
customer?.SetLastVisit(DateTime.UtcNow);  // only if it was a method

// C# 14 — null-conditional assignment
customer?.LastVisit = DateTime.UtcNow;
customer?.Orders?.Clear();
```

```csharp
// Practical: optional configuration
public class AppBuilder
{
    private ILogger? _logger;
    private MetricsConfig? _metrics;

    public void Configure(Action<AppBuilder>? configure)
    {
        configure?.Invoke(this);

        // Set defaults only if the objects exist
        _logger?.MinLevel = LogLevel.Information;
        _metrics?.Enabled = true;
    }
}
```

> **Tip:** Null-conditional assignment works with any property, field, or indexer access that follows `?.`. The entire assignment is skipped if the left side evaluates to null at any point in the chain.

---

## Modular Imports

C# 14 improves how imports work within extension blocks and across modules, supporting finer-grained control over which extensions are in scope.

```csharp
// Import extensions from a specific extension block
using static MyLibrary.StringExtensions;

// Alias an extension block
using StrExt = MyLibrary.StringExtensions;
```

> **Note:** Modular imports help manage conflicts when multiple libraries define extensions on the same type. You can selectively import only the extension blocks you need.

---

## Comprehensive Example: Modern C# 14 Code

```csharp
using Coordinate = (double Lat, double Lon);

public extension CoordinateExtensions for Coordinate
{
    public double DistanceTo(Coordinate other)
    {
        // Haversine formula (simplified)
        var dLat = (other.Lat - this.Lat) * Math.PI / 180;
        var dLon = (other.Lon - this.Lon) * Math.PI / 180;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2);
        return 6371 * 2 * Math.Asin(Math.Sqrt(a)); // km (simplified)
    }

    public bool IsNorthernHemisphere => this.Lat > 0;
    public string Display => $"{this.Lat:F4}, {this.Lon:F4}";
}

public class TripPlanner(IRouteService routeService, ILogger<TripPlanner>? logger)
{
    public string Description
    {
        get;
        set
        {
            if (string.IsNullOrWhiteSpace(value))
                throw new ArgumentException("Description cannot be empty");
            field = value;
        }
    } = "Untitled Trip";

    public double Plan(params ReadOnlySpan<Coordinate> stops)
    {
        logger?.LogInformation("Planning trip: {Description}", Description);

        double total = 0;
        for (int i = 1; i < stops.Length; i++)
        {
            total += stops[i - 1].DistanceTo(stops[i]);
            logger?.MinLevel = LogLevel.Debug;  // null-conditional assignment
        }

        return total;
    }
}
```

---

## Summary

| Feature | Impact |
|---|---|
| Extension blocks | Replaces static extension class pattern with first-class syntax |
| Extension properties | Finally possible after 18 years of C# extensions |
| Extension operators | Define operators for types you do not own |
| `field` keyword | Eliminates manual backing fields for property validation/logic |
| Unbound generics in `nameof` | Cleaner diagnostic and metadata code |
| First-class Span support | Better overload resolution favoring stack-friendly APIs |
| Null-conditional assignment | One-line null-safe property/field assignment |
| Modular imports | Fine-grained control over extension visibility |

> **Tip:** C# 14 pairs with .NET 10. Target `net10.0` or set `<LangVersion>14.0</LangVersion>`. Extension blocks are the headline feature — start migrating your utility extension classes to the new syntax for cleaner, more capable code.
