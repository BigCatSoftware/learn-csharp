# Graph Theory Fundamentals

## What Is a Graph?

A **graph** is a collection of **vertices** (nodes) connected by **edges** (links). Graphs model relationships: social networks, road maps, dependencies, and much more.

```
Undirected Graph:           Directed Graph (Digraph):

  A --- B                     A ---> B
  |   / |                     |      |
  |  /  |                     v      v
  C --- D                     C ---> D
```

---

## Key Terminology

| Term | Definition |
|------|-----------|
| **Vertex (Node)** | A fundamental unit in a graph |
| **Edge** | A connection between two vertices |
| **Directed** | Edges have a direction (A -> B is not B -> A) |
| **Undirected** | Edges go both ways (A -- B means A -> B and B -> A) |
| **Weighted** | Edges carry a cost/distance |
| **Unweighted** | All edges have equal weight (or weight = 1) |
| **Cyclic** | Contains at least one cycle (path that returns to start) |
| **Acyclic** | No cycles exist |
| **DAG** | Directed Acyclic Graph — directed with no cycles |
| **Connected** | Every vertex is reachable from every other (undirected) |
| **Strongly Connected** | Every vertex reachable from every other (directed) |
| **Degree** | Number of edges incident to a vertex |
| **In-degree** | Number of incoming edges (directed graphs) |
| **Out-degree** | Number of outgoing edges (directed graphs) |
| **Path** | Sequence of vertices connected by edges |
| **Sparse** | Few edges relative to vertices (E << V^2) |
| **Dense** | Many edges relative to vertices (E close to V^2) |

---

## Graph Representations

### 1. Adjacency Matrix

A 2D array where `matrix[i][j] = 1` (or weight) if there is an edge from vertex i to vertex j.

```
Graph:                  Adjacency Matrix:
  0 --- 1                  0  1  2  3
  |   / |              0 [ 0  1  1  0 ]
  |  /  |              1 [ 1  0  1  1 ]
  2 --- 3              2 [ 1  1  0  1 ]
                       3 [ 0  1  1  0 ]
```

```csharp
public class AdjacencyMatrix
{
    private readonly int[,] _matrix;
    private readonly int _vertices;

    public AdjacencyMatrix(int vertices)
    {
        _vertices = vertices;
        _matrix = new int[vertices, vertices];
    }

    // Add undirected edge — O(1)
    public void AddEdge(int u, int v, int weight = 1)
    {
        _matrix[u, v] = weight;
        _matrix[v, u] = weight; // remove for directed graph
    }

    // Check if edge exists — O(1)
    public bool HasEdge(int u, int v) => _matrix[u, v] != 0;

    // Get all neighbors — O(V)
    public IEnumerable<int> GetNeighbors(int u)
    {
        for (int v = 0; v < _vertices; v++)
            if (_matrix[u, v] != 0)
                yield return v;
    }
}
```

### 2. Adjacency List

Each vertex stores a list of its neighbors. The most common representation for sparse graphs.

```
Graph:                  Adjacency List:
  0 --- 1              0 -> [1, 2]
  |   / |              1 -> [0, 2, 3]
  |  /  |              2 -> [0, 1, 3]
  2 --- 3              3 -> [1, 2]
```

```csharp
public class AdjacencyList
{
    private readonly Dictionary<int, List<(int neighbor, int weight)>> _adj = new();

    public void AddVertex(int v)
    {
        if (!_adj.ContainsKey(v))
            _adj[v] = new List<(int, int)>();
    }

    // Add undirected edge — O(1)
    public void AddEdge(int u, int v, int weight = 1)
    {
        AddVertex(u);
        AddVertex(v);
        _adj[u].Add((v, weight));
        _adj[v].Add((u, weight)); // remove for directed graph
    }

    // Get neighbors — O(1) to access list, O(degree) to iterate
    public IEnumerable<(int neighbor, int weight)> GetNeighbors(int u)
    {
        return _adj.ContainsKey(u) ? _adj[u] : Enumerable.Empty<(int, int)>();
    }

    // Check if edge exists — O(degree)
    public bool HasEdge(int u, int v)
    {
        return _adj.ContainsKey(u) && _adj[u].Any(e => e.neighbor == v);
    }
}
```

### 3. Edge List

Simply a list of all edges. Useful for algorithms like Kruskal's MST or Bellman-Ford.

```
Graph:                  Edge List:
  0 --- 1              (0, 1, w=1)
  |   / |              (0, 2, w=1)
  |  /  |              (1, 2, w=1)
  2 --- 3              (1, 3, w=1)
                       (2, 3, w=1)
```

```csharp
public class EdgeList
{
    public record Edge(int From, int To, int Weight = 1);

    private readonly List<Edge> _edges = new();
    private readonly HashSet<int> _vertices = new();

    // Add edge — O(1)
    public void AddEdge(int from, int to, int weight = 1)
    {
        _edges.Add(new Edge(from, to, weight));
        _vertices.Add(from);
        _vertices.Add(to);
    }

    public IReadOnlyList<Edge> GetAllEdges() => _edges;
    public int VertexCount => _vertices.Count;
    public int EdgeCount => _edges.Count;

    // Get neighbors — O(E)
    public IEnumerable<int> GetNeighbors(int u)
    {
        foreach (var e in _edges)
        {
            if (e.From == u) yield return e.To;
            if (e.To == u) yield return e.From; // remove for directed
        }
    }
}
```

