# Modern C# Features

*C# 10, 11, and 12 highlights*

C# evolves rapidly with annual releases. Here are the most impactful features from recent versions that every C# developer should know.

## Global Usings (C# 10)

```csharp
// In a GlobalUsings.cs file
global using System;
global using System.Collections.Generic;
global using System.Linq;
global using System.Threading.Tasks;

// Now available everywhere in the project without per-file imports
```

> **Tip:** The .NET SDK includes implicit global usings for common namespaces. Check `<ImplicitUsings>enable</ImplicitUsings>` in your project file.

## File-Scoped Namespaces (C# 10)

```csharp
// Before: block-scoped (extra indentation)
namespace MyApp.Models
{
    public class User { }
}

// After: file-scoped (saves a level of indentation)
namespace MyApp.Models;

public class User { }
```

## Required Members (C# 11)

```csharp
public class Config
{
    public required string Host { get; init; }
    public required int Port { get; init; }
    public string Protocol { get; init; } = "https";
}

// Must set required members
var config = new Config { Host = "localhost", Port = 8080 };
// var bad = new Config { Host = "localhost" }; // Error: Port is required
```

## Raw String Literals (C# 11)

```csharp
// Triple-quoted strings - no escaping needed
string json = """
    {
        "name": "Alice",
        "scores": [100, 95, 87]
    }
    """;

// With interpolation (double $$ means double braces for interpolation)
string name = "Alice";
string template = $$"""
    {
        "name": "{{name}}",
        "timestamp": "{{DateTime.UtcNow:O}}"
    }
    """;
```

## List Patterns (C# 11)

```csharp
int[] numbers = { 1, 2, 3, 4, 5 };

var result = numbers switch
{
    [1, 2, ..] => "Starts with 1, 2",
    [.., 4, 5] => "Ends with 4, 5",
    [var first, .., var last] => $"From {first} to {last}",
    [] => "Empty"
};
```

## Primary Constructors (C# 12)

```csharp
// Before
public class UserService
{
    private readonly IUserRepository _repo;
    private readonly ILogger<UserService> _logger;

    public UserService(IUserRepository repo, ILogger<UserService> logger)
    {
        _repo = repo;
        _logger = logger;
    }
}

// After - primary constructor (C# 12)
public class UserService(IUserRepository repo, ILogger<UserService> logger)
{
    public async Task<User?> GetUserAsync(int id)
    {
        logger.LogInformation("Getting user {Id}", id);
        return await repo.GetByIdAsync(id);
    }
}
```

> **Note:** Primary constructor parameters are available throughout the class body but are NOT automatically stored as fields. They're captured by closures in methods and property initializers.

## Collection Expressions (C# 12)

```csharp
// Before
List<int> numbers = new List<int> { 1, 2, 3 };
int[] array = new int[] { 1, 2, 3 };
Span<int> span = stackalloc int[] { 1, 2, 3 };

// After - collection expressions
List<int> numbers = [1, 2, 3];
int[] array = [1, 2, 3];
Span<int> span = [1, 2, 3];

// Spread operator
int[] first = [1, 2, 3];
int[] second = [4, 5, 6];
int[] combined = [..first, ..second]; // [1, 2, 3, 4, 5, 6]
```

## Type Aliases (C# 12)

```csharp
using Point = (double X, double Y);
using UserLookup = System.Collections.Generic.Dictionary<string, User>;

Point origin = (0, 0);
UserLookup users = new()
{
    ["alice"] = new User("Alice"),
    ["bob"] = new User("Bob")
};
```

## Pattern Summary

| Feature | Version | Impact |
|---------|---------|--------|
| Global usings | C# 10 | Less boilerplate |
| File-scoped namespaces | C# 10 | Cleaner files |
| Required members | C# 11 | Safer initialization |
| Raw string literals | C# 11 | Embedded text/JSON |
| List patterns | C# 11 | Array matching |
| Primary constructors | C# 12 | Less DI boilerplate |
| Collection expressions | C# 12 | Uniform syntax |
| Type aliases | C# 12 | Readability |

> **Important:** These features are additive — they don't break existing code. Adopt them incrementally as you write new code. There's no need to rewrite existing working code just to use newer syntax.
