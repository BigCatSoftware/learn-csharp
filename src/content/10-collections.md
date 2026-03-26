# Collections

*Data structures in C#*

C# provides a rich set of collection types in `System.Collections.Generic`. Choosing the right collection can dramatically impact your application's performance and readability.

## List\<T\>

The most commonly used collection — a dynamic array:

```csharp
var fruits = new List<string> { "Apple", "Banana", "Cherry" };

fruits.Add("Date");
fruits.AddRange(new[] { "Elderberry", "Fig" });
fruits.Insert(1, "Avocado");

fruits.Remove("Banana");
fruits.RemoveAt(0);       // Remove first
fruits.RemoveAll(f => f.StartsWith("E"));

bool hasCherry = fruits.Contains("Cherry");  // true
int index = fruits.IndexOf("Cherry");        // fast lookup by index
var sorted = fruits.OrderBy(f => f).ToList();

// List comprehension style with LINQ
var lengths = fruits.Select(f => (f, f.Length)).ToList();
```

> **Tip:** If you know the approximate size upfront, use `new List<T>(capacity)` to avoid repeated internal array resizing.

## Dictionary\<TKey, TValue\>

Key-value pairs with O(1) lookup:

```csharp
var scores = new Dictionary<string, int>
{
    ["Alice"] = 95,
    ["Bob"] = 87,
    ["Charlie"] = 92
};

// Safe access
if (scores.TryGetValue("Alice", out int aliceScore))
    Console.WriteLine($"Alice: {aliceScore}");

// Add or update
scores["Diana"] = 88;  // Add
scores["Bob"] = 90;    // Update

// Iterate
foreach (var (name, score) in scores)
    Console.WriteLine($"{name}: {score}");

// Useful operations
bool exists = scores.ContainsKey("Eve");
var topScorers = scores.Where(kv => kv.Value >= 90)
                       .Select(kv => kv.Key);
```

## HashSet\<T\>

Unique elements with O(1) Contains check:

```csharp
var tags = new HashSet<string> { "csharp", "dotnet", "programming" };

tags.Add("csharp");     // Returns false - already exists
tags.Add("tutorial");   // Returns true - added

// Set operations
var otherTags = new HashSet<string> { "csharp", "tutorial", "beginner" };

tags.UnionWith(otherTags);        // All tags combined
tags.IntersectWith(otherTags);    // Only common tags
tags.ExceptWith(otherTags);       // Tags not in other
tags.IsSubsetOf(otherTags);       // Check subset
```

> **Note:** Use `HashSet<T>` whenever you need to check membership frequently or ensure uniqueness. It's significantly faster than `List<T>.Contains()` for large collections.

## Queue\<T\> and Stack\<T\>

```csharp
// Queue - FIFO (First In, First Out)
var queue = new Queue<string>();
queue.Enqueue("First");
queue.Enqueue("Second");
queue.Enqueue("Third");
string next = queue.Dequeue();   // "First"
string peek = queue.Peek();     // "Second" (doesn't remove)

// Stack - LIFO (Last In, First Out)
var stack = new Stack<string>();
stack.Push("Bottom");
stack.Push("Middle");
stack.Push("Top");
string top = stack.Pop();       // "Top"
string peekStack = stack.Peek(); // "Middle"

// PriorityQueue (.NET 6+)
var pq = new PriorityQueue<string, int>();
pq.Enqueue("Low priority", 3);
pq.Enqueue("High priority", 1);
pq.Enqueue("Medium priority", 2);
string highest = pq.Dequeue();  // "High priority"
```

## Immutable Collections

For thread-safe, unchangeable collections:

```csharp
using System.Collections.Immutable;

var list = ImmutableList.Create(1, 2, 3);
var newList = list.Add(4);      // Returns NEW list
// list still has [1, 2, 3]
// newList has [1, 2, 3, 4]

var dict = ImmutableDictionary<string, int>.Empty
    .Add("one", 1)
    .Add("two", 2);

var builder = ImmutableList.CreateBuilder<int>();
builder.Add(1);
builder.Add(2);
builder.Add(3);
var immutable = builder.ToImmutable();
```

## Choosing the Right Collection

| Need | Collection | Complexity |
|------|-----------|------------|
| Ordered, index access | `List<T>` | O(1) access, O(n) search |
| Key-value lookup | `Dictionary<K,V>` | O(1) average |
| Unique elements | `HashSet<T>` | O(1) contains |
| Sorted unique | `SortedSet<T>` | O(log n) |
| Sorted key-value | `SortedDictionary<K,V>` | O(log n) |
| FIFO | `Queue<T>` | O(1) enqueue/dequeue |
| LIFO | `Stack<T>` | O(1) push/pop |
| Priority ordering | `PriorityQueue<T,P>` | O(log n) |
| Thread-safe | `ConcurrentDictionary` | O(1) average |
| Never changes | `ImmutableList<T>` | O(log n) |

> **Important:** Always program against interfaces (`IList<T>`, `IReadOnlyList<T>`, `IDictionary<K,V>`) in method parameters and return types. This gives callers flexibility in what collection type they pass.
