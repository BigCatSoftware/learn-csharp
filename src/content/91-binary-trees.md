# Binary Trees — Fundamentals

## Tree Terminology

```
                    +---------+
                    |   10    |  <-- Root (depth 0)
                    +---------+
                   /           \
              +------+       +------+
              |  5   |       |  15  |   <-- depth 1
              +------+       +------+
             /      \             \
         +-----+ +-----+      +-----+
         |  3  | |  7  |      | 20  |  <-- depth 2 (leaves)
         +-----+ +-----+      +-----+

  Height of tree = 2  (longest root-to-leaf path)
  Depth of node 7 = 2  (edges from root to node)
  Leaf = node with no children (3, 7, 20)
  Internal node = node with at least one child (10, 5, 15)
  Subtree = a node and all its descendants
```

| Term        | Definition                                        |
|-------------|---------------------------------------------------|
| Root        | Topmost node (no parent)                          |
| Leaf        | Node with zero children                           |
| Height      | Longest path from node down to a leaf              |
| Depth       | Number of edges from the root to the node          |
| Level       | Depth + 1 (some definitions; be careful)           |
| Degree      | Number of children a node has (0, 1, or 2)        |

---

## Binary Tree Node in C\#

```csharp
public class TreeNode
{
    public int Val;
    public TreeNode? Left;
    public TreeNode? Right;

    public TreeNode(int val, TreeNode? left = null, TreeNode? right = null)
    {
        Val = val;
        Left = left;
        Right = right;
    }
}
```

---

## Traversals

### Traversal Order Diagrams

```
  Tree:       1
             / \
            2   3
           / \
          4   5

  Inorder   (Left, Root, Right):  4, 2, 5, 1, 3
  Preorder  (Root, Left, Right):  1, 2, 4, 5, 3
  Postorder (Left, Right, Root):  4, 5, 2, 3, 1
  Level-order (BFS):              1, 2, 3, 4, 5
```

### Recursive Implementations

```csharp
public void Inorder(TreeNode? node, List<int> result)
{
    if (node is null) return;
    Inorder(node.Left, result);
    result.Add(node.Val);         // visit between children
    Inorder(node.Right, result);
}

public void Preorder(TreeNode? node, List<int> result)
{
    if (node is null) return;
    result.Add(node.Val);         // visit before children
    Preorder(node.Left, result);
    Preorder(node.Right, result);
}

public void Postorder(TreeNode? node, List<int> result)
{
    if (node is null) return;
    Postorder(node.Left, result);
    Postorder(node.Right, result);
    result.Add(node.Val);         // visit after children
}
```

### Iterative Inorder (using a stack)

```csharp
public IList<int> InorderIterative(TreeNode? root)
{
    var result = new List<int>();
    var stack = new Stack<TreeNode>();
    var current = root;

    while (current is not null || stack.Count > 0)
    {
        // Go as far left as possible
        while (current is not null)
        {
            stack.Push(current);
            current = current.Left;
        }
        current = stack.Pop();
        result.Add(current.Val);
        current = current.Right;
    }
    return result;
}
```

### Level-Order Traversal (BFS with Queue)

```csharp
public IList<IList<int>> LevelOrder(TreeNode? root)
{
    var result = new List<IList<int>>();
    if (root is null) return result;

    var queue = new Queue<TreeNode>();
    queue.Enqueue(root);

    while (queue.Count > 0)
    {
        int levelSize = queue.Count;
        var level = new List<int>();

        for (int i = 0; i < levelSize; i++)
        {
            var node = queue.Dequeue();
            level.Add(node.Val);

            if (node.Left is not null) queue.Enqueue(node.Left);
            if (node.Right is not null) queue.Enqueue(node.Right);
        }
        result.Add(level);
    }
    return result;
}
```

### Iterative Preorder (using a stack)

```csharp
public IList<int> PreorderIterative(TreeNode? root)
{
    var result = new List<int>();
    if (root is null) return result;

    var stack = new Stack<TreeNode>();
    stack.Push(root);

    while (stack.Count > 0)
    {
        var node = stack.Pop();
        result.Add(node.Val);
        // Push right first so left is processed first
        if (node.Right is not null) stack.Push(node.Right);
        if (node.Left is not null) stack.Push(node.Left);
    }
    return result;
}
```

---

## Complexity

| Traversal    | Time | Space      | Notes                          |
|--------------|------|------------|--------------------------------|
| Inorder      | O(n) | O(h) stack | h = height; O(log n) balanced, O(n) skewed |
| Preorder     | O(n) | O(h) stack |                                |
| Postorder    | O(n) | O(h) stack |                                |
| Level-order  | O(n) | O(w) queue | w = max width of any level     |

> **Callout:** For a balanced tree, h = O(log n). For a completely skewed tree (like a linked list), h = O(n). Always state both cases in interviews.

---

## Practice Problem 1: Maximum Depth of Binary Tree

**Problem:** Return the maximum depth (number of nodes along the longest root-to-leaf path).

