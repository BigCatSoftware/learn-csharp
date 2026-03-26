# Union Find (Disjoint Set Union)

*Track connected components efficiently*

Union Find (also called Disjoint Set Union or DSU) is a data structure that tracks a set of elements partitioned into disjoint (non-overlapping) subsets. It supports two primary operations — **Find** (which set does an element belong to?) and **Union** (merge two sets). With path compression and union by rank, both operations run in nearly O(1) amortized time.

## When to Use Union Find

- Detecting cycles in an undirected graph
- Counting connected components
- Determining if two nodes are in the same component
- Kruskal's Minimum Spanning Tree algorithm
- Grouping related items (accounts, synonyms, equivalences)

## Core Concepts

### The Parent Array

Every element points to a **parent**. A root element points to itself. Elements in the same set share the same root.

- Initial state (each element is its own set):
- parent: [0, 1, 2, 3, 4]
- Element: 0 — 1 — 2 — 3 — 4
- After Union(0,1) and Union(2,3):
- 0 — 1 — 2 — 3 — 4
- (set A) — (set B) — (set C)
- After Union(0,2):
- (set A+B merged) — 4 (set C)


### Path Compression

During **Find**, we make every node on the path point directly to the root. This flattens the tree:

- Before path compression — After Find(3) with compression
- | — / | \
- 1 — 1 — 2 — 3
- Find(3) visits 3 2 1 0 — Now Find(3) is O(1)


### Union by Rank

When merging two sets, attach the **shorter tree** under the **taller tree** to keep the structure flat:

- rank=2 — rank=1 — rank=2
- 0 — 3 — 0
- / \ — | — / | \
- 1 — 2 — 4 — 1 — 2 — 3
- Attach smaller rank under larger rank


## Full C# Implementation

```csharp
public class UnionFind
{
    private int[] _parent;
    private int[] _rank;
    public int Components { get; private set; }

    public UnionFind(int n)
    {
        _parent = new int[n];
        _rank = new int[n];
        Components = n;

        for (int i = 0; i < n; i++)
            _parent[i] = i; // each element is its own root
    }

    /// <summary>
    /// Find the root of x with path compression.
    /// </summary>
    public int Find(int x)
    {
        if (_parent[x] != x)
            _parent[x] = Find(_parent[x]); // path compression
        return _parent[x];
    }

    /// <summary>
    /// Union by rank. Returns false if already connected.
    /// </summary>
    public bool Union(int x, int y)
    {
        int rootX = Find(x);
        int rootY = Find(y);

        if (rootX == rootY) return false; // already in same set

        // Attach smaller rank tree under larger rank tree
        if (_rank[rootX] < _rank[rootY])
            _parent[rootX] = rootY;
        else if (_rank[rootX] > _rank[rootY])
            _parent[rootY] = rootX;
        else
        {
            _parent[rootY] = rootX;
            _rank[rootX]++;
        }

        Components--;
        return true;
    }

    /// <summary>
    /// Check if two elements are in the same set.
    /// </summary>
    public bool Connected(int x, int y) => Find(x) == Find(y);
}
```

## Complexity Analysis

| Operation | Without Optimization | With Path Compression + Union by Rank |
|-----------|---------------------|---------------------------------------|
| Find      | O(n) worst case     | O(α(n)) ≈ O(1) amortized            |
| Union     | O(n) worst case     | O(α(n)) ≈ O(1) amortized            |
| Space     | O(n)                | O(n)                                  |

> **Note:** α(n) is the inverse Ackermann function. For all practical values of n (up to ~10^80), α(n) ≤ 4. It is effectively constant.

---

## Practice Problems

### Problem 1: Number of Connected Components in an Undirected Graph

**Problem:** Given `n` nodes labeled `0` to `n-1` and a list of undirected edges, return the number of connected components.

**Approach:** Initialize Union Find with `n` nodes. Process each edge with Union. The remaining component count is the answer.

```csharp
public class Solution
{
    public int CountComponents(int n, int[][] edges)
    {
        var uf = new UnionFind(n);

        foreach (var edge in edges)
            uf.Union(edge[0], edge[1]);

        return uf.Components;
    }
}
```

**Complexity:** O(n + E · α(n)) time where E = number of edges, O(n) space.

---

### Problem 2: Redundant Connection (LeetCode 684)

**Problem:** A tree of `n` nodes has one extra edge added, creating exactly one cycle. Return the edge that can be removed to restore the tree. If multiple answers exist, return the one that appears last in the input.

