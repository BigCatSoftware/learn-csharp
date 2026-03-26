# Interfaces

*Defining contracts and enabling polymorphism*

An interface defines a contract that classes or structs can implement. It specifies **what** a type can do without dictating **how** it does it. Interfaces are one of the most powerful tools for writing flexible, testable, and maintainable code.

## Defining an Interface

```csharp
public interface IShape
{
    double Area { get; }
    double Perimeter { get; }
    void Draw();
}
```

> **Tip:** By convention, C# interface names start with the letter `I`. This isn't enforced by the compiler but is universally followed.

## Implementing an Interface

```csharp
public class Circle : IShape
{
    public double Radius { get; }

    public Circle(double radius) => Radius = radius;

    public double Area => Math.PI * Radius * Radius;
    public double Perimeter => 2 * Math.PI * Radius;
    public void Draw() => Console.WriteLine($"Drawing circle with radius {Radius}");
}

public class Rectangle : IShape
{
    public double Width { get; }
    public double Height { get; }

    public Rectangle(double width, double height)
    {
        Width = width;
        Height = height;
    }

    public double Area => Width * Height;
    public double Perimeter => 2 * (Width + Height);
    public void Draw() => Console.WriteLine($"Drawing {Width}x{Height} rectangle");
}
```

## Using Interfaces for Polymorphism

```csharp
void PrintShapeInfo(IShape shape)
{
    shape.Draw();
    Console.WriteLine($"  Area: {shape.Area:F2}");
    Console.WriteLine($"  Perimeter: {shape.Perimeter:F2}");
}

// Works with any IShape implementation
PrintShapeInfo(new Circle(5));
PrintShapeInfo(new Rectangle(4, 6));
```

## Multiple Interface Implementation

A class can implement multiple interfaces:

```csharp
public interface ISerializable
{
    string Serialize();
}

public interface IComparable<T>
{
    int CompareTo(T other);
}

public class Temperature : ISerializable, IComparable<Temperature>
{
    public double Celsius { get; }

    public Temperature(double celsius) => Celsius = celsius;

    public string Serialize() => $"{{\"celsius\": {Celsius}}}";

    public int CompareTo(Temperature other) =>
        Celsius.CompareTo(other.Celsius);
}
```

## Default Interface Methods (C# 8+)

Interfaces can provide default implementations:

```csharp
public interface ILogger
{
    void Log(string message);

    // Default implementation - classes don't HAVE to override this
    void LogError(string message) => Log($"ERROR: {message}");
    void LogWarning(string message) => Log($"WARNING: {message}");
    void LogInfo(string message) => Log($"INFO: {message}");
}

public class ConsoleLogger : ILogger
{
    public void Log(string message) =>
        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {message}");

    // Gets LogError, LogWarning, LogInfo for free!
}
```

> **Note:** Default interface methods are only accessible through the interface reference, not through the implementing class directly, unless the class explicitly overrides them.

## Interface Segregation

Keep interfaces focused and small:

```csharp
// BAD: One fat interface
public interface IRepository
{
    void Add(Entity entity);
    void Update(Entity entity);
    void Delete(int id);
    Entity GetById(int id);
    IEnumerable<Entity> GetAll();
    IEnumerable<Entity> Search(string query);
    void BulkInsert(IEnumerable<Entity> entities);
    void Archive(int id);
}

// BETTER: Segregated interfaces
public interface IReadRepository<T>
{
    T GetById(int id);
    IEnumerable<T> GetAll();
}

public interface IWriteRepository<T>
{
    void Add(T entity);
    void Update(T entity);
    void Delete(int id);
}

public interface ISearchable<T>
{
    IEnumerable<T> Search(string query);
}
```

> **Important:** The Interface Segregation Principle (ISP) states that no client should be forced to depend on methods it does not use. Prefer many small, specific interfaces over one large general-purpose interface.

## Common .NET Interfaces

| Interface | Purpose | Example |
|-----------|---------|---------|
| `IDisposable` | Resource cleanup | Database connections, file handles |
| `IEnumerable<T>` | Iteration support | Collections, LINQ |
| `IComparable<T>` | Natural ordering | Sorting |
| `IEquatable<T>` | Value equality | Dictionary keys, HashSet |
| `ICloneable` | Object copying | Deep/shallow copy |
| `IAsyncDisposable` | Async cleanup | Async streams |
