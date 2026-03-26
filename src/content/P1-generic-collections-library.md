# Project 1: Custom Generic Collections Library

*Difficulty: Medium — Estimated: 3-5 days — Category: CS Fundamentals*

---

## Project Overview

Build a fully tested generic collections library in C# from scratch — no standard library
collections used internally. You will implement seven core data structures, each backed by
your own low-level storage (arrays and node objects only). Every collection must implement
the relevant BCL interfaces so it can drop into any code that expects `IEnumerable<T>`,
`ICollection<T>`, or `IReadOnlyCollection<T>`.

**Data structures to implement:**

| Structure | Backing Store | Key Operation Complexity |
|---|---|---|
| `DynamicArray<T>` | Resizable `T[]` | Amortized O(1) append, O(1) index |
| `LinkedList<T>` | Doubly-linked nodes | O(1) prepend/append, O(n) search |
| `Stack<T>` | Your `DynamicArray<T>` | O(1) push/pop/peek |
| `Queue<T>` | Circular `T[]` buffer | O(1) enqueue/dequeue |
| `HashMap<TKey, TValue>` | Array of linked chains | Amortized O(1) get/put |
| `MinHeap<T>` | Array-backed binary heap | O(log n) insert/extract |
| `BST<T>` | Node-based binary tree | O(h) insert/search/delete |

Every public member must have XML doc comments. Every collection must document Big-O
complexity for each operation. The project ships with a comprehensive xUnit test suite and
a BenchmarkDotNet suite that compares your implementations against BCL equivalents.

---

## Learning Objectives

- **Internals of BCL collections**: Understand exactly how `List<T>`, `Dictionary<TKey,TValue>`, `PriorityQueue<T,T>`, and `SortedSet<T>` work under the hood by building your own.
- **Generic type constraints**: Use `where T : IComparable<T>`, `where T : IEquatable<T>`, `where TKey : notnull` to write type-safe, reusable code.
- **Interface implementation**: Implement `IEnumerable<T>`, `IEnumerator<T>`, `ICollection<T>`, `IReadOnlyCollection<T>`, and `IDisposable` correctly.
- **Iterator pattern**: Write custom enumerators using both `yield return` and manual `IEnumerator<T>` implementations; handle enumerator invalidation on collection modification.
- **Test-driven development**: Write tests first for edge cases, then implement to make them pass. Achieve >95% branch coverage.
- **Performance benchmarking**: Use BenchmarkDotNet to measure throughput and allocations; compare against BCL baselines.

---

## Prerequisites

Complete these lessons before starting:

| Lesson | Why |
|---|---|
| [Generics (05)](05-generics.md) | Type parameters, constraints, covariance/contravariance |
| [Interfaces (04)](04-interfaces.md) | IEnumerable, ICollection, explicit implementation |
| [Collections (10)](10-collections.md) | Understand what the BCL provides so you can replicate it |
| [Testing (20)](20-testing.md) | xUnit patterns, assertions, test organization |
| [Iterators and Yield (26)](26-iterators-and-yield.md) | yield return, custom enumerators |
| [Spans and Memory (25)](25-spans-and-memory.md) | Span<T> for bonus perf-oriented extensions |

---

## Architecture

```
GenericCollections/
├── GenericCollections.sln
├── src/
│   └── Collections.Core/
│       ├── Collections.Core.csproj
│       ├── DynamicArray.cs
│       ├── LinkedList.cs
│       ├── Stack.cs
│       ├── Queue.cs
│       ├── HashMap.cs
│       ├── MinHeap.cs
│       ├── BST.cs
│       └── Internal/
│           ├── LinkedListNode.cs
│           ├── HashMapEntry.cs
│           └── BSTNode.cs
├── tests/
│   └── Collections.Tests/
│       ├── Collections.Tests.csproj
│       ├── DynamicArrayTests.cs
│       ├── LinkedListTests.cs
│       ├── StackTests.cs
│       ├── QueueTests.cs
│       ├── HashMapTests.cs
│       ├── MinHeapTests.cs
│       └── BSTTests.cs
└── benchmarks/
    └── Collections.Benchmarks/
        ├── Collections.Benchmarks.csproj
        ├── DynamicArrayBenchmark.cs
        ├── HashMapBenchmark.cs
        └── HeapBenchmark.cs
```

**Project references:**
- `Collections.Tests` references `Collections.Core`
- `Collections.Benchmarks` references `Collections.Core`
- `Collections.Core` has zero external dependencies
- `Collections.Tests` depends on `xunit`, `xunit.runner.visualstudio`, `FluentAssertions`
- `Collections.Benchmarks` depends on `BenchmarkDotNet`

---

## Requirements

### Core (Must Have)

