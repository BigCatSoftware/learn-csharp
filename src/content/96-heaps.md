# Heaps and Priority Queues

## What Is a Heap?

A **heap** is a complete binary tree stored in an array where every parent satisfies the **heap property**:

- **Min-Heap:** parent <= children (root is the minimum)
- **Max-Heap:** parent >= children (root is the maximum)

### Array-to-Tree Mapping

```
Array: [1, 3, 5, 7, 9, 8, 6]

Tree representation (min-heap):

            1            index 0
          /   \
         3     5         index 1, 2
        / \   / \
       7   9 8   6       index 3, 4, 5, 6

Parent of i     = (i - 1) / 2
Left child of i = 2 * i + 1
Right child of i= 2 * i + 2
```

> **Key Insight:** A heap is NOT fully sorted. It only guarantees the root is the min (or max). This partial ordering is what makes heap operations O(log n) instead of O(n log n).

---

## Heap Operations

| Operation   | Time      | Description                        |
|-------------|----------|------------------------------------|
| Peek        | O(1)     | Return root element                |
| Insert      | O(log n) | Add to end, bubble up              |
| ExtractMin  | O(log n) | Remove root, replace with last, bubble down |
| Heapify     | O(n)     | Build heap from unsorted array     |

### Bubble Up (after insert)

```
Insert 2 into [1, 3, 5, 7, 9, 8, 6]:

Step 1: Add to end          Step 2: Bubble up (2 < 5)    Step 3: Done (2 > 1)
     1                           1                             1
   /   \                       /   \                         /   \
  3     5          =>         3     2           =>          3     2
 / \   / \                   / \   / \                     / \   / \
7   9 8   6                 7   9 8   6                   7   9 8   6
             \                        \
              2                        5
```

### Bubble Down (after extract)

```
Extract min from [1, 3, 2, 7, 9, 8, 5]:

Step 1: Replace root with last    Step 2: Bubble down (5 > 2)   Step 3: Done
         5                                 2                            2
       /   \                             /   \                        /   \
      3     2              =>           3     5          =>          3     5
     / \   /                           / \   /                      / \   /
    7   9 8                           7   9 8                      7   9 8
```

---

## Min-Heap From Scratch in C#

```csharp
public class MinHeap<T> where T : IComparable<T>
{
    private readonly List<T> _data = new();

    public int Count => _data.Count;
    public bool IsEmpty => _data.Count == 0;

    // Peek at the minimum element — O(1)
    public T Peek()
    {
        if (IsEmpty) throw new InvalidOperationException("Heap is empty");
        return _data[0];
    }

    // Insert a new element — O(log n)
    public void Push(T item)
    {
        _data.Add(item);
        BubbleUp(_data.Count - 1);
    }

    // Remove and return the minimum — O(log n)
    public T Pop()
    {
        if (IsEmpty) throw new InvalidOperationException("Heap is empty");

        T min = _data[0];
        int last = _data.Count - 1;
        _data[0] = _data[last];
        _data.RemoveAt(last);

        if (!IsEmpty)
            BubbleDown(0);

        return min;
    }

    private void BubbleUp(int i)
    {
        while (i > 0)
        {
            int parent = (i - 1) / 2;
            if (_data[i].CompareTo(_data[parent]) >= 0)
                break;
            (_data[i], _data[parent]) = (_data[parent], _data[i]);
            i = parent;
        }
    }

    private void BubbleDown(int i)
    {
        int n = _data.Count;
        while (true)
        {
            int smallest = i;
            int left = 2 * i + 1;
            int right = 2 * i + 2;

            if (left < n && _data[left].CompareTo(_data[smallest]) < 0)
                smallest = left;
            if (right < n && _data[right].CompareTo(_data[smallest]) < 0)
                smallest = right;

            if (smallest == i) break;

            (_data[i], _data[smallest]) = (_data[smallest], _data[i]);
            i = smallest;
        }
    }
}
```

---

## .NET Built-in: PriorityQueue<TElement, TPriority>

