# Tour of C#

*A high-level overview of the C# programming language*

C# (pronounced "See Sharp") is a modern, object-oriented, type-safe programming language. C# enables developers to build many types of secure and robust applications that run in .NET. C# has its roots in the C family of languages and will be immediately familiar to C, C++, Java, and JavaScript programmers.

## Hello World

The "Hello, World" program is traditionally used to introduce a programming language. Here it is in C#:

```csharp
Console.WriteLine("Hello, World!");
```

The `Console.WriteLine` line uses the `Console` class from the `System` namespace. Starting with C# 10 and .NET 6, you can use **top-level statements** — meaning you don't need a `Main` method or namespace wrapper for simple programs.

The traditional form looks like this:

```csharp
using System;

namespace HelloWorld
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello, World!");
        }
    }
}
```

## Types and Variables

C# is a **strongly typed** language. Every variable and constant has a type, as does every expression that evaluates to a value. There are two kinds of types in C#:

- **Value types** — directly contain their data (`int`, `double`, `bool`, `struct`, `enum`)
- **Reference types** — store references to their data (`class`, `interface`, `delegate`, `string`, `object`, arrays)

```csharp
// Value types
int count = 42;
double price = 19.99;
bool isActive = true;
char letter = 'A';

// Reference types
string name = "C# Developer";
int[] numbers = { 1, 2, 3, 4, 5 };
object obj = "I can hold anything";
```

> **Tip:** Use `var` when the type is obvious from the right side of the assignment. It makes your code cleaner without sacrificing readability.

```csharp
var message = "Hello";          // string
var items = new List<int>();    // List<int>
var lookup = new Dictionary<string, int>(); // obvious from context
```

## Program Structure

The key organizational concepts in C# are:

| Concept | Description |
|---------|-------------|
| **Programs** | The entry point of your application |
| **Namespaces** | Organize types into logical groups |
| **Types** | Classes, structs, interfaces, enums, delegates |
| **Members** | Fields, methods, properties, events |
| **Assemblies** | Compiled units of deployment (.dll or .exe) |

Programs declare types, which contain members and can be organized into namespaces. Classes, structs, and interfaces are examples of types. Fields, methods, properties, and events are examples of members.

> **Note:** C# programs can reference other assemblies via NuGet packages or project references. The .NET runtime provides a large standard library of types organized into namespaces.

## Why C#?

C# offers many compelling features:

1. **Type safety** catches errors at compile time
2. **Garbage collection** automatically manages memory
3. **Exception handling** provides structured error handling
4. **LINQ** gives powerful data querying capabilities
5. **Async/await** simplifies asynchronous programming
6. **Pattern matching** enables concise conditional logic
7. **Cross-platform** runs on Windows, Linux, and macOS via .NET

> **Important:** C# is continuously evolving. Each new version adds features that make the language more expressive and developer-friendly while maintaining backward compatibility.
