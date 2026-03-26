# Pattern Matching

*Concise conditional logic with powerful patterns*

Pattern matching lets you test a value against a pattern and extract information from it. C# has progressively added more patterns with each release, making conditional logic more expressive and concise.

## Type Patterns

```csharp
object value = "Hello, World!";

// is pattern with declaration
if (value is string text)
{
    Console.WriteLine($"String of length {text.Length}");
}

// is pattern in conditions
if (value is int n && n > 0)
{
    Console.WriteLine($"Positive number: {n}");
}

// Negation
if (value is not null)
{
    Console.WriteLine("Value is not null");
}
```

## Switch Expressions (C# 8+)

```csharp
// Classic switch statement
string GetDayType(DayOfWeek day)
{
    switch (day)
    {
        case DayOfWeek.Saturday:
        case DayOfWeek.Sunday:
            return "Weekend";
        default:
            return "Weekday";
    }
}

// Switch expression - much cleaner!
string GetDayType(DayOfWeek day) => day switch
{
    DayOfWeek.Saturday or DayOfWeek.Sunday => "Weekend",
    _ => "Weekday"
};
```

## Property Patterns

Match on object properties:

```csharp
record Order(string Status, decimal Total, string Country);

string GetShippingMessage(Order order) => order switch
{
    { Status: "Shipped", Country: "US" } => "Arrives in 3-5 days",
    { Status: "Shipped" } => "Arrives in 7-14 days (international)",
    { Status: "Processing", Total: > 100 } => "Priority processing",
    { Status: "Processing" } => "Standard processing",
    { Status: "Cancelled" } => "Order was cancelled",
    _ => "Unknown status"
};
```

## Relational Patterns

```csharp
string GetTemperatureDescription(double temp) => temp switch
{
    < 0 => "Freezing",
    >= 0 and < 10 => "Cold",
    >= 10 and < 20 => "Cool",
    >= 20 and < 30 => "Warm",
    >= 30 and < 40 => "Hot",
    >= 40 => "Extreme heat",
    double.NaN => "Invalid reading"
};

// Tax bracket example
decimal CalculateTax(decimal income) => income switch
{
    <= 10_000m => 0,
    <= 50_000m => income * 0.10m,
    <= 100_000m => income * 0.20m,
    _ => income * 0.30m
};
```

## Tuple Patterns

Match multiple values simultaneously:

```csharp
string RockPaperScissors(string player1, string player2)
    => (player1, player2) switch
    {
        ("rock", "scissors") => "Player 1 wins",
        ("scissors", "paper") => "Player 1 wins",
        ("paper", "rock") => "Player 1 wins",
        (var a, var b) when a == b => "Tie",
        _ => "Player 2 wins"
    };
```

> **Tip:** Tuple patterns are excellent for state machines and situations where the result depends on a combination of values.

## List Patterns (C# 11+)

Match against the structure of a list or array:

```csharp
int[] numbers = { 1, 2, 3, 4, 5 };

var description = numbers switch
{
    [] => "empty",
    [var single] => $"single element: {single}",
    [var first, .., var last] => $"starts with {first}, ends with {last}",
};

// Discard pattern with slice
bool IsValidHeader(byte[] data) => data switch
{
    [0x89, 0x50, 0x4E, 0x47, ..] => true,  // PNG header
    [0xFF, 0xD8, 0xFF, ..] => true,          // JPEG header
    [0x47, 0x49, 0x46, ..] => true,          // GIF header
    _ => false
};
```

## Combining Patterns

```csharp
record Person(string Name, int Age, string? Email);

string Classify(Person person) => person switch
{
    { Age: < 0 } => "Invalid age",
    { Age: < 13 } => "Child",
    { Age: < 18, Email: null } => "Teen (no email)",
    { Age: < 18, Email: not null } => "Teen (has email)",
    { Age: >= 18, Email: null or "" } => "Adult (needs email)",
    { Name: var name, Age: var age } when name.StartsWith("Dr.")
        => $"Doctor, age {age}",
    _ => "Adult"
};
```

> **Note:** The compiler checks for exhaustiveness in switch expressions. If it can determine that not all cases are covered, it will emit a warning. The discard pattern `_` serves as the catch-all default case.

## When Guards

Add additional conditions with `when`:

```csharp
string DescribeNumber(int n) => n switch
{
    0 => "zero",
    > 0 when n % 2 == 0 => "positive even",
    > 0 => "positive odd",
    < 0 when n % 2 == 0 => "negative even",
    < 0 => "negative odd"
};
```

> **Important:** Pattern matching in C# is not just syntactic sugar — the compiler generates efficient code that often outperforms equivalent if-else chains, especially with type patterns.
