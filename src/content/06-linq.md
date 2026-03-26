# LINQ

*Language Integrated Query — querying data in C#*

LINQ (Language Integrated Query) is one of C#'s most powerful features. It provides a unified syntax for querying and transforming data from any source — collections, databases, XML, JSON, and more.

## Basic LINQ Operations

```csharp
var numbers = new List<int> { 5, 3, 8, 1, 9, 2, 7, 4, 6 };

// Filter
var evens = numbers.Where(n => n % 2 == 0);        // 8, 2, 4, 6

// Transform
var doubled = numbers.Select(n => n * 2);           // 10, 6, 16, ...

// Sort
var sorted = numbers.OrderBy(n => n);               // 1, 2, 3, 4, ...
var desc = numbers.OrderByDescending(n => n);       // 9, 8, 7, 6, ...

// Aggregate
int sum = numbers.Sum();                            // 45
double avg = numbers.Average();                     // 5.0
int max = numbers.Max();                            // 9

// Take/Skip
var firstThree = numbers.Take(3);                   // 5, 3, 8
var skipThree = numbers.Skip(3);                    // 1, 9, 2, 7, 4, 6
```

## Method Syntax vs Query Syntax

C# offers two ways to write LINQ:

```csharp
var people = new List<Person>
{
    new("Alice", 30, "Engineering"),
    new("Bob", 25, "Marketing"),
    new("Charlie", 35, "Engineering"),
    new("Diana", 28, "Marketing"),
    new("Eve", 32, "Engineering"),
};

// Method syntax (fluent) - most common
var engineers = people
    .Where(p => p.Department == "Engineering")
    .OrderBy(p => p.Age)
    .Select(p => new { p.Name, p.Age });

// Query syntax (SQL-like) - sometimes more readable
var engineers2 = from p in people
                 where p.Department == "Engineering"
                 orderby p.Age
                 select new { p.Name, p.Age };
```

> **Tip:** Most C# developers prefer method syntax for simple queries and query syntax for complex joins. Both compile to the same code — use whichever is more readable.

## Chaining Operations

LINQ methods can be chained together fluently:

```csharp
var result = students
    .Where(s => s.Grade >= 90)
    .OrderByDescending(s => s.Grade)
    .ThenBy(s => s.LastName)
    .Select(s => new
    {
        FullName = $"{s.FirstName} {s.LastName}",
        s.Grade,
        Honor = s.Grade >= 95 ? "High Honors" : "Honors"
    })
    .Take(10)
    .ToList();
```

## Grouping

```csharp
var byDepartment = people
    .GroupBy(p => p.Department)
    .Select(g => new
    {
        Department = g.Key,
        Count = g.Count(),
        AverageAge = g.Average(p => p.Age),
        Members = g.OrderBy(p => p.Name).ToList()
    });

foreach (var dept in byDepartment)
{
    Console.WriteLine($"{dept.Department}: {dept.Count} people, avg age {dept.AverageAge:F1}");
    foreach (var person in dept.Members)
        Console.WriteLine($"  - {person.Name}");
}
```

## Joins

```csharp
var orders = new List<Order>
{
    new(1, 101, "Laptop"),
    new(2, 102, "Mouse"),
    new(3, 101, "Keyboard"),
};

var customers = new List<Customer>
{
    new(101, "Alice"),
    new(102, "Bob"),
};

// Join
var orderDetails = orders
    .Join(customers,
        order => order.CustomerId,
        customer => customer.Id,
        (order, customer) => new
        {
            customer.Name,
            order.Product
        });

// Output: Alice - Laptop, Bob - Mouse, Alice - Keyboard
```

## Deferred Execution

> **Important:** LINQ queries use **deferred execution** — the query isn't executed until you iterate over the results. This means the data source is queried each time you enumerate.

```csharp
var numbers = new List<int> { 1, 2, 3 };

// Query is NOT executed here
var query = numbers.Where(n => n > 1);

numbers.Add(4); // Modify the source

// Query executes NOW - includes 4!
foreach (var n in query)
    Console.WriteLine(n); // 2, 3, 4

// Force immediate execution with ToList(), ToArray(), etc.
var snapshot = numbers.Where(n => n > 1).ToList();
numbers.Add(5);
// snapshot still has just 2, 3, 4
```

## Useful LINQ Methods

| Method | Description |
|--------|-------------|
| `Any()` | Returns true if any element matches |
| `All()` | Returns true if all elements match |
| `First()` / `FirstOrDefault()` | Get first matching element |
| `Single()` / `SingleOrDefault()` | Get exactly one matching element |
| `Count()` | Count of elements |
| `Distinct()` | Remove duplicates |
| `SelectMany()` | Flatten nested collections |
| `Zip()` | Combine two sequences element-wise |
| `Aggregate()` | Custom accumulation |
| `Chunk()` | Split into fixed-size groups (C# 10+) |

> **Caution:** `First()` and `Single()` throw exceptions if no element matches. Always prefer `FirstOrDefault()` and `SingleOrDefault()` unless you're certain the element exists — or use them with a predicate and handle the default case.
