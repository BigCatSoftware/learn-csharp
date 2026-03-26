# Hashing — HashSet and Dictionary

## How Hash Tables Work Internally

A hash table maps **keys to values** using a **hash function** that converts a key into an array index (bucket). This gives us O(1) average-case lookups.

![Hash table with separate chaining — keys hashed into buckets with collision chains](/diagrams/hash-table.svg)

### Collision Resolution Strategies

When two keys hash to the same bucket, we have a **collision**. Two main strategies:

| Strategy | How it works | .NET uses? |
|---|---|---|
| **Separate Chaining** | Each bucket holds a linked list of entries | Yes (Dictionary<K,V>) |
| **Open Addressing** | Probe next bucket(s) until an empty slot is found | No (but used in some custom impls) |

> **Note:** .NET's `Dictionary<K,V>` uses **separate chaining** with an array of `Entry` structs. Each entry stores the key, value, hash code, and a `next` index pointing to the next entry in the chain.

---

## Dictionary\<K,V\> Internals in .NET

![Hash table with separate chaining — keys hashed into buckets with collision chains](/diagrams/hash-table.svg)

**Key internals:**
- `_buckets` maps hash % size to the first entry index
- `_entries` stores all key-value pairs
- When load factor exceeds threshold, the dictionary **resizes** (doubles bucket count, rehashes everything)

---

## HashSet\<T\> — The Essentials

`HashSet<T>` is like `Dictionary<K,V>` but stores only keys (no values). Perfect for membership testing.

```csharp
var seen = new HashSet<int>();

seen.Add(5);           // true (added)
seen.Add(5);           // false (already exists)
seen.Contains(5);      // true  — O(1) average
seen.Remove(5);        // true (removed)

// Set operations
var a = new HashSet<int> { 1, 2, 3 };
var b = new HashSet<int> { 2, 3, 4 };

a.IntersectWith(b);    // a = {2, 3}
a.UnionWith(b);        // a = {2, 3, 4}
a.ExceptWith(b);       // a = {}
```

---

## Operation Complexity

| Operation | Average | Worst (all collisions) |
|---|---|---|
| `Add` / `TryAdd` | **O(1)** | O(n) |
| `ContainsKey` / `Contains` | **O(1)** | O(n) |
| `Remove` | **O(1)** | O(n) |
| `TryGetValue` | **O(1)** | O(n) |
| `Count` | **O(1)** | O(1) |
| Resize (rehash) | **O(n)** | O(n) |

> **Warning:** Worst-case O(n) happens when every key collides into the same bucket. In practice with a good hash function, this almost never occurs.

---

## Essential Dictionary Patterns

```csharp
var dict = new Dictionary<string, int>();

// PATTERN 1: TryGetValue — preferred over ContainsKey + indexer
if (dict.TryGetValue("key", out int value))
{
    Console.WriteLine($"Found: {value}");
}

// PATTERN 2: GetValueOrDefault (.NET 6+)
int val = dict.GetValueOrDefault("missing", 0); // returns 0 if key absent

// PATTERN 3: TryAdd — add only if key doesn't exist
dict.TryAdd("key", 100); // returns false if key already exists

// PATTERN 4: Counting frequency
int[] nums = { 1, 2, 2, 3, 3, 3 };
var freq = new Dictionary<int, int>();
foreach (int n in nums)
{
    freq[n] = freq.GetValueOrDefault(n, 0) + 1;
    // OR: freq.TryGetValue(n, out int c); freq[n] = c + 1;
}
// freq = {1:1, 2:2, 3:3}

// PATTERN 5: Grouping
var groups = new Dictionary<char, List<string>>();
string[] words = { "eat", "tea", "tan", "ate", "nat", "bat" };
foreach (string w in words)
{
    char first = w[0];
    if (!groups.ContainsKey(first))
        groups[first] = new List<string>();
    groups[first].Add(w);
}
```

> **Tip:** Always prefer `TryGetValue` over checking `ContainsKey` then indexing — it does one hash lookup instead of two.

---

## Implementing GetHashCode and Equals

When using custom types as dictionary keys, you **must** override both `GetHashCode()` and `Equals()`.

```csharp
public class Point : IEquatable<Point>
{
    public int X { get; }
    public int Y { get; }

    public Point(int x, int y) { X = x; Y = y; }

    public override int GetHashCode()
    {
        return HashCode.Combine(X, Y); // .NET built-in combiner
    }

    public override bool Equals(object? obj) => Equals(obj as Point);

    public bool Equals(Point? other)
    {
        if (other is null) return false;
        return X == other.X && Y == other.Y;
    }
}
```

> **Warning:** If two objects are `Equal`, they **must** return the same `GetHashCode()`. The reverse is not required (collisions are allowed). Violating this contract silently breaks Dictionary and HashSet.

---

## Practice Problems

### Problem 1: Two Sum — Hash Map O(n) (LeetCode 1)

**Problem:** Given `nums` and `target`, return indices of two numbers that sum to target.

**Approach:** For each element, compute its complement (`target - nums[i]`). Check if the complement exists in a hash map. If yes, return both indices. If no, store the current element and its index.

```
  nums = [2, 7, 11, 15], target = 9

  Step 0: complement = 9 - 2 = 7, map = {}        → not found, store {2:0}
  Step 1: complement = 9 - 7 = 2, map = {2:0}     → FOUND! return [0, 1]
```

```csharp
public class Solution
{
    public int[] TwoSum(int[] nums, int target)
    {
        var map = new Dictionary<int, int>(); // value → index

        for (int i = 0; i < nums.Length; i++)
        {
            int complement = target - nums[i];

            if (map.TryGetValue(complement, out int j))
                return new int[] { j, i };

            map[nums[i]] = i;
        }

        throw new ArgumentException("No solution");
    }
}
```

