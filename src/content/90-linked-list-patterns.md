# Linked List Patterns

## Overview

Many linked list interview problems follow recurring patterns. Master these four and you can solve the majority of linked list questions:

1. **Fast/Slow Pointers** — cycle detection, finding the middle
2. **Reversing In Place** — reverse sublists without extra space
3. **Merging Sorted Lists** — two-pointer merge
4. **Dummy Head Technique** — simplify edge cases for head manipulation

---

## Pattern 1: Fast/Slow Pointers

Two pointers traverse the list at different speeds. The fast pointer moves 2 steps while the slow pointer moves 1 step.

### Finding the Middle Node

```
  slow: 1 step     fast: 2 steps

  Start:
   s
   f
   1 -> 2 -> 3 -> 4 -> 5 -> null

  Step 1:
        s
             f
   1 -> 2 -> 3 -> 4 -> 5 -> null

  Step 2:
             s
                       f
   1 -> 2 -> 3 -> 4 -> 5 -> null

  fast.Next is null => stop. slow is at middle (3).
```

```csharp
public ListNode? FindMiddle(ListNode? head)
{
    ListNode? slow = head, fast = head;

    while (fast?.Next is not null)
    {
        slow = slow!.Next;
        fast = fast.Next.Next;
    }
    return slow; // middle node
}
```

> **Callout:** For even-length lists, this returns the second of the two middle nodes. To get the first, check `fast?.Next?.Next` instead.

### Floyd's Cycle Detection — Full Diagram

```
  Floyd's Algorithm — Cycle Detection + Finding Start

  Phase 1: Detect cycle (slow=1 step, fast=2 steps)

       +---+    +---+    +---+    +---+
  ---->| A |--->| B |--->| C |--->| D |---+
       +---+    +---+    +---+    +---+   |
                  ^                        |
                  |       +---+            |
                  +-------| E |<-----------+
                          +---+

  Distances:
    Let x = distance from head to cycle start (A->B = x)
    Let y = distance from cycle start to meeting point
    Let c = cycle length

  When they meet:  slow traveled x + y
                   fast traveled x + y + n*c  (n >= 1)
  Since fast = 2 * slow:  2(x+y) = x+y+n*c  =>  x = n*c - y

  Phase 2: Reset one pointer to head, move both 1 step.
           They meet at the cycle start after x steps.
```

---

## Pattern 2: Reversing In Place

Reverse a sublist without allocating new nodes. The key: save the next pointer before overwriting.

```csharp
// Reverse nodes between positions left and right (1-indexed)
public ListNode? ReverseBetween(ListNode? head, int left, int right)
{
    var dummy = new ListNode(0, head);
    var prev = dummy;

    // Move prev to node before the reversal zone
    for (int i = 1; i < left; i++)
        prev = prev.Next!;

    // Reverse the sublist
    var current = prev.Next;
    for (int i = 0; i < right - left; i++)
    {
        var next = current!.Next;       // node to move
        current.Next = next!.Next;      // skip over it
        next.Next = prev.Next;          // place it at front of sublist
        prev.Next = next;               // update prev's link
    }

    return dummy.Next;
}
```

---

## Pattern 3: Merging Sorted Lists

Compare heads of two lists; pick the smaller. Use a dummy node to avoid special-casing the first pick.

```csharp
public ListNode? MergeSorted(ListNode? l1, ListNode? l2)
{
    var dummy = new ListNode(0);
    var tail = dummy;

    while (l1 is not null && l2 is not null)
    {
        if (l1.Val <= l2.Val) { tail.Next = l1; l1 = l1.Next; }
        else                  { tail.Next = l2; l2 = l2.Next; }
        tail = tail.Next!;
    }
    tail.Next = l1 ?? l2;
    return dummy.Next;
}
```

---

## Pattern 4: Removing the Nth Node from the End

Use two pointers separated by n nodes. When the lead reaches the end, the trail is at the target.

```
  Remove 2nd from end:   1 -> 2 -> 3 -> 4 -> 5

  Gap of 2:
  trail                  lead
  dummy -> 1 -> 2 -> 3 -> 4 -> 5 -> null

  Advance both until lead is null:
                    trail              lead
  dummy -> 1 -> 2 -> 3 -> 4 -> 5 -> null

  trail.Next = trail.Next.Next  =>  skip node 4
  Result: 1 -> 2 -> 3 -> 5
```