---

## Complexity Comparison Table

| Operation | Adjacency Matrix | Adjacency List | Edge List |
|-----------|-----------------|----------------|-----------|
| **Space** | O(V^2) | O(V + E) | O(E) |
| **Add Edge** | O(1) | O(1) | O(1) |
| **Remove Edge** | O(1) | O(degree) | O(E) |
| **Has Edge?** | O(1) | O(degree) | O(E) |
| **Get Neighbors** | O(V) | O(degree) | O(E) |
| **Iterate All Edges** | O(V^2) | O(V + E) | O(E) |

> **When to use which:**
> - **Adjacency Matrix** — dense graphs, need O(1) edge lookup
> - **Adjacency List** — sparse graphs (most real-world graphs), general-purpose
> - **Edge List** — when you mainly iterate over all edges (Kruskal's, Bellman-Ford)

---

## Converting Between Representations

### Edge List to Adjacency List

```csharp
public static Dictionary<int, List<(int to, int w)>> EdgeListToAdjList(
    List<(int from, int to, int weight)> edges, int vertexCount)
{
    var adj = new Dictionary<int, List<(int, int)>>();
    for (int i = 0; i < vertexCount; i++)
        adj[i] = new List<(int, int)>();

    foreach (var (from, to, weight) in edges)
    {
        adj[from].Add((to, weight));
        adj[to].Add((from, weight)); // remove for directed
    }
    return adj;
}
```

### Adjacency List to Adjacency Matrix

```csharp
public static int[,] AdjListToMatrix(
    Dictionary<int, List<(int to, int w)>> adj, int vertexCount)
{
    var matrix = new int[vertexCount, vertexCount];

    foreach (var (u, neighbors) in adj)
        foreach (var (v, w) in neighbors)
            matrix[u, v] = w;

    return matrix;
}
```

### Adjacency Matrix to Edge List

```csharp
public static List<(int from, int to, int weight)> MatrixToEdgeList(
    int[,] matrix, int vertexCount, bool directed = false)
{
    var edges = new List<(int, int, int)>();

    for (int i = 0; i < vertexCount; i++)
    {
        // For undirected, only check upper triangle to avoid duplicates
        int start = directed ? 0 : i + 1;
        for (int j = start; j < vertexCount; j++)
        {
            if (matrix[i, j] != 0)
                edges.Add((i, j, matrix[i, j]));
        }
    }
    return edges;
}
```

---

## Building a Graph from Common Input Formats

Many interview problems give edges as a list of pairs. Here is how to build an adjacency list from typical inputs.

```csharp
// From int[][] edges (e.g., [[0,1],[1,2],[2,3]])
public static Dictionary<int, List<int>> BuildGraph(int n, int[][] edges)
{
    var graph = new Dictionary<int, List<int>>();
    for (int i = 0; i < n; i++)
        graph[i] = new List<int>();

    foreach (var edge in edges)
    {
        graph[edge[0]].Add(edge[1]);
        graph[edge[1]].Add(edge[0]); // remove for directed
    }
    return graph;
}
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using adjacency matrix for sparse graphs | Wastes O(V^2) space; use adjacency list for V >> sqrt(E) |
| Forgetting to add both directions for undirected graphs | Add edge (u,v) AND (v,u) |
| Off-by-one with 1-indexed vertices | Many problems use 1-indexed nodes; adjust array sizes accordingly |
| Not initializing adjacency list entries | Always initialize empty lists for all vertices before adding edges |
| Confusing directed and undirected in the same problem | Read the problem carefully — "connections" usually means undirected |

---

## Interview Tips

- Always clarify: directed or undirected? weighted or unweighted? can there be cycles?
- Default to adjacency list — it works well for almost all interview problems.
- Know the tradeoffs between representations and be ready to justify your choice.
- For grid-based graph problems, the grid itself is the implicit adjacency structure — you do not need to build an explicit graph.
- Mention that V and E define sparsity: a graph is sparse when E = O(V) and dense when E = O(V^2).

---

## Quiz

<details>
<summary>1. What is the maximum number of edges in a simple undirected graph with V vertices?</summary>

**V * (V - 1) / 2** — each pair of vertices can have at most one edge, and there are C(V, 2) pairs.
</details>

<details>
<summary>2. When would you choose an adjacency matrix over an adjacency list?</summary>

When the graph is **dense** (E is close to V^2) and you need O(1) edge existence checks. Also useful when you need to perform matrix operations (like Floyd-Warshall) on the graph.
</details>

<details>
<summary>3. What is the space complexity of an adjacency list for a graph with V vertices and E edges?</summary>

**O(V + E)** — V entries in the dictionary plus E total neighbor entries across all lists (2E for undirected since each edge is stored twice).
</details>

<details>
<summary>4. What is a DAG, and why is it important?</summary>

A **Directed Acyclic Graph** has directed edges and no cycles. DAGs are important because they support topological sorting, which is used in task scheduling, dependency resolution, and build systems.
</details>

<details>
<summary>5. In a directed graph, what is the difference between in-degree and out-degree?</summary>

**In-degree** is the number of edges pointing INTO a vertex. **Out-degree** is the number of edges going OUT of a vertex. In an undirected graph, there is just "degree" (the total number of incident edges).
</details>
