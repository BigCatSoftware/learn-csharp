# What's New in C# 10

C# 10, shipped with .NET 6 in November 2021, focused on reducing boilerplate and improving everyday coding ergonomics. Almost every feature in this release removes redundant syntax you previously had to write by hand.

---

## Global Using Directives

Declare a `using` once and have it apply to every file in the project.

```csharp
// C# 9 — every file repeats common usings
using System;
using System.Collections.Generic;
using System.Linq;

namespace MyApp;

// C# 10 — declare once in a GlobalUsings.cs file
global using System;
global using System.Collections.Generic;
global using System.Linq;
global using System.Threading.Tasks;
```

> **Tip:** The .NET 6+ SDK also supports implicit global usings via `<ImplicitUsings>enable</ImplicitUsings>` in the `.csproj`, which auto-imports the most common namespaces for your project type.

| Approach | Where to declare | Scope |
|---|---|---|
| Regular `using` | Top of each file | That file only |
| `global using` | Any `.cs` file | Entire project |
| Implicit usings | `.csproj` property | Entire project (SDK-defined) |

---

## File-Scoped Namespaces

Remove one level of indentation from every type in the file.

```csharp
// C# 9 — block-scoped namespace
namespace MyApp.Services
{
    public class OrderService
    {
        public void PlaceOrder(Order order)
        {
            // ...
        }
    }
}

// C# 10 — file-scoped namespace
namespace MyApp.Services;

public class OrderService
{
    public void PlaceOrder(Order order)
    {
        // ...
    }
}
```

> **Important:** A file-scoped namespace applies to the entire file. You cannot have multiple namespaces in one file when using this syntax.

---

## Record Structs

C# 9 records were reference types. C# 10 adds `record struct` for value-type records with the same conveniences.

```csharp
// C# 9 — record is always a class (heap-allocated)
public record PersonRecord(string Name, int Age);

// C# 10 — record struct (stack-allocated, value semantics)
public record struct Point(double X, double Y);

// Also supports readonly record struct
public readonly record struct Color(byte R, byte G, byte B);
```

| Feature | `record class` | `record struct` | `readonly record struct` |
|---|---|---|---|
| Allocation | Heap | Stack | Stack |
| Mutable by default | No (init) | Yes (set) | No (readonly) |
| Value equality | Yes | Yes | Yes |
| `with`-expressions | Yes | Yes | Yes |

```csharp
var p1 = new Point(1.0, 2.0);
var p2 = p1 with { X = 5.0 };

Console.WriteLine(p1); // Point { X = 1, Y = 2 }
Console.WriteLine(p2); // Point { X = 5, Y = 2 }
Console.WriteLine(p1 == p2); // False
```

> **Note:** Regular `record struct` properties have `set` accessors (mutable). Use `readonly record struct` if you want immutability.

---

## Extended Property Patterns

Nested property patterns now support dot-separated access, removing extra braces.

```csharp
public record Address(string City, string Country);
public record Customer(string Name, Address Address);

// C# 9 — nested property pattern (extra braces)
if (customer is { Address: { Country: "US" } })
{
    ApplyUsTax(customer);
}

// C# 10 — extended property pattern (dot notation)
if (customer is { Address.Country: "US" })
{
    ApplyUsTax(customer);
}

// Works in switch expressions too
string GetShippingZone(Customer c) => c switch
{
    { Address.Country: "US" }   => "Domestic",
    { Address.Country: "CA" }   => "North America",
    { Address.Country: "MX" }   => "North America",
    _                            => "International"
};
```

---

## Constant Interpolated Strings

Interpolated strings can now be `const` if all placeholders are also constants.

```csharp
// C# 9 — must use concatenation for const strings
const string Scheme = "https";
const string Domain = "example.com";
const string BaseUrl = Scheme + "://" + Domain; // OK

// C# 10 — const interpolated strings
const string Scheme = "https";
const string Domain = "example.com";
const string BaseUrl = $"{Scheme}://{Domain}"; // Now OK!
```

