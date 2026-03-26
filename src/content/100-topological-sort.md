# Topological Sort

## What Is Topological Sort?

A **topological sort** produces a linear ordering of vertices in a **Directed Acyclic Graph (DAG)** such that for every directed edge (u, v), vertex u comes before v. It answers: "In what order should I process tasks given their dependencies?"

```
DAG:                          One valid topological order:
                              A -> B -> C -> D -> E -> F
  A ---> B ---> D
  |      |      |             Another valid order:
  v      v      v             A -> C -> B -> D -> E -> F
  C ---> E ---> F

(A must come before B and C; B before D and E; etc.)
```

> **Key Insight:** Topological sort only works on DAGs. If the graph has a cycle, no valid ordering exists — this is how we detect cycles in dependency graphs.

---

## Kahn's Algorithm (BFS with In-Degree)

**Idea:** Start with nodes that have no incoming edges (in-degree = 0). Remove them, reduce in-degrees of their neighbors, and repeat.

### Step-by-Step Example

```
Graph: A -> B -> D
       A -> C -> E -> F
       B -> E, D -> F

Step 1: Compute in-degrees
  A:0  B:1  C:1  D:1  E:2  F:2

Step 2: Enqueue nodes with in-degree 0
  Queue: [A]

Step 3: Process A, reduce neighbors
  B:0  C:0  D:1  E:2  F:2
  Queue: [B, C]    Output: [A]

Step 4: Process B, reduce neighbors
  D:0  E:1
  Queue: [C, D]    Output: [A, B]

Step 5: Process C, reduce neighbors
  E:0
  Queue: [D, E]    Output: [A, B, C]

Step 6: Process D, reduce neighbors
  F:1
  Queue: [E]       Output: [A, B, C, D]

Step 7: Process E, reduce neighbors
  F:0
  Queue: [F]       Output: [A, B, C, D, E]

Step 8: Process F
  Queue: []        Output: [A, B, C, D, E, F]  ✓
```

### Kahn's Algorithm in C#

```csharp
public static List<int> TopologicalSortKahn(
    Dictionary<int, List<int>> graph, int numNodes)
{
    // Step 1: Compute in-degrees
    var inDegree = new int[numNodes];
    foreach (var (node, neighbors) in graph)
        foreach (int neighbor in neighbors)
            inDegree[neighbor]++;

    // Step 2: Enqueue all nodes with in-degree 0
    var queue = new Queue<int>();
    for (int i = 0; i < numNodes; i++)
        if (inDegree[i] == 0)
            queue.Enqueue(i);

    var result = new List<int>();

    // Step 3: Process nodes
    while (queue.Count > 0)
    {
        int node = queue.Dequeue();
        result.Add(node);

        if (graph.ContainsKey(node))
        {
            foreach (int neighbor in graph[node])
            {
                inDegree[neighbor]--;
                if (inDegree[neighbor] == 0)
                    queue.Enqueue(neighbor);
            }
        }
    }

    // If result doesn't contain all nodes, there's a cycle
    if (result.Count != numNodes)
        return new List<int>(); // cycle detected — no valid ordering

    return result;
}
```

---

## DFS-Based Topological Sort

**Idea:** Perform DFS and add nodes to the result in **post-order** (after all descendants are processed). Reverse the result to get topological order.

```csharp
public static List<int> TopologicalSortDfs(
    Dictionary<int, List<int>> graph, int numNodes)
{
    var visited = new int[numNodes]; // 0=unvisited, 1=in-path, 2=done
    var result = new List<int>();

    for (int i = 0; i < numNodes; i++)
    {
        if (visited[i] == 0 && !Dfs(graph, i, visited, result))
            return new List<int>(); // cycle detected
    }

    result.Reverse(); // post-order reversed = topological order
    return result;
}

private static bool Dfs(
    Dictionary<int, List<int>> graph, int node,
    int[] visited, List<int> result)
{
    visited[node] = 1; // mark as in current path

    if (graph.ContainsKey(node))
    {
        foreach (int neighbor in graph[node])
        {
            if (visited[neighbor] == 1) return false; // cycle!
            if (visited[neighbor] == 0 && !Dfs(graph, neighbor, visited, result))
                return false;
        }
    }

    visited[node] = 2;
    result.Add(node); // post-order: add after processing all descendants
    return true;
}
```

