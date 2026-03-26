# Linked Lists — Theory and Implementation

## What Is a Linked List?

A linked list is a linear data structure where each element (node) contains data and a reference (pointer) to the next node. Unlike arrays, elements are **not stored contiguously** in memory.

```
Singly Linked List:

  Head
   |
   v
 +------+---+    +------+---+    +------+---+    +------+------+
 | Data | *-+--->| Data | *-+--->| Data | *-+--->| Data | null |
 +------+---+    +------+---+    +------+---+    +------+------+
   10               20              30              40

 Each node: [value | next pointer]
```

```
Doubly Linked List:

  Head                                                      Tail
   |                                                         |
   v                                                         v
 +------+------+---+    +---+------+---+    +---+------+------+
 | null | Data | *-+--->| *-+ Data | *-+--->| *-+ Data | null |
 +------+------+---+    +---+------+---+    +---+------+------+
                   <---+-+            <---+-+
 Each node: [prev pointer | value | next pointer]
```

---

## Singly Linked List Node in C\#

```csharp
public class ListNode<T>
{
    public T Value;
    public ListNode<T>? Next;

    public ListNode(T value, ListNode<T>? next = null)
    {
        Value = value;
        Next = next;
    }
}
```

---

## Full Linked List Implementation from Scratch

```csharp
public class SinglyLinkedList<T>
{
    private ListNode<T>? _head;
    private int _count;

    public int Count => _count;

    // O(1) — add to the front
    public void AddFirst(T value)
    {
        _head = new ListNode<T>(value, _head);
        _count++;
    }

    // O(n) — add to the end
    public void AddLast(T value)
    {
        var newNode = new ListNode<T>(value);
        if (_head is null)
        {
            _head = newNode;
        }
        else
        {
            var current = _head;
            while (current.Next is not null)
                current = current.Next;
            current.Next = newNode;
        }
        _count++;
    }

    // O(n) — insert at arbitrary index
    public void InsertAt(int index, T value)
    {
        if (index < 0 || index > _count)
            throw new ArgumentOutOfRangeException(nameof(index));

        if (index == 0) { AddFirst(value); return; }

        var current = _head;
        for (int i = 0; i < index - 1; i++)
            current = current!.Next;

        current!.Next = new ListNode<T>(value, current.Next);
        _count++;
    }

    // O(n) — remove first occurrence
    public bool Remove(T value)
    {
        if (_head is null) return false;

        if (EqualityComparer<T>.Default.Equals(_head.Value, value))
        {
            _head = _head.Next;
            _count--;
            return true;
        }

        var current = _head;
        while (current.Next is not null)
        {
            if (EqualityComparer<T>.Default.Equals(current.Next.Value, value))
            {
                current.Next = current.Next.Next;
                _count--;
                return true;
            }
            current = current.Next;
        }
        return false;
    }

    // O(n) — linear search
    public bool Search(T value)
    {
        var current = _head;
        while (current is not null)
        {
            if (EqualityComparer<T>.Default.Equals(current.Value, value))
                return true;
            current = current.Next;
        }
        return false;
    }

    // O(n) — reverse in place
    public void Reverse()
    {
        ListNode<T>? prev = null;
        var current = _head;
        while (current is not null)
        {
            var next = current.Next;
            current.Next = prev;
            prev = current;
            current = next;
        }
        _head = prev;
    }
}
```

---

## The Standard Library: `LinkedList<T>`

C# provides `System.Collections.Generic.LinkedList<T>`, a **doubly linked list**.

```csharp
var list = new LinkedList<int>();
list.AddLast(10);
list.AddLast(20);
list.AddFirst(5);

LinkedListNode<int> node = list.Find(10)!;
list.AddAfter(node, 15);   // O(1) insert at known node

foreach (int val in list)
    Console.Write($"{val} "); // 5 10 15 20
```

> **Callout:** `LinkedList<T>` exposes nodes directly, enabling O(1) insert/delete at a known position — something `List<T>` cannot do.

