# What's New in C# 11

C# 11, released with .NET 7 in November 2022, delivered powerful features for math-heavy code, string handling, and type safety. This release made generic math practical and introduced raw string literals, both of which fundamentally changed how C# code is written.

---

## Required Members

The `required` modifier forces callers to set a property during initialization, combining the flexibility of object initializers with the safety of constructor parameters.

```csharp
// C# 10 — constructor enforces required data, but loses initializer flexibility
public class Employee
{
    public Employee(string name, string department)
    {
        Name = name;
        Department = department;
    }

    public string Name { get; set; }
    public string Department { get; set; }
    public string? Title { get; set; }
}

// C# 11 — required members
public class Employee
{
    public required string Name { get; init; }
    public required string Department { get; init; }
    public string? Title { get; init; } // optional
}

var emp = new Employee
{
    Name = "Alice",
    Department = "Engineering"
    // Title is optional — no error
};

// var bad = new Employee { Name = "Bob" };
// ERROR: 'Department' is required
```

> **Tip:** You can use `[SetsRequiredMembers]` on a constructor to indicate that it satisfies all required members, exempting callers from setting them via initializers.

```csharp
public class Employee
{
    [SetsRequiredMembers]
    public Employee(string name, string department)
    {
        Name = name;
        Department = department;
    }

    public required string Name { get; init; }
    public required string Department { get; init; }
}
```

---

## Raw String Literals

Triple-quoted strings eliminate escaping nightmares for JSON, XML, regex, and other embedded content.

```csharp
// C# 10 — escaping quotes and formatting is painful
string json = "{\n  \"name\": \"Alice\",\n  \"age\": 30\n}";

// C# 11 — raw string literals
string json = """
    {
        "name": "Alice",
        "age": 30
    }
    """;
```

The indentation of the closing `"""` determines the baseline — everything to its left is trimmed.

### Raw Interpolated Strings

Use repeated `$` signs to control how braces are interpreted:

```csharp
string name = "Alice";
int age = 30;

// Single $ — use {{ }} for literal braces
string json = $$"""
    {
        "name": "{{name}}",
        "age": {{age}}
    }
    """;
```

> **Important:** The number of `$` symbols determines how many braces start an interpolation hole. `$$` means `{{ }}` is an interpolation, and a single `{` is a literal brace.

---

## Generic Math (`INumber<T>` and Static Abstract Interface Members)

C# 11 introduced static abstract and static virtual members in interfaces, enabling generic math operations.

```csharp
// Before C# 11 — separate methods for each numeric type
int SumInts(int[] values)
{
    int total = 0;
    foreach (var v in values) total += v;
    return total;
}

double SumDoubles(double[] values)
{
    double total = 0;
    foreach (var v in values) total += v;
    return total;
}

// C# 11 — one generic method for all number types
T Sum<T>(IEnumerable<T> values) where T : INumber<T>
{
    T total = T.Zero;
    foreach (var v in values)
        total += v;
    return total;
}

// Works with any numeric type
int intSum = Sum(new[] { 1, 2, 3, 4, 5 });           // 15
double dblSum = Sum(new[] { 1.5, 2.5, 3.0 });        // 7.0
decimal decSum = Sum(new[] { 10.0m, 20.0m, 30.0m }); // 60.0
```

### Defining Your Own Static Abstract Members

```csharp
public interface IFactory<TSelf> where TSelf : IFactory<TSelf>
{
    static abstract TSelf Create();
    static virtual string Description => "Default";
}

public class Widget : IFactory<Widget>
{
    public static Widget Create() => new Widget();
    public static string Description => "A widget";
}
```

| Interface | Purpose |
|---|---|
| `INumber<T>` | All numeric operations |
| `IAdditionOperators<T,T,T>` | `+` operator |
| `IMultiplyOperators<T,T,T>` | `*` operator |
| `IComparisonOperators<T,T,bool>` | `<`, `>`, `<=`, `>=` |
| `IParsable<T>` | `Parse` and `TryParse` |
| `IMinMaxValue<T>` | `MinValue` and `MaxValue` |

---

## UTF-8 String Literals

The `u8` suffix creates `ReadOnlySpan<byte>` UTF-8 data at compile time, avoiding runtime encoding.

```csharp
// C# 10 — runtime encoding
byte[] data = Encoding.UTF8.GetBytes("Hello, World!");

// C# 11 — compile-time UTF-8 literal
ReadOnlySpan<byte> data = "Hello, World!"u8;
```

> **Tip:** UTF-8 literals are ideal for HTTP headers, protocol constants, and any scenario where you send bytes over the wire. They avoid allocations and encoding overhead.

