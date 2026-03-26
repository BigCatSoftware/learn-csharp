# String Handling

*Working with text in C#*

Strings in C# are immutable sequences of Unicode characters. The `string` type (alias for `System.String`) is one of the most heavily used types, and C# provides rich syntax for working with text.

## String Basics

```csharp
string greeting = "Hello, World!";
string empty = "";
string? nullable = null;

// String properties
int length = greeting.Length;       // 13
char first = greeting[0];          // 'H'
char last = greeting[^1];          // '!'

// Substring
string sub = greeting[0..5];       // "Hello" (range operator)
string world = greeting[7..^1];    // "World"
```

## String Interpolation

```csharp
string name = "Alice";
int age = 30;

// Basic interpolation
string intro = $"Hi, I'm {name} and I'm {age} years old.";

// Expressions inside braces
string info = $"Next year I'll be {age + 1}";

// Format specifiers
decimal price = 19.99m;
string formatted = $"Price: {price:C}";          // Price: $19.99
string padded = $"|{name,15}|";                   // |          Alice|
string date = $"Today: {DateTime.Now:yyyy-MM-dd}"; // Today: 2024-01-15

// Raw string literals (C# 11+)
string json = """
    {
        "name": "Alice",
        "age": 30
    }
    """;

// Raw interpolated string
string rawInterp = $$"""
    {
        "name": "{{name}}",
        "age": {{age}}
    }
    """;
```

> **Tip:** Raw string literals (`"""..."""`) are perfect for JSON, XML, SQL, and any text containing quotes or special characters. The number of `$` signs determines how many braces trigger interpolation.

## Common String Operations

```csharp
string text = "  Hello, C# World!  ";

// Trimming
string trimmed = text.Trim();          // "Hello, C# World!"
string trimStart = text.TrimStart();   // "Hello, C# World!  "

// Case
string upper = text.ToUpperInvariant(); // "  HELLO, C# WORLD!  "
string lower = text.ToLowerInvariant(); // "  hello, c# world!  "

// Searching
bool contains = text.Contains("C#");        // true
bool starts = text.StartsWith("  Hello");   // true
int index = text.IndexOf("World");          // 13

// Replacing
string replaced = text.Replace("World", "Universe");

// Splitting
string csv = "apple,banana,cherry";
string[] fruits = csv.Split(',');  // ["apple", "banana", "cherry"]

// Joining
string joined = string.Join(" | ", fruits); // "apple | banana | cherry"
```

## StringBuilder

For building strings in a loop, use `StringBuilder` — it's much faster than concatenation:

```csharp
// SLOW - creates many intermediate strings
string result = "";
for (int i = 0; i < 10000; i++)
    result += i.ToString();  // O(n²) allocations!

// FAST - modifies buffer in place
var sb = new StringBuilder();
for (int i = 0; i < 10000; i++)
    sb.Append(i);
string result = sb.ToString();  // O(n) allocations
```

> **Warning:** String concatenation in a loop creates a new string object each iteration. For more than a handful of iterations, always use `StringBuilder`.

## String Comparison

```csharp
string a = "hello";
string b = "HELLO";

// Case-sensitive (default)
bool equal1 = a == b;                    // false
bool equal2 = a.Equals(b);              // false

// Case-insensitive
bool equal3 = a.Equals(b, StringComparison.OrdinalIgnoreCase); // true
bool equal4 = string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

// For sorting/display (culture-aware)
int comp = string.Compare(a, b, StringComparison.CurrentCulture);
```

| Comparison Type | Use Case |
|----------------|----------|
| `Ordinal` | Internal identifiers, file paths, keys |
| `OrdinalIgnoreCase` | Case-insensitive lookups |
| `CurrentCulture` | Display to user, sorting |
| `InvariantCulture` | Serialization, data persistence |

> **Important:** Always specify `StringComparison` explicitly. Using `==` for comparison is fine for exact matches, but for case-insensitive or culture-aware comparisons, always be explicit to avoid subtle bugs.

## Span\<char\> for Performance

```csharp
// Zero-allocation substring
string path = "/home/user/documents/file.txt";
ReadOnlySpan<char> fileName = path.AsSpan(path.LastIndexOf('/') + 1);
// fileName is "file.txt" - no new string allocated!

// Parsing without allocations
ReadOnlySpan<char> numberText = "12345".AsSpan();
int number = int.Parse(numberText);
```

> **Note:** `Span<T>` and `ReadOnlySpan<T>` are stack-only types that provide views into memory without allocations. They're essential for high-performance string processing.
