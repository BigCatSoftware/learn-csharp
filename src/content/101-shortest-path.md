# Shortest Path Algorithms

## Overview

Finding the shortest path between vertices is one of the most important graph problems. The right algorithm depends on the graph's properties.

| Algorithm | Use Case | Negative Weights? | Time Complexity |
|-----------|----------|-------------------|-----------------|
| **BFS** | Unweighted graphs | N/A | O(V + E) |
| **Dijkstra's** | Non-negative weights | No | O((V + E) log V) |
| **Bellman-Ford** | Handles negative weights | Yes (detects neg cycles) | O(V * E) |
| **Floyd-Warshall** | All-pairs shortest path | Yes (no neg cycles) | O(V^3) |

---

## Dijkstra's Algorithm

**Idea:** Greedily expand the nearest unvisited vertex using a min-heap. Each vertex is finalized with its shortest distance when popped from the heap.

### Step-by-Step Diagram

```
Weighted graph:

  A --1-- B --3-- D
  |       |       |
  4       2       1
  |       |       |
  C --5-- E --2-- F

Start: A    Goal: F

Step 1: dist = {A:0, B:inf, C:inf, D:inf, E:inf, F:inf}
        Heap: [(A, 0)]

Step 2: Pop A(0). Update neighbors.
        B = min(inf, 0+1) = 1
        C = min(inf, 0+4) = 4
        dist = {A:0, B:1, C:4, D:inf, E:inf, F:inf}
        Heap: [(B,1), (C,4)]

Step 3: Pop B(1). Update neighbors.
        D = min(inf, 1+3) = 4
        E = min(inf, 1+2) = 3
        dist = {A:0, B:1, C:4, D:4, E:3, F:inf}
        Heap: [(E,3), (C,4), (D,4)]

Step 4: Pop E(3). Update neighbors.
        C = min(4, 3+5) = 4 (no change)
        F = min(inf, 3+2) = 5
        dist = {A:0, B:1, C:4, D:4, E:3, F:5}
        Heap: [(C,4), (D,4), (F,5)]

Step 5: Pop C(4). No better paths found.

Step 6: Pop D(4). Update neighbors.
        F = min(5, 4+1) = 5 (no change)

Step 7: Pop F(5). Done!

Shortest path A -> F = 5 (A -> B -> E -> F)
```

### Dijkstra's in C#

```csharp
public static int[] Dijkstra(
    Dictionary<int, List<(int to, int weight)>> graph, int source, int numNodes)
{
    var dist = new int[numNodes];
    Array.Fill(dist, int.MaxValue);
    dist[source] = 0;

    // Min-heap: (distance, node)
    var pq = new PriorityQueue<int, int>();
    pq.Enqueue(source, 0);

    while (pq.Count > 0)
    {
        int node = pq.Dequeue();

        // Process each neighbor
        if (!graph.ContainsKey(node)) continue;

        foreach (var (next, weight) in graph[node])
        {
            int newDist = dist[node] + weight;

            if (newDist < dist[next])
            {
                dist[next] = newDist;
                pq.Enqueue(next, newDist);
            }
        }
    }

    return dist;
}
```

> **Note:** We allow duplicate entries in the heap (lazy deletion). When a node is popped, if its distance is already finalized (popped dist > recorded dist), we skip it. This avoids the need for decrease-key.

### Dijkstra's with Path Reconstruction

```csharp
public static (int distance, List<int> path) DijkstraWithPath(
    Dictionary<int, List<(int to, int weight)>> graph,
    int source, int target, int numNodes)
{
    var dist = new int[numNodes];
    var prev = new int[numNodes];
    Array.Fill(dist, int.MaxValue);
    Array.Fill(prev, -1);
    dist[source] = 0;

    var pq = new PriorityQueue<int, int>();
    pq.Enqueue(source, 0);

    while (pq.Count > 0)
    {
        int node = pq.Dequeue();

        if (node == target) break; // early exit

        if (!graph.ContainsKey(node)) continue;

        foreach (var (next, weight) in graph[node])
        {
            int newDist = dist[node] + weight;
            if (newDist < dist[next])
            {
                dist[next] = newDist;
                prev[next] = node;
                pq.Enqueue(next, newDist);
            }
        }
    }

    // Reconstruct path
    var path = new List<int>();
    for (int at = target; at != -1; at = prev[at])
        path.Add(at);
    path.Reverse();

    if (path[0] != source) return (-1, new List<int>());
    return (dist[target], path);
}
```

---

## Bellman-Ford Algorithm

**Idea:** Relax all edges V-1 times. After V-1 iterations, all shortest paths are found. A Vth iteration that still improves a distance indicates a negative cycle.