Available since .NET 6, `PriorityQueue` is a min-heap by default.

```csharp
// Min-heap by default (lowest priority dequeued first)
var pq = new PriorityQueue<string, int>();

pq.Enqueue("low priority", 10);
pq.Enqueue("high priority", 1);
pq.Enqueue("medium", 5);

Console.WriteLine(pq.Dequeue()); // "high priority"
Console.WriteLine(pq.Dequeue()); // "medium"

// For max-heap behavior, use a custom comparer
var maxPq = new PriorityQueue<string, int>(Comparer<int>.Create((a, b) => b - a));
```

> **Note:** `PriorityQueue` does NOT support updating priorities or checking membership efficiently. For those needs, consider `SortedSet<T>`.

## SortedSet as an Alternative

```csharp
// SortedSet maintains sorted order — useful when you need min AND max
var set = new SortedSet<(int val, int id)>();

set.Add((5, 0));
set.Add((1, 1));
set.Add((3, 2));

var min = set.Min; // (1, 1)
var max = set.Max; // (5, 0)
set.Remove(min);   // efficient removal
```

---

## Practice Problems

### Problem 1: Kth Largest Element in an Array (LeetCode 215)

**Problem:** Find the kth largest element in an unsorted array.

**Approach:** Maintain a min-heap of size k. After processing all elements, the root is the kth largest.

```csharp
public class Solution
{
    public int FindKthLargest(int[] nums, int k)
    {
        // Min-heap of size k
        var pq = new PriorityQueue<int, int>();

        foreach (int num in nums)
        {
            pq.Enqueue(num, num);

            // If heap exceeds size k, remove the smallest
            if (pq.Count > k)
                pq.Dequeue();
        }

        // The root is the kth largest
        return pq.Peek();
    }
}
```

**Complexity:** O(n log k) time, O(k) space.

---

### Problem 2: Top K Frequent Elements (LeetCode 347)

**Problem:** Given an integer array, return the k most frequent elements.

**Approach:** Count frequencies with a dictionary, then use a min-heap of size k keyed by frequency.

```csharp
public class Solution
{
    public int[] TopKFrequent(int[] nums, int k)
    {
        // Step 1: Count frequencies
        var freq = new Dictionary<int, int>();
        foreach (int n in nums)
            freq[n] = freq.GetValueOrDefault(n) + 1;

        // Step 2: Min-heap of size k (priority = frequency)
        var pq = new PriorityQueue<int, int>();

        foreach (var (num, count) in freq)
        {
            pq.Enqueue(num, count);
            if (pq.Count > k)
                pq.Dequeue(); // remove least frequent
        }

        // Step 3: Extract results
        var result = new int[k];
        for (int i = 0; i < k; i++)
            result[i] = pq.Dequeue();

        return result;
    }
}
```

**Complexity:** O(n log k) time, O(n) space for the frequency map.

---

### Problem 3: Find Median from Data Stream (LeetCode 295)

**Problem:** Design a data structure that supports adding integers and finding the median in O(log n) time.

**Approach:** Use two heaps — a max-heap for the lower half and a min-heap for the upper half. Balance them so they differ in size by at most 1.

```
Numbers added: 1, 5, 3, 8, 2

maxHeap (lower half)    minHeap (upper half)
      [2, 1]                 [3, 5, 8]

Median = minHeap.Peek() = 3  (odd total, upper half has more)
```

```csharp
public class MedianFinder
{
    // Max-heap for the lower half (negate values for max-heap behavior)
    private readonly PriorityQueue<int, int> _maxHeap = new();
    // Min-heap for the upper half
    private readonly PriorityQueue<int, int> _minHeap = new();

    public void AddNum(int num)
    {
        // Always add to max-heap first (negate for max-heap)
        _maxHeap.Enqueue(num, -num);

        // Move the max of lower half to upper half
        int moved = _maxHeap.Dequeue();
        _minHeap.Enqueue(moved, moved);

        // Balance: maxHeap can have at most 1 fewer than minHeap
        if (_minHeap.Count > _maxHeap.Count + 1)
        {
            int val = _minHeap.Dequeue();
            _maxHeap.Enqueue(val, -val);
        }
    }

    public double FindMedian()
    {
        if (_minHeap.Count > _maxHeap.Count)
            return _minHeap.Peek();

        return (_minHeap.Peek() + _maxHeap.Peek()) / 2.0;
    }
}
```

