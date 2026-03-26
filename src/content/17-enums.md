# Enums

*Named constants and type-safe choices*

Enums (enumerations) define a type with a fixed set of named constants. They make your code more readable and less error-prone by replacing magic numbers and strings.

## Basic Enums

```csharp
public enum Season
{
    Spring,    // 0
    Summer,    // 1
    Autumn,    // 2
    Winter     // 3
}

Season current = Season.Summer;
Console.WriteLine(current);  // "Summer"

// Comparison
if (current == Season.Summer)
    Console.WriteLine("Time for the beach!");

// Switch expression
string clothing = current switch
{
    Season.Spring => "Light jacket",
    Season.Summer => "Shorts and t-shirt",
    Season.Autumn => "Sweater",
    Season.Winter => "Heavy coat",
    _ => "Unknown season"
};
```

## Custom Values

```csharp
public enum HttpStatus
{
    OK = 200,
    Created = 201,
    BadRequest = 400,
    Unauthorized = 401,
    Forbidden = 403,
    NotFound = 404,
    InternalError = 500
}

HttpStatus status = HttpStatus.NotFound;
int code = (int)status;  // 404
Console.WriteLine($"Status: {code} {status}"); // Status: 404 NotFound
```

## Flags Enums

For combining multiple values:

```csharp
[Flags]
public enum FilePermissions
{
    None    = 0,
    Read    = 1,
    Write   = 2,
    Execute = 4,

    // Combinations
    ReadWrite = Read | Write,
    All = Read | Write | Execute
}

var perms = FilePermissions.Read | FilePermissions.Write;
Console.WriteLine(perms);  // "ReadWrite"

// Check for a flag
bool canRead = perms.HasFlag(FilePermissions.Read);    // true
bool canExecute = perms.HasFlag(FilePermissions.Execute); // false

// Add a flag
perms |= FilePermissions.Execute;

// Remove a flag
perms &= ~FilePermissions.Write;
```

> **Tip:** Always use powers of 2 for `[Flags]` enum values (1, 2, 4, 8, 16...) so they can be combined with bitwise operators without overlapping.

## Parsing Enums

```csharp
// Parse from string
Season season = Enum.Parse<Season>("Summer");
bool success = Enum.TryParse<Season>("Winter", out Season result);

// Case-insensitive parsing
Enum.TryParse<Season>("summer", ignoreCase: true, out Season s);

// Get all values
Season[] allSeasons = Enum.GetValues<Season>();
string[] allNames = Enum.GetNames<Season>();

// Check if value is defined
bool valid = Enum.IsDefined<Season>((Season)1);  // true (Summer)
bool invalid = Enum.IsDefined<Season>((Season)99); // false
```

> **Warning:** `Enum.Parse` throws an exception for invalid strings. Always prefer `Enum.TryParse` for user input or external data.

## Enum Best Practices

```csharp
// DO: Use singular names for regular enums
public enum Color { Red, Green, Blue }

// DO: Use plural names for flags enums
[Flags]
public enum Colors { None = 0, Red = 1, Green = 2, Blue = 4 }

// DO: Include a default "None" or "Unknown" value
public enum OrderStatus
{
    Unknown = 0,
    Pending,
    Processing,
    Shipped,
    Delivered,
    Cancelled
}

// DON'T: Use enums for open-ended sets
// Use a class or string constants instead
```

> **Important:** The default value of any enum is `0`. If your enum doesn't have a member with value 0, the default will be an unnamed value. Always define a `None`, `Unknown`, or `Default` member with value 0 for clarity.
