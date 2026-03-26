# Queue — Theory and Implementation

## What Is a Queue?

A **queue** is a linear data structure that follows the **FIFO** (First In, First Out) principle. The first element added is the first one removed — like a line at a ticket counter.

**Circular Queue Buffer**

A circular queue uses an array with `head` and `tail` pointers that wrap around:

- `Enqueue` → write at `tail`, advance `tail = (tail + 1) % capacity`
- `Dequeue` → read at `head`, advance `head = (head + 1) % capacity`
- **Full** → `(tail + 1) % capacity == head`
- **Empty** → `head == tail`

When the tail reaches the end of the array, it wraps to index 0 — reusing space freed by dequeue operations.

> **Key insight:** Elements enter at the **rear** and leave from the **front**. No cutting in line.

---

## Core Operations

| Operation  | Description                  | Time  | Space |
|------------|------------------------------|-------|-------|
| `Enqueue`  | Add element to the rear      | O(1)* | O(1)  |
| `Dequeue`  | Remove and return front      | O(1)  | O(1)  |
| `Peek`     | View front without removing  | O(1)  | O(1)  |
| `IsEmpty`  | Check if queue is empty      | O(1)  | O(1)  |
| `Count`    | Number of elements           | O(1)  | O(1)  |

*Amortised O(1) for array-backed queues.

---

## Queue\<T\> in C#

```csharp
var queue = new Queue<int>();

queue.Enqueue(10);
queue.Enqueue(20);
queue.Enqueue(30);

Console.WriteLine(queue.Peek());     // 10 (front)
Console.WriteLine(queue.Dequeue());  // 10
Console.WriteLine(queue.Count);      // 2

// Safe variants
if (queue.TryDequeue(out int val))
    Console.WriteLine(val);          // 20

if (queue.TryPeek(out int front))
    Console.WriteLine(front);        // 30
```

> **Callout:** Internally `Queue<T>` uses a **circular buffer** (array with head/tail pointers). It resizes by doubling when full.

---

## Circular Queue — How It Works

A naive array queue wastes space at the front after dequeues. A **circular queue** wraps around using modular arithmetic.

> Capacity = 6, | Count = 4, | head = 2, | tail = 0
> Index: | 0 | 1 | 2 | 3 | 4 | 5
> A | B | C | D
> tail | head
> After Enqueue(E): | tail moves to index 1
> Index: | 0 | 1 | 2 | 3 | 4 | 5
> E | A | B | C | D
> tail | head


---

## Implement Circular Queue from Scratch

```csharp
public class CircularQueue<T>
{
    private T[] _items;
    private int _head;     // index of the front element
    private int _tail;     // index of the next empty slot at rear
    private int _count;

    public CircularQueue(int capacity = 4)
    {
        _items = new T[capacity];
        _head = 0;
        _tail = 0;
        _count = 0;
    }

    public int Count => _count;
    public bool IsEmpty => _count == 0;
    public bool IsFull => _count == _items.Length;

    public void Enqueue(T item)
    {
        if (IsFull)
            Resize(_items.Length * 2);

        _items[_tail] = item;
        _tail = (_tail + 1) % _items.Length;   // wrap around
        _count++;
    }

    public T Dequeue()
    {
        if (IsEmpty)
            throw new InvalidOperationException("Queue is empty.");

        T item = _items[_head];
        _items[_head] = default!;              // avoid memory leak
        _head = (_head + 1) % _items.Length;   // wrap around
        _count--;

        if (_count > 0 && _count == _items.Length / 4)
            Resize(_items.Length / 2);

        return item;
    }

    public T Peek()
    {
        if (IsEmpty)
            throw new InvalidOperationException("Queue is empty.");
        return _items[_head];
    }

    private void Resize(int newCapacity)
    {
        var copy = new T[newCapacity];
        // Copy elements in order starting from head
        for (int i = 0; i < _count; i++)
            copy[i] = _items[(_head + i) % _items.Length];

        _items = copy;
        _head = 0;
        _tail = _count;
    }
}
```

---

## PriorityQueue\<TElement, TPriority\> (.NET 6+)