**Approach:** Recursively compute the depth of left and right subtrees. Return 1 + max of both.

```csharp
public int MaxDepth(TreeNode? root)
{
    if (root is null) return 0;
    return 1 + Math.Max(MaxDepth(root.Left), MaxDepth(root.Right));
}
```

**Complexity:** O(n) time (visit every node), O(h) space (recursion stack).

---

## Practice Problem 2: Same Tree

**Problem:** Check whether two binary trees are structurally identical with the same values.

**Approach:** Recursively compare: both null = true, one null = false, values differ = false.

```csharp
public bool IsSameTree(TreeNode? p, TreeNode? q)
{
    if (p is null && q is null) return true;
    if (p is null || q is null) return false;
    if (p.Val != q.Val) return false;

    return IsSameTree(p.Left, q.Left) && IsSameTree(p.Right, q.Right);
}
```

**Complexity:** O(n) time, O(h) space.

---

## Practice Problem 3: Invert Binary Tree

**Problem:** Mirror a binary tree — swap every left and right child.

```
  Input:       4            Output:      4
              / \                       / \
             2   7                     7   2
            / \ / \                   / \ / \
           1  3 6  9                 9  6 3  1
```

**Approach:** Recursively swap left and right children.

```csharp
public TreeNode? InvertTree(TreeNode? root)
{
    if (root is null) return null;

    // Swap children
    (root.Left, root.Right) = (root.Right, root.Left);

    // Recurse on both subtrees
    InvertTree(root.Left);
    InvertTree(root.Right);

    return root;
}
```

**Complexity:** O(n) time, O(h) space.

---

## Practice Problem 4: Subtree of Another Tree

**Problem:** Given trees `root` and `subRoot`, return true if `subRoot` is a subtree of `root`.

**Approach:** For every node in `root`, check if the subtree rooted there is identical to `subRoot` (using `IsSameTree`).

```csharp
public bool IsSubtree(TreeNode? root, TreeNode? subRoot)
{
    if (root is null) return subRoot is null;

    if (IsSameTree(root, subRoot)) return true;

    return IsSubtree(root.Left, subRoot) || IsSubtree(root.Right, subRoot);
}

private bool IsSameTree(TreeNode? p, TreeNode? q)
{
    if (p is null && q is null) return true;
    if (p is null || q is null) return false;
    return p.Val == q.Val
        && IsSameTree(p.Left, q.Left)
        && IsSameTree(p.Right, q.Right);
}
```

**Complexity:** O(n * m) time in the worst case, where n and m are the sizes of `root` and `subRoot`. O(h) space.

> **Callout:** An O(n + m) solution exists using tree serialization and KMP/Rabin-Karp string matching, but the recursive approach is expected in most interviews.

---

## Common Mistakes

1. **Confusing height and depth.** Height is measured downward (from node to leaf). Depth is measured upward (from root to node).
2. **Forgetting the base case** — every recursive tree function must handle `null`.
3. **BFS without tracking level size** — if you need levels, capture `queue.Count` at the start of each iteration.
4. **Stack overflow on deep trees** — for trees that could be very deep (100k+ nodes), use iterative traversal.
5. **Returning the wrong value from Invert** — make sure you return `root` after swapping so the parent can reconnect.

---

## Interview Tips

- **Start with the recursive solution.** It is cleaner and interviewers expect it. Mention you can convert to iterative if needed.
- **State the space complexity.** Many candidates forget the O(h) call stack. This matters for skewed trees.
- **Know all four traversals** and when each is useful: inorder for BST sorted output, preorder for serialization, postorder for deletion, level-order for level-based problems.
- **Draw the tree.** Always sketch the example before coding. It catches edge cases early.

---

## Quiz

<details>
<summary>1. What is the space complexity of a recursive inorder traversal on a balanced binary tree with n nodes?</summary>

**O(log n)**. The recursion depth equals the height of the tree, which is O(log n) for a balanced tree.
</details>

<details>
<summary>2. Which traversal visits nodes in sorted order for a Binary Search Tree?</summary>

**Inorder traversal** (Left, Root, Right). It visits the left subtree first (smaller values), then the root, then the right subtree (larger values), producing sorted output.
</details>

<details>
<summary>3. What data structure does level-order traversal use, and why?</summary>

A **queue** (FIFO). It processes nodes level by level: enqueue children of the current node, then process the next node from the front. A stack (LIFO) would give DFS order instead.
</details>

<details>
<summary>4. In the iterative inorder traversal, why do we push nodes while going left before popping?</summary>

To simulate the recursive call stack. In recursive inorder, we recurse left before visiting the current node. The stack stores ancestors we still need to visit. After reaching the leftmost node (null), we pop to visit it, then move to its right subtree.
</details>

<details>
<summary>5. Can you invert a binary tree iteratively? How?</summary>

Yes. Use BFS (queue) or DFS (stack). At each node, swap `Left` and `Right`, then enqueue/push both children. The logic is the same as recursive — just manage the traversal manually.
</details>