---

## Comparison: Kahn's vs DFS-Based

| Aspect | Kahn's (BFS) | DFS-Based |
|--------|-------------|-----------|
| Approach | In-degree tracking | Post-order reversal |
| Cycle detection | result.Count < numNodes | Back-edge detection |
| Extra space | In-degree array + queue | Visited array + call stack |
| Output | One valid ordering (BFS-level) | One valid ordering (DFS-finish) |
| Parallelism hint | Nodes at same BFS level can run in parallel | Less natural |

---

## Complexity

| Aspect | Complexity |
|--------|-----------|
| Time | O(V + E) |
| Space | O(V + E) |

---

## Practice Problems

### Problem 1: Course Schedule (LeetCode 207)

**Problem:** Determine if you can finish all courses given prerequisites. `prerequisites[i] = [a, b]` means take b before a.

**Approach:** Build a directed graph and check for cycles using Kahn's algorithm. If the topological sort includes all courses, the answer is true.

```csharp
public class Solution
{
    public bool CanFinish(int numCourses, int[][] prerequisites)
    {
        var graph = new Dictionary<int, List<int>>();
        var inDegree = new int[numCourses];

        for (int i = 0; i < numCourses; i++)
            graph[i] = new List<int>();

        foreach (var p in prerequisites)
        {
            graph[p[1]].Add(p[0]);  // b -> a
            inDegree[p[0]]++;
        }

        var queue = new Queue<int>();
        for (int i = 0; i < numCourses; i++)
            if (inDegree[i] == 0)
                queue.Enqueue(i);

        int processed = 0;

        while (queue.Count > 0)
        {
            int course = queue.Dequeue();
            processed++;

            foreach (int next in graph[course])
            {
                inDegree[next]--;
                if (inDegree[next] == 0)
                    queue.Enqueue(next);
            }
        }

        return processed == numCourses;
    }
}
```

**Complexity:** O(V + E) time, O(V + E) space.

---

### Problem 2: Course Schedule II (LeetCode 210)

**Problem:** Return the ordering of courses you should take. If impossible, return an empty array.

**Approach:** Same as above but collect the actual order.

```csharp
public class Solution
{
    public int[] FindOrder(int numCourses, int[][] prerequisites)
    {
        var graph = new Dictionary<int, List<int>>();
        var inDegree = new int[numCourses];

        for (int i = 0; i < numCourses; i++)
            graph[i] = new List<int>();

        foreach (var p in prerequisites)
        {
            graph[p[1]].Add(p[0]);
            inDegree[p[0]]++;
        }

        var queue = new Queue<int>();
        for (int i = 0; i < numCourses; i++)
            if (inDegree[i] == 0)
                queue.Enqueue(i);

        var order = new List<int>();

        while (queue.Count > 0)
        {
            int course = queue.Dequeue();
            order.Add(course);

            foreach (int next in graph[course])
            {
                inDegree[next]--;
                if (inDegree[next] == 0)
                    queue.Enqueue(next);
            }
        }

        // If we processed all courses, return the order; else empty
        return order.Count == numCourses ? order.ToArray() : Array.Empty<int>();
    }
}
```

**Complexity:** O(V + E) time, O(V + E) space.

---

### Problem 3: Alien Dictionary (LeetCode 269)

**Problem:** Given a list of words sorted in an alien language's lexicographic order, derive the order of characters in that language.

**Approach:** Compare adjacent words to extract ordering rules (edges), then topological sort the character graph.

