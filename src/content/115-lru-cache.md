# LRU and LFU Cache

## LRU Cache Concept

An **LRU (Least Recently Used) Cache** evicts the least recently accessed item when the cache reaches capacity. It supports two operations in **O(1)** time:
- `Get(key)` — return the value if the key exists, otherwise -1
- `Put(key, value)` — insert or update the key-value pair; evict the LRU item if at capacity

The key data structure: a **Dictionary** (for O(1) lookup) combined with a **doubly linked list** (for O(1) insertion, deletion, and reordering).

- LRU Cache (capacity = 3):
- Dictionary (key — node):
- key=1 — node "A"
- key=2 — node "B"
- key=3 — node "C"
- Doubly Linked List (most recent — least recent):
- HEAD ↔ [C] ↔ [B] ↔ [A] ↔ TAIL
- MRU — LRU
- On access to key=2 (B): move B to front
- HEAD ↔ [B] ↔ [C] ↔ [A] ↔ TAIL
- On insert key=4 (D) at capacity: evict A (at TAIL), add D at HEAD
- HEAD ↔ [D] ↔ [B] ↔ [C] ↔ TAIL


> **Why doubly linked list?** We need to remove a node from the middle in O(1). With a doubly linked list, if we have a reference to the node (from the dictionary), we can unlink it by updating its neighbors' pointers — no traversal needed.

## Full C# LRU Cache Implementation

```csharp
public class LRUCache
{
    private class DLinkedNode
    {
        public int Key;
        public int Value;
        public DLinkedNode Prev;
        public DLinkedNode Next;
    }

    private readonly int capacity;
    private readonly Dictionary<int, DLinkedNode> cache;

    // Sentinel nodes — simplify edge cases (no null checks)
    private readonly DLinkedNode head;
    private readonly DLinkedNode tail;

    public LRUCache(int capacity)
    {
        this.capacity = capacity;
        cache = new Dictionary<int, DLinkedNode>(capacity);

        // Initialize sentinel doubly linked list: head ↔ tail
        head = new DLinkedNode();
        tail = new DLinkedNode();
        head.Next = tail;
        tail.Prev = head;
    }

    public int Get(int key)
    {
        if (!cache.TryGetValue(key, out var node))
            return -1;

        // Move to front (most recently used)
        MoveToHead(node);
        return node.Value;
    }

    public void Put(int key, int value)
    {
        if (cache.TryGetValue(key, out var node))
        {
            // Key exists — update value and move to front
            node.Value = value;
            MoveToHead(node);
        }
        else
        {
            // New key
            var newNode = new DLinkedNode { Key = key, Value = value };

            cache[key] = newNode;
            AddToHead(newNode);

            if (cache.Count > capacity)
            {
                // Evict the LRU item (node before tail sentinel)
                DLinkedNode lru = tail.Prev;
                RemoveNode(lru);
                cache.Remove(lru.Key);
            }
        }
    }

    // --- Linked list helpers ---

    private void AddToHead(DLinkedNode node)
    {
        // Insert right after head sentinel
        node.Prev = head;
        node.Next = head.Next;
        head.Next.Prev = node;
        head.Next = node;
    }

    private void RemoveNode(DLinkedNode node)
    {
        // Unlink node from its current position
        node.Prev.Next = node.Next;
        node.Next.Prev = node.Prev;
    }

    private void MoveToHead(DLinkedNode node)
    {
        RemoveNode(node);
        AddToHead(node);
    }
}
```

### LRU State Diagram Example

> Operations: Put(1,1), Put(2,2), Get(1), Put(3,3), Put(4,4) [capacity=3]
> Put(1,1): | HEAD ↔ [1:1] ↔ TAIL
> Put(2,2): | HEAD ↔ [2:2] ↔ [1:1] ↔ TAIL
> Get(1): | HEAD ↔ [1:1] ↔ [2:2] ↔ TAIL | key 1 moved to front
> returns 1
> Put(3,3): | HEAD ↔ [3:3] ↔ [1:1] ↔ [2:2] ↔ TAIL
> Put(4,4): | HEAD ↔ [4:4] ↔ [3:3] ↔ [1:1] ↔ TAIL | evicted [2:2] (LRU)
> cache.Count was 4 > capacity 3, so tail.Prev ([2:2]) was removed


