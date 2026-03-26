# What's New in C# 9

C# 9, released with .NET 5 in November 2020, introduced several features aimed at reducing boilerplate, enabling immutable data modeling, and simplifying program structure. This lesson covers every major addition with before/after comparisons.

---

## Records

Records are reference types that provide built-in value-based equality, immutability semantics, and concise syntax for data-centric types.

### Positional Records

```csharp
// C# 8 — verbose class for a simple data type
public class PersonOld
{
    public string FirstName { get; }
    public string LastName { get; }

    public PersonOld(string firstName, string lastName)
    {
        FirstName = firstName;
        LastName = lastName;
    }

    public override bool Equals(object? obj) =>
        obj is PersonOld other &&
        FirstName == other.FirstName &&
        LastName == other.LastName;

    public override int GetHashCode() =>
        HashCode.Combine(FirstName, LastName);

    public override string ToString() =>
        $"PersonOld {{ FirstName = {FirstName}, LastName = {LastName} }}";
}

// C# 9 — one line replaces all of the above
public record Person(string FirstName, string LastName);
```

> **Tip:** Positional records automatically generate a constructor, `Deconstruct` method, `Equals`, `GetHashCode`, `ToString`, and the `==` / `!=` operators.

### Value-Based Equality

```csharp
var a = new Person("Ada", "Lovelace");
var b = new Person("Ada", "Lovelace");

Console.WriteLine(a == b);          // True  (value equality)
Console.WriteLine(ReferenceEquals(a, b)); // False (different instances)
```

### With-Expressions (Non-Destructive Mutation)

```csharp
var original = new Person("Grace", "Hopper");
var modified = original with { LastName = "Murray" };

Console.WriteLine(original); // Person { FirstName = Grace, LastName = Hopper }
Console.WriteLine(modified); // Person { FirstName = Grace, LastName = Murray }
```

> **Note:** `with` creates a shallow copy. The original instance is unchanged, which makes records ideal for immutable data pipelines.

---

## Init-Only Setters

Init-only setters allow properties to be set during object initialization but become immutable afterward.

```csharp
// C# 8 — must choose between mutable set or constructor-only
public class ConfigOld
{
    public string ConnectionString { get; set; } // mutable forever
}

// C# 9 — init allows setting only at construction time
public class Config
{
    public string ConnectionString { get; init; }
    public int MaxRetries { get; init; } = 3;
}

var config = new Config
{
    ConnectionString = "Server=localhost;Database=app",
    MaxRetries = 5
};

// config.MaxRetries = 10; // ERROR: init-only property
```

> **Important:** Init-only setters work with object initializers, constructor calls, and `with`-expressions on records. They do **not** work with later assignment.

---

## Top-Level Statements

C# 9 lets you omit the `Main` method boilerplate for simple programs.

```csharp
// C# 8 — the ceremony
using System;

namespace HelloWorld
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello, World!");
        }
    }
}

// C# 9 — just the code
Console.WriteLine("Hello, World!");
```

