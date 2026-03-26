# Classes and Objects

*Object-oriented programming fundamentals in C#*

Classes are the most fundamental building block in C#. A class is a blueprint for creating objects — instances that combine data (fields/properties) and behavior (methods).

## Defining a Class

```csharp
public class Person
{
    // Fields (private by convention)
    private string _name;
    private int _age;

    // Constructor
    public Person(string name, int age)
    {
        _name = name;
        _age = age;
    }

    // Properties (public access to private data)
    public string Name
    {
        get => _name;
        set => _name = value ?? throw new ArgumentNullException(nameof(value));
    }

    public int Age
    {
        get => _age;
        set => _age = value >= 0 ? value : throw new ArgumentOutOfRangeException(nameof(value));
    }

    // Method
    public string Introduce() => $"Hi, I'm {Name} and I'm {Age} years old.";

    // Override ToString
    public override string ToString() => $"Person({Name}, {Age})";
}
```

## Creating Objects

```csharp
// Using constructor
var alice = new Person("Alice", 30);
Console.WriteLine(alice.Introduce()); // Hi, I'm Alice and I'm 30 years old.

// Using object initializer (requires settable properties)
var bob = new Person("Bob", 25) { Name = "Robert" };
```

## Auto-Implemented Properties

For simple properties that don't need custom logic:

```csharp
public class Product
{
    public string Name { get; set; }
    public decimal Price { get; set; }
    public string Category { get; init; }  // Set only during initialization
    public int Id { get; }                  // Read-only, set in constructor

    public Product(int id)
    {
        Id = id;
    }
}

// Usage with object initializer
var laptop = new Product(1)
{
    Name = "ThinkPad",
    Price = 1299.99m,
    Category = "Electronics"  // Can set because of 'init'
};

// laptop.Category = "Other"; // ERROR: init-only property
```

> **Tip:** Use `init` accessors (C# 9+) for properties that should be immutable after construction but settable in object initializers.

## Inheritance

```csharp
public class Animal
{
    public string Name { get; set; }

    public virtual string Speak() => "...";

    public override string ToString() => $"{GetType().Name}: {Name}";
}

public class Dog : Animal
{
    public string Breed { get; set; }

    public override string Speak() => "Woof!";

    public void Fetch(string item) =>
        Console.WriteLine($"{Name} fetches the {item}!");
}

public class Cat : Animal
{
    public bool IsIndoor { get; set; }

    public override string Speak() => "Meow!";
}
```

```csharp
// Polymorphism in action
List<Animal> animals = new()
{
    new Dog { Name = "Rex", Breed = "German Shepherd" },
    new Cat { Name = "Whiskers", IsIndoor = true },
    new Dog { Name = "Buddy", Breed = "Golden Retriever" }
};

foreach (var animal in animals)
{
    Console.WriteLine($"{animal.Name} says {animal.Speak()}");
}
// Rex says Woof!
// Whiskers says Meow!
// Buddy says Woof!
```

## Access Modifiers

| Modifier | Access Level |
|----------|-------------|
| `public` | Accessible from anywhere |
| `private` | Only within the same class |
| `protected` | Same class and derived classes |
| `internal` | Same assembly only |
| `protected internal` | Same assembly OR derived classes |
| `private protected` | Same class or derived classes in same assembly |

> **Note:** The default access modifier for class members is `private`. For top-level types, it's `internal`.

## Static Members

```csharp
public class MathHelper
{
    // Static field
    public static readonly double Pi = 3.14159265358979;

    // Static method
    public static double CircleArea(double radius) => Pi * radius * radius;

    // Static property
    public static int CalculationCount { get; private set; }
}

// Usage - no instance needed
double area = MathHelper.CircleArea(5.0);
```

## Constructors

```csharp
public class Connection
{
    public string Host { get; }
    public int Port { get; }
    public string Protocol { get; }

    // Primary constructor
    public Connection(string host, int port, string protocol = "https")
    {
        Host = host;
        Port = port;
        Protocol = protocol;
    }

    // Constructor chaining
    public Connection(string host) : this(host, 443) { }

    // Static factory method (often preferred)
    public static Connection CreateLocal() =>
        new Connection("localhost", 5000, "http");
}
```

> **Important:** C# does not support multiple inheritance of classes. A class can inherit from only one base class but can implement multiple interfaces.