---

## LFU Cache Concept

An **LFU (Least Frequently Used) Cache** evicts the item with the lowest access frequency. If there's a tie, evict the least recently used among those with the lowest frequency.

**Data structures:**
1. `keyToNode` — Dictionary mapping key to its node (for O(1) lookup)
2. `freqToList` — Dictionary mapping frequency to a doubly linked list of nodes with that frequency (ordered by recency)
3. `minFreq` — tracks the current minimum frequency (for O(1) eviction)

> LFU Cache State (capacity = 3):
> keyToNode: | { 1→nodeA, 2→nodeB, 3→nodeC }
> minFreq: 1
> freqToList:
> freq=1: HEAD ↔ [3:C] ↔ TAIL | nodeC accessed once
> freq=2: HEAD ↔ [2:B] ↔ [1:A] ↔ TAIL | nodeA, nodeB accessed twice
> On eviction: remove tail of freqToList[minFreq]
> → remove nodeC (freq=1, least recent at that freq)


## Full C# LFU Cache Implementation

```csharp
public class LFUCache
{
    private class Node
    {
        public int Key, Value, Freq;
        public Node Prev, Next;
        public Node(int key, int val)
        {
            Key = key; Value = val; Freq = 1;
        }
    }

    // A doubly linked list with sentinel nodes
    private class DLinkedList
    {
        public Node Head, Tail;
        public int Count;

        public DLinkedList()
        {
            Head = new Node(0, 0);
            Tail = new Node(0, 0);
            Head.Next = Tail;
            Tail.Prev = Head;
            Count = 0;
        }

        public void AddToHead(Node node)
        {
            node.Prev = Head;
            node.Next = Head.Next;
            Head.Next.Prev = node;
            Head.Next = node;
            Count++;
        }

        public void Remove(Node node)
        {
            node.Prev.Next = node.Next;
            node.Next.Prev = node.Prev;
            Count--;
        }

        public Node RemoveTail()
        {
            Node lru = Tail.Prev;
            Remove(lru);
            return lru;
        }
    }

    private readonly int capacity;
    private int minFreq;
    private readonly Dictionary<int, Node> keyToNode;
    private readonly Dictionary<int, DLinkedList> freqToList;

    public LFUCache(int capacity)
    {
        this.capacity = capacity;
        minFreq = 0;
        keyToNode = new Dictionary<int, Node>();
        freqToList = new Dictionary<int, DLinkedList>();
    }

    public int Get(int key)
    {
        if (!keyToNode.TryGetValue(key, out var node))
            return -1;

        IncreaseFreq(node);
        return node.Value;
    }

    public void Put(int key, int value)
    {
        if (capacity == 0) return;

        if (keyToNode.TryGetValue(key, out var node))
        {
            node.Value = value;
            IncreaseFreq(node);
            return;
        }

        // Evict if at capacity
        if (keyToNode.Count >= capacity)
        {
            var list = freqToList[minFreq];
            Node evicted = list.RemoveTail();
            keyToNode.Remove(evicted.Key);
        }

        // Insert new node with freq = 1
        var newNode = new Node(key, value);
        keyToNode[key] = newNode;

        if (!freqToList.ContainsKey(1))
            freqToList[1] = new DLinkedList();
        freqToList[1].AddToHead(newNode);
        minFreq = 1; // new node always has freq 1
    }

    private void IncreaseFreq(Node node)
    {
        int oldFreq = node.Freq;
        int newFreq = oldFreq + 1;
        node.Freq = newFreq;

        // Remove from old frequency list
        freqToList[oldFreq].Remove(node);

        // If old freq list is empty and it was the min, increment minFreq
        if (freqToList[oldFreq].Count == 0)
        {
            freqToList.Remove(oldFreq);
            if (minFreq == oldFreq)
                minFreq++;
        }

        // Add to new frequency list
        if (!freqToList.ContainsKey(newFreq))
            freqToList[newFreq] = new DLinkedList();
        freqToList[newFreq].AddToHead(node);
    }
}
```