1. **DynamicArray&lt;T&gt;** — Resizable array with amortized O(1) `Add`, O(1) `this[int index]` getter/setter, `RemoveAt(int index)`, `Insert(int index, T item)`, `Contains(T item)`, `IndexOf(T item)`, `Clear()`. Implements `ICollection<T>` and `IEnumerable<T>`. Throws `ArgumentOutOfRangeException` on bad index.
2. **LinkedList&lt;T&gt;** — Doubly linked list with `AddFirst`, `AddLast`, `RemoveFirst`, `RemoveLast`, `Find(T item)`, `Remove(T item)`. Implements `ICollection<T>`, `IEnumerable<T>`. Exposes `First` and `Last` node properties.
3. **Stack&lt;T&gt;** — Backed by your `DynamicArray<T>`. Provides `Push`, `Pop`, `Peek`, `Count`, `IsEmpty`. Throws `InvalidOperationException` on pop/peek when empty.
4. **Queue&lt;T&gt;** — Circular buffer implementation. `Enqueue`, `Dequeue`, `Peek`, `Count`, `IsEmpty`. Automatically resizes when full.
5. **HashMap&lt;TKey, TValue&gt;** — Separate chaining with linked lists. `Add(key, value)`, `Remove(key)`, `TryGetValue(key, out value)`, indexer `this[TKey key]`, `ContainsKey`, `Keys`, `Values`. Load factor 0.75 triggers resize to next prime bucket count.
6. **Full xUnit test coverage** — Every public method tested with: empty, single, many elements, boundary conditions, exception cases.

### Extended (Should Have)

7. **MinHeap&lt;T&gt;** — Array-backed binary min-heap. `Insert(T item)`, `ExtractMin()`, `Peek()`, `Count`. Requires `T : IComparable<T>`. Supports `Heapify(IEnumerable<T>)` in O(n).
8. **BST&lt;T&gt;** — Binary search tree with `Insert`, `Delete` (all 3 cases), `Search`, `Min`, `Max`. Traversals: `InOrder()`, `PreOrder()`, `PostOrder()`, `LevelOrder()` — all returning `IEnumerable<T>`.
9. **XML doc comments** on every public type, method, property, and parameter.
10. **Big-O documentation** — Each method's XML doc includes `<remarks>` with time and space complexity.

### Stretch (Nice to Have)

11. BenchmarkDotNet suite comparing each collection against its BCL equivalent.
12. Thread-safe wrappers (`ConcurrentDynamicArray<T>`, etc.) using `ReaderWriterLockSlim`.
13. NuGet packaging with proper `.nuspec`, README, and semantic versioning.
14. `ReadOnlyDynamicArray<T>` wrapper implementing `IReadOnlyList<T>`.
15. `ObservableDynamicArray<T>` that raises events on add/remove (like `ObservableCollection<T>`).

---

## Technical Guidance

### DynamicArray — Amortized O(1) Append

Start with an internal `T[] _items` of capacity 4. When `Count == Capacity`, allocate a new
array of double the size and copy elements over. This gives amortized O(1) because the cost
of n insertions is n + n/2 + n/4 + ... = O(n), so each insertion averages O(1).

Think about: What should the initial capacity be? What happens if someone adds 1 million
items one at a time vs. calling a constructor with `capacity: 1_000_000`?

### Queue — Circular Buffer

Maintain `_head` and `_tail` indices into a fixed-size array. On `Enqueue`, place at
`_items[_tail]` and advance `_tail = (_tail + 1) % _items.Length`. On `Dequeue`, read from
`_items[_head]` and advance `_head`. When `Count == _items.Length`, resize (allocate new
array, copy from head to end then start to tail). The modular arithmetic is the key insight.

### HashMap — Separate Chaining

Maintain `Entry<TKey, TValue>[]` where each entry is the head of a singly linked chain.
To find a bucket: `Math.Abs(key.GetHashCode()) % _buckets.Length`. When
`Count / _buckets.Length > 0.75`, resize to the next prime number > 2x current size (primes
reduce clustering). Rehash every entry into the new bucket array.

Think about: Why primes? What happens with a bad `GetHashCode`? How does
`EqualityComparer<TKey>.Default` help?

### MinHeap — Bubble Up / Bubble Down

Store elements in a `T[]` where the children of index `i` are at `2i + 1` and `2i + 2`,
parent is at `(i - 1) / 2`. On `Insert`, add to end and bubble up (swap with parent while
smaller). On `ExtractMin`, swap root with last, shrink, and bubble down (swap with smallest
child while larger). `Heapify` builds in O(n) by calling bubble-down from the last
non-leaf node backward.

### Key BCL Interfaces

- `IEnumerable<T>` — requires `GetEnumerator()` returning `IEnumerator<T>`
- `IEnumerator<T>` — requires `Current`, `MoveNext()`, `Reset()`, `Dispose()`
- `ICollection<T>` — requires `Count`, `IsReadOnly`, `Add`, `Clear`, `Contains`, `CopyTo`, `Remove`
- Track a `_version` field; increment on every mutation. Enumerators capture the version at
  creation and throw `InvalidOperationException` if it changes during iteration.

---

## Step by Step Milestones

### Milestone 1: Project Scaffolding (30 min)
Create the solution with `dotnet new sln`, add three projects. Verify `dotnet build` and
`dotnet test` both pass with a single placeholder test. Set up `.editorconfig` and enable
nullable reference types.

