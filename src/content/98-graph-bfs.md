# Graph BFS

## Breadth-First Search on Graphs

**BFS** explores a graph level by level using a **queue**. It visits all neighbors of the current node before moving deeper, making it ideal for finding the **shortest path in unweighted graphs**.

### BFS Exploration Order

```
Graph:                   BFS from node 0:

  0 --- 1 --- 4          Level 0: [0]
  |     |                 Level 1: [1, 2]
  2 --- 3 --- 5          Level 2: [3, 4]
                          Level 3: [5]

Exploration order: 0 -> 1 -> 2 -> 3 -> 4 -> 5
```

> **Key Insight:** BFS guarantees that the first time you reach a node, you have found the shortest path to it (in terms of edge count). This is why BFS is the go-to for shortest path in unweighted graphs.

---

## BFS Template in C#

```csharp
// Generic BFS on a graph represented as an adjacency list
public static void Bfs(Dictionary<int, List<int>> graph, int start)
{
    var visited = new HashSet<int> { start };
    var queue = new Queue<int>();
    queue.Enqueue(start);

    int level = 0;

    while (queue.Count > 0)
    {
        int size = queue.Count; // process one level at a time
        for (int i = 0; i < size; i++)
        {
            int node = queue.Dequeue();
            Console.WriteLine($"Level {level}: visiting node {node}");

            foreach (int neighbor in graph[node])
            {
                if (!visited.Contains(neighbor))
                {
                    visited.Add(neighbor);
                    queue.Enqueue(neighbor);
                }
            }
        }
        level++;
    }
}
```

### BFS for Shortest Path (Unweighted)

```csharp
public static int ShortestPath(Dictionary<int, List<int>> graph, int start, int end)
{
    if (start == end) return 0;

    var visited = new HashSet<int> { start };
    var queue = new Queue<int>();
    queue.Enqueue(start);
    int distance = 0;

    while (queue.Count > 0)
    {
        distance++;
        int size = queue.Count;

        for (int i = 0; i < size; i++)
        {
            int node = queue.Dequeue();

            foreach (int neighbor in graph[node])
            {
                if (neighbor == end)
                    return distance;

                if (visited.Add(neighbor))
                    queue.Enqueue(neighbor);
            }
        }
    }

    return -1; // no path found
}
```

---

## Complexity

| Aspect | Complexity |
|--------|-----------|
| Time | O(V + E) — visit every vertex and edge once |
| Space | O(V) — queue and visited set |
| Shortest path guarantee | Yes, for unweighted graphs |

---

## Practice Problems

### Problem 1: Number of Islands (LeetCode 200)

**Problem:** Given a 2D grid of `'1'`s (land) and `'0'`s (water), count the number of islands. An island is surrounded by water and formed by connecting adjacent lands horizontally or vertically.

**Approach:** Iterate through the grid. When you find a `'1'`, run BFS to mark the entire island as visited, and increment the count.

```csharp
public class Solution
{
    public int NumIslands(char[][] grid)
    {
        int rows = grid.Length, cols = grid[0].Length;
        int count = 0;
        int[][] dirs = { new[]{0,1}, new[]{0,-1}, new[]{1,0}, new[]{-1,0} };

        for (int r = 0; r < rows; r++)
        {
            for (int c = 0; c < cols; c++)
            {
                if (grid[r][c] == '1')
                {
                    count++;
                    // BFS to mark entire island
                    var queue = new Queue<(int r, int c)>();
                    queue.Enqueue((r, c));
                    grid[r][c] = '0'; // mark visited

                    while (queue.Count > 0)
                    {
                        var (cr, cc) = queue.Dequeue();
                        foreach (var d in dirs)
                        {
                            int nr = cr + d[0], nc = cc + d[1];
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols
                                && grid[nr][nc] == '1')
                            {
                                grid[nr][nc] = '0';
                                queue.Enqueue((nr, nc));
                            }
                        }
                    }
                }
            }
        }

        return count;
    }
}
```

**Complexity:** O(rows * cols) time, O(min(rows, cols)) space for the queue.

---

### Problem 2: Clone Graph (LeetCode 133)

**Problem:** Given a reference to a node in a connected undirected graph, return a deep copy (clone).

**Approach:** BFS through the original graph. Use a dictionary to map original nodes to their clones.

```csharp
public class Solution
{
    public Node? CloneGraph(Node? node)
    {
        if (node is null) return null;

        // Map: original node -> cloned node
        var clones = new Dictionary<Node, Node>();
        clones[node] = new Node(node.val);

        var queue = new Queue<Node>();
        queue.Enqueue(node);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();

            foreach (var neighbor in current.neighbors)
            {
                if (!clones.ContainsKey(neighbor))
                {
                    // Clone the neighbor and map it
                    clones[neighbor] = new Node(neighbor.val);
                    queue.Enqueue(neighbor);
                }
                // Connect the cloned current to the cloned neighbor
                clones[current].neighbors.Add(clones[neighbor]);
            }
        }

        return clones[node];
    }
}
```

**Complexity:** O(V + E) time and space.

---

### Problem 3: Rotting Oranges (LeetCode 994)

**Problem:** In a grid, `0` = empty, `1` = fresh orange, `2` = rotten orange. Every minute, fresh oranges adjacent to rotten ones become rotten. Return the minimum minutes until no fresh oranges remain, or -1 if impossible.

**Approach:** Multi-source BFS — start from all rotten oranges simultaneously. Each BFS level is one minute.