```csharp
public static int[] BellmanFord(
    List<(int from, int to, int weight)> edges, int source, int numNodes)
{
    var dist = new int[numNodes];
    Array.Fill(dist, int.MaxValue);
    dist[source] = 0;

    // Relax all edges V-1 times
    for (int i = 0; i < numNodes - 1; i++)
    {
        bool updated = false;
        foreach (var (u, v, w) in edges)
        {
            if (dist[u] != int.MaxValue && dist[u] + w < dist[v])
            {
                dist[v] = dist[u] + w;
                updated = true;
            }
        }
        if (!updated) break; // early exit — no changes
    }

    // Check for negative cycles (Vth iteration)
    foreach (var (u, v, w) in edges)
    {
        if (dist[u] != int.MaxValue && dist[u] + w < dist[v])
            throw new InvalidOperationException("Graph contains a negative cycle");
    }

    return dist;
}
```

---

## Floyd-Warshall Algorithm

**Idea:** Dynamic programming over all pairs. For each intermediate vertex k, check if going through k improves the distance between every pair (i, j).

```csharp
public static int[,] FloydWarshall(int[,] graph, int numNodes)
{
    int INF = 100_000_000; // large sentinel, avoid overflow
    var dist = new int[numNodes, numNodes];

    // Initialize distance matrix
    for (int i = 0; i < numNodes; i++)
        for (int j = 0; j < numNodes; j++)
            dist[i, j] = (i == j) ? 0 : (graph[i, j] != 0 ? graph[i, j] : INF);

    // DP: try each vertex as intermediate
    for (int k = 0; k < numNodes; k++)
        for (int i = 0; i < numNodes; i++)
            for (int j = 0; j < numNodes; j++)
                if (dist[i, k] + dist[k, j] < dist[i, j])
                    dist[i, j] = dist[i, k] + dist[k, j];

    return dist;
}
```

---

## Practice Problems

### Problem 1: Network Delay Time (LeetCode 743)

**Problem:** Given a network of n nodes and weighted directed edges `times[i] = [u, v, w]`, find the time for a signal from node k to reach all nodes. Return -1 if impossible.

**Approach:** Classic Dijkstra. The answer is the maximum shortest distance to any node.

```csharp
public class Solution
{
    public int NetworkDelayTime(int[][] times, int n, int k)
    {
        // Build adjacency list (1-indexed nodes)
        var graph = new Dictionary<int, List<(int to, int w)>>();
        for (int i = 1; i <= n; i++)
            graph[i] = new List<(int, int)>();

        foreach (var t in times)
            graph[t[0]].Add((t[1], t[2]));

        // Dijkstra from source k
        var dist = new int[n + 1];
        Array.Fill(dist, int.MaxValue);
        dist[k] = 0;

        var pq = new PriorityQueue<int, int>();
        pq.Enqueue(k, 0);

        while (pq.Count > 0)
        {
            int node = pq.Dequeue();

            foreach (var (next, weight) in graph[node])
            {
                int newDist = dist[node] + weight;
                if (newDist < dist[next])
                {
                    dist[next] = newDist;
                    pq.Enqueue(next, newDist);
                }
            }
        }

        // Find the maximum distance (ignoring index 0)
        int maxDist = 0;
        for (int i = 1; i <= n; i++)
        {
            if (dist[i] == int.MaxValue) return -1;
            maxDist = Math.Max(maxDist, dist[i]);
        }

        return maxDist;
    }
}
```

**Complexity:** O((V + E) log V) time, O(V + E) space.

---

### Problem 2: Cheapest Flights Within K Stops (LeetCode 787)

**Problem:** Find the cheapest price from `src` to `dst` with at most k stops. Return -1 if no such route.

**Approach:** Modified Bellman-Ford — run only k+1 iterations instead of V-1. Each iteration relaxes edges using only the previous iteration's distances to respect the stop limit.

```csharp
public class Solution
{
    public int FindCheapestPrice(int n, int[][] flights, int src, int dst, int k)
    {
        var dist = new int[n];
        Array.Fill(dist, int.MaxValue);
        dist[src] = 0;

        // At most k+1 relaxation rounds (k stops = k+1 edges)
        for (int i = 0; i <= k; i++)
        {
            // Copy distances — use only previous round's values
            var prev = (int[])dist.Clone();
            bool updated = false;

            foreach (var flight in flights)
            {
                int u = flight[0], v = flight[1], w = flight[2];
                if (prev[u] != int.MaxValue && prev[u] + w < dist[v])
                {
                    dist[v] = prev[u] + w;
                    updated = true;
                }
            }

            if (!updated) break;
        }

        return dist[dst] == int.MaxValue ? -1 : dist[dst];
    }
}
```

**Complexity:** O(k * E) time, O(V) space.

> **Why clone the array?** Without cloning, a single round could chain updates (A->B->C) that use more stops than allowed. The clone ensures each round only extends paths by one edge.

---

### Problem 3: Path With Minimum Effort (LeetCode 1631)

**Problem:** You are at the top-left of a grid of heights. You can move to adjacent cells. The effort of a path is the maximum absolute difference in heights between consecutive cells. Find the minimum effort to reach the bottom-right.