---

## List Patterns

Match arrays, lists, and any type with an indexer and `Length`/`Count` against structural patterns.

```csharp
int[] numbers = { 1, 2, 3, 4, 5 };

// Exact match
bool isOneTwoThree = numbers is [1, 2, 3];  // false (has 5 elements)

// Discard and range patterns
bool startsWithOne = numbers is [1, ..];     // true
bool endsWithFive  = numbers is [.., 5];     // true

// Capture the middle with a slice pattern
if (numbers is [var first, .. var middle, var last])
{
    Console.WriteLine(first);              // 1
    Console.WriteLine(string.Join(",", middle)); // 2,3,4
    Console.WriteLine(last);               // 5
}

// Practical: validate command-line args
string[] args = { "push", "--force", "main" };

var message = args switch
{
    ["push", "--force", var branch] => $"Force pushing to {branch}",
    ["push", var branch]           => $"Pushing to {branch}",
    ["pull", ..]                   => "Pulling changes",
    [var cmd, ..]                  => $"Unknown command: {cmd}",
    []                             => "No arguments provided"
};
```

---

## File-Local Types

The `file` access modifier restricts a type to the file in which it is declared.

```csharp
// Validators.cs
file class EmailValidator
{
    public static bool IsValid(string email) =>
        email.Contains('@') && email.Contains('.');
}

public class RegistrationService
{
    public bool Register(string email)
    {
        if (!EmailValidator.IsValid(email))
            return false;

        // ... registration logic
        return true;
    }
}

// EmailValidator is invisible outside Validators.cs
```

> **Note:** File-local types are especially useful for source generators, which may produce helper types that should not leak into the public API.

---

## Newlines in Interpolation Expressions

Interpolation holes can now span multiple lines, which helps with complex expressions.

```csharp
string report = $"Status: {
    users.Count switch
    {
        0     => "No users",
        1     => "One user",
        var n => $"{n} users"
    }
}";
```

---

## Pattern Match `Span<char>` on String Constants

You can now pattern match a `Span<char>` or `ReadOnlySpan<char>` against constant strings.

```csharp
ReadOnlySpan<char> command = "GET".AsSpan();

string method = command switch
{
    "GET"    => "Retrieve",
    "POST"   => "Create",
    "PUT"    => "Update",
    "DELETE" => "Remove",
    _        => "Unknown"
};
```

> **Tip:** This avoids allocating a `string` from the span just for comparison. It is a significant performance win in parsers and protocol handlers.

---

## Ref Fields and `scoped ref`

Ref structs can now contain `ref` fields, enabling low-level data structures that reference other memory.

```csharp
public ref struct RefArray<T>
{
    private ref T _reference;
    private int _length;

    public RefArray(ref T reference, int length)
    {
        _reference = ref reference;
        _length = length;
    }

    public ref T this[int index]
    {
        get
        {
            if ((uint)index >= (uint)_length)
                throw new IndexOutOfRangeException();
            return ref Unsafe.Add(ref _reference, index);
        }
    }
}
```

The `scoped` keyword restricts the lifetime of a `ref` or `ref struct` to the current method, preventing it from escaping.

```csharp
void Process(scoped ref int value)
{
    // 'value' cannot escape this method
    // Cannot assign to a field or return it
}
```

> **Warning:** Ref fields and `scoped` are advanced features primarily used by library authors building high-performance abstractions. Most application code does not need them directly.

---

## Unsigned Right-Shift Operator (`>>>`)

A new operator that always shifts in zero bits from the left, regardless of the sign of the operand.

```csharp
int negative = -16;

Console.WriteLine(negative >> 2);   // -4  (sign-preserving, arithmetic shift)
Console.WriteLine(negative >>> 2);  // 1073741820 (zero-fill, logical shift)
```

| Operator | Name | High bits filled with |
|---|---|---|
| `>>` | Arithmetic right shift | Sign bit (0 or 1) |
| `>>>` | Unsigned (logical) right shift | Always 0 |

---

## Summary

| Feature | Key Benefit |
|---|---|
| Required members | Compile-time enforcement of initialization |
| Raw string literals | Readable embedded JSON, XML, and regex |
| Generic math | One algorithm for all numeric types |
| UTF-8 string literals | Zero-allocation byte sequences |
| List patterns | Structural matching on sequences |
| File-local types | Encapsulation at the file level |
| Ref fields / scoped | High-performance low-level data structures |
| `>>>` operator | Correct logical right-shift for signed types |

> **Tip:** C# 11 pairs with .NET 7. Target `net7.0` or set `<LangVersion>11.0</LangVersion>`.