### Milestone 2: DynamicArray<T> (3-4 hours)
Write tests first: Add 0, 1, 100, 10_000 items. Test indexer bounds. Test `Contains`,
`IndexOf`, `Remove`. Test that `foreach` works. Test enumerator invalidation. Then implement
to pass all tests.

### Milestone 3: LinkedList<T> (2-3 hours)
Test AddFirst/AddLast/RemoveFirst/RemoveLast/Find/Remove. Test enumeration forward.
Implement with a sentinel node pattern or explicit null checks for head/tail.

### Milestone 4: Stack<T> and Queue<T> (2-3 hours)
Stack is thin wrapper over DynamicArray — quick. Queue requires the circular buffer logic,
which is trickier. Test resize behavior specifically: enqueue 4 items (fills default buffer),
dequeue 2, enqueue 4 more — this forces the wrap-around copy on resize.

### Milestone 5: HashMap<TKey, TValue> (4-5 hours)
This is the hardest one. Start with a simple version that resizes at load factor. Test with
`int` keys first, then `string` keys, then custom objects with overridden
`GetHashCode`/`Equals`. Test that `Keys` and `Values` properties work and stay in sync.

### Milestone 6: MinHeap<T> (2-3 hours)
Test insert/extract ordering with known sequences. Test heapify with random arrays — extract
all and verify sorted order. Test with custom `IComparable<T>` types.

### Milestone 7: BST<T> (3-4 hours)
Test insert, search, delete (leaf, one child, two children). Test all four traversals against
known trees. Test degenerate case (sorted insert creating a linked list shape).

### Milestone 8: Polish and Benchmarks (2-3 hours)
Add XML docs everywhere. Run `dotnet format`. Write BenchmarkDotNet comparisons. Generate
benchmark report. Write README with results table.

---

## Testing Requirements

### Test Categories

Each collection needs tests in these categories:

```csharp
// 1. Empty collection behavior
[Fact]
public void Count_WhenEmpty_ReturnsZero() { ... }

[Fact]
public void Remove_WhenEmpty_ReturnsFalse() { ... }

// 2. Single element
[Fact]
public void Add_SingleItem_CountIsOne() { ... }

// 3. Many elements — verify ordering, correctness
[Fact]
public void Add_1000Items_AllRetrievable() { ... }

// 4. Boundary conditions — resize triggers
[Fact]
public void Add_ExceedsInitialCapacity_ResizesCorrectly() { ... }

// 5. Exception behavior
[Fact]
public void Indexer_NegativeIndex_ThrowsArgumentOutOfRange() { ... }

[Fact]
public void Pop_WhenEmpty_ThrowsInvalidOperation() { ... }

// 6. Enumerator invalidation
[Fact]
public void Enumerator_ModifiedDuringIteration_ThrowsInvalidOperation() { ... }

// 7. Performance / Big-O verification
[Fact]
public void Add_10000Items_CompletesUnderThreshold() { ... }
```

### Coverage Targets

- **Line coverage**: > 95%
- **Branch coverage**: > 90%
- **Mutation testing** (stretch): Use Stryker.NET to verify test quality

### Integration Tests

- Verify that `Stack<T>` correctly delegates to `DynamicArray<T>` (not just testing Stack in isolation).
- Verify that `HashMap<TKey, TValue>` works with types that have colliding hash codes.
- Verify LINQ interop: `myDynamicArray.Where(x => x > 5).ToList()` works because `IEnumerable<T>` is implemented.

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### DynamicArray&lt;T&gt; — Complete Implementation