---

## Complexity Summary

| Pattern                   | Time  | Space |
|---------------------------|-------|-------|
| Fast/slow — find middle   | O(n)  | O(1)  |
| Fast/slow — cycle detect  | O(n)  | O(1)  |
| Reverse in place          | O(n)  | O(1)  |
| Merge two sorted lists    | O(n+m)| O(1)  |
| Remove nth from end       | O(n)  | O(1)  |

---

## Practice Problem 1: Reorder List

**Problem:** Given `1 -> 2 -> 3 -> 4 -> 5`, reorder to `1 -> 5 -> 2 -> 4 -> 3`. Interleave the first half with the reversed second half.

**Approach:**
1. Find the middle using fast/slow pointers.
2. Reverse the second half.
3. Merge the two halves alternately.

```csharp
public void ReorderList(ListNode head)
{
    if (head?.Next is null) return;

    // Step 1: Find middle
    ListNode slow = head, fast = head;
    while (fast.Next?.Next is not null)
    {
        slow = slow.Next!;
        fast = fast.Next.Next!;
    }

    // Step 2: Reverse second half
    ListNode? prev = null;
    ListNode? curr = slow.Next;
    slow.Next = null; // split the list

    while (curr is not null)
    {
        var next = curr.Next;
        curr.Next = prev;
        prev = curr;
        curr = next;
    }

    // Step 3: Merge alternately
    ListNode? first = head;
    ListNode? second = prev;
    while (second is not null)
    {
        var tmp1 = first!.Next;
        var tmp2 = second.Next;
        first.Next = second;
        second.Next = tmp1;
        first = tmp1;
        second = tmp2;
    }
}
```

**Complexity:** O(n) time, O(1) space. Three passes: find middle, reverse, merge.

---

## Practice Problem 2: Remove Nth Node From End of List

**Problem:** Remove the nth node from the end in a single pass.

```
Input:  1 -> 2 -> 3 -> 4 -> 5,  n = 2
Output: 1 -> 2 -> 3 -> 5
```

**Approach:** Two-pointer gap technique with a dummy node.

```csharp
public ListNode? RemoveNthFromEnd(ListNode? head, int n)
{
    var dummy = new ListNode(0, head);
    ListNode lead = dummy, trail = dummy;

    // Advance lead by n+1 steps to create the gap
    for (int i = 0; i <= n; i++)
        lead = lead.Next!;

    // Move both until lead reaches the end
    while (lead is not null)
    {
        lead = lead.Next!;
        trail = trail.Next!;
    }

    // trail.Next is the node to remove
    trail.Next = trail.Next!.Next;

    return dummy.Next;
}
```

**Complexity:** O(n) time, O(1) space. Single pass after initial gap setup.

> **Callout:** The dummy node handles the edge case where the head itself must be removed (e.g., single-element list with n=1).

---

## Practice Problem 3: LRU Cache

**Problem:** Design a data structure that supports `Get(key)` and `Put(key, value)` in **O(1)** time. When capacity is exceeded, evict the least recently used item.

**Approach:** Combine a **Dictionary** for O(1) key lookup with a **doubly linked list** for O(1) insertion/removal. Most recently used items go to the front; the tail is evicted.

```
  Dictionary maps key -> node in doubly linked list

  Head <-> [MRU] <-> [..] <-> [..] <-> [LRU] <-> Tail
  (sentinel)                               (sentinel)

  Get: look up node in dict, move to front
  Put: add to front, evict tail.Prev if over capacity
```