---

## Complexity Table

| Operation           | Singly Linked List | Doubly Linked List | Array/List<T> |
|---------------------|--------------------|--------------------|---------------|
| Access by index     | O(n)               | O(n)               | O(1)          |
| Search              | O(n)               | O(n)               | O(n)          |
| Insert at head      | O(1)               | O(1)               | O(n)          |
| Insert at tail      | O(n) / O(1)*       | O(1)               | O(1) amortized|
| Insert at known node| O(1)               | O(1)               | O(n)          |
| Delete at head      | O(1)               | O(1)               | O(n)          |
| Delete at known node| O(n)**             | O(1)               | O(n)          |

*O(1) if you maintain a tail pointer. **O(n) because you must find the previous node.

---

## Trade-offs: Arrays vs Linked Lists

> **Callout — Cache Unfriendliness:** Linked list nodes are scattered in memory. Modern CPUs load data in cache lines (64 bytes). Arrays benefit from spatial locality; linked lists do not. In practice, `List<T>` often outperforms `LinkedList<T>` even for frequent insertions due to cache effects.

> **Callout — Pointer Overhead:** Each singly linked node stores an extra reference (8 bytes on 64-bit). Doubly linked nodes store two. For small value types, overhead can exceed data size.

---

## Practice Problem 1: Reverse Linked List

**Problem:** Given the head of a singly linked list, reverse the list and return the new head.

```
Input:  1 -> 2 -> 3 -> 4 -> 5
Output: 5 -> 4 -> 3 -> 2 -> 1
```

**Approach (Iterative):** Maintain three pointers: `prev`, `current`, `next`. Walk through the list, reversing each pointer.

```
Step-by-step:
  prev=null  curr=1->2->3
  prev=1     curr=2->3        (1->null)
  prev=2->1  curr=3           (2->1->null)
  prev=3->2->1  curr=null     done, return prev
```

```csharp
// Iterative — O(n) time, O(1) space
public ListNode? ReverseList(ListNode? head)
{
    ListNode? prev = null;
    ListNode? current = head;

    while (current is not null)
    {
        ListNode? next = current.Next; // save next
        current.Next = prev;           // reverse pointer
        prev = current;                // advance prev
        current = next;                // advance current
    }
    return prev; // prev is the new head
}

// Recursive — O(n) time, O(n) space (call stack)
public ListNode? ReverseListRecursive(ListNode? head)
{
    if (head is null || head.Next is null)
        return head;

    ListNode? newHead = ReverseListRecursive(head.Next);
    head.Next.Next = head; // the node after head points back to head
    head.Next = null;      // head now points to null
    return newHead;
}
```

**Complexity:** Iterative: O(n) time, O(1) space. Recursive: O(n) time, O(n) space.

---

## Practice Problem 2: Merge Two Sorted Lists

**Problem:** Merge two sorted linked lists into one sorted list.

```
Input:  1 -> 3 -> 5
        2 -> 4 -> 6
Output: 1 -> 2 -> 3 -> 4 -> 5 -> 6
```

**Approach:** Use a dummy head node. Compare fronts of both lists; append the smaller node.

```csharp
public ListNode? MergeTwoLists(ListNode? l1, ListNode? l2)
{
    var dummy = new ListNode(0);  // sentinel node
    var tail = dummy;

    while (l1 is not null && l2 is not null)
    {
        if (l1.Val <= l2.Val)
        {
            tail.Next = l1;
            l1 = l1.Next;
        }
        else
        {
            tail.Next = l2;
            l2 = l2.Next;
        }
        tail = tail.Next;
    }

    // Attach the remaining nodes
    tail.Next = l1 ?? l2;

    return dummy.Next;
}
```

**Complexity:** O(n + m) time, O(1) space (reusing existing nodes).

---

## Practice Problem 3: Linked List Cycle (Floyd's Algorithm)

**Problem:** Given a linked list, determine if it has a cycle.