```csharp
using System;
using System.Collections;
using System.Collections.Generic;

namespace Collections.Core;

/// <summary>
/// A resizable array-backed list that grows by doubling capacity.
/// Drop-in replacement for <see cref="List{T}"/>.
/// </summary>
/// <typeparam name="T">The type of elements stored.</typeparam>
public class DynamicArray<T> : ICollection<T>, IReadOnlyCollection<T>
{
    private const int DefaultCapacity = 4;
    private T[] _items;
    private int _count;
    private int _version;

    /// <summary>Creates an empty DynamicArray with default capacity (4).</summary>
    public DynamicArray() : this(DefaultCapacity) { }

    /// <summary>Creates an empty DynamicArray with the specified initial capacity.</summary>
    /// <param name="capacity">Initial capacity. Must be non-negative.</param>
    /// <exception cref="ArgumentOutOfRangeException">capacity is negative.</exception>
    public DynamicArray(int capacity)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(capacity);
        _items = capacity == 0 ? Array.Empty<T>() : new T[capacity];
    }

    /// <summary>Creates a DynamicArray populated with items from the given collection.</summary>
    public DynamicArray(IEnumerable<T> collection)
    {
        ArgumentNullException.ThrowIfNull(collection);
        if (collection is ICollection<T> c)
        {
            _items = new T[c.Count];
            c.CopyTo(_items, 0);
            _count = c.Count;
        }
        else
        {
            _items = new T[DefaultCapacity];
            foreach (var item in collection)
                Add(item);
        }
    }

    /// <summary>Number of elements currently stored.</summary>
    /// <remarks>Time: O(1). Space: O(1).</remarks>
    public int Count => _count;

    /// <summary>Current internal buffer capacity.</summary>
    public int Capacity => _items.Length;

    /// <inheritdoc />
    public bool IsReadOnly => false;

    /// <summary>Gets or sets the element at the specified index.</summary>
    /// <remarks>Time: O(1). Space: O(1).</remarks>
    /// <exception cref="ArgumentOutOfRangeException">index is out of range.</exception>
    public T this[int index]
    {
        get
        {
            if ((uint)index >= (uint)_count)
                throw new ArgumentOutOfRangeException(nameof(index));
            return _items[index];
        }
        set
        {
            if ((uint)index >= (uint)_count)
                throw new ArgumentOutOfRangeException(nameof(index));
            _items[index] = value;
            _version++;
        }
    }

    /// <summary>Adds an item to the end of the array.</summary>
    /// <remarks>Time: Amortized O(1). Space: O(n) on resize, O(1) otherwise.</remarks>
    public void Add(T item)
    {
        if (_count == _items.Length)
            Grow();
        _items[_count++] = item;
        _version++;
    }

    /// <summary>Inserts an item at the specified index, shifting subsequent elements right.</summary>
    /// <remarks>Time: O(n). Space: O(1) amortized.</remarks>
    public void Insert(int index, T item)
    {
        if ((uint)index > (uint)_count)
            throw new ArgumentOutOfRangeException(nameof(index));
        if (_count == _items.Length)
            Grow();
        if (index < _count)
            Array.Copy(_items, index, _items, index + 1, _count - index);
        _items[index] = item;
        _count++;
        _version++;
    }

    /// <summary>Removes the first occurrence of the specified item.</summary>
    /// <remarks>Time: O(n). Space: O(1).</remarks>
    /// <returns>true if the item was found and removed; false otherwise.</returns>
    public bool Remove(T item)
    {
        int index = IndexOf(item);
        if (index < 0) return false;
        RemoveAt(index);
        return true;
    }

    /// <summary>Removes the element at the specified index, shifting subsequent elements left.</summary>
    /// <remarks>Time: O(n). Space: O(1).</remarks>
    public void RemoveAt(int index)
    {
        if ((uint)index >= (uint)_count)
            throw new ArgumentOutOfRangeException(nameof(index));
        _count--;
        if (index < _count)
            Array.Copy(_items, index + 1, _items, index, _count - index);
        _items[_count] = default!;
        _version++;
    }

    /// <summary>Returns the zero-based index of the first occurrence of the item, or -1.</summary>
    /// <remarks>Time: O(n). Space: O(1).</remarks>
    public int IndexOf(T item)
    {
        var comparer = EqualityComparer<T>.Default;
        for (int i = 0; i < _count; i++)
        {
            if (comparer.Equals(_items[i], item))
                return i;
        }
        return -1;
    }

    /// <summary>Determines whether the array contains the specified item.</summary>
    /// <remarks>Time: O(n). Space: O(1).</remarks>
    public bool Contains(T item) => IndexOf(item) >= 0;

    /// <summary>Removes all elements and resets count to zero.</summary>
    /// <remarks>Time: O(n) for reference types (clears refs), O(1) for value types.</remarks>
    public void Clear()
    {
        if (RuntimeHelpers.IsReferenceOrContainsReferences<T>())
            Array.Clear(_items, 0, _count);
        _count = 0;
        _version++;
    }

    /// <inheritdoc />
    public void CopyTo(T[] array, int arrayIndex)
    {
        ArgumentNullException.ThrowIfNull(array);
        Array.Copy(_items, 0, array, arrayIndex, _count);
    }

    /// <summary>Returns an enumerator that iterates through the array.</summary>
    public Enumerator GetEnumerator() => new(this);

    IEnumerator<T> IEnumerable<T>.GetEnumerator() => GetEnumerator();
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    private void Grow()
    {
        int newCapacity = _items.Length == 0 ? DefaultCapacity : _items.Length * 2;
        var newArray = new T[newCapacity];
        Array.Copy(_items, newArray, _count);
        _items = newArray;
    }

    /// <summary>Enumerator for DynamicArray that detects modification during iteration.</summary>
    public struct Enumerator : IEnumerator<T>
    {
        private readonly DynamicArray<T> _array;
        private readonly int _version;
        private int _index;
        private T? _current;

        internal Enumerator(DynamicArray<T> array)
        {
            _array = array;
            _version = array._version;
            _index = -1;
            _current = default;
        }

        public readonly T Current => _current!;
        readonly object? IEnumerator.Current => Current;

        public bool MoveNext()
        {
            if (_version != _array._version)
                throw new InvalidOperationException(
                    "Collection was modified during enumeration.");

            if (++_index < _array._count)
            {
                _current = _array._items[_index];
                return true;
            }
            _current = default;
            return false;
        }

        public void Reset()
        {
            if (_version != _array._version)
                throw new InvalidOperationException(
                    "Collection was modified during enumeration.");
            _index = -1;
            _current = default;
        }

        public readonly void Dispose() { }
    }
}

// Helper — needed for Clear optimization
file static class RuntimeHelpers
{
    public static bool IsReferenceOrContainsReferences<T>() =>
        !typeof(T).IsValueType || System.Runtime.CompilerServices
            .RuntimeHelpers.IsReferenceOrContainsReferences<T>();
}
```

