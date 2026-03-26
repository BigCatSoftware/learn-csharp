# Attributes

Attributes are metadata annotations you attach to code elements — classes, methods, properties, parameters, assemblies. They don't change program behavior by themselves, but frameworks, tools, and your own code can read them at compile time or runtime to drive behavior.

## Attribute Syntax

Attributes are placed in square brackets above the target element.

```csharp
[Obsolete("Use NewMethod instead.")]
public void OldMethod() { }

[Serializable]
public class LegacyData { }

// Multiple attributes
[Required]
[StringLength(100, MinimumLength = 2)]
public string Name { get; set; } = "";

// Multiple attributes in one bracket
[Required, StringLength(100)]
public string Email { get; set; } = "";
```

## Common Built-In Attributes

### [Obsolete] — Marking Deprecated Code

```csharp
public class PaymentService
{
    [Obsolete("Use ProcessPaymentAsync instead.", error: false)]
    public void ProcessPayment(decimal amount)
    {
        // old synchronous implementation
    }

    public Task ProcessPaymentAsync(decimal amount)
    {
        // new async implementation
        return Task.CompletedTask;
    }
}

// Using the obsolete method produces a compiler warning.
// Setting error: true makes it a compiler error instead.
```

### [Flags] — Bitwise Enum Combinations

```csharp
[Flags]
public enum FilePermissions
{
    None    = 0,
    Read    = 1,
    Write   = 2,
    Execute = 4,
    All     = Read | Write | Execute
}

var perms = FilePermissions.Read | FilePermissions.Write;
Console.WriteLine(perms);                              // Read, Write
Console.WriteLine(perms.HasFlag(FilePermissions.Read)); // True
```

> **Tip:** Without `[Flags]`, the `ToString()` of a combined enum value would print the integer (3) instead of the named combination (Read, Write).

### [Conditional] — Compile-Time Method Inclusion

```csharp
using System.Diagnostics;

public static class DebugHelper
{
    [Conditional("DEBUG")]
    public static void Log(string message)
    {
        Console.WriteLine($"[DEBUG] {message}");
    }
}

// Calls to DebugHelper.Log are completely removed from Release builds.
// No runtime cost at all — the call site is stripped by the compiler.
DebugHelper.Log("This only runs in debug builds");
```

### [Serializable] — Marking Types for Serialization

```csharp
[Serializable]
public class SessionData
{
    public string UserId { get; set; } = "";
    public DateTime LoginTime { get; set; }

    [NonSerialized]
    private string _cachedToken = "";  // excluded from serialization
}
```

> **Note:** `[Serializable]` is primarily used with `BinaryFormatter` (now obsolete and dangerous) and some legacy APIs. Modern serialization uses `System.Text.Json` or `System.Xml.Serialization`, which rely on different attributes.

### JSON Serialization Attributes

```csharp
using System.Text.Json.Serialization;

public class ApiResponse
{
    [JsonPropertyName("status_code")]
    public int StatusCode { get; set; }

    [JsonPropertyName("data")]
    public object? Data { get; set; }

    [JsonIgnore]
    public string InternalNotes { get; set; } = "";

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public ResponseType Type { get; set; }
}

// Serializes to: {"status_code":200,"data":null,"type":"Success"}
```

### Data Annotation Attributes

These are used by ASP.NET model validation, EF Core, and other frameworks.

```csharp
using System.ComponentModel.DataAnnotations;

public class CreateUserRequest
{
    [Required(ErrorMessage = "Username is required.")]
    [StringLength(50, MinimumLength = 3,
        ErrorMessage = "Username must be between 3 and 50 characters.")]
    public string Username { get; set; } = "";

    [Required]
    [EmailAddress(ErrorMessage = "Invalid email format.")]
    public string Email { get; set; } = "";

    [Range(13, 120, ErrorMessage = "Age must be between 13 and 120.")]
    public int Age { get; set; }

    [RegularExpression(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$",
        ErrorMessage = "Password must be at least 8 chars with upper, lower, and digit.")]
    public string Password { get; set; } = "";

    [Compare(nameof(Password), ErrorMessage = "Passwords do not match.")]
    public string ConfirmPassword { get; set; } = "";

    [Url]
    public string? Website { get; set; }

    [Phone]
    public string? PhoneNumber { get; set; }
}
```

### ASP.NET Routing and API Attributes

```csharp
[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(List<Product>), StatusCodes.Status200OK)]
    public IActionResult GetAll() => Ok(products);

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(Product), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetById(int id) { /* ... */ }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public IActionResult Create([FromBody] CreateProductRequest request) { /* ... */ }
}
```

## Summary of Built-In Attributes

