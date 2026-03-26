# Nullable Reference Types

*Eliminating null reference exceptions*

The `NullReferenceException` is one of the most common runtime errors. C# 8+ introduced nullable reference types to catch potential null issues at compile time.

## Enabling Nullable Context

```xml
<!-- In .csproj file -->
<PropertyGroup>
    <Nullable>enable</Nullable>
</PropertyGroup>
```

```csharp
// With nullable enabled:
string name = "Alice";     // Non-nullable - compiler guarantees not null
string? nickname = null;    // Nullable - explicitly allowed to be null

name = null;    // WARNING: Cannot assign null to non-nullable
```

## Null Operators

C# provides several operators for working with null values:

```csharp
string? name = GetName(); // Might return null

// Null-conditional operator (?.)
int? length = name?.Length;           // null if name is null
char? first = name?[0];              // null if name is null
string? upper = name?.ToUpper();     // null if name is null

// Null-coalescing operator (??)
string display = name ?? "Unknown";   // "Unknown" if name is null

// Null-coalescing assignment (??=)
name ??= "Default";  // Assign only if name is null

// Null-forgiving operator (!)
string definitelyNotNull = name!;  // "Trust me, this isn't null"
```

> **Warning:** The null-forgiving operator (`!`) suppresses the compiler warning but does NOT prevent a `NullReferenceException` at runtime. Use it sparingly and only when you know something the compiler doesn't.

## Null Checking Patterns

```csharp
// Traditional null check
if (name != null)
{
    Console.WriteLine(name.Length); // Safe - compiler knows it's not null
}

// Pattern matching (preferred)
if (name is not null)
{
    Console.WriteLine(name.Length);
}

// is pattern with variable
if (name is string validName)
{
    Console.WriteLine(validName.Length);
}

// Guard clause in methods
public void Process(string? input)
{
    ArgumentNullException.ThrowIfNull(input);
    // After this line, compiler knows input is not null
    Console.WriteLine(input.Length);
}
```

## Required Members (C# 11+)

```csharp
public class User
{
    public required string Name { get; init; }
    public required string Email { get; init; }
    public string? Phone { get; init; }  // Optional

    // SetsRequiredMembers attribute for constructor
    [SetsRequiredMembers]
    public User(string name, string email)
    {
        Name = name;
        Email = email;
    }

    public User() { }
}

// Must set required properties
var user = new User { Name = "Alice", Email = "alice@example.com" };
// var bad = new User { Name = "Bob" }; // ERROR: Email is required
```

## Nullable Value Types

```csharp
int? nullableInt = null;
double? nullableDouble = 3.14;

// HasValue and Value
if (nullableInt.HasValue)
    Console.WriteLine(nullableInt.Value);

// GetValueOrDefault
int withDefault = nullableInt.GetValueOrDefault(0);

// Pattern matching
if (nullableInt is int value)
    Console.WriteLine($"Has value: {value}");
```

## Design Patterns for Null Safety

```csharp
// Option/Maybe pattern
public readonly struct Option<T> where T : class
{
    private readonly T? _value;
    public bool HasValue => _value is not null;
    public T Value => _value ?? throw new InvalidOperationException("No value");

    private Option(T? value) => _value = value;

    public static Option<T> Some(T value) => new(value);
    public static Option<T> None => new(null);

    public Option<TResult> Map<TResult>(Func<T, TResult> mapper)
        where TResult : class
        => HasValue ? Option<TResult>.Some(mapper(_value!)) : Option<TResult>.None;

    public T GetValueOrDefault(T fallback) => _value ?? fallback;
}

// Usage
Option<User> FindUser(string email)
{
    var user = _db.Users.FirstOrDefault(u => u.Email == email);
    return user is not null ? Option<User>.Some(user) : Option<User>.None;
}

var result = FindUser("alice@example.com");
var name = result.Map(u => u.Name).GetValueOrDefault("Unknown");
```

> **Important:** Enable nullable reference types in all new projects. It catches a huge class of bugs at compile time and makes your API contracts clearer about what can and cannot be null.

> **Tip:** When migrating an existing project, enable nullable incrementally using `#nullable enable` at the top of individual files rather than project-wide.
