# Records and Structs

*Value semantics and data-focused types*

C# offers several ways to define types optimized for holding data. Records, structs, and record structs each have distinct characteristics suited to different scenarios.

## Records (C# 9+)

Records are reference types designed for immutable data:

```csharp
// Positional record - most concise
public record Person(string Name, int Age);

// The compiler generates:
// - Constructor
// - Properties (init-only)
// - Equals() and GetHashCode() (value-based)
// - ToString() (e.g., "Person { Name = Alice, Age = 30 }")
// - Deconstruct method
// - With-expression support
```

```csharp
var alice = new Person("Alice", 30);
var bob = new Person("Bob", 25);
var alsoAlice = new Person("Alice", 30);

// Value-based equality
Console.WriteLine(alice == alsoAlice);  // True (same values)

// With-expressions for non-destructive mutation
var olderAlice = alice with { Age = 31 };
Console.WriteLine(olderAlice);  // Person { Name = Alice, Age = 31 }

// Deconstruction
var (name, age) = alice;
Console.WriteLine($"{name} is {age}"); // Alice is 30
```

> **Tip:** Use records whenever you have a type that is primarily about its data rather than its behavior. They're perfect for DTOs, API responses, events, and configuration.

## Record Classes vs Record Structs

```csharp
// Record class (reference type) - heap allocated
public record PersonRecord(string Name, int Age);

// Record struct (value type) - stack allocated
public record struct Point(double X, double Y);

// Readonly record struct - fully immutable
public readonly record struct Color(byte R, byte G, byte B);
```

| Feature | `record` | `record struct` | `readonly record struct` |
|---------|---------|----------------|------------------------|
| **Type** | Reference | Value | Value |
| **Allocated** | Heap | Stack | Stack |
| **Mutable?** | No (init) | Yes (set) | No |
| **Equality** | Value-based | Value-based | Value-based |
| **Inheritance** | Yes | No | No |
| **Nullable** | Yes | No | No |

## Structs

Structs are value types — they live on the stack and are copied on assignment:

```csharp
public struct Vector2D
{
    public double X { get; }
    public double Y { get; }

    public Vector2D(double x, double y) => (X, Y) = (x, y);

    public double Magnitude => Math.Sqrt(X * X + Y * Y);

    public static Vector2D operator +(Vector2D a, Vector2D b)
        => new(a.X + b.X, a.Y + b.Y);

    public static Vector2D operator *(Vector2D v, double scalar)
        => new(v.X * scalar, v.Y * scalar);

    public override string ToString() => $"({X}, {Y})";
}

var v1 = new Vector2D(3, 4);
var v2 = new Vector2D(1, 2);
var v3 = v1 + v2;           // (4, 6)
Console.WriteLine(v3.Magnitude); // 7.21...
```

> **Note:** Use structs for small, frequently-created types (under ~16 bytes) where value semantics are desired. Think coordinates, colors, ranges, and similar small value objects.

## Readonly Structs

```csharp
public readonly struct Temperature
{
    public double Celsius { get; }
    public double Fahrenheit => Celsius * 9.0 / 5.0 + 32;
    public double Kelvin => Celsius + 273.15;

    public Temperature(double celsius) => Celsius = celsius;

    public override string ToString() => $"{Celsius}°C";
}
```

> **Important:** Mark structs as `readonly` when none of their members modify state. The compiler can then optimize by avoiding defensive copies when the struct is used with `in` parameters or `readonly` fields.

## Records with Behavior

Records aren't just data containers — they can have methods and computed properties:

```csharp
public record Money(decimal Amount, string Currency)
{
    public Money Add(Money other)
    {
        if (Currency != other.Currency)
            throw new InvalidOperationException(
                $"Cannot add {Currency} and {other.Currency}");
        return this with { Amount = Amount + other.Amount };
    }

    public Money MultiplyBy(decimal factor)
        => this with { Amount = Amount * factor };

    public string Display() => $"{Amount:N2} {Currency}";
}

var price = new Money(29.99m, "USD");
var tax = price.MultiplyBy(0.08m);
var total = price.Add(tax);
Console.WriteLine(total.Display()); // 32.39 USD
```

## Record Inheritance

```csharp
public record Animal(string Name, int Legs);
public record Dog(string Name, int Legs, string Breed) : Animal(Name, Legs);
public record Cat(string Name, int Legs, bool IsIndoor) : Animal(Name, Legs);

var rex = new Dog("Rex", 4, "German Shepherd");
var whiskers = new Cat("Whiskers", 4, true);

// Polymorphic equality
Animal a1 = new Dog("Rex", 4, "German Shepherd");
Animal a2 = new Dog("Rex", 4, "German Shepherd");
Console.WriteLine(a1 == a2); // True - runtime type check included!
```

> **Caution:** Record struct types cannot inherit from other types (just like regular structs). Only record class types support inheritance.