### HashMap&lt;TKey, TValue&gt; — Complete Implementation

```csharp
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace Collections.Core;

/// <summary>
/// Hash map using separate chaining for collision resolution.
/// Resizes when load factor exceeds 0.75.
/// </summary>
/// <typeparam name="TKey">Key type. Must be non-null.</typeparam>
/// <typeparam name="TValue">Value type.</typeparam>
public class HashMap<TKey, TValue> : IEnumerable<KeyValuePair<TKey, TValue>>
    where TKey : notnull
{
    private const double LoadFactorThreshold = 0.75;
    private const int DefaultCapacity = 17;

    private Entry?[] _buckets;
    private int _count;
    private int _version;
    private readonly IEqualityComparer<TKey> _comparer;

    /// <summary>A node in the separate chain.</summary>
    private sealed class Entry
    {
        public TKey Key;
        public TValue Value;
        public Entry? Next;
        public int HashCode;

        public Entry(TKey key, TValue value, int hashCode, Entry? next)
        {
            Key = key;
            Value = value;
            HashCode = hashCode;
            Next = next;
        }
    }

    /// <summary>Creates a HashMap with default capacity and comparer.</summary>
    public HashMap() : this(DefaultCapacity, null) { }

    /// <summary>Creates a HashMap with specified capacity and optional comparer.</summary>
    public HashMap(int capacity, IEqualityComparer<TKey>? comparer = null)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(capacity);
        _buckets = new Entry?[GetPrime(Math.Max(capacity, DefaultCapacity))];
        _comparer = comparer ?? EqualityComparer<TKey>.Default;
    }

    /// <summary>Number of key-value pairs stored.</summary>
    public int Count => _count;

    /// <summary>Gets or sets the value associated with the specified key.</summary>
    /// <remarks>Time: Average O(1), Worst O(n). Space: O(1).</remarks>
    /// <exception cref="KeyNotFoundException">Key not found on get.</exception>
    public TValue this[TKey key]
    {
        get
        {
            if (TryGetValue(key, out var value))
                return value;
            throw new KeyNotFoundException($"Key '{key}' not found.");
        }
        set => AddOrUpdate(key, value);
    }

    /// <summary>Collection of all keys in the map.</summary>
    public IEnumerable<TKey> Keys
    {
        get
        {
            int ver = _version;
            foreach (var bucket in _buckets)
            {
                var entry = bucket;
                while (entry != null)
                {
                    if (ver != _version)
                        throw new InvalidOperationException("Collection modified.");
                    yield return entry.Key;
                    entry = entry.Next;
                }
            }
        }
    }

    /// <summary>Collection of all values in the map.</summary>
    public IEnumerable<TValue> Values
    {
        get
        {
            int ver = _version;
            foreach (var bucket in _buckets)
            {
                var entry = bucket;
                while (entry != null)
                {
                    if (ver != _version)
                        throw new InvalidOperationException("Collection modified.");
                    yield return entry.Value;
                    entry = entry.Next;
                }
            }
        }
    }

    /// <summary>Adds a key-value pair. Throws if key already exists.</summary>
    /// <remarks>Time: Average O(1). Space: Amortized O(1).</remarks>
    /// <exception cref="ArgumentException">Key already exists.</exception>
    public void Add(TKey key, TValue value)
    {
        ArgumentNullException.ThrowIfNull(key);
        int hashCode = _comparer.GetHashCode(key) & 0x7FFFFFFF;
        int bucket = hashCode % _buckets.Length;

        for (var e = _buckets[bucket]; e != null; e = e.Next)
        {
            if (e.HashCode == hashCode && _comparer.Equals(e.Key, key))
                throw new ArgumentException($"Key '{key}' already exists.", nameof(key));
        }

        _buckets[bucket] = new Entry(key, value, hashCode, _buckets[bucket]);
        _count++;
        _version++;

        if ((double)_count / _buckets.Length > LoadFactorThreshold)
            Resize();
    }

    /// <summary>Adds or updates a key-value pair.</summary>
    public void AddOrUpdate(TKey key, TValue value)
    {
        ArgumentNullException.ThrowIfNull(key);
        int hashCode = _comparer.GetHashCode(key) & 0x7FFFFFFF;
        int bucket = hashCode % _buckets.Length;

        for (var e = _buckets[bucket]; e != null; e = e.Next)
        {
            if (e.HashCode == hashCode && _comparer.Equals(e.Key, key))
            {
                e.Value = value;
                _version++;
                return;
            }
        }

        _buckets[bucket] = new Entry(key, value, hashCode, _buckets[bucket]);
        _count++;
        _version++;

        if ((double)_count / _buckets.Length > LoadFactorThreshold)
            Resize();
    }

    /// <summary>Removes the entry with the specified key.</summary>
    /// <remarks>Time: Average O(1). Space: O(1).</remarks>
    /// <returns>true if the key was found and removed.</returns>
    public bool Remove(TKey key)
    {
        ArgumentNullException.ThrowIfNull(key);
        int hashCode = _comparer.GetHashCode(key) & 0x7FFFFFFF;
        int bucket = hashCode % _buckets.Length;

        Entry? prev = null;
        for (var e = _buckets[bucket]; e != null; prev = e, e = e.Next)
        {
            if (e.HashCode == hashCode && _comparer.Equals(e.Key, key))
            {
                if (prev == null)
                    _buckets[bucket] = e.Next;
                else
                    prev.Next = e.Next;
                _count--;
                _version++;
                return true;
            }
        }
        return false;
    }

    /// <summary>Tries to get the value associated with the key.</summary>
    /// <remarks>Time: Average O(1). Space: O(1).</remarks>
    public bool TryGetValue(TKey key, [MaybeNullWhen(false)] out TValue value)
    {
        ArgumentNullException.ThrowIfNull(key);
        int hashCode = _comparer.GetHashCode(key) & 0x7FFFFFFF;
        int bucket = hashCode % _buckets.Length;

        for (var e = _buckets[bucket]; e != null; e = e.Next)
        {
            if (e.HashCode == hashCode && _comparer.Equals(e.Key, key))
            {
                value = e.Value;
                return true;
            }
        }
        value = default;
        return false;
    }

    /// <summary>Determines whether the map contains the specified key.</summary>
    public bool ContainsKey(TKey key) => TryGetValue(key, out _);

    /// <summary>Removes all entries from the map.</summary>
    public void Clear()
    {
        Array.Clear(_buckets, 0, _buckets.Length);
        _count = 0;
        _version++;
    }

    public IEnumerator<KeyValuePair<TKey, TValue>> GetEnumerator()
    {
        int ver = _version;
        foreach (var bucket in _buckets)
        {
            var entry = bucket;
            while (entry != null)
            {
                if (ver != _version)
                    throw new InvalidOperationException("Collection modified.");
                yield return new KeyValuePair<TKey, TValue>(entry.Key, entry.Value);
                entry = entry.Next;
            }
        }
    }

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    private void Resize()
    {
        int newSize = GetPrime(_buckets.Length * 2);
        var newBuckets = new Entry?[newSize];

        foreach (var bucket in _buckets)
        {
            var entry = bucket;
            while (entry != null)
            {
                var next = entry.Next;
                int newBucket = entry.HashCode % newSize;
                entry.Next = newBuckets[newBucket];
                newBuckets[newBucket] = entry;
                entry = next;
            }
        }
        _buckets = newBuckets;
    }

    /// <summary>Returns the smallest prime >= min.</summary>
    private static int GetPrime(int min)
    {
        // Small set of primes for bucket sizing
        int[] primes =
        {
            17, 37, 79, 163, 331, 673, 1361, 2729, 5471, 10949,
            21911, 43853, 87719, 175447, 350899, 701819, 1403641,
            2807303, 5614657, 11229331, 22458671, 44917381
        };
        foreach (int p in primes)
        {
            if (p >= min) return p;
        }
        // Fallback: brute force primality for very large maps
        for (int candidate = min | 1; candidate < int.MaxValue; candidate += 2)
        {
            if (IsPrime(candidate)) return candidate;
        }
        return min;
    }

    private static bool IsPrime(int n)
    {
        if (n < 2) return false;
        if (n == 2 || n == 3) return true;
        if (n % 2 == 0 || n % 3 == 0) return false;
        for (int i = 5; (long)i * i <= n; i += 6)
        {
            if (n % i == 0 || n % (i + 2) == 0) return false;
        }
        return true;
    }
}
```