```csharp
public class Solution
{
    public int OrangesRotting(int[][] grid)
    {
        int rows = grid.Length, cols = grid[0].Length;
        var queue = new Queue<(int r, int c)>();
        int fresh = 0;

        // Initialize: enqueue all rotten oranges, count fresh
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++)
            {
                if (grid[r][c] == 2) queue.Enqueue((r, c));
                else if (grid[r][c] == 1) fresh++;
            }

        if (fresh == 0) return 0;

        int[][] dirs = { new[]{0,1}, new[]{0,-1}, new[]{1,0}, new[]{-1,0} };
        int minutes = 0;

        while (queue.Count > 0)
        {
            int size = queue.Count;
            bool rotted = false;

            for (int i = 0; i < size; i++)
            {
                var (cr, cc) = queue.Dequeue();

                foreach (var d in dirs)
                {
                    int nr = cr + d[0], nc = cc + d[1];
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols
                        && grid[nr][nc] == 1)
                    {
                        grid[nr][nc] = 2;
                        fresh--;
                        rotted = true;
                        queue.Enqueue((nr, nc));
                    }
                }
            }

            if (rotted) minutes++;
        }

        return fresh == 0 ? minutes : -1;
    }
}
```

**Complexity:** O(rows * cols) time and space.

---

### Problem 4: Word Ladder (LeetCode 127)

**Problem:** Given `beginWord`, `endWord`, and a word list, find the length of the shortest transformation sequence where each step changes exactly one letter and each intermediate word must be in the word list.

**Approach:** BFS where each word is a node and edges connect words that differ by one letter. Use wildcard patterns to find neighbors efficiently.

```csharp
public class Solution
{
    public int LadderLength(string beginWord, string endWord, IList<string> wordList)
    {
        var wordSet = new HashSet<string>(wordList);
        if (!wordSet.Contains(endWord)) return 0;

        var visited = new HashSet<string> { beginWord };
        var queue = new Queue<string>();
        queue.Enqueue(beginWord);
        int steps = 1;

        while (queue.Count > 0)
        {
            int size = queue.Count;
            steps++;

            for (int i = 0; i < size; i++)
            {
                char[] word = queue.Dequeue().ToCharArray();

                // Try changing each position to every letter
                for (int j = 0; j < word.Length; j++)
                {
                    char original = word[j];

                    for (char c = 'a'; c <= 'z'; c++)
                    {
                        if (c == original) continue;
                        word[j] = c;
                        string next = new string(word);

                        if (next == endWord) return steps;

                        if (wordSet.Contains(next) && visited.Add(next))
                            queue.Enqueue(next);
                    }

                    word[j] = original; // restore
                }
            }
        }

        return 0; // no path
    }
}
```

**Complexity:** O(M^2 * N) time where M = word length, N = word list size. O(M * N) space.

---

## BFS on Grids — Quick Reference

```csharp
// Grid BFS template
int[][] dirs = { new[]{0,1}, new[]{0,-1}, new[]{1,0}, new[]{-1,0} };

var queue = new Queue<(int r, int c)>();
var visited = new bool[rows, cols];
queue.Enqueue((startR, startC));
visited[startR, startC] = true;

while (queue.Count > 0)
{
    var (r, c) = queue.Dequeue();
    foreach (var d in dirs)
    {
        int nr = r + d[0], nc = c + d[1];
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols
            && !visited[nr, nc] && grid[nr][nc] != WALL)
        {
            visited[nr, nc] = true;
            queue.Enqueue((nr, nc));
        }
    }
}
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Marking visited when dequeuing instead of enqueuing | Mark visited **when adding** to queue to avoid duplicate entries |
| Forgetting level-by-level processing | Capture `queue.Count` before the inner loop to process one level at a time |
| Not handling disconnected components | BFS from a single source only reaches its connected component |
| Using DFS for shortest path in unweighted graphs | DFS does NOT guarantee shortest path — use BFS |
| Modifying the grid without permission | Some problems expect the grid unchanged — use a separate visited array |

---

## Interview Tips

- BFS = shortest path in unweighted graphs. Always mention this property.
- Multi-source BFS (enqueue multiple starting points) is powerful for "simultaneous spread" problems.
- For word transformation problems, think of each word as a graph node.
- Grid BFS is extremely common — have the template memorized.
- If the graph is weighted, BFS alone will not find the shortest path — you need Dijkstra's.

---

## Quiz

<details>
<summary>1. Why does BFS guarantee the shortest path in an unweighted graph?</summary>

BFS explores nodes in order of their distance from the source. It visits all nodes at distance d before any node at distance d+1. So the first time a node is reached, it is via the shortest path.
</details>

<details>
<summary>2. What data structure does BFS use, and why?</summary>

A **queue** (FIFO). The FIFO property ensures nodes are processed in the order they were discovered, which maintains the level-by-level exploration pattern.
</details>

<details>
<summary>3. In the Rotting Oranges problem, why do we use multi-source BFS?</summary>

All rotten oranges spread rot simultaneously. By enqueuing all initially rotten oranges at once, each BFS level corresponds to one minute of simultaneous rotting from all sources.
</details>

<details>
<summary>4. What is the time complexity of BFS on a graph with V vertices and E edges?</summary>

**O(V + E)** — each vertex is enqueued and dequeued once (O(V)), and each edge is examined once when processing its endpoints (O(E)).
</details>

<details>
<summary>5. Why should you mark a node as visited when enqueuing rather than when dequeuing?</summary>

If you wait until dequeuing, the same node may be enqueued multiple times by different neighbors, wasting time and space. Marking on enqueue ensures each node enters the queue exactly once.
</details>