A **priority queue** dequeues the element with the *lowest* priority value first (min-heap).

```csharp
var pq = new PriorityQueue<string, int>();

pq.Enqueue("Low priority task", 10);
pq.Enqueue("Critical task", 1);
pq.Enqueue("Medium task", 5);

Console.WriteLine(pq.Dequeue());  // "Critical task"  (priority 1)
Console.WriteLine(pq.Dequeue());  // "Medium task"    (priority 5)
Console.WriteLine(pq.Dequeue());  // "Low priority task" (priority 10)
```

| Operation     | Time       |
|---------------|------------|
| `Enqueue`     | O(log n)   |
| `Dequeue`     | O(log n)   |
| `Peek`        | O(1)       |
| `EnqueueDequeue` | O(log n) — more efficient than separate calls |

> **Callout:** .NET's `PriorityQueue` is a **min-heap**. For max-heap behaviour, negate the priority or use a custom `IComparer<T>`.

---

## Deque with LinkedList\<T\>

A **deque** (double-ended queue) supports insertion and removal at both ends. C# has no dedicated `Deque<T>`, but `LinkedList<T>` serves the purpose:

```csharp
var deque = new LinkedList<int>();

// Add to front and back
deque.AddFirst(10);    // front
deque.AddLast(20);     // back
deque.AddFirst(5);     // new front

// Remove from front and back
int front = deque.First!.Value;   // 5
deque.RemoveFirst();

int back = deque.Last!.Value;     // 20
deque.RemoveLast();

// Remaining: [10]
```

All four operations (`AddFirst`, `AddLast`, `RemoveFirst`, `RemoveLast`) are **O(1)**.

---

## Practice Problems

### Problem 1 — Implement Queue Using Two Stacks (LeetCode 232)

**Statement:** Implement a FIFO queue using only two stacks. Support `Push`, `Pop`, `Peek`, and `Empty`.

**Approach:** Use an *input* stack for pushes and an *output* stack for pops. When the output stack is empty, pour everything from input to output (reversing order = FIFO).

```csharp
public class MyQueue
{
    private readonly Stack<int> _input = new();
    private readonly Stack<int> _output = new();

    // Push to the input stack
    public void Push(int x) => _input.Push(x);

    // Pop from output stack; refill from input if empty
    public int Pop()
    {
        EnsureOutput();
        return _output.Pop();
    }

    public int Peek()
    {
        EnsureOutput();
        return _output.Peek();
    }

    public bool Empty() => _input.Count == 0 && _output.Count == 0;

    private void EnsureOutput()
    {
        if (_output.Count == 0)
        {
            // Transfer all items — reverses the order
            while (_input.Count > 0)
                _output.Push(_input.Pop());
        }
    }
}
```

> Push(1), Push(2), Push(3), then Pop():
> _input | _output | After EnsureOutput:
> _input | _output
> 1 | top (front of queue)
> Pop() returns 1 ✓


**Complexity:** Amortised O(1) per operation — each element is moved at most once. Space O(n).
**Edge cases:** Interleaved push/pop, pop on empty queue.

---

### Problem 2 — Sliding Window Maximum (LeetCode 239)

**Statement:** Given an array `nums` and sliding window size `k`, return the max value in each window as it slides from left to right.

**Approach:** Use a **monotonic deque** (decreasing). The front always holds the index of the current window's maximum. Remove from back if a new element is larger; remove from front if it falls outside the window.

```csharp
public int[] MaxSlidingWindow(int[] nums, int k)
{
    int n = nums.Length;
    int[] result = new int[n - k + 1];
    var deque = new LinkedList<int>();  // stores indices

    for (int i = 0; i < n; i++)
    {
        // Remove indices outside the window
        if (deque.Count > 0 && deque.First!.Value <= i - k)
            deque.RemoveFirst();

        // Remove from back while current element is larger
        while (deque.Count > 0 && nums[deque.Last!.Value] <= nums[i])
            deque.RemoveLast();

        deque.AddLast(i);

        // Window is fully formed once i >= k - 1
        if (i >= k - 1)
            result[i - k + 1] = nums[deque.First!.Value];
    }

    return result;
}
```