### MinHeap&lt;T&gt; — Complete Implementation

```csharp
using System;
using System.Collections;
using System.Collections.Generic;

namespace Collections.Core;

/// <summary>
/// Array-backed binary min-heap. The smallest element is always at the root.
/// </summary>
/// <typeparam name="T">Element type. Must implement IComparable&lt;T&gt;.</typeparam>
public class MinHeap<T> : IEnumerable<T> where T : IComparable<T>
{
    private const int DefaultCapacity = 16;
    private T[] _items;
    private int _count;
    private int _version;

    /// <summary>Creates an empty MinHeap.</summary>
    public MinHeap() : this(DefaultCapacity) { }

    /// <summary>Creates an empty MinHeap with specified initial capacity.</summary>
    public MinHeap(int capacity)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(capacity);
        _items = new T[Math.Max(capacity, 1)];
    }

    /// <summary>
    /// Creates a MinHeap from the given collection using O(n) heapify.
    /// </summary>
    /// <remarks>Time: O(n). Space: O(n).</remarks>
    public MinHeap(IEnumerable<T> collection)
    {
        ArgumentNullException.ThrowIfNull(collection);

        if (collection is ICollection<T> col)
        {
            _items = new T[Math.Max(col.Count, 1)];
            col.CopyTo(_items, 0);
            _count = col.Count;
        }
        else
        {
            _items = new T[DefaultCapacity];
            foreach (var item in collection)
            {
                if (_count == _items.Length)
                    Grow();
                _items[_count++] = item;
            }
        }

        // O(n) heapify: bubble down from last non-leaf to root
        for (int i = (_count / 2) - 1; i >= 0; i--)
            BubbleDown(i);
    }

    /// <summary>Number of elements in the heap.</summary>
    public int Count => _count;

    /// <summary>Whether the heap is empty.</summary>
    public bool IsEmpty => _count == 0;

    /// <summary>
    /// Inserts an item into the heap, maintaining the min-heap property.
    /// </summary>
    /// <remarks>Time: O(log n). Space: Amortized O(1).</remarks>
    public void Insert(T item)
    {
        if (_count == _items.Length)
            Grow();

        _items[_count] = item;
        BubbleUp(_count);
        _count++;
        _version++;
    }

    /// <summary>
    /// Returns the minimum element without removing it.
    /// </summary>
    /// <remarks>Time: O(1). Space: O(1).</remarks>
    /// <exception cref="InvalidOperationException">Heap is empty.</exception>
    public T Peek()
    {
        if (_count == 0)
            throw new InvalidOperationException("Heap is empty.");
        return _items[0];
    }

    /// <summary>
    /// Removes and returns the minimum element.
    /// </summary>
    /// <remarks>Time: O(log n). Space: O(1).</remarks>
    /// <exception cref="InvalidOperationException">Heap is empty.</exception>
    public T ExtractMin()
    {
        if (_count == 0)
            throw new InvalidOperationException("Heap is empty.");

        T min = _items[0];
        _count--;
        _items[0] = _items[_count];
        _items[_count] = default!;

        if (_count > 0)
            BubbleDown(0);

        _version++;
        return min;
    }

    /// <summary>Removes all elements from the heap.</summary>
    public void Clear()
    {
        Array.Clear(_items, 0, _count);
        _count = 0;
        _version++;
    }

    /// <summary>
    /// Returns the elements in heap order (not sorted).
    /// To get sorted order, extract all elements.
    /// </summary>
    public IEnumerator<T> GetEnumerator()
    {
        int ver = _version;
        for (int i = 0; i < _count; i++)
        {
            if (ver != _version)
                throw new InvalidOperationException("Collection modified.");
            yield return _items[i];
        }
    }

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    /// <summary>
    /// Returns all elements in sorted (ascending) order.
    /// This creates a copy and extracts from it — does not modify the original.
    /// </summary>
    /// <remarks>Time: O(n log n). Space: O(n).</remarks>
    public IEnumerable<T> InOrder()
    {
        var copy = new MinHeap<T>(_count);
        Array.Copy(_items, copy._items, _count);
        copy._count = _count;

        while (copy._count > 0)
            yield return copy.ExtractMin();
    }

    private void BubbleUp(int index)
    {
        T item = _items[index];
        while (index > 0)
        {
            int parent = (index - 1) / 2;
            if (item.CompareTo(_items[parent]) >= 0)
                break;
            _items[index] = _items[parent];
            index = parent;
        }
        _items[index] = item;
    }

    private void BubbleDown(int index)
    {
        T item = _items[index];
        int half = _count / 2; // last non-leaf + 1

        while (index < half)
        {
            int left = 2 * index + 1;
            int right = left + 1;
            int smallest = left;

            // Pick the smaller child
            if (right < _count && _items[right].CompareTo(_items[left]) < 0)
                smallest = right;

            if (item.CompareTo(_items[smallest]) <= 0)
                break;

            _items[index] = _items[smallest];
            index = smallest;
        }
        _items[index] = item;
    }

    private void Grow()
    {
        int newCapacity = _items.Length * 2;
        var newItems = new T[newCapacity];
        Array.Copy(_items, newItems, _count);
        _items = newItems;
    }
}
```

