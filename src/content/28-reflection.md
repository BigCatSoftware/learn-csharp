# Reflection

Reflection is the ability of a program to inspect and interact with its own structure at runtime. Through the `System.Reflection` namespace, you can discover types, read metadata, invoke methods, access properties, and create instances — all without knowing the types at compile time.

## Getting Type Information

Every object in .NET has a `Type` that describes it. You can obtain it in several ways.

```csharp
// From an instance
string name = "Hello";
Type t1 = name.GetType(); // System.String

// From a type directly
Type t2 = typeof(string); // System.String

// From a fully qualified name
Type? t3 = Type.GetType("System.String");

// Comparing types
Console.WriteLine(t1 == t2); // True
```

## Inspecting Members

Once you have a `Type`, you can enumerate its methods, properties, fields, constructors, and events.

```csharp
Type type = typeof(List<int>);

// Get all public methods
MethodInfo[] methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance);
foreach (MethodInfo method in methods)
    Console.WriteLine($"{method.ReturnType.Name} {method.Name}({string.Join(", ",
        method.GetParameters().Select(p => $"{p.ParameterType.Name} {p.Name}"))})");

// Get all public properties
PropertyInfo[] properties = type.GetProperties();
foreach (PropertyInfo prop in properties)
    Console.WriteLine($"{prop.PropertyType.Name} {prop.Name} " +
        $"[get: {prop.CanRead}, set: {prop.CanWrite}]");
```

## BindingFlags

`BindingFlags` control which members are returned. You almost always need to combine flags.

| Flag | Meaning |
|---|---|
| `Public` | Include public members |
| `NonPublic` | Include private/protected/internal members |
| `Instance` | Include instance members |
| `Static` | Include static members |
| `DeclaredOnly` | Exclude inherited members |
| `FlattenHierarchy` | Include inherited static members |

```csharp
// Get private instance fields
FieldInfo[] privateFields = type.GetFields(
    BindingFlags.NonPublic | BindingFlags.Instance);

// Get all static methods including private
MethodInfo[] staticMethods = type.GetMethods(
    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
```

> **Warning:** Accessing private members via reflection bypasses encapsulation. Use it for debugging, testing, or framework code — not as a regular design pattern.

## Creating Instances Dynamically

`Activator.CreateInstance` lets you instantiate types at runtime.

```csharp
// With a parameterless constructor
object? instance = Activator.CreateInstance(typeof(StringBuilder));
Console.WriteLine(instance?.GetType().Name); // StringBuilder

// With constructor parameters
object? list = Activator.CreateInstance(
    typeof(List<int>),
    new object[] { 100 }); // capacity = 100

// Generic types
Type openType = typeof(Dictionary<,>);
Type closedType = openType.MakeGenericType(typeof(string), typeof(int));
object? dict = Activator.CreateInstance(closedType);
Console.WriteLine(dict?.GetType()); // Dictionary`2[String,Int32]
```

## Invoking Methods Dynamically

```csharp
public class Calculator
{
    public int Add(int a, int b) => a + b;
    public int Multiply(int a, int b) => a * b;
}

// Invoke a method by name
var calc = new Calculator();
Type calcType = calc.GetType();

MethodInfo? addMethod = calcType.GetMethod("Add");
object? result = addMethod?.Invoke(calc, new object[] { 3, 4 });
Console.WriteLine(result); // 7

// Invoke dynamically based on user input
string operation = "Multiply";
MethodInfo? method = calcType.GetMethod(operation);
object? dynamicResult = method?.Invoke(calc, new object[] { 5, 6 });
Console.WriteLine(dynamicResult); // 30
```

## Reading and Setting Properties

```csharp
public class Person
{
    public string Name { get; set; } = "";
    public int Age { get; set; }
}

var person = new Person { Name = "Alice", Age = 30 };
Type personType = typeof(Person);

