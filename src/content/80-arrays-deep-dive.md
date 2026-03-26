# Arrays in C# — Deep Dive

## How Arrays Work in Memory

Arrays are the most fundamental data structure in C#. When you declare an array, the CLR allocates a **contiguous block of memory** on the managed heap. This means every element sits right next to the previous one in memory.

![Array memory layout — stack reference pointing to contiguous heap allocation](/diagrams/array-memory.svg)

### Why Contiguous Allocation Matters — Cache Locality

Modern CPUs don't fetch one byte at a time. They load entire **cache lines** (typically 64 bytes). Because array elements are packed together, accessing `arr[0]` likely brings `arr[1]` through `arr[15]` (for `int[]`) into L1 cache automatically.

**CPU Cache Line (64 bytes)**

When the CPU loads `arr[0]`, it fetches an entire 64-byte cache line into L1 cache. For an `int[]`, this means elements `arr[0]` through `arr[15]` are loaded in a single fetch. Sequential array access is therefore extremely fast — the data is already in cache.

This gives arrays a **massive** performance advantage when iterating sequentially compared to linked structures like `LinkedList<T>`.

---

## Array vs List\<T\> vs Span\<T\>

| Feature | `T[]` | `List<T>` | `Span<T>` |
|---|---|---|---|
| **Underlying storage** | Contiguous heap block | Wraps a `T[]` internally | Stack-only view over memory |
| **Resizable** | No (fixed at creation) | Yes (doubles capacity) | No |
| **Heap allocated** | Yes | Yes (backing array) | No (stack only, ref struct) |
| **Bounds checking** | Yes (JIT may elide) | Yes | Yes |
| **Can slice without copy** | No | No (`GetRange` copies) | Yes (`Slice`) |
| **Async-safe** | Yes | Yes | No (cannot cross `await`) |
| **Best for** | Fixed-size, hot paths | General-purpose lists | Zero-alloc slicing |

```csharp
// Array — fixed size
int[] arr = new int[5];

// List<T> — dynamic, backed by array internally
List<int> list = new List<int> { 1, 2, 3 };
list.Add(4); // may trigger resize + copy

// Span<T> — zero-allocation slice
Span<int> span = arr.AsSpan(1, 3); // view of arr[1..4], no copy
```

---

## Time Complexity of Array Operations

| Operation | Time Complexity | Notes |
|---|---|---|
| Access by index `arr[i]` | **O(1)** | Pointer arithmetic: base + i * sizeof(T) |
| Search (unsorted) | **O(n)** | Must scan every element |
| Search (sorted) | **O(log n)** | Binary search |
| Insert at end (fixed array) | **O(1)** | If slot exists |
| Insert at position | **O(n)** | Must shift elements right |
| Delete at position | **O(n)** | Must shift elements left |
| `Array.Sort` | **O(n log n)** | IntroSort (Quicksort + HeapSort + InsertionSort) |
| `Array.BinarySearch` | **O(log n)** | Array must be sorted first |
| `Array.Copy` | **O(n)** | Block memory copy |
| `Array.Reverse` | **O(n)** | In-place swap |

---

## Built-in Array Methods

```csharp
int[] nums = { 5, 3, 8, 1, 9, 2 };

// Sort in-place
Array.Sort(nums); // [1, 2, 3, 5, 8, 9]

// Binary search (array MUST be sorted)
int index = Array.BinarySearch(nums, 5); // returns 3

// Reverse
Array.Reverse(nums); // [9, 8, 5, 3, 2, 1]

// Copy
int[] copy = new int[6];
Array.Copy(nums, copy, nums.Length);

// Fill (available in .NET 6+)
Array.Fill(copy, 0); // [0, 0, 0, 0, 0, 0]

// Exists / Find / FindAll
bool hasEven = Array.Exists(nums, x => x % 2 == 0);
int firstEven = Array.Find(nums, x => x % 2 == 0);
int[] allEvens = Array.FindAll(nums, x => x % 2 == 0);
```

> **Warning:** `Array.BinarySearch` on an unsorted array gives **undefined results**. Always sort first or use a different search strategy.

---

## LINQ on Arrays

```csharp
int[] nums = { 4, 2, 7, 1, 9, 3 };

int sum = nums.Sum();                    // 26
int max = nums.Max();                    // 9
double avg = nums.Average();             // 4.333...
int[] sorted = nums.OrderBy(x => x).ToArray();
int[] distinct = nums.Distinct().ToArray();
bool any = nums.Any(x => x > 5);        // true
int count = nums.Count(x => x % 2 == 0); // 2
```

> **Tip:** LINQ is expressive but allocates iterators. In hot loops or competitive programming, prefer `for` loops and manual logic for performance.

---

## Memory Layout: Value Types vs Reference Types

> int[] nums = {10, 20, 30};
> Heap:
> 10 | 20 | 30 | values stored inline
> string[] words = {"hi", "bye"};
> Heap:
> ref1 | ref2 | references (pointers) stored inline
> "hi" | "bye" | actual string objects elsewhere on heap


> **Note:** For value types (`int`, `double`, `struct`), elements live directly in the array. For reference types (`string`, `class`), the array holds pointers and the objects live separately on the heap.

---

## Practice Problems

### Problem 1: Contains Duplicate (LeetCode 217)

**Problem:** Given an integer array `nums`, return `true` if any value appears at least twice.