### Sample xUnit Tests

```csharp
using Collections.Core;
using FluentAssertions;
using Xunit;

namespace Collections.Tests;

public class DynamicArrayTests
{
    [Fact]
    public void NewArray_HasZeroCount()
    {
        var arr = new DynamicArray<int>();
        arr.Count.Should().Be(0);
    }

    [Fact]
    public void Add_SingleItem_CountIsOne()
    {
        var arr = new DynamicArray<int>();
        arr.Add(42);
        arr.Count.Should().Be(1);
        arr[0].Should().Be(42);
    }

    [Fact]
    public void Add_BeyondCapacity_ResizesCorrectly()
    {
        var arr = new DynamicArray<int>(2);
        arr.Add(1);
        arr.Add(2);
        arr.Add(3); // triggers resize
        arr.Count.Should().Be(3);
        arr[2].Should().Be(3);
    }

    [Fact]
    public void Indexer_OutOfRange_Throws()
    {
        var arr = new DynamicArray<int>();
        arr.Invoking(a => _ = a[0])
           .Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void Remove_ExistingItem_ReturnsTrue()
    {
        var arr = new DynamicArray<int> { 1, 2, 3 };
        arr.Remove(2).Should().BeTrue();
        arr.Count.Should().Be(2);
        arr.Contains(2).Should().BeFalse();
    }

    [Fact]
    public void Enumerator_ModifiedDuringIteration_Throws()
    {
        var arr = new DynamicArray<int> { 1, 2, 3 };
        Action act = () =>
        {
            foreach (var item in arr)
                arr.Add(99);
        };
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Foreach_YieldsAllElements()
    {
        var arr = new DynamicArray<int> { 10, 20, 30 };
        var result = new List<int>();
        foreach (var item in arr)
            result.Add(item);
        result.Should().Equal(10, 20, 30);
    }

    [Fact]
    public void LinqInterop_Works()
    {
        var arr = new DynamicArray<int> { 1, 2, 3, 4, 5 };
        var evens = arr.Where(x => x % 2 == 0).ToList();
        evens.Should().Equal(2, 4);
    }
}

public class HashMapTests
{
    [Fact]
    public void Add_And_Retrieve_SinglePair()
    {
        var map = new HashMap<string, int>();
        map.Add("hello", 42);
        map["hello"].Should().Be(42);
    }

    [Fact]
    public void Add_DuplicateKey_Throws()
    {
        var map = new HashMap<string, int>();
        map.Add("key", 1);
        map.Invoking(m => m.Add("key", 2))
           .Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Indexer_Set_UpdatesExisting()
    {
        var map = new HashMap<string, int>();
        map["key"] = 1;
        map["key"] = 2;
        map["key"].Should().Be(2);
        map.Count.Should().Be(1);
    }

    [Fact]
    public void Remove_ExistingKey_ReturnsTrue()
    {
        var map = new HashMap<string, int>();
        map.Add("a", 1);
        map.Remove("a").Should().BeTrue();
        map.ContainsKey("a").Should().BeFalse();
    }

    [Fact]
    public void ManyInserts_TriggersResize_AllRetrievable()
    {
        var map = new HashMap<int, string>();
        for (int i = 0; i < 1000; i++)
            map.Add(i, $"val{i}");

        map.Count.Should().Be(1000);
        for (int i = 0; i < 1000; i++)
            map[i].Should().Be($"val{i}");
    }
}

public class MinHeapTests
{
    [Fact]
    public void ExtractMin_ReturnsSortedOrder()
    {
        var heap = new MinHeap<int>();
        heap.Insert(5);
        heap.Insert(1);
        heap.Insert(3);
        heap.Insert(2);
        heap.Insert(4);

        var sorted = new List<int>();
        while (!heap.IsEmpty)
            sorted.Add(heap.ExtractMin());

        sorted.Should().Equal(1, 2, 3, 4, 5);
    }

    [Fact]
    public void Heapify_Constructor_BuildsValidHeap()
    {
        var data = new[] { 9, 4, 7, 1, 3, 8, 2 };
        var heap = new MinHeap<int>(data);

        heap.Peek().Should().Be(1);
        heap.Count.Should().Be(7);
    }

    [Fact]
    public void ExtractMin_WhenEmpty_Throws()
    {
        var heap = new MinHeap<int>();
        heap.Invoking(h => h.ExtractMin())
           .Should().Throw<InvalidOperationException>();
    }
}
```