| Aspect | Before (C# 8) | After (C# 9) |
|---|---|---|
| Lines of code | 11 | 1 |
| Namespace required | Yes | No |
| Class required | Yes | No |
| `Main` method required | Yes | No |

> **Caution:** Only one file per project can use top-level statements. The compiler generates the `Main` method behind the scenes.

---

## Pattern Matching Enhancements

C# 9 added relational, logical, and improved type patterns, making conditional logic far more expressive.

### Relational Patterns

```csharp
// C# 8 — chained if/else
string GetTemperatureCategory(double tempC)
{
    if (tempC < 0) return "Freezing";
    else if (tempC < 20) return "Cold";
    else if (tempC < 30) return "Comfortable";
    else return "Hot";
}

// C# 9 — relational patterns in switch
string GetTemperatureCategory(double tempC) => tempC switch
{
    < 0   => "Freezing",
    < 20  => "Cold",
    < 30  => "Comfortable",
    >= 30 => "Hot"
};
```

### Logical Patterns (`and`, `or`, `not`)

```csharp
// Validate a character is a lowercase ASCII letter
bool IsLowerAscii(char c) => c is >= 'a' and <= 'z';

// Check for non-null non-empty string
bool HasContent(string? s) => s is not null and not "";

// HTTP status category
string Categorize(int status) => status switch
{
    >= 200 and < 300 => "Success",
    >= 300 and < 400 => "Redirection",
    >= 400 and < 500 => "Client Error",
    >= 500            => "Server Error",
    _                 => "Unknown"
};
```

### Type Patterns (Simplified)

```csharp
// C# 8 — required a discard variable
if (obj is string _) { }

// C# 9 — discard no longer needed
if (obj is string) { }
```

> **Tip:** Combine relational and logical patterns to replace complex `if` chains with a single readable switch expression.

---

## Target-Typed `new` Expressions

When the type is known from context, you can omit it from the `new` expression.

```csharp
// C# 8
Dictionary<string, List<int>> lookup = new Dictionary<string, List<int>>();

// C# 9
Dictionary<string, List<int>> lookup = new();

// Works in field declarations
private readonly ConcurrentQueue<WorkItem> _queue = new();

// Works in method arguments
void Process(List<Order> orders) { }
Process(new() { firstOrder, secondOrder });
```

| Context | Before | After |
|---|---|---|
| Variable declaration | `new List<int>()` | `new()` |
| Field initialization | `new SemaphoreSlim(1, 1)` | `new(1, 1)` |
| Return statement | `return new Point(x, y)` | `return new(x, y)` |

---

## Covariant Returns

Derived classes can now override methods and return a more specific type.

```csharp
public class Animal
{
    public virtual Animal Clone() => new Animal();
}

public class Cat : Animal
{
    // C# 8: must return Animal, then cast at call site
    // C# 9: can return Cat directly
    public override Cat Clone() => new Cat();
}

Cat original = new Cat();
Cat copy = original.Clone(); // no cast needed
```

> **Note:** This works only for reference-type return types. The override must return the same type or a derived type.

---

## Static Anonymous Functions

The `static` modifier on lambdas and anonymous methods prevents accidental closure over local variables, avoiding heap allocations.

```csharp
int multiplier = 10;

// Non-static: captures 'multiplier' — allocates a closure
Func<int, int> withCapture = x => x * multiplier;

// Static: compiler error if you reference 'multiplier'
Func<int, int> noCapture = static x => x * 2;

// Useful for performance-sensitive delegates
list.Sort(static (a, b) => a.Name.CompareTo(b.Name));
```

> **Warning:** If you accidentally capture a variable in a hot loop, the closure allocation can cause GC pressure. Marking the lambda `static` turns that runtime problem into a compile-time error.

---

## Function Pointers

Function pointers provide a low-level, allocation-free way to reference methods, primarily for interop and high-performance scenarios.

```csharp
// Declare a function pointer type (managed calling convention)
unsafe
{
    delegate*<int, int, int> add = &Add;
    int result = add(3, 4); // 7
}

static int Add(int a, int b) => a + b;

// With unmanaged calling convention for P/Invoke
// delegate* unmanaged<int, int, int> nativeAdd = ...;
```

| Feature | `Func<T>` Delegate | `delegate*` Function Pointer |
|---|---|---|
| Allocation | Heap (closure object) | None |
| Calling convention | Managed only | Managed or unmanaged |
| Typical use | Application code | Interop, perf-critical code |
| Requires `unsafe` | No | Yes |

> **Caution:** Function pointers require `unsafe` context and the `AllowUnsafeBlocks` project setting. Use them only when delegate overhead is measurable.

---

## Summary

| Feature | Primary Benefit |
|---|---|
| Records | Immutable data types with value equality in one line |
| Init-only setters | Immutability without constructor-only initialization |
| Top-level statements | Minimal ceremony for scripts and small programs |
| Pattern matching enhancements | Expressive conditional logic with `and`, `or`, `not` |
| Target-typed `new` | Less redundancy in declarations |
| Covariant returns | Type-safe overrides without casting |
| Static anonymous functions | Prevent accidental closures and allocations |
| Function pointers | Zero-allocation method references for interop |

> **Tip:** C# 9 pairs with .NET 5. To use these features, set `<LangVersion>9.0</LangVersion>` in your `.csproj` or target `net5.0` or later.