**Complexity:** Time O(n) — each element enters and leaves the deque at most once. Space O(k).
**Edge cases:** `k = 1` (answer is the array itself), `k = n` (single window), all elements equal.

---

### Problem 3 — Design Circular Queue (LeetCode 622)

**Statement:** Design a circular queue with a fixed capacity supporting: `EnQueue`, `DeQueue`, `Front`, `Rear`, `IsEmpty`, `IsFull`.

**Approach:** Use a fixed-size array with `head`, `count` tracking. Compute tail from `(head + count - 1) % capacity`.

```csharp
public class MyCircularQueue
{
    private readonly int[] _data;
    private int _head;
    private int _count;

    public MyCircularQueue(int k)
    {
        _data = new int[k];
        _head = 0;
        _count = 0;
    }

    public bool EnQueue(int value)
    {
        if (IsFull()) return false;

        // Insert at tail position
        int tail = (_head + _count) % _data.Length;
        _data[tail] = value;
        _count++;
        return true;
    }

    public bool DeQueue()
    {
        if (IsEmpty()) return false;

        _head = (_head + 1) % _data.Length;
        _count--;
        return true;
    }

    public int Front() => IsEmpty() ? -1 : _data[_head];

    public int Rear()
    {
        if (IsEmpty()) return -1;
        int tail = (_head + _count - 1) % _data.Length;
        return _data[tail];
    }

    public bool IsEmpty() => _count == 0;
    public bool IsFull() => _count == _data.Length;
}
```

**Complexity:** All operations O(1) time, O(k) space.
**Edge cases:** Enqueue when full (return false), dequeue when empty, wrap-around indexing.

---

## Common Mistakes

1. **Off-by-one in circular indexing** — always use `% capacity`, never `% count`.
2. **Confusing `head` and `tail`** — `head` is where you dequeue, `tail` is where you enqueue.
3. **Forgetting to check empty/full** — dequeue on empty and enqueue on full must be handled.
4. **Using `List<T>.RemoveAt(0)` as a queue** — this is O(n). Use `Queue<T>` or `LinkedList<T>`.
5. **PriorityQueue ordering** — .NET's is a min-heap; forgetting this leads to reversed results.

---

## Interview Tips

- If the problem involves **processing in order of arrival**, think queue (BFS, task scheduling).
- **BFS on trees and graphs** always uses a queue — never a stack (that would be DFS).
- "Implement X using Y" problems (queue from stacks, stack from queues) test your understanding of both structures.
- For **sliding window** problems with max/min queries, reach for a monotonic deque.
- Know the difference: `Queue<T>` = FIFO, `Stack<T>` = LIFO, `PriorityQueue<T,P>` = priority-ordered.

---

## Quiz

<details>
<summary>1. What is the key difference between a stack and a queue?</summary>

A **stack** is LIFO (Last In, First Out) — the most recent element comes out first. A **queue** is FIFO (First In, First Out) — the oldest element comes out first.
</details>

<details>
<summary>2. Why is a circular buffer better than a plain array for implementing a queue?</summary>

With a plain array, dequeuing from the front leaves wasted space that can never be reclaimed without shifting all elements (O(n)). A circular buffer reuses the vacated space at the front by wrapping the tail around, keeping all operations O(1).
</details>

<details>
<summary>3. In the two-stack queue, why is the amortised cost O(1) even though transferring is O(n)?</summary>

Each element is transferred from the input stack to the output stack **exactly once** over its lifetime. So across n operations, the total transfer work is O(n), making the amortised cost per operation O(1).
</details>

<details>
<summary>4. What is the time complexity of Enqueue and Dequeue on .NET's PriorityQueue?</summary>

Both are **O(log n)** because the underlying min-heap must sift elements up or down to maintain the heap property.
</details>

<details>
<summary>5. When would you use a deque instead of a standard queue?</summary>

When you need to add or remove elements from **both ends** efficiently. Common examples include the sliding window maximum problem (monotonic deque), palindrome checking, and work-stealing schedulers.
</details>
