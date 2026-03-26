# Graph DFS

## Depth-First Search on Graphs

**DFS** explores a graph by going as deep as possible along each branch before backtracking. It uses a **stack** (or recursion's call stack) and is the foundation for cycle detection, topological sort, and finding connected components.

### DFS Exploration Order

```
Graph:                   DFS from node 0 (one possible order):

  0 --- 1 --- 4          Visit 0
  |     |                 Visit 1 (neighbor of 0)
  2 --- 3 --- 5          Visit 3 (neighbor of 1)
                          Visit 2 (neighbor of 3)
                          Backtrack to 3
                          Visit 5 (neighbor of 3)
                          Backtrack to 1
                          Visit 4 (neighbor of 1)

Order: 0 -> 1 -> 3 -> 2 -> 5 -> 4
```

> **Key Insight:** DFS naturally detects cycles in directed graphs by tracking nodes in the current recursion path. If you revisit a node on the current path, a cycle exists.

---

## DFS Templates in C#

### Recursive DFS

```csharp
public static void DfsRecursive(
    Dictionary<int, List<int>> graph, int node, HashSet<int> visited)
{
    visited.Add(node);
    Console.WriteLine($"Visiting {node}");

    foreach (int neighbor in graph[node])
    {
        if (!visited.Contains(neighbor))
            DfsRecursive(graph, neighbor, visited);
    }
}

// Usage:
// var visited = new HashSet<int>();
// DfsRecursive(graph, startNode, visited);
```

### Iterative DFS (using explicit stack)

```csharp
public static void DfsIterative(Dictionary<int, List<int>> graph, int start)
{
    var visited = new HashSet<int>();
    var stack = new Stack<int>();
    stack.Push(start);

    while (stack.Count > 0)
    {
        int node = stack.Pop();

        if (visited.Contains(node))
            continue;

        visited.Add(node);
        Console.WriteLine($"Visiting {node}");

        // Push neighbors in reverse order to visit in natural order
        foreach (int neighbor in graph[node])
        {
            if (!visited.Contains(neighbor))
                stack.Push(neighbor);
        }
    }
}
```

> **Recursive vs Iterative:** Recursive is cleaner for most interview problems. Use iterative when the graph is very deep (to avoid stack overflow) or when you need explicit control over the traversal stack.

---

## Cycle Detection in Directed Graphs

Use three states for each node: **unvisited**, **in current path**, **fully processed**.

```csharp
public static bool HasCycle(Dictionary<int, List<int>> graph, int numNodes)
{
    // 0 = unvisited, 1 = in current path, 2 = fully processed
    var state = new int[numNodes];

    for (int i = 0; i < numNodes; i++)
    {
        if (state[i] == 0 && DfsDetectCycle(graph, i, state))
            return true;
    }
    return false;
}

private static bool DfsDetectCycle(
    Dictionary<int, List<int>> graph, int node, int[] state)
{
    state[node] = 1; // mark as "in current path"

    if (graph.ContainsKey(node))
    {
        foreach (int neighbor in graph[node])
        {
            if (state[neighbor] == 1) return true;  // back edge = cycle
            if (state[neighbor] == 0 && DfsDetectCycle(graph, neighbor, state))
                return true;
        }
    }

    state[node] = 2; // mark as fully processed
    return false;
}
```

### Cycle Detection Diagram

```
Directed graph with a cycle:

  0 --> 1 --> 2
        ^     |
        |     v
        +---- 3

DFS from 0:
  Visit 0 (state: in-path)
  Visit 1 (state: in-path)
  Visit 2 (state: in-path)
  Visit 3 (state: in-path)
  3 -> 1: node 1 is in current path => CYCLE DETECTED!
```

---

## Finding Connected Components

For undirected graphs, run DFS from each unvisited node.

```csharp
public static List<List<int>> FindConnectedComponents(
    Dictionary<int, List<int>> graph, int numNodes)
{
    var visited = new HashSet<int>();
    var components = new List<List<int>>();

    for (int i = 0; i < numNodes; i++)
    {
        if (!visited.Contains(i))
        {
            var component = new List<int>();
            DfsCollect(graph, i, visited, component);
            components.Add(component);
        }
    }

    return components;
}

private static void DfsCollect(
    Dictionary<int, List<int>> graph, int node,
    HashSet<int> visited, List<int> component)
{
    visited.Add(node);
    component.Add(node);

    if (graph.ContainsKey(node))
    {
        foreach (int neighbor in graph[node])
        {
            if (!visited.Contains(neighbor))
                DfsCollect(graph, neighbor, visited, component);
        }
    }
}
```

---

## Complexity

| Aspect | Complexity |
|--------|-----------|
| Time | O(V + E) |
| Space | O(V) for visited set + O(V) recursion depth |
| Shortest path? | No — DFS does NOT guarantee shortest path |

---

## Practice Problems

### Problem 1: Pacific Atlantic Water Flow (LeetCode 417)

**Problem:** Given a grid of heights, find all cells from which water can flow to both the Pacific ocean (top and left edges) and the Atlantic ocean (bottom and right edges). Water flows to neighbors with equal or lower height.

**Approach:** Reverse thinking — DFS from ocean borders inward. A cell that is reachable from both oceans is in the answer.

```csharp
public class Solution
{
    private int _rows, _cols;
    private int[][] _heights;
    private int[][] _dirs = { new[]{0,1}, new[]{0,-1}, new[]{1,0}, new[]{-1,0} };

    public IList<IList<int>> PacificAtlantic(int[][] heights)
    {
        _heights = heights;
        _rows = heights.Length;
        _cols = heights[0].Length;

        var pacific = new bool[_rows, _cols];
        var atlantic = new bool[_rows, _cols];

        // DFS from Pacific borders (top row, left column)
        for (int c = 0; c < _cols; c++) Dfs(0, c, pacific, int.MinValue);
        for (int r = 0; r < _rows; r++) Dfs(r, 0, pacific, int.MinValue);

        // DFS from Atlantic borders (bottom row, right column)
        for (int c = 0; c < _cols; c++) Dfs(_rows - 1, c, atlantic, int.MinValue);
        for (int r = 0; r < _rows; r++) Dfs(r, _cols - 1, atlantic, int.MinValue);

        // Collect cells reachable from both oceans
        var result = new List<IList<int>>();
        for (int r = 0; r < _rows; r++)
            for (int c = 0; c < _cols; c++)
                if (pacific[r, c] && atlantic[r, c])
                    result.Add(new List<int> { r, c });

        return result;
    }

    private void Dfs(int r, int c, bool[,] reachable, int prevHeight)
    {
        if (r < 0 || r >= _rows || c < 0 || c >= _cols)
            return;
        if (reachable[r, c] || _heights[r][c] < prevHeight)
            return;

        reachable[r, c] = true;

        foreach (var d in _dirs)
            Dfs(r + d[0], c + d[1], reachable, _heights[r][c]);
    }
}
```

**Complexity:** O(rows * cols) time and space.

---

### Problem 2: Number of Connected Components (LeetCode 323)

**Problem:** Given n nodes labeled 0 to n-1 and a list of undirected edges, find the number of connected components.

**Approach:** Build adjacency list and count how many times you start a new DFS.

```csharp
public class Solution
{
    public int CountComponents(int n, int[][] edges)
    {
        // Build adjacency list
        var graph = new Dictionary<int, List<int>>();
        for (int i = 0; i < n; i++)
            graph[i] = new List<int>();

        foreach (var edge in edges)
        {
            graph[edge[0]].Add(edge[1]);
            graph[edge[1]].Add(edge[0]);
        }

        var visited = new HashSet<int>();
        int components = 0;

        for (int i = 0; i < n; i++)
        {
            if (!visited.Contains(i))
            {
                components++;
                Dfs(graph, i, visited);
            }
        }

        return components;
    }

    private void Dfs(Dictionary<int, List<int>> graph, int node, HashSet<int> visited)
    {
        visited.Add(node);
        foreach (int neighbor in graph[node])
        {
            if (!visited.Contains(neighbor))
                Dfs(graph, neighbor, visited);
        }
    }
}
```

**Complexity:** O(V + E) time, O(V + E) space.

> **Alternative:** Union-Find also solves this in O(V + E * alpha(V)) which is nearly O(V + E).

---

### Problem 3: Course Schedule (LeetCode 207)

**Problem:** There are `numCourses` courses labeled 0 to numCourses-1. Prerequisites are given as pairs `[a, b]` meaning you must take b before a. Determine if it is possible to finish all courses (i.e., no cycles in the prerequisite graph).

**Approach:** Model as a directed graph and detect cycles using DFS with three-state coloring.

```csharp
public class Solution
{
    public bool CanFinish(int numCourses, int[][] prerequisites)
    {
        // Build directed graph: prerequisite -> course
        var graph = new Dictionary<int, List<int>>();
        for (int i = 0; i < numCourses; i++)
            graph[i] = new List<int>();

        foreach (var p in prerequisites)
            graph[p[1]].Add(p[0]); // edge from prerequisite to course

        // 0 = unvisited, 1 = in current path, 2 = done
        var state = new int[numCourses];

        for (int i = 0; i < numCourses; i++)
        {
            if (state[i] == 0 && HasCycle(graph, i, state))
                return false; // cycle found — impossible to finish
        }

        return true;
    }

    private bool HasCycle(Dictionary<int, List<int>> graph, int node, int[] state)
    {
        state[node] = 1;

        foreach (int next in graph[node])
        {
            if (state[next] == 1) return true;  // cycle!
            if (state[next] == 0 && HasCycle(graph, next, state))
                return true;
        }

        state[node] = 2;
        return false;
    }
}
```

**Complexity:** O(V + E) time and space.

---

## DFS on Grids — Quick Reference

```csharp
// Grid DFS template
int[][] dirs = { new[]{0,1}, new[]{0,-1}, new[]{1,0}, new[]{-1,0} };

void Dfs(int[][] grid, int r, int c, bool[,] visited)
{
    if (r < 0 || r >= grid.Length || c < 0 || c >= grid[0].Length)
        return;
    if (visited[r, c] || grid[r][c] == 0) // boundary conditions
        return;

    visited[r, c] = true;

    foreach (var d in dirs)
        Dfs(grid, r + d[0], c + d[1], visited);
}
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using only two states for cycle detection | Need three states (unvisited / in-path / done); two states causes false positives in directed graphs |
| Forgetting to handle disconnected components | Loop through ALL nodes, not just node 0 |
| Stack overflow on deep graphs | Switch to iterative DFS or increase stack size |
| Using DFS for shortest path | DFS does not find shortest paths — use BFS for that |
| Not building both directions for undirected graphs | Add edge (u,v) AND (v,u) |

---

## Interview Tips

- DFS is best for: cycle detection, topological sort, pathfinding (all paths), connected components.
- BFS is better for: shortest path in unweighted graphs, level-order processing.
- For cycle detection in undirected graphs, you only need two states (visited/not), but you must track the parent to avoid false positives on the edge you came from.
- The "reverse DFS from borders" technique (Pacific Atlantic) is a powerful pattern for grid problems.
- Know both recursive and iterative implementations.

---

## Quiz

<details>
<summary>1. What is the time complexity of DFS on a graph with V vertices and E edges?</summary>

**O(V + E)** — same as BFS. Each vertex is visited once, and each edge is examined once.
</details>

<details>
<summary>2. Why do we need three states (not two) for cycle detection in directed graphs?</summary>

Two states (visited/not) would flag revisiting a fully-processed node as a cycle, even when it is not. Three states distinguish between a node that is on the current DFS path (true back-edge = cycle) and one that was fully processed in a previous traversal (not a cycle).
</details>

<details>
<summary>3. When should you use iterative DFS instead of recursive DFS?</summary>

When the graph can be very deep (thousands of levels), recursive DFS may cause a stack overflow. Iterative DFS with an explicit stack avoids this. Also use iterative when you need more control over traversal order.
</details>

<details>
<summary>4. In the Pacific Atlantic problem, why do we DFS from the ocean borders inward?</summary>

DFS from every cell to the ocean would be O((rows*cols)^2). Reversing the direction — starting from the ocean and flowing "uphill" — lets us mark all cells reachable from each ocean in O(rows*cols) total.
</details>

<details>
<summary>5. Can DFS find the shortest path in an unweighted graph?</summary>

**No.** DFS may find a path, but it is not guaranteed to be the shortest. BFS is the correct algorithm for shortest paths in unweighted graphs.
</details>