**Approach:** Dijkstra where the "distance" is the maximum height difference along the path. The priority queue sorts by this effort value.

```csharp
public class Solution
{
    public int MinimumEffortPath(int[][] heights)
    {
        int rows = heights.Length, cols = heights[0].Length;
        int[][] dirs = { new[]{0,1}, new[]{0,-1}, new[]{1,0}, new[]{-1,0} };

        // dist[r][c] = minimum effort to reach (r, c)
        var dist = new int[rows][];
        for (int i = 0; i < rows; i++)
        {
            dist[i] = new int[cols];
            Array.Fill(dist[i], int.MaxValue);
        }
        dist[0][0] = 0;

        // Min-heap: (row, col) with priority = effort
        var pq = new PriorityQueue<(int r, int c), int>();
        pq.Enqueue((0, 0), 0);

        while (pq.Count > 0)
        {
            var (r, c) = pq.Dequeue();

            // Reached destination
            if (r == rows - 1 && c == cols - 1)
                return dist[r][c];

            foreach (var d in dirs)
            {
                int nr = r + d[0], nc = c + d[1];
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols)
                    continue;

                // Effort for this edge
                int edgeEffort = Math.Abs(heights[nr][nc] - heights[r][c]);
                // Path effort = max effort along the path
                int newEffort = Math.Max(dist[r][c], edgeEffort);

                if (newEffort < dist[nr][nc])
                {
                    dist[nr][nc] = newEffort;
                    pq.Enqueue((nr, nc), newEffort);
                }
            }
        }

        return dist[rows - 1][cols - 1];
    }
}
```

**Complexity:** O(rows * cols * log(rows * cols)) time, O(rows * cols) space.

---

## Algorithm Comparison Table

| Feature | Dijkstra | Bellman-Ford | Floyd-Warshall |
|---------|----------|-------------|----------------|
| **Source** | Single source | Single source | All pairs |
| **Negative edges** | No | Yes | Yes |
| **Negative cycle detection** | No | Yes | Partial |
| **Time** | O((V+E) log V) | O(V * E) | O(V^3) |
| **Space** | O(V + E) | O(V) | O(V^2) |
| **Best for** | Sparse, non-negative | Negative weights / k stops | Dense, all-pairs |

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using Dijkstra with negative weights | Dijkstra fails with negative edges — use Bellman-Ford |
| Integer overflow when adding to int.MaxValue | Check `dist[u] != int.MaxValue` before adding weight |
| Not cloning dist array in k-stop Bellman-Ford | Without clone, updates chain within one round, exceeding stop limit |
| Forgetting early exit in Dijkstra | Can exit when popping the target node — saves time |
| Using Floyd-Warshall for single-source | Overkill — use Dijkstra or Bellman-Ford for single source |

---

## Interview Tips

- Default to Dijkstra for weighted shortest path with non-negative weights.
- Know when to switch: negative weights? Bellman-Ford. All pairs? Floyd-Warshall. Unweighted? BFS.
- The "Cheapest Flights Within K Stops" pattern (bounded Bellman-Ford) is a common variant.
- For grid problems, Dijkstra works directly — each cell is a node, edges are to adjacent cells.
- Mention time/space tradeoffs when comparing algorithms.
- Dijkstra with a standard PriorityQueue (lazy deletion) is the practical approach; no need to implement decrease-key.

---

## Quiz

<details>
<summary>1. Why can't Dijkstra's algorithm handle negative edge weights?</summary>

Dijkstra's assumes that once a node is popped from the heap, its shortest distance is finalized. With negative weights, a later path through a negative edge could produce a shorter distance, violating this assumption.
</details>

<details>
<summary>2. What is the time complexity of Dijkstra's algorithm with a binary heap?</summary>

**O((V + E) log V)** — each vertex is extracted from the heap once (O(V log V)) and each edge may cause a heap insertion (O(E log V)).
</details>

<details>
<summary>3. How does Bellman-Ford detect negative cycles?</summary>

After V-1 relaxation rounds, all shortest paths are found (if no negative cycles). If a Vth round still reduces any distance, a negative cycle exists because distances can be reduced infinitely.
</details>

<details>
<summary>4. When would you choose Floyd-Warshall over running Dijkstra from every vertex?</summary>

Floyd-Warshall is O(V^3) and works with negative weights. Running Dijkstra from every vertex is O(V * (V + E) log V). For dense graphs (E close to V^2), Floyd-Warshall is simpler and comparable. For sparse graphs, repeated Dijkstra is faster.
</details>

<details>
<summary>5. In "Path With Minimum Effort," why do we use max instead of sum for path cost?</summary>

The problem defines effort as the maximum height difference along the path, not the sum. So Dijkstra's relaxation step uses `max(current_effort, edge_effort)` instead of `current_effort + edge_weight`. Dijkstra still works because max over non-negative values is monotonically non-decreasing.
</details>