```
Floyd's Cycle Detection ("Tortoise and Hare"):

  slow moves 1 step, fast moves 2 steps

       +---+    +---+    +---+    +---+
  ---->| 1 |--->| 2 |--->| 3 |--->| 4 |--+
       +---+    +---+    +---+    +---+  |
                  ^                       |
                  |       +---+           |
                  +-------| 5 |<----------+
                          +---+
  If there is a cycle, fast will eventually meet slow inside the cycle.
```

**Approach:** Use two pointers. If they ever meet, a cycle exists.

```csharp
public bool HasCycle(ListNode? head)
{
    ListNode? slow = head;
    ListNode? fast = head;

    while (fast?.Next is not null)
    {
        slow = slow!.Next;        // 1 step
        fast = fast.Next.Next;    // 2 steps

        if (slow == fast)
            return true;          // pointers met — cycle exists
    }
    return false; // fast reached end — no cycle
}
```

**Finding the cycle start:** After slow and fast meet, reset one pointer to head. Move both one step at a time. They meet at the cycle's start.

```csharp
public ListNode? DetectCycleStart(ListNode? head)
{
    ListNode? slow = head, fast = head;

    while (fast?.Next is not null)
    {
        slow = slow!.Next;
        fast = fast.Next.Next;
        if (slow == fast) break;
    }

    if (fast?.Next is null) return null; // no cycle

    slow = head;
    while (slow != fast)
    {
        slow = slow!.Next;
        fast = fast!.Next;
    }
    return slow; // start of cycle
}
```

**Complexity:** O(n) time, O(1) space.

---

## Common Mistakes

1. **Forgetting to handle null head** — always check if `head is null` before accessing `.Next`.
2. **Losing the reference** — when reversing, save `current.Next` before overwriting it.
3. **Off-by-one with dummy nodes** — return `dummy.Next`, not `dummy`.
4. **Not updating the tail pointer** — after appending, move `tail = tail.Next`.
5. **Modifying the input list unintentionally** — if the problem requires the original list intact, clone nodes.

---

## Interview Tips

- **Draw the pointers.** Sketch the list and walk through pointer changes step by step.
- **Use a dummy/sentinel node** for merge or insertion problems to avoid edge-case code for the head.
- **Know Floyd's algorithm cold.** It appears in many cycle-related problems.
- **State trade-offs** between arrays and linked lists when the interviewer asks about design choices.
- **Mention cache performance** — it shows you understand real-world implications beyond Big-O.

---

## Quiz

<details>
<summary>1. What is the time complexity of inserting a node at the beginning of a singly linked list?</summary>

**O(1)**. You create a new node, point its `Next` to the current head, and update the head reference. No shifting is needed.
</details>

<details>
<summary>2. Why is searching a linked list O(n) even if you know the value exists?</summary>

There is no random access. You must traverse node by node from the head. In the worst case the target is the last node, requiring n steps.
</details>

<details>
<summary>3. In Floyd's cycle detection, why does the fast pointer move exactly 2 steps (not 3 or more)?</summary>

Moving 2 steps guarantees the fast pointer closes the gap with the slow pointer by exactly 1 node per iteration, ensuring they will meet within one full traversal of the cycle. Larger steps could also work but 2 is the simplest and most efficient choice — it guarantees meeting and keeps the proof straightforward.
</details>

<details>
<summary>4. When would you choose LinkedList&lt;T&gt; over List&lt;T&gt; in C#?</summary>

When you need frequent O(1) insertions/deletions at known positions (e.g., implementing an LRU cache) and you do not need random access by index. In most other scenarios, `List<T>` wins due to cache locality.
</details>

<details>
<summary>5. What happens if you reverse a linked list recursively on a list with 100,000 nodes?</summary>

You risk a **StackOverflowException**. Each recursive call adds a frame to the call stack. The default stack size in .NET is ~1 MB, which supports roughly 10,000–15,000 frames. For large lists, use the iterative approach.
</details>