```csharp
public class Solution
{
    public string AlienOrder(string[] words)
    {
        // Build graph: character -> set of characters that come after it
        var graph = new Dictionary<char, HashSet<char>>();
        var inDegree = new Dictionary<char, int>();

        // Initialize all characters
        foreach (string word in words)
            foreach (char c in word)
            {
                if (!graph.ContainsKey(c)) graph[c] = new HashSet<char>();
                if (!inDegree.ContainsKey(c)) inDegree[c] = 0;
            }

        // Compare adjacent words to find ordering rules
        for (int i = 0; i < words.Length - 1; i++)
        {
            string w1 = words[i], w2 = words[i + 1];
            int minLen = Math.Min(w1.Length, w2.Length);

            // Edge case: "abc" before "ab" is invalid
            if (w1.Length > w2.Length && w1.StartsWith(w2))
                return "";

            for (int j = 0; j < minLen; j++)
            {
                if (w1[j] != w2[j])
                {
                    // w1[j] comes before w2[j]
                    if (graph[w1[j]].Add(w2[j]))
                        inDegree[w2[j]]++;
                    break; // only the first difference matters
                }
            }
        }

        // Kahn's algorithm
        var queue = new Queue<char>();
        foreach (var (ch, deg) in inDegree)
            if (deg == 0)
                queue.Enqueue(ch);

        var result = new List<char>();

        while (queue.Count > 0)
        {
            char ch = queue.Dequeue();
            result.Add(ch);

            foreach (char next in graph[ch])
            {
                inDegree[next]--;
                if (inDegree[next] == 0)
                    queue.Enqueue(next);
            }
        }

        // If not all characters are in result, there's a cycle
        return result.Count == inDegree.Count ? new string(result.ToArray()) : "";
    }
}
```

**Complexity:** O(C) time where C = total characters across all words. O(U + min(U^2, N)) space where U = unique characters, N = number of words.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Applying topological sort to a cyclic graph | Always check for cycles — if result has fewer nodes than the graph, a cycle exists |
| Forgetting to initialize graph entries for all nodes | Nodes with no outgoing edges still need entries; nodes with no incoming edges need in-degree = 0 |
| Wrong edge direction for prerequisites | `[a, b]` means b -> a (take b before a), NOT a -> b |
| Comparing non-adjacent words in Alien Dictionary | Only adjacent words give valid ordering information |
| Not handling the prefix edge case | "abc" before "ab" is invalid — check for this explicitly |

---

## Interview Tips

- Topological sort = dependency ordering. Whenever you see "order tasks with dependencies," think topological sort.
- Kahn's algorithm is usually easier to implement and reason about in interviews.
- The cycle detection is built into both approaches — you get it for free.
- Alien Dictionary is a classic "hidden topological sort" problem — practice recognizing when to extract a graph from the problem description.
- Know that multiple valid topological orderings can exist for the same DAG.

---

## Quiz

<details>
<summary>1. Can a graph with cycles have a valid topological ordering?</summary>

**No.** Topological sort is only defined for DAGs (Directed Acyclic Graphs). If a cycle exists, there is no way to linearly order the nodes such that all edges go forward.
</details>

<details>
<summary>2. How does Kahn's algorithm detect cycles?</summary>

If after processing all nodes with in-degree 0, the result contains fewer nodes than the total, some nodes were never enqueued. These nodes are part of a cycle (their in-degree never reached 0).
</details>

<details>
<summary>3. What is the time complexity of topological sort?</summary>

**O(V + E)** — we process each vertex once and examine each edge once when decrementing in-degrees (Kahn's) or during DFS traversal.
</details>

<details>
<summary>4. In the DFS-based approach, why do we reverse the post-order?</summary>

In DFS, a node is added to the result after all its descendants. This means dependencies are added first. Reversing gives us the correct order where a node appears before its dependents.
</details>

<details>
<summary>5. In Alien Dictionary, why do we only compare adjacent words?</summary>

Only adjacent words in a sorted list guarantee a direct ordering relationship. Non-adjacent words might differ in ways that do not provide new ordering constraints, or worse, could yield incorrect edges.
</details>