// Read a property value
PropertyInfo? nameProp = personType.GetProperty("Name");
string? name = nameProp?.GetValue(person) as string;
Console.WriteLine(name); // Alice

// Set a property value
PropertyInfo? ageProp = personType.GetProperty("Age");
ageProp?.SetValue(person, 35);
Console.WriteLine(person.Age); // 35
```

## Reading Custom Attributes

Attributes are metadata attached to code elements. Reflection is the primary way to read them at runtime.

```csharp
[AttributeUsage(AttributeTargets.Property)]
public class MaxLengthAttribute : Attribute
{
    public int Length { get; }
    public MaxLengthAttribute(int length) => Length = length;
}

public class UserInput
{
    [MaxLength(50)]
    public string Username { get; set; } = "";

    [MaxLength(200)]
    public string Bio { get; set; } = "";
}

// Read attributes at runtime
foreach (PropertyInfo prop in typeof(UserInput).GetProperties())
{
    var attr = prop.GetCustomAttribute<MaxLengthAttribute>();
    if (attr is not null)
        Console.WriteLine($"{prop.Name}: max {attr.Length} characters");
}
// Output:
// Username: max 50 characters
// Bio: max 200 characters
```

## Practical Example: Simple Plugin System

Reflection enables plugin architectures where you load and instantiate types from external assemblies.

```csharp
public interface IPlugin
{
    string Name { get; }
    void Execute();
}

public class PluginLoader
{
    public List<IPlugin> LoadPlugins(string directory)
    {
        var plugins = new List<IPlugin>();

        foreach (string dll in Directory.GetFiles(directory, "*.dll"))
        {
            Assembly assembly = Assembly.LoadFrom(dll);

            IEnumerable<Type> pluginTypes = assembly.GetTypes()
                .Where(t => typeof(IPlugin).IsAssignableFrom(t)
                         && !t.IsInterface
                         && !t.IsAbstract);

            foreach (Type pluginType in pluginTypes)
            {
                if (Activator.CreateInstance(pluginType) is IPlugin plugin)
                    plugins.Add(plugin);
            }
        }

        return plugins;
    }
}

// Usage
var loader = new PluginLoader();
foreach (IPlugin plugin in loader.LoadPlugins("/app/plugins"))
{
    Console.WriteLine($"Running plugin: {plugin.Name}");
    plugin.Execute();
}
```

## Practical Example: Simple Object Mapper

```csharp
public static class SimpleMapper
{
    public static TDest Map<TSource, TDest>(TSource source)
        where TDest : new()
    {
        var dest = new TDest();

        PropertyInfo[] sourceProps = typeof(TSource).GetProperties(
            BindingFlags.Public | BindingFlags.Instance);
        PropertyInfo[] destProps = typeof(TDest).GetProperties(
            BindingFlags.Public | BindingFlags.Instance);

        foreach (PropertyInfo sourceProp in sourceProps)
        {
            PropertyInfo? destProp = destProps.FirstOrDefault(
                p => p.Name == sourceProp.Name
                  && p.PropertyType == sourceProp.PropertyType
                  && p.CanWrite);

            destProp?.SetValue(dest, sourceProp.GetValue(source));
        }

        return dest;
    }
}

// Usage
public record UserEntity(string Name, int Age, string Email);
public class UserDto { public string Name { get; set; } = ""; public int Age { get; set; } }

var entity = new UserEntity("Alice", 30, "alice@example.com");
var dto = SimpleMapper.Map<UserEntity, UserDto>(entity);
Console.WriteLine($"{dto.Name}, {dto.Age}"); // Alice, 30
```

## Practical Example: Dependency Injection Container

At its core, a DI container uses reflection to resolve dependencies.

```csharp
public class MiniContainer
{
    private readonly Dictionary<Type, Type> _registrations = new();

    public void Register<TInterface, TImplementation>()
        where TImplementation : TInterface
    {
        _registrations[typeof(TInterface)] = typeof(TImplementation);
    }