**Complexity:** AddNum O(log n), FindMedian O(1). Space O(n).

---

### Problem 4: Merge K Sorted Lists (LeetCode 23)

**Problem:** Merge k sorted linked lists into one sorted linked list.

**Approach:** Use a min-heap to always pick the smallest head among all lists.

```csharp
public class Solution
{
    public ListNode? MergeKLists(ListNode?[] lists)
    {
        var pq = new PriorityQueue<ListNode, int>();

        // Add the head of each non-null list
        foreach (var head in lists)
            if (head is not null)
                pq.Enqueue(head, head.val);

        var dummy = new ListNode(0);
        var current = dummy;

        while (pq.Count > 0)
        {
            var smallest = pq.Dequeue();
            current.next = smallest;
            current = current.next;

            // If this list has more nodes, add the next one
            if (smallest.next is not null)
                pq.Enqueue(smallest.next, smallest.next.val);
        }

        return dummy.next;
    }
}
```

**Complexity:** O(N log k) time where N = total nodes, k = number of lists. O(k) space for the heap.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting .NET PriorityQueue is a min-heap | For max-heap, negate priorities or use a reverse comparer |
| Off-by-one in parent/child index formulas | Parent = (i-1)/2, Left = 2i+1, Right = 2i+2 (0-indexed) |
| Not handling empty heap in Pop/Peek | Always check `IsEmpty` or `Count > 0` first |
| Using SortedSet with duplicate keys | SortedSet ignores duplicates — add a unique tie-breaker (e.g., an ID) |
| Forgetting to rebalance in MedianFinder | Always ensure the two heaps differ in size by at most 1 after each add |

---

## Interview Tips

- Heaps are the go-to when you need "the k smallest/largest" or "the next minimum/maximum."
- Know that building a heap from an array is O(n), not O(n log n) — interviewers love this detail.
- For "merge k sorted" anything, think heap immediately.
- The two-heap pattern (median finder) appears in many streaming/online algorithm questions.
- Mention `PriorityQueue<T,P>` for .NET 6+ but be ready to implement from scratch.

---

## Quiz

<details>
<summary>1. What is the time complexity of building a heap from an unsorted array of n elements?</summary>

**O(n)** — this is called "heapify." Although inserting n elements one-by-one is O(n log n), the bottom-up heapify algorithm is O(n) because most nodes are near the bottom and need very little sifting.
</details>

<details>
<summary>2. Given a min-heap as an array [1, 3, 5, 7, 9, 8, 6], what is the parent of the element at index 5?</summary>

Parent index = (5 - 1) / 2 = **2**. The element at index 2 is **5**, so 5 is the parent of 8.
</details>

<details>
<summary>3. Why do we negate priorities when simulating a max-heap with .NET's PriorityQueue?</summary>

.NET's `PriorityQueue` is a min-heap (lowest priority dequeued first). By negating values, the largest original value gets the most negative (smallest) priority and is dequeued first, effectively creating max-heap behavior.
</details>

<details>
<summary>4. In the "Find Median" problem, why do we need two heaps instead of one?</summary>

A single heap only gives efficient access to one extreme (min or max). Two heaps let us maintain the lower and upper halves of the data separately, so the median sits at the boundary and can be retrieved in O(1).
</details>

<details>
<summary>5. When would you use a SortedSet over a PriorityQueue in C#?</summary>

Use `SortedSet` when you need: (a) access to both min and max, (b) efficient removal of arbitrary elements, (c) membership checks, or (d) ordered iteration. `PriorityQueue` is better for simple min/max extraction.
</details>