```csharp
public class LRUCache
{
    private class DLinkedNode
    {
        public int Key, Value;
        public DLinkedNode? Prev, Next;
    }

    private readonly int _capacity;
    private readonly Dictionary<int, DLinkedNode> _map;
    private readonly DLinkedNode _head; // sentinel
    private readonly DLinkedNode _tail; // sentinel

    public LRUCache(int capacity)
    {
        _capacity = capacity;
        _map = new Dictionary<int, DLinkedNode>(capacity);
        _head = new DLinkedNode();
        _tail = new DLinkedNode();
        _head.Next = _tail;
        _tail.Prev = _head;
    }

    public int Get(int key)
    {
        if (!_map.TryGetValue(key, out var node))
            return -1;

        MoveToFront(node);
        return node.Value;
    }

    public void Put(int key, int value)
    {
        if (_map.TryGetValue(key, out var node))
        {
            node.Value = value;
            MoveToFront(node);
            return;
        }

        var newNode = new DLinkedNode { Key = key, Value = value };
        _map[key] = newNode;
        AddToFront(newNode);

        if (_map.Count > _capacity)
        {
            var lru = _tail.Prev!;
            RemoveNode(lru);
            _map.Remove(lru.Key);
        }
    }

    private void AddToFront(DLinkedNode node)
    {
        node.Next = _head.Next;
        node.Prev = _head;
        _head.Next!.Prev = node;
        _head.Next = node;
    }

    private void RemoveNode(DLinkedNode node)
    {
        node.Prev!.Next = node.Next;
        node.Next!.Prev = node.Prev;
    }

    private void MoveToFront(DLinkedNode node)
    {
        RemoveNode(node);
        AddToFront(node);
    }
}
```

**Complexity:**
| Operation | Time | Space   |
|-----------|------|---------|
| Get       | O(1) | —       |
| Put       | O(1) | —       |
| Overall   | —    | O(capacity) |

> **Callout:** Sentinel nodes for head and tail eliminate null checks in `AddToFront` and `RemoveNode`. This is the standard trick for doubly linked list manipulation.

---

## Common Mistakes

1. **Not splitting the list** in reorder — forgetting `slow.Next = null` creates a cycle.
2. **Off-by-one in the gap technique** — the lead must be advanced `n + 1` times from the dummy, not `n`.
3. **Forgetting to update the dictionary** in LRU Cache when evicting a node.
4. **Using singly linked list for LRU** — removal is O(n) without a `prev` pointer. You need doubly linked.
5. **Not using sentinel nodes** — leads to verbose null-checking code in every linked list operation.

---

## Interview Tips

- **Combine patterns.** Reorder List uses three patterns: fast/slow, reverse, and merge. Practice recognizing which patterns apply.
- **LRU Cache is a top interview question.** Know the Dict + DLL design by heart. Be ready to code it from scratch in 15 minutes.
- **Always mention the dummy node trick** when discussing edge cases. Interviewers appreciate clean code.
- **Walk through a small example** before coding. Draw the list state after each operation.
- **Know the follow-ups:** LRU with TTL (time to live), LFU cache, thread-safe LRU.

---

## Quiz

<details>
<summary>1. How do you find the middle of a linked list in one pass?</summary>

Use the **fast/slow pointer** technique. Move `slow` one step and `fast` two steps. When `fast` reaches the end, `slow` is at the middle. O(n) time, O(1) space.
</details>

<details>
<summary>2. Why does the LRU Cache need both a dictionary AND a linked list?</summary>

The dictionary provides O(1) key lookup. The doubly linked list provides O(1) insertion, removal, and ordering of elements by recency. Neither alone achieves both — a dictionary has no order, and a linked list has no O(1) lookup.
</details>

<details>
<summary>3. In "Remove Nth from End," what happens if n equals the length of the list?</summary>

The head node must be removed. The dummy node handles this: after advancing `lead` by `n+1` steps, `trail` stays at `dummy`. Then `trail.Next = trail.Next.Next` skips the head. Without the dummy, you would need a special case.
</details>

<details>
<summary>4. What is the purpose of sentinel (dummy) head and tail nodes in the LRU Cache?</summary>

Sentinels eliminate null checks. Without them, `AddToFront` and `RemoveNode` would need to handle cases where the list is empty or the node is at the boundary. Sentinels guarantee that every real node always has valid `Prev` and `Next` references.
</details>

<details>
<summary>5. Can you detect a cycle using a HashSet instead of Floyd's algorithm? What is the trade-off?</summary>

Yes. Store visited nodes in a `HashSet<ListNode>`. If you encounter a node already in the set, there is a cycle. The trade-off is **O(n) space** vs Floyd's **O(1) space**. Time is O(n) for both.
</details>