## Complexity Reference

| Operation | LRU Cache | LFU Cache |
|---|---|---|
| Get | O(1) | O(1) |
| Put | O(1) | O(1) |
| Space | O(capacity) | O(capacity) |
| Data structures | Dict + 1 DLL | Dict + Dict of DLLs |
| Eviction policy | Least recently used | Least frequently used (LRU tiebreak) |

---

## Practice Problems

### Problem 1: LRU Cache (LeetCode 146)

**Statement:** Implement the `LRUCache` class with `Get(key)` and `Put(key, value)` as described above, both in O(1) time.

The complete implementation is shown above. Here is a usage walkthrough:

```csharp
// Test the LRU Cache
var cache = new LRUCache(2); // capacity 2

cache.Put(1, 1);     // cache: {1=1}
cache.Put(2, 2);     // cache: {1=1, 2=2}
cache.Get(1);        // returns 1, cache: {2=2, 1=1} (1 is now MRU)
cache.Put(3, 3);     // evicts key 2, cache: {1=1, 3=3}
cache.Get(2);        // returns -1 (evicted)
cache.Put(4, 4);     // evicts key 1, cache: {3=3, 4=4}
cache.Get(1);        // returns -1 (evicted)
cache.Get(3);        // returns 3
cache.Get(4);        // returns 4
```

```
State trace:
  Put(1,1): HEAD ↔ [1:1] ↔ TAIL
  Put(2,2): HEAD ↔ [2:2] ↔ [1:1] ↔ TAIL
  Get(1):   HEAD ↔ [1:1] ↔ [2:2] ↔ TAIL           move 1 to front
  Put(3,3): HEAD ↔ [3:3] ↔ [1:1] ↔ TAIL           evict 2 (tail)
  Get(2):   returns -1
  Put(4,4): HEAD ↔ [4:4] ↔ [3:3] ↔ TAIL           evict 1 (tail)
```

**Complexity:** O(1) for both operations. Space O(capacity).

---

### Problem 2: LFU Cache (LeetCode 460)

**Statement:** Implement the `LFUCache` class with `Get(key)` and `Put(key, value)` in O(1) time. When evicting, remove the least frequently used key. If there's a tie, remove the least recently used among those.

The complete implementation is shown above. Here is a usage walkthrough:

```csharp
var cache = new LFUCache(2);

cache.Put(1, 1);     // freq: {1:1}
cache.Put(2, 2);     // freq: {1:1, 2:1}
cache.Get(1);        // returns 1, freq of key 1 → 2
cache.Put(3, 3);     // evicts key 2 (freq=1, LRU among freq=1), adds 3
cache.Get(2);        // returns -1 (evicted)
cache.Get(3);        // returns 3, freq of key 3 → 2
cache.Put(4, 4);     // evicts key 1 (freq=2) vs key 3 (freq=2) → key 1 is LRU among freq=2
                     // Wait — minFreq is 1 (key 4 just inserted with freq 1)
                     // Actually key 4 has freq=1 but we evict before inserting:
                     // keys are {1: freq=2, 3: freq=2}, minFreq=2
                     // evict key 1 (LRU at freq=2)
```

```
Detailed state trace:

Put(1,1): keyToNode={1}, freqToList={1: [1]}, minFreq=1
Put(2,2): keyToNode={1,2}, freqToList={1: [2,1]}, minFreq=1
Get(1):   move 1 from freq=1 to freq=2
          freqToList={1: [2], 2: [1]}, minFreq=1
Put(3,3): at capacity, evict from freqToList[minFreq=1] → evict 2
          freqToList={2: [1], 1: [3]}, minFreq=1
Get(2):   returns -1
Get(3):   move 3 from freq=1 to freq=2
          freqToList={2: [3, 1]}, minFreq=2
Put(4,4): at capacity, evict from freqToList[minFreq=2] → evict 1 (LRU at freq=2)
          freqToList={2: [3], 1: [4]}, minFreq=1
```