**Complexity:**
- **Time:** O(n) — single pass, O(1) hash lookups
- **Space:** O(n) — hash map stores up to n entries

---

### Problem 2: Group Anagrams (LeetCode 49)

**Problem:** Given an array of strings, group the anagrams together.

**Approach:** Two strings are anagrams if they have the same characters in the same frequency. Sort each string to get a canonical form, then use that as a dictionary key to group.

```csharp
public class Solution
{
    public IList<IList<string>> GroupAnagrams(string[] strs)
    {
        var groups = new Dictionary<string, IList<string>>();

        foreach (string s in strs)
        {
            char[] chars = s.ToCharArray();
            Array.Sort(chars);
            string key = new string(chars);

            if (!groups.ContainsKey(key))
                groups[key] = new List<string>();

            groups[key].Add(s);
        }

        return groups.Values.ToList<IList<string>>();
    }
}
```

**Complexity:**
- **Time:** O(n * k log k) — where n = number of strings, k = max string length (sorting each string)
- **Space:** O(n * k) — storing all strings in the dictionary

> **Tip:** For an O(n * k) approach, use a frequency count array `int[26]` as the key instead of sorting. Convert it to a string like `"1#0#2#..."`.

---

### Problem 3: Top K Frequent Elements (LeetCode 347)

**Problem:** Given an integer array and `k`, return the `k` most frequent elements.

**Approach:** First, build a frequency map. Then use **bucket sort**: create an array where the index represents frequency, and each bucket holds elements with that frequency. Iterate from highest bucket down.

```
  nums = [1,1,1,2,2,3], k = 2

  Step 1 — freq map:  {1:3, 2:2, 3:1}

  Step 2 — bucket array (index = frequency):
  index: 0    1    2    3    4    5    6
         []  [3]  [2]  [1]  []   []   []

  Step 3 — scan right to left, collect k elements: [1, 2]
```

```csharp
public class Solution
{
    public int[] TopKFrequent(int[] nums, int k)
    {
        // Step 1: frequency map
        var freq = new Dictionary<int, int>();
        foreach (int n in nums)
            freq[n] = freq.GetValueOrDefault(n, 0) + 1;

        // Step 2: bucket sort — index = frequency
        var buckets = new List<int>[nums.Length + 1];
        for (int i = 0; i < buckets.Length; i++)
            buckets[i] = new List<int>();

        foreach (var kvp in freq)
            buckets[kvp.Value].Add(kvp.Key);

        // Step 3: collect top k from highest frequency bucket
        var result = new List<int>();
        for (int i = buckets.Length - 1; i >= 0 && result.Count < k; i--)
        {
            result.AddRange(buckets[i]);
        }

        return result.Take(k).ToArray();
    }
}
```

**Complexity:**
- **Time:** O(n) — frequency counting + bucket sort are both linear
- **Space:** O(n) — frequency map + buckets

---

## Common Mistakes

1. **Using mutable objects as dictionary keys** — If the hash code changes after insertion, the entry becomes unreachable. Always use immutable keys.
2. **Forgetting `GetHashCode` when overriding `Equals`** — Objects that are equal but have different hash codes break dictionary behavior silently.
3. **Assuming insertion order** — `Dictionary<K,V>` in .NET happens to preserve insertion order in practice, but this is **not guaranteed** by the specification. If you need order, use `SortedDictionary` or `LinkedList` + Dictionary.
4. **KeyNotFoundException** — Using `dict[key]` on a missing key throws. Always use `TryGetValue` or `ContainsKey` first.

---

## Interview Tips

- Two Sum is the **gateway problem** — if you can't do it with a hash map in O(n), interviewers move on fast.
- When asked "can you do better than O(n^2)?", think **hash map** first. Trading space for time is the core pattern.
- Mention that .NET uses **separate chaining** for collision resolution if asked about internals.
- Know the difference between `Dictionary` (unordered, O(1)) and `SortedDictionary` (balanced BST, O(log n)).
- Always mention **amortized** O(1) — individual operations can be O(n) during resize.

---

## Quiz

<details>
<summary><strong>Q1:</strong> What is the average time complexity of <code>Dictionary.TryGetValue</code>?</summary>

**O(1)** amortized. The key is hashed to find the bucket, then the chain (if any) is traversed. With a good hash function and low load factor, chain length is approximately 1.
</details>

<details>
<summary><strong>Q2:</strong> Why must <code>GetHashCode()</code> return the same value for objects that are <code>Equal</code>?</summary>

Because the dictionary uses the hash code to determine which bucket to look in. If two equal objects hash to different buckets, the dictionary will never find the match when searching — it looks in the wrong bucket.
</details>

<details>
<summary><strong>Q3:</strong> What collision resolution strategy does .NET's Dictionary use?</summary>

**Separate chaining.** Each bucket points to a chain of entries stored in the internal `_entries` array, linked via `next` indices.
</details>

<details>
<summary><strong>Q4:</strong> Why is the bucket sort approach for Top K Frequent Elements O(n) instead of O(n log n)?</summary>

Because the maximum possible frequency is `n` (the array length), so the bucket array has a fixed size of `n+1`. Building the frequency map is O(n), distributing into buckets is O(n), and scanning buckets is O(n). No comparison-based sort is needed.
</details>

<details>
<summary><strong>Q5:</strong> What is the difference between <code>HashSet&lt;T&gt;</code> and <code>Dictionary&lt;K,V&gt;</code>?</summary>

`HashSet<T>` stores only keys (for membership testing), while `Dictionary<K,V>` stores key-value pairs. Internally, both use hash tables. `HashSet` is like a `Dictionary` where you only care about the keys.
</details>