    public T Resolve<T>() => (T)Resolve(typeof(T));

    private object Resolve(Type type)
    {
        if (_registrations.TryGetValue(type, out Type? impl))
            type = impl;

        ConstructorInfo? ctor = type.GetConstructors().OrderByDescending(
            c => c.GetParameters().Length).FirstOrDefault()
            ?? throw new InvalidOperationException(
                $"No public constructor for {type.Name}");

        // Recursively resolve constructor parameters
        object[] args = ctor.GetParameters()
            .Select(p => Resolve(p.ParameterType))
            .ToArray();

        return ctor.Invoke(args);
    }
}

// Usage
var container = new MiniContainer();
container.Register<ILogger, ConsoleLogger>();
container.Register<IUserRepository, SqlUserRepository>();
container.Register<IUserService, UserService>();

var service = container.Resolve<IUserService>();
// Automatically resolves ILogger and IUserRepository for UserService's constructor
```

> **Note:** Real DI containers (Microsoft.Extensions.DependencyInjection, Autofac) are far more sophisticated, but this shows the fundamental mechanism.

## Assembly Scanning

```csharp
// Find all types in the current assembly that implement a given interface
Assembly currentAssembly = Assembly.GetExecutingAssembly();

IEnumerable<Type> handlers = currentAssembly.GetTypes()
    .Where(t => t.IsClass && !t.IsAbstract)
    .Where(t => t.GetInterfaces().Any(
        i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IHandler<>)));

foreach (Type handler in handlers)
{
    Type messageType = handler.GetInterfaces()
        .First(i => i.GetGenericTypeDefinition() == typeof(IHandler<>))
        .GetGenericArguments()[0];

    Console.WriteLine($"{handler.Name} handles {messageType.Name}");
}
```

## Performance Considerations

Reflection is slow compared to direct method calls. The cost comes from runtime type checks, security verification, and boxing of value types.

| Operation | Relative Cost |
|---|---|
| Direct method call | 1x (baseline) |
| Cached `MethodInfo.Invoke` | ~50-100x |
| `Activator.CreateInstance` | ~10-50x |
| `PropertyInfo.GetValue` | ~50-100x |
| Compiled expression tree | ~1-3x |
| Source generator (compile time) | 0x (no runtime cost) |

> **Tip:** If you need reflection in a hot path, cache the `MethodInfo`/`PropertyInfo` objects. Better yet, compile a delegate using expression trees or use source generators to eliminate runtime reflection entirely.

### Caching Reflection Results

```csharp
// BAD: Looks up the method every time
void InvokeSlow(object target, string methodName)
{
    target.GetType().GetMethod(methodName)?.Invoke(target, null);
}

// GOOD: Cache the MethodInfo
private static readonly ConcurrentDictionary<(Type, string), MethodInfo?> _cache = new();

void InvokeFast(object target, string methodName)
{
    var key = (target.GetType(), methodName);
    MethodInfo? method = _cache.GetOrAdd(key,
        k => k.Item1.GetMethod(k.Item2));
    method?.Invoke(target, null);
}
```

## Alternatives to Reflection

| Approach | When to Use |
|---|---|
| **Source generators** | Generate code at compile time; zero runtime overhead |
| **Expression trees** | Build and compile delegates dynamically; near-native speed |
| **Generic constraints** | When type information is available at compile time |
| **`dynamic` keyword** | Quick-and-dirty late binding (uses DLR, still has overhead) |

## Key Takeaways

1. Reflection lets you inspect types, invoke methods, and create instances at runtime.
2. It powers plugin systems, serializers, ORMs, DI containers, and test frameworks.
3. `BindingFlags` control which members are visible to reflection queries.
4. Always cache `MethodInfo`/`PropertyInfo` when used in performance-sensitive code.
5. Prefer source generators or expression trees when you need the flexibility of reflection without the runtime cost.
6. Accessing private members via reflection should be reserved for framework-level code, not application logic.