</details>

---

## What to Show Off

### In Your Portfolio

- Link the GitHub repo with a polished README showing: project description, architecture diagram, Big-O table for all operations, BenchmarkDotNet results.
- Highlight that you built this from scratch with zero BCL collection dependencies.
- Show test coverage badge (use Coverlet + ReportGenerator).

### In Interviews

- **"Walk me through your HashMap implementation"** — Discuss hashing, collision resolution (separate chaining vs. open addressing), load factor, why prime bucket sizes reduce clustering, amortized O(1) analysis.
- **"How does your DynamicArray achieve amortized O(1) append?"** — Geometric growth, aggregate analysis showing n insertions cost O(n) total.
- **"What tradeoffs did you make?"** — Separate chaining uses more memory (node allocations) than open addressing but is simpler to implement and handles deletion cleanly. DynamicArray wastes up to 50% capacity but gives O(1) index access.
- **"How would you make this thread-safe?"** — Discuss `ReaderWriterLockSlim`, `ConcurrentDictionary` patterns, lock-free approaches with `Interlocked`.

### Key Talking Points for a DE Role

- "Understanding collection internals helps me choose the right data structure when building data pipelines — e.g., when to use a heap for top-K streaming vs. sorting."
- "The benchmarking suite taught me to measure before optimizing, which I apply to SQL query tuning and pipeline performance."

---

## Stretch Goals

1. **AVL Tree** — Extend BST with self-balancing rotations. Compare search performance of unbalanced BST vs. AVL for sorted input.
2. **Skip List** — Probabilistic alternative to balanced BSTs. Implement with configurable probability.
3. **Bloom Filter** — Probabilistic set membership with configurable false positive rate. Great for DE interviews.
4. **LRU Cache** — Combine your HashMap and LinkedList into an O(1) get/put LRU cache, matching LeetCode #146.
5. **Immutable Collections** — Build `ImmutableDynamicArray<T>` that returns new instances on modification (functional programming style).