**Approach:** Sort the array, then check adjacent elements. If any two neighbors are equal, we have a duplicate. Alternatively, use a `HashSet` (covered in lesson 81), but here we use a pure array approach.

```csharp
public class Solution
{
    public bool ContainsDuplicate(int[] nums)
    {
        Array.Sort(nums); // O(n log n)

        for (int i = 1; i < nums.Length; i++)
        {
            if (nums[i] == nums[i - 1])
                return true;
        }

        return false;
    }
}
```

**Complexity:**
- **Time:** O(n log n) — dominated by the sort
- **Space:** O(1) — sorting is in-place (ignoring sort's internal stack)

---

### Problem 2: Two Sum (LeetCode 1) — Brute Force Array Approach

**Problem:** Given an array `nums` and a target, return indices of two numbers that add up to the target.

**Approach:** Check every pair `(i, j)` where `i < j`. If `nums[i] + nums[j] == target`, return the pair. This is the naive array-only approach with no extra data structures.

```csharp
public class Solution
{
    public int[] TwoSum(int[] nums, int target)
    {
        for (int i = 0; i < nums.Length; i++)
        {
            for (int j = i + 1; j < nums.Length; j++)
            {
                if (nums[i] + nums[j] == target)
                    return new int[] { i, j };
            }
        }

        throw new ArgumentException("No two sum solution");
    }
}
```

**Complexity:**
- **Time:** O(n^2) — every pair examined
- **Space:** O(1) — no extra data structures

> **Tip:** The O(n) solution using a hash map is covered in lesson 81. Interviewers will expect you to optimize beyond brute force.

---

### Problem 3: Maximum Subarray — Kadane's Algorithm (LeetCode 53)

**Problem:** Find the contiguous subarray with the largest sum.

**Approach (Kadane's Algorithm):** Track the running sum. At each element, decide: is it better to extend the current subarray, or start fresh from this element? Keep a global max.

> nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]
> Index: | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
> curr: | -2 | 1 | -2 | 4 | 3 | 5 | 6 | 1 | 5
> best: | -2 | 1 | 1 | 4 | 4 | 5 | 6 | 6 | 6
> Answer = 6
> Subarray: [4, -1, 2, 1]


```csharp
public class Solution
{
    public int MaxSubArray(int[] nums)
    {
        int currentSum = nums[0];
        int maxSum = nums[0];

        for (int i = 1; i < nums.Length; i++)
        {
            // Either extend existing subarray or start new one
            currentSum = Math.Max(nums[i], currentSum + nums[i]);
            maxSum = Math.Max(maxSum, currentSum);
        }

        return maxSum;
    }
}
```

**Complexity:**
- **Time:** O(n) — single pass
- **Space:** O(1) — two variables

---

## Common Mistakes

1. **Off-by-one errors** — Array indices run `0` to `Length - 1`. Accessing `arr[arr.Length]` throws `IndexOutOfRangeException`.
2. **Forgetting arrays are reference types** — Assigning `b = a` does NOT copy. Both point to the same array.
3. **Sorting then using original indices** — `Array.Sort` reorders in-place. If you need original indices, sort an index array or use `List<(int val, int idx)>`.
4. **Using `==` on arrays** — This checks reference equality, not content. Use `SequenceEqual()` or loop comparison.

---

## Interview Tips

- Always clarify: is the array **sorted**? This unlocks binary search and two pointers.
- Ask about **duplicates** — they change the approach significantly.
- Ask about **constraints** — if `n <= 10^4`, O(n^2) may be fine. If `n <= 10^6`, you need O(n) or O(n log n).
- Mention **cache locality** when comparing arrays to linked lists — interviewers love hearing you understand hardware.
- Know that `Array.Sort` uses **IntroSort** in .NET — a hybrid of quicksort, heapsort, and insertion sort.

---

## Quiz

<details>
<summary><strong>Q1:</strong> What is the time complexity of accessing an element by index in an array?</summary>

**O(1)** — The address is computed as `base_address + index * sizeof(element)`, which is constant time pointer arithmetic.
</details>

<details>
<summary><strong>Q2:</strong> Why are arrays faster to iterate than linked lists, even though both are O(n)?</summary>

**Cache locality.** Array elements are stored contiguously in memory, so when the CPU loads one element into cache, neighboring elements come along for free. Linked list nodes are scattered across the heap, causing frequent cache misses.
</details>

<details>
<summary><strong>Q3:</strong> What happens if you call <code>Array.BinarySearch</code> on an unsorted array?</summary>

The result is **undefined** (unpredictable). Binary search assumes sorted order. It may return a wrong index, a negative value, or appear to work by coincidence. Always sort first.
</details>

<details>
<summary><strong>Q4:</strong> What sorting algorithm does <code>Array.Sort</code> use in .NET?</summary>

**IntroSort** — a hybrid that starts with quicksort, switches to heapsort if recursion depth exceeds a threshold, and uses insertion sort for small partitions. Average and worst case are both O(n log n).
</details>

<details>
<summary><strong>Q5:</strong> In Kadane's algorithm, what is the key decision at each step?</summary>

At each element, decide: **extend the current subarray** (add this element to the running sum) **or start a new subarray** from this element. Formally: `currentSum = Math.Max(nums[i], currentSum + nums[i])`.
</details>
