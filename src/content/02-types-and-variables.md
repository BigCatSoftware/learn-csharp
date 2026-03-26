# Types and Variables

*Understanding the C# type system*

C# is a strongly typed language. Every variable, constant, and expression has a type that is known at compile time. The type determines what values can be stored, what operations can be performed, and how much memory is allocated.

## Built-in Types

C# provides a rich set of built-in types:

### Numeric Types

```csharp
// Integer types
byte   b = 255;           // 8-bit unsigned (0 to 255)
short  s = -32768;        // 16-bit signed
int    i = 2_147_483_647; // 32-bit signed (most common)
long   l = 9_000_000_000L;// 64-bit signed

// Floating-point types
float  f = 3.14f;         // 32-bit (~6-7 digits precision)
double d = 3.14159265;    // 64-bit (~15-16 digits precision)
decimal m = 19.99m;       // 128-bit (28-29 digits, for financial)
```

> **Tip:** Use `int` for general integers, `double` for scientific calculations, and `decimal` for financial and monetary calculations where precision matters.

### Other Built-in Types

```csharp
bool isReady = true;              // true or false
char grade = 'A';                 // Single Unicode character
string greeting = "Hello, C#!";  // Sequence of characters
object anything = 42;             // Base type of all types
```

## Value Types vs Reference Types

This is one of the most important concepts in C#:

| Aspect | Value Types | Reference Types |
|--------|-------------|-----------------|
| **Storage** | Stack (usually) | Heap |
| **Contains** | Actual data | Reference to data |
| **Assignment** | Copies the value | Copies the reference |
| **Default** | Zero/false/null equivalent | `null` |
| **Examples** | `int`, `bool`, `struct`, `enum` | `class`, `string`, `array`, `interface` |

```csharp
// Value type behavior - independent copies
int a = 42;
int b = a;    // b gets a COPY of the value
b = 100;      // a is still 42

// Reference type behavior - shared data
int[] arr1 = { 1, 2, 3 };
int[] arr2 = arr1;    // arr2 points to SAME array
arr2[0] = 99;         // arr1[0] is now 99 too!
```

> **Warning:** Be careful when assigning reference types. Both variables will point to the same object in memory. Modifying one affects the other.

## Nullable Types

By default, value types cannot be `null`. But you can make them nullable:

```csharp
int? nullableInt = null;       // Can be null or an int
double? nullableDouble = 3.14; // Can be null or a double

if (nullableInt.HasValue)
{
    Console.WriteLine(nullableInt.Value);
}

// Null-coalescing operator
int result = nullableInt ?? 0; // Use 0 if null

// Null-conditional operator
string? name = null;
int? length = name?.Length; // null, doesn't throw
```

> **Note:** Starting with C# 8.0, nullable reference types can be enabled to get compiler warnings when you might dereference a null reference. Enable it with `<Nullable>enable</Nullable>` in your project file.

## Type Conversion

C# supports both implicit and explicit conversions:

```csharp
// Implicit conversion (safe, no data loss)
int num = 42;
long bigger = num;        // int → long is safe
double precise = num;     // int → double is safe

// Explicit conversion (casting, possible data loss)
double pi = 3.14159;
int truncated = (int)pi;  // 3 (fractional part lost!)

// Using Convert class
string text = "42";
int parsed = Convert.ToInt32(text);

// Using Parse and TryParse
int.TryParse("42", out int value); // Safe parsing
```

> **Caution:** Explicit casts can lose data or throw exceptions. Always prefer `TryParse` over `Parse` when converting from strings, as it won't throw on invalid input.

## Constants and Read-only

```csharp
// Compile-time constant
const double Pi = 3.14159265358979;
const string AppName = "My App";

// Runtime constant (can be set in constructor)
readonly DateTime startTime = DateTime.Now;
```

## var and Type Inference

The `var` keyword lets the compiler infer the type:

```csharp
var count = 10;                    // int
var name = "Alice";                // string
var items = new List<string>();    // List<string>
var lookup = new Dictionary<string, List<int>>(); // readable!

// var CANNOT be used for:
// var x;              // Error: no initializer
// var y = null;       // Error: can't infer type from null
```

> **Tip:** Use `var` when the type is obvious from the right-hand side. Spell out the type when it adds clarity.