**Complexity:** O(1) for both operations. Space O(capacity).

---

## Common Mistakes

1. **Not using sentinel nodes.** Without dummy head/tail nodes, you need null checks everywhere for empty list and single-node edge cases. Sentinels eliminate this.
2. **Forgetting to update the dictionary** when evicting. You must `cache.Remove(lru.Key)` after unlinking the node.
3. **Not storing the key in the node.** When evicting the LRU node, you need its key to remove it from the dictionary. The node must store its own key.
4. **LFU `minFreq` update.** Only increment `minFreq` when the old frequency list becomes empty AND it was the current `minFreq`. On `Put` of a new key, always reset `minFreq = 1`.
5. **Shallow copy of lists.** Forgetting to make a deep copy or properly manage references when adding/removing nodes.

## Interview Tips

- **LRU is a top-5 interview question.** Practice until you can write it from memory in under 10 minutes.
- **Start by explaining the data structure** before coding: "I'll use a dictionary for O(1) lookup and a doubly linked list for O(1) ordering."
- **Use sentinel nodes** and explain why: "Dummy head and tail nodes eliminate edge cases for empty lists."
- **For LFU**, the key insight is the `minFreq` pointer. Explain: "I track the minimum frequency so eviction is O(1) — I just remove the tail of the list at `minFreq`."
- **Draw the state diagram** for your interviewer — it makes the algorithm crystal clear.
- **Know the trade-offs:** LRU is simpler to implement; LFU better handles items with consistently high access rates.

---

## Quiz

<details>
<summary>1. Why does LRU Cache require a doubly linked list instead of a singly linked list?</summary>

To remove a node in O(1), we need access to its predecessor (to update `prev.Next`). In a singly linked list, finding the predecessor requires O(n) traversal. In a doubly linked list, each node has a `Prev` pointer, so removal is O(1). The dictionary gives us direct access to the node, and the doubly linked list lets us remove it and re-insert it at the head instantly.
</details>

<details>
<summary>2. What is the purpose of sentinel (dummy) head and tail nodes?</summary>

Sentinel nodes eliminate all null-pointer edge cases. Without them, adding to an empty list, removing the only node, and removing the first or last node all require special handling. With sentinels, the list is never truly empty (it always has `head ↔ tail`), so `AddToHead`, `RemoveNode`, and `RemoveTail` work uniformly without any conditional checks.
</details>

<details>
<summary>3. In LFU Cache, why is minFreq set to 1 when a new key is inserted?</summary>

Every newly inserted key starts with frequency 1. Since `Put` for a new key may have just evicted the only element at `minFreq`, the new minimum frequency in the cache is guaranteed to be 1 (the frequency of the newly inserted element). This is true regardless of what `minFreq` was before the insertion.
</details>

<details>
<summary>4. Could you implement LRU Cache using an OrderedDictionary or LinkedList from the standard library?</summary>

In theory yes, but with caveats. C#'s `LinkedList<T>` is a doubly linked list, but `LinkedList.Remove(node)` is O(1) only if you have the `LinkedListNode<T>` reference (which you can store in the dictionary). `OrderedDictionary` maintains insertion order but doesn't support moving an item to the front in O(1). The custom implementation with a hand-rolled doubly linked list gives the most control and clarity for interviews.
</details>

<details>
<summary>5. What happens in LFU Cache when you access a key and its old frequency list becomes empty?</summary>

When a key's frequency increases from `oldFreq` to `oldFreq + 1`, the key is removed from `freqToList[oldFreq]`. If that list becomes empty, we remove the entry from `freqToList`. Critically, if `oldFreq == minFreq`, we also increment `minFreq` by 1. This is safe because the key we just promoted is now at `minFreq + 1`, and there are no other keys at `minFreq` (the list is empty). We only increment `minFreq` by 1 — never by more — because the promoted key guarantees that `minFreq + 1` has at least one element.
</details>