| Attribute | Namespace | Purpose |
|---|---|---|
| `[Obsolete]` | `System` | Mark deprecated APIs |
| `[Flags]` | `System` | Enable bitwise enum combinations |
| `[Conditional]` | `System.Diagnostics` | Strip method calls based on symbols |
| `[Serializable]` | `System` | Mark type for binary serialization |
| `[JsonPropertyName]` | `System.Text.Json` | Rename JSON property |
| `[JsonIgnore]` | `System.Text.Json` | Exclude from JSON |
| `[Required]` | `DataAnnotations` | Validation: field is required |
| `[Range]` | `DataAnnotations` | Validation: numeric range |
| `[StringLength]` | `DataAnnotations` | Validation: string length |
| `[EmailAddress]` | `DataAnnotations` | Validation: email format |
| `[HttpGet]` / `[HttpPost]` | `AspNetCore.Mvc` | Route HTTP methods |
| `[Authorize]` | `AspNetCore.Authorization` | Require authentication |
| `[CallerMemberName]` | `CompilerServices` | Inject caller's member name |

## Creating Custom Attributes

Custom attributes are classes that inherit from `System.Attribute`.

```csharp
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public class CacheDurationAttribute : Attribute
{
    public int Seconds { get; }
    public string? CacheKey { get; set; }

    public CacheDurationAttribute(int seconds)
    {
        Seconds = seconds;
    }
}

// Usage
public class WeatherService
{
    [CacheDuration(300, CacheKey = "weather-current")]
    public WeatherData GetCurrentWeather(string city)
    {
        // expensive API call
        return FetchFromApi(city);
    }

    [CacheDuration(3600, CacheKey = "weather-forecast")]
    public List<WeatherData> GetForecast(string city)
    {
        return FetchForecastFromApi(city);
    }
}
```

## AttributeUsage

The `[AttributeUsage]` attribute controls how your custom attribute can be applied.

```csharp
[AttributeUsage(
    AttributeTargets.Class | AttributeTargets.Struct,  // what it can decorate
    AllowMultiple = true,                               // can appear more than once
    Inherited = true                                    // applies to derived classes
)]
public class AuditLogAttribute : Attribute
{
    public string TableName { get; }
    public AuditLogAttribute(string tableName) => TableName = tableName;
}
```

| `AttributeTargets` Value | What It Can Decorate |
|---|---|
| `Class` | Classes |
| `Struct` | Structs |
| `Method` | Methods |
| `Property` | Properties |
| `Field` | Fields |
| `Parameter` | Method parameters |
| `ReturnValue` | Method return values |
| `Assembly` | The assembly itself |
| `All` | Anything |

## Reading Attributes with Reflection

Attributes are inert metadata until something reads them. Reflection is the traditional way.

```csharp
[AttributeUsage(AttributeTargets.Property)]
public class DisplayNameAttribute : Attribute
{
    public string Name { get; }
    public DisplayNameAttribute(string name) => Name = name;
}

public class Invoice
{
    [DisplayName("Invoice Number")]
    public string InvoiceNo { get; set; } = "";

    [DisplayName("Issue Date")]
    public DateTime IssuedOn { get; set; }

    [DisplayName("Total Amount")]
    public decimal Total { get; set; }
}

// Read attributes at runtime to build a display table
public static Dictionary<string, object?> GetDisplayValues(object obj)
{
    var result = new Dictionary<string, object?>();

    foreach (PropertyInfo prop in obj.GetType().GetProperties())
    {
        var attr = prop.GetCustomAttribute<DisplayNameAttribute>();
        string displayName = attr?.Name ?? prop.Name;
        result[displayName] = prop.GetValue(obj);
    }

    return result;
}

var invoice = new Invoice
{
    InvoiceNo = "INV-001",
    IssuedOn = new DateTime(2026, 3, 1),
    Total = 1250.00m
};

foreach (var (key, value) in GetDisplayValues(invoice))
    Console.WriteLine($"{key}: {value}");
// Invoice Number: INV-001
// Issue Date: 3/1/2026
// Total Amount: 1250.00
```

## Real-World Example: Custom Validation Framework

```csharp
// Base attribute for validation
[AttributeUsage(AttributeTargets.Property, AllowMultiple = true)]
public abstract class ValidationAttribute : Attribute
{
    public string? ErrorMessage { get; set; }
    public abstract bool IsValid(object? value);
}

// Concrete validators
public class NotEmptyAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) => value switch
    {
        string s => !string.IsNullOrWhiteSpace(s),
        null => false,
        _ => true
    };
}

public class MinValueAttribute : ValidationAttribute
{
    public double Minimum { get; }
    public MinValueAttribute(double minimum) => Minimum = minimum;

    public override bool IsValid(object? value) =>
        value is not null && Convert.ToDouble(value) >= Minimum;
}

public class MatchesPatternAttribute : ValidationAttribute
{
    public string Pattern { get; }
    public MatchesPatternAttribute(string pattern) => Pattern = pattern;

    public override bool IsValid(object? value) =>
        value is string s && Regex.IsMatch(s, Pattern);
}

// Model using custom validation
public class OrderRequest
{
    [NotEmpty(ErrorMessage = "Customer ID is required.")]
    public string CustomerId { get; set; } = "";

    [MinValue(0.01, ErrorMessage = "Amount must be positive.")]
    public decimal Amount { get; set; }

    [MatchesPattern(@"^[A-Z]{2}-\d{6}$",
        ErrorMessage = "Order code must be like 'AB-123456'.")]
    public string OrderCode { get; set; } = "";
}

// Validation engine
public static class Validator
{
    public static List<string> Validate(object obj)
    {
        var errors = new List<string>();

        foreach (PropertyInfo prop in obj.GetType().GetProperties())
        {
            object? value = prop.GetValue(obj);

            foreach (var attr in prop.GetCustomAttributes<ValidationAttribute>())
            {
                if (!attr.IsValid(value))
                {
                    errors.Add(attr.ErrorMessage
                        ?? $"Validation failed for {prop.Name}.");
                }
            }
        }

        return errors;
    }
}

// Usage
var order = new OrderRequest
{
    CustomerId = "",
    Amount = -5,
    OrderCode = "invalid"
};

List<string> errors = Validator.Validate(order);
foreach (string error in errors)
    Console.WriteLine(error);
// Customer ID is required.
// Amount must be positive.
// Order code must be like 'AB-123456'.
```