**Approach:** Process edges one by one. The first edge where both endpoints are already connected forms the cycle — that is the redundant edge.

```csharp
public class Solution
{
    public int[] FindRedundantConnection(int[][] edges)
    {
        int n = edges.Length;
        var uf = new UnionFind(n + 1); // 1-indexed nodes

        foreach (var edge in edges)
        {
            // If Union returns false, both nodes already share a root
            // → this edge creates a cycle
            if (!uf.Union(edge[0], edge[1]))
                return edge;
        }

        return Array.Empty<int>(); // should not reach here
    }
}
```

**Complexity:** O(n · α(n)) time, O(n) space.

---

### Problem 3: Accounts Merge (LeetCode 721)

**Problem:** Given a list of accounts where each account is `[name, email1, email2, ...]`, merge accounts that share any email. Return merged accounts with sorted emails.

**Approach:**
1. Map each email to an integer ID.
2. For each account, union the first email's ID with all other email IDs in that account.
3. Group emails by their root ID.
4. Build the result with the account name and sorted emails.

```csharp
public class Solution
{
    public IList<IList<string>> AccountsMerge(IList<IList<string>> accounts)
    {
        var emailToId = new Dictionary<string, int>();
        var emailToName = new Dictionary<string, string>();
        int id = 0;

        // Step 1: Assign an ID to each unique email
        foreach (var account in accounts)
        {
            string name = account[0];
            for (int i = 1; i < account.Count; i++)
            {
                if (!emailToId.ContainsKey(account[i]))
                    emailToId[account[i]] = id++;
                emailToName[account[i]] = name;
            }
        }

        // Step 2: Union emails within the same account
        var uf = new UnionFind(id);
        foreach (var account in accounts)
        {
            int firstId = emailToId[account[1]];
            for (int i = 2; i < account.Count; i++)
                uf.Union(firstId, emailToId[account[i]]);
        }

        // Step 3: Group emails by root
        var groups = new Dictionary<int, List<string>>();
        foreach (var (email, eid) in emailToId)
        {
            int root = uf.Find(eid);
            if (!groups.ContainsKey(root))
                groups[root] = new List<string>();
            groups[root].Add(email);
        }

        // Step 4: Build result
        var result = new List<IList<string>>();
        foreach (var (root, emails) in groups)
        {
            emails.Sort(StringComparer.Ordinal);
            var merged = new List<string> { emailToName[emails[0]] };
            merged.AddRange(emails);
            result.Add(merged);
        }

        return result;
    }
}
```

**Complexity:** O(n · k · α(nk) + nk · log(nk)) time where n = accounts, k = avg emails per account. O(nk) space.

---

## Common Mistakes

1. **Forgetting path compression** — Without it, Find degrades to O(n) and the whole structure becomes a linked list.
2. **Off-by-one with 1-indexed nodes** — Many graph problems use 1-indexed nodes. Size the parent array as `n + 1`.
3. **Not tracking component count** — Many problems ask for the number of components. Decrement on every successful union.
4. **Using Union without checking the return value** — The boolean return tells you if a cycle was formed.

## Interview Tips

- Union Find is the go-to structure when you see "connected components," "grouping," or "equivalence."
- Always implement both **path compression** and **union by rank** — interviewers expect it.
- Know that Union Find cannot efficiently **split** sets. If you need to disconnect nodes, consider other approaches.
- For string-keyed problems (like Accounts Merge), map strings to integers first, then use standard Union Find.

---

## Quiz

<details>
<summary>1. What is the amortized time complexity of Find with path compression and union by rank?</summary>

O(α(n)), where α is the inverse Ackermann function. For all practical purposes this is O(1).
</details>

<details>
<summary>2. What does path compression do during a Find operation?</summary>

It makes every node on the path from the queried node to the root point directly to the root. This flattens the tree so future Find operations on those nodes are O(1).
</details>

<details>
<summary>3. Why do we use "union by rank" instead of always attaching the second tree under the first?</summary>

Union by rank keeps the tree height minimal by always attaching the shorter tree under the taller one. Without it, the tree can degenerate into a linked list with O(n) Find time.
</details>

<details>
<summary>4. How do you detect a cycle in an undirected graph using Union Find?</summary>

Process each edge with Union. If both endpoints already have the same root (Union returns false), that edge creates a cycle.
</details>

<details>
<summary>5. Can Union Find efficiently split a set into two subsets?</summary>

No. Union Find only supports merging. There is no efficient way to undo a union. If you need splits, consider link-cut trees or other data structures.
</details>
