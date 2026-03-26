# Generics

*Writing type-safe, reusable code*

Generics let you define classes, interfaces, and methods with a placeholder for the type they operate on. Instead of writing separate code for `int`, `string`, etc., you write it once and specify the type when you use it.

## Why Generics?

Without generics, you'd need either separate implementations or lose type safety:

```csharp
// Without generics - loses type safety
class ObjectBox
{
    private object _value;
    public void Set(object value) => _value = value;
    public object Get() => _value;  // Must cast: (int)box.Get()
}

// With generics - type-safe and reusable
class Box<T>
{
    private T _value;
    public void Set(T value) => _value = value;
    public T Get() => _value;  // No cast needed!
}
```

```csharp
var intBox = new Box<int>();
intBox.Set(42);
int value = intBox.Get();  // Type-safe, no casting

var stringBox = new Box<string>();
stringBox.Set("hello");
string text = stringBox.Get();  // Also type-safe
```

## Generic Classes

```csharp
public class Stack<T>
{
    private readonly List<T> _items = new();

    public int Count => _items.Count;
    public bool IsEmpty => Count == 0;

    public void Push(T item) => _items.Add(item);

    public T Pop()
    {
        if (IsEmpty) throw new InvalidOperationException("Stack is empty");
        var item = _items[^1];  // Last element (index from end)
        _items.RemoveAt(_items.Count - 1);
        return item;
    }

    public T Peek() => IsEmpty
        ? throw new InvalidOperationException("Stack is empty")
        : _items[^1];
}
```

## Generic Methods

```csharp
public static class Utilities
{
    // Generic method
    public static T Max<T>(T a, T b) where T : IComparable<T>
        => a.CompareTo(b) >= 0 ? a : b;

    // Swap any two values
    public static void Swap<T>(ref T a, ref T b)
        => (a, b) = (b, a);

    // Create a list from params
    public static List<T> ListOf<T>(params T[] items)
        => new List<T>(items);
}

// Usage - type is often inferred
int bigger = Utilities.Max(10, 20);        // int inferred
string later = Utilities.Max("abc", "xyz"); // string inferred
var numbers = Utilities.ListOf(1, 2, 3);   // List<int>
```

## Generic Constraints

Constraints restrict what types can be used as type arguments:

```csharp
// T must implement IComparable<T>
public T FindMin<T>(IEnumerable<T> items) where T : IComparable<T>
{
    return items.Min()!;
}

// T must be a reference type with a parameterless constructor
public T CreateAndLog<T>() where T : class, new()
{
    var instance = new T();
    Console.WriteLine($"Created {typeof(T).Name}");
    return instance;
}
```

| Constraint | Meaning |
|-----------|---------|
| `where T : struct` | T must be a value type |
| `where T : class` | T must be a reference type |
| `where T : new()` | T must have a parameterless constructor |
| `where T : BaseClass` | T must inherit from BaseClass |
| `where T : IInterface` | T must implement IInterface |
| `where T : notnull` | T must be a non-nullable type |
| `where T : unmanaged` | T must be an unmanaged type |

> **Tip:** You can combine multiple constraints: `where T : class, IComparable<T>, new()`. Constraints are evaluated at compile time, giving you both safety and IntelliSense support.

## Generic Interfaces

```csharp
public interface IRepository<T> where T : class
{
    T? GetById(int id);
    IEnumerable<T> GetAll();
    void Add(T entity);
    void Remove(T entity);
}

public class InMemoryRepository<T> : IRepository<T> where T : class
{
    private readonly List<T> _items = new();

    public T? GetById(int id) => _items.ElementAtOrDefault(id);
    public IEnumerable<T> GetAll() => _items.AsReadOnly();
    public void Add(T entity) => _items.Add(entity);
    public void Remove(T entity) => _items.Remove(entity);
}
```

## Covariance and Contravariance

```csharp
// Covariant (out) - can return derived types
IEnumerable<object> objects = new List<string>();  // string is object

// Contravariant (in) - can accept base types
Action<string> stringAction = (object obj) => Console.WriteLine(obj);

// Custom covariant interface
public interface IProducer<out T>
{
    T Produce();
}

// Custom contravariant interface
public interface IConsumer<in T>
{
    void Consume(T item);
}
```

> **Warning:** Covariance (`out`) only works with interfaces and delegates, not with classes. You also cannot use a covariant type parameter as a method input parameter.

## Common Generic Types in .NET

```csharp
List<T>                    // Dynamic array
Dictionary<TKey, TValue>   // Key-value pairs
HashSet<T>                 // Unique elements
Queue<T>                   // FIFO collection
Stack<T>                   // LIFO collection
Tuple<T1, T2>             // Pair of values
Task<T>                    // Async result
Nullable<T>                // Nullable value type (T?)
Func<T, TResult>          // Function delegate
Action<T>                  // Void delegate
```