## Real-World Example: Attribute-Based Routing Registration

```csharp
[AttributeUsage(AttributeTargets.Class)]
public class ServiceRouteAttribute : Attribute
{
    public string Path { get; }
    public ServiceRouteAttribute(string path) => Path = path;
}

[AttributeUsage(AttributeTargets.Method)]
public class HandleAttribute : Attribute
{
    public string HttpMethod { get; }
    public string? SubPath { get; set; }

    public HandleAttribute(string httpMethod) => HttpMethod = httpMethod;
}

// Service definition
[ServiceRoute("/api/users")]
public class UserHandler
{
    [Handle("GET")]
    public object GetAll() => new { Users = new[] { "Alice", "Bob" } };

    [Handle("GET", SubPath = "/{id}")]
    public object GetById(int id) => new { Id = id, Name = "Alice" };

    [Handle("POST")]
    public object Create(object body) => new { Status = "Created" };
}

// Discovery via reflection
public static void RegisterRoutes(Assembly assembly)
{
    var handlerTypes = assembly.GetTypes()
        .Where(t => t.GetCustomAttribute<ServiceRouteAttribute>() is not null);

    foreach (Type handlerType in handlerTypes)
    {
        string basePath = handlerType.GetCustomAttribute<ServiceRouteAttribute>()!.Path;

        foreach (MethodInfo method in handlerType.GetMethods())
        {
            var handleAttr = method.GetCustomAttribute<HandleAttribute>();
            if (handleAttr is null) continue;

            string fullPath = basePath + (handleAttr.SubPath ?? "");
            Console.WriteLine(
                $"{handleAttr.HttpMethod} {fullPath} -> {handlerType.Name}.{method.Name}");
        }
    }
}
// GET /api/users -> UserHandler.GetAll
// GET /api/users/{id} -> UserHandler.GetById
// POST /api/users -> UserHandler.Create
```

## Caller Info Attributes

These special attributes are filled in by the compiler, not by the caller.

```csharp
using System.Runtime.CompilerServices;

public static class Logger
{
    public static void Log(
        string message,
        [CallerMemberName] string memberName = "",
        [CallerFilePath] string filePath = "",
        [CallerLineNumber] int lineNumber = 0)
    {
        Console.WriteLine(
            $"[{Path.GetFileName(filePath)}:{lineNumber}] {memberName}: {message}");
    }
}

// Usage — no need to pass caller info manually
public class OrderService
{
    public void PlaceOrder()
    {
        Logger.Log("Order placed successfully");
        // Output: [OrderService.cs:15] PlaceOrder: Order placed successfully
    }
}
```

> **Warning:** Attributes with constructors that accept types (like `typeof(SomeClass)`) can create coupling between assemblies. Be thoughtful about which types you reference in attribute arguments.

## Attribute Best Practices

1. **Keep attributes lightweight** — they are metadata, not logic containers. Put complex behavior in the code that reads the attribute.
2. **Use `sealed`** on custom attributes unless you specifically need inheritance.
3. **Set `AttributeUsage`** explicitly to prevent misapplication.
4. **Prefer built-in attributes** when they exist rather than creating custom ones for the same purpose.
5. **Document attribute behavior** — since attributes are declarative, their effect is not always obvious from reading the code.

> **Caution:** Attribute constructors run when the attribute is first accessed via reflection, not when the decorated code is loaded. If an attribute constructor throws, the exception surfaces at the reflection call site, which can be confusing to debug.

## Key Takeaways

1. Attributes are metadata annotations that enrich code elements with additional information.
2. Built-in attributes handle deprecation (`[Obsolete]`), serialization (`[JsonPropertyName]`), validation (`[Required]`), routing (`[HttpGet]`), and more.
3. Custom attributes inherit from `System.Attribute` and are controlled by `[AttributeUsage]`.
4. Attributes are read at runtime via reflection (`GetCustomAttribute<T>`) or at compile time by source generators.
5. Real-world uses include validation frameworks, routing systems, serialization control, and plugin discovery.
6. Attributes themselves are inert — they only affect behavior when something reads and acts on them.