> **Note:** All values in the interpolation holes must be `const` strings. You cannot use `const int` or other types — only `const string`.

---

## Lambda Improvements

C# 10 significantly improved lambda expressions with natural types, explicit return types, and attribute support.

### Natural Type for Lambdas

```csharp
// C# 9 — must specify the delegate type
Func<int, int> square = x => x * x;

// C# 10 — compiler infers the delegate type
var square = (int x) => x * x;       // inferred as Func<int, int>
var greet = () => "Hello";            // inferred as Func<string>
var print = (string msg) => Console.WriteLine(msg); // inferred as Action<string>
```

### Explicit Return Types

```csharp
// When the compiler cannot determine the return type
var parse = object (string s) => int.TryParse(s, out var n) ? n : s;
```

### Attributes on Lambdas

```csharp
var handler = [Obsolete("Use ProcessV2")] (HttpRequest req) => HandleLegacy(req);

// Attributes on parameters
var validate = ([NotNull] string input) => Process(input);
```

> **Tip:** Lambda natural types are especially useful with ASP.NET Minimal APIs:
> ```csharp
> app.MapGet("/items", () => db.Items.ToListAsync());
> app.MapPost("/items", (Item item) => db.Items.Add(item));
> ```

---

## CallerArgumentExpression

Capture the source text of an argument, making assertion and validation messages automatic.

```csharp
public static class Guard
{
    public static void NotNull<T>(
        T? value,
        [CallerArgumentExpression(nameof(value))] string? expression = null)
    {
        if (value is null)
            throw new ArgumentNullException(expression);
    }
}

// Usage
string? name = null;
Guard.NotNull(name);
// Throws: ArgumentNullException: Value cannot be null. (Parameter 'name')
```

```csharp
// Before CallerArgumentExpression — manual parameter name
public static void NotNullOld<T>(T? value, string paramName)
{
    if (value is null)
        throw new ArgumentNullException(paramName);
}

NotNullOld(name, nameof(name)); // repetitive
```

> **Warning:** `CallerArgumentExpression` captures the literal source text. If you pass a complex expression like `users.FirstOrDefault()`, that entire string becomes the parameter name in the exception.

---

## Sealed `ToString` on Records

Derived records can now seal `ToString` to prevent further overrides, giving you control over formatting in hierarchies.

```csharp
public record Animal(string Name)
{
    public sealed override string ToString() => $"Animal: {Name}";
}

public record Dog(string Name, string Breed) : Animal(Name);

var d = new Dog("Rex", "Labrador");
Console.WriteLine(d); // "Animal: Rex" — sealed, not overridden by Dog
```

> **Note:** Without `sealed`, derived records automatically generate their own `ToString`, which would print all properties including the derived type's.

---

## Enhanced `#line` Directives

Razor and source generators benefit from finer-grained `#line` directives that map to specific character positions.

```csharp
// New syntax allows specifying character span
#line (1, 1) - (1, 20) 5 "MyPage.razor"
CallGeneratedMethod();
```

> **Tip:** This feature primarily benefits tooling authors (Razor compiler, source generators). You rarely write these by hand, but they improve the debugging experience in generated code.

---

## Summary

| Feature | What It Eliminates |
|---|---|
| Global usings | Repeated `using` blocks in every file |
| File-scoped namespaces | One level of indentation across the entire file |
| Record structs | Boilerplate for value-type data with equality |
| Extended property patterns | Nested braces in property patterns |
| Constant interpolated strings | String concatenation for `const` values |
| Lambda improvements | Explicit delegate type declarations |
| CallerArgumentExpression | Manual `nameof()` for parameter names |
| Sealed ToString | Uncontrolled ToString overrides in record hierarchies |

> **Tip:** C# 10 pairs with .NET 6 (LTS). Set `<LangVersion>10.0</LangVersion>` or target `net6.0` or later.
