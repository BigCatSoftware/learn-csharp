# Tree Depth and Path Problems

## Depth Calculation Strategies

Tree depth problems have two main approaches:

1. **Bottom-up (postorder):** Compute depths of children first, then combine at the parent. Used when you need information from both subtrees.
2. **Top-down (preorder):** Pass the current depth as a parameter. Used when you need depth from the root.

```csharp
// Bottom-up: returns the height of the subtree
int Height(TreeNode? node)
{
    if (node is null) return 0;
    return 1 + Math.Max(Height(node.Left), Height(node.Right));
}

// Top-down: passes depth as parameter
void TraverseWithDepth(TreeNode? node, int depth)
{
    if (node is null) return;
    // Use 'depth' here (e.g., record max)
    TraverseWithDepth(node.Left, depth + 1);
    TraverseWithDepth(node.Right, depth + 1);
}
```

---

## Diameter Concept

The **diameter** of a binary tree is the length of the longest path between any two nodes. This path may or may not pass through the root.

```
         1
        / \
       2   3
      / \
     4   5
    /
   6

  Longest path: 6 -> 4 -> 2 -> 1 -> 3  (length = 4 edges)

  But consider:
         1
        / \
       2   3
      / \
     4   5
    /     \
   6       7

  Longest path: 6 -> 4 -> 2 -> 5 -> 7  (length = 4 edges)
  This path does NOT go through the root!
```

> **Callout:** The diameter through a node = left height + right height. The overall diameter is the maximum over all nodes.

---

## Practice Problem 1: Diameter of Binary Tree

**Problem:** Return the diameter (number of edges on the longest path between any two nodes).

**Approach:** At each node, compute left height + right height. Track the global maximum.

```csharp
public class Solution
{
    private int _diameter = 0;

    public int DiameterOfBinaryTree(TreeNode? root)
    {
        Height(root);
        return _diameter;
    }

    private int Height(TreeNode? node)
    {
        if (node is null) return 0;

        int left = Height(node.Left);
        int right = Height(node.Right);

        // The path through this node has length left + right
        _diameter = Math.Max(_diameter, left + right);

        // Return height for the parent to use
        return 1 + Math.Max(left, right);
    }
}
```

**Complexity:** O(n) time (visit every node once), O(h) space.

---

## Practice Problem 2: Balanced Binary Tree

**Problem:** Determine if a binary tree is height-balanced (for every node, the heights of its two subtrees differ by at most 1).

**Approach:** Bottom-up check. Return -1 to signal imbalance; otherwise return height.

```
  Balanced:              Unbalanced:

       1                      1
      / \                    /
     2   3                  2
    / \                    /
   4   5                  3
                         /
  Heights: left=2,       4
  right=1, diff=1 OK
                         Height diff at node 1 = 3, not balanced
```

```csharp
public bool IsBalanced(TreeNode? root)
{
    return CheckHeight(root) != -1;
}

private int CheckHeight(TreeNode? node)
{
    if (node is null) return 0;

    int left = CheckHeight(node.Left);
    if (left == -1) return -1; // early termination

    int right = CheckHeight(node.Right);
    if (right == -1) return -1;

    if (Math.Abs(left - right) > 1)
        return -1; // imbalanced

    return 1 + Math.Max(left, right);
}
```

**Complexity:** O(n) time, O(h) space. The early termination with -1 avoids redundant computation.

> **Callout:** A naive approach that calls `Height()` at every node is O(n^2). The bottom-up approach above computes height and checks balance in a single pass.

---

## Practice Problem 3: Path Sum

**Problem:** Given a target sum, determine if the tree has a root-to-leaf path where values sum to the target.

```
  Target = 22

         5
        / \
       4   8
      /   / \
     11  13  4
    /  \      \
   7    2      1

  Path: 5 -> 4 -> 11 -> 2 = 22  => true
```

**Approach:** Subtract the current node's value from the target. At a leaf, check if the remaining sum is 0.

```csharp
public bool HasPathSum(TreeNode? root, int targetSum)
{
    if (root is null) return false;

    targetSum -= root.Val;

    // Leaf node: check if remaining sum is zero
    if (root.Left is null && root.Right is null)
        return targetSum == 0;

    return HasPathSum(root.Left, targetSum)
        || HasPathSum(root.Right, targetSum);
}
```

**Complexity:** O(n) time, O(h) space.

---

## Practice Problem 4: Maximum Path Sum

**Problem:** Find the maximum path sum. A path is any sequence of nodes connected by edges (does not need to go through the root or be root-to-leaf). Node values can be negative.

**The Four Cases at Each Node:**

```
  At any node, the max path sum involving this node is one of:

  Case 1: node alone          Case 2: node + left path
      [node]                   [left] -> [node]

  Case 3: node + right path   Case 4: node + left + right (full arch)
      [node] -> [right]       [left] -> [node] -> [right]

  Cases 1-3 can extend upward to the parent.
  Case 4 CANNOT extend upward (it already uses both sides).
```

```
  Example:
        -10
        /  \
       9   20
          /  \
         15   7

  Best path: 15 -> 20 -> 7 = 42
  (This is Case 4 at node 20)
```

```csharp
public class Solution
{
    private int _maxSum = int.MinValue;

    public int MaxPathSum(TreeNode? root)
    {
        MaxGain(root);
        return _maxSum;
    }

    // Returns the max "gain" this node can contribute to its parent
    // (only a single path — left or right, not both)
    private int MaxGain(TreeNode? node)
    {
        if (node is null) return 0;

        // Clamp negative gains to 0 (don't extend a negative path)
        int leftGain = Math.Max(0, MaxGain(node.Left));
        int rightGain = Math.Max(0, MaxGain(node.Right));

        // Case 4: path through this node as the "arch"
        int pathThroughNode = node.Val + leftGain + rightGain;
        _maxSum = Math.Max(_maxSum, pathThroughNode);

        // Return the best single-side path (Cases 1-3)
        return node.Val + Math.Max(leftGain, rightGain);
    }
}
```

**Complexity:** O(n) time, O(h) space.

> **Callout:** The key insight is separating what you **track globally** (the arch path, Case 4) from what you **return to the parent** (single-side path). The return value can only go one direction — left or right — because the parent needs to extend the path further.

---

## Practice Problem 5: Binary Tree Right Side View

**Problem:** Return the values visible from the right side (last node at each level).

```
         1
        / \
       2   3
        \   \
         5   4

  Right side view: [1, 3, 4]
  Level 0: 1         -> see 1
  Level 1: 2, 3      -> see 3
  Level 2: 5, 4      -> see 4
```

**Approach:** Level-order BFS. The last node in each level is the right-side node.

```csharp
public IList<int> RightSideView(TreeNode? root)
{
    var result = new List<int>();
    if (root is null) return result;

    var queue = new Queue<TreeNode>();
    queue.Enqueue(root);

    while (queue.Count > 0)
    {
        int levelSize = queue.Count;

        for (int i = 0; i < levelSize; i++)
        {
            var node = queue.Dequeue();

            // Last node in this level = right side view
            if (i == levelSize - 1)
                result.Add(node.Val);

            if (node.Left is not null) queue.Enqueue(node.Left);
            if (node.Right is not null) queue.Enqueue(node.Right);
        }
    }
    return result;
}
```

**Alternative — DFS approach:** Traverse right subtree first. Track the deepest level seen.

```csharp
public IList<int> RightSideViewDFS(TreeNode? root)
{
    var result = new List<int>();
    Dfs(root, 0, result);
    return result;
}

private void Dfs(TreeNode? node, int depth, List<int> result)
{
    if (node is null) return;

    // First node we see at this depth = rightmost (because we go right first)
    if (depth == result.Count)
        result.Add(node.Val);

    Dfs(node.Right, depth + 1, result); // right first
    Dfs(node.Left, depth + 1, result);
}
```

**Complexity:** Both approaches: O(n) time. BFS uses O(w) space (max width), DFS uses O(h) space.

---

## Complexity Summary

| Problem               | Time | Space |
|-----------------------|------|-------|
| Diameter              | O(n) | O(h)  |
| Balanced Tree         | O(n) | O(h)  |
| Path Sum              | O(n) | O(h)  |
| Maximum Path Sum      | O(n) | O(h)  |
| Right Side View       | O(n) | O(w) or O(h) |

---

## Common Mistakes

1. **Diameter: returning height instead of edge count.** If the problem asks for edges, the diameter is `leftHeight + rightHeight` (not +1).
2. **Max Path Sum: forgetting to clamp negatives.** If a subtree's gain is negative, it is better to not include it (clamp to 0).
3. **Max Path Sum: returning the arch path to the parent.** Only a single-direction path can extend upward.
4. **Path Sum: checking the sum at internal nodes.** The problem specifies root-to-**leaf** paths. An internal node with the correct sum does not count.
5. **Right Side View: assuming it is always the rightmost child.** A left child can appear in the right side view if there is no right child at that level.

---

## Interview Tips

- **Diameter and Max Path Sum share the same pattern:** compute something locally (using both children), update a global variable, but return a single-direction value to the parent.
- **Balanced Tree check should be O(n), not O(n^2).** The bottom-up approach is expected. If you write the naive version, immediately mention you can optimize.
- **For Path Sum variants** (all paths, path sum III), clarify whether paths must start at root and end at a leaf.
- **Right Side View** is a great warm-up BFS problem. Be ready for the DFS variant — it shows versatility.

---

## Quiz

<details>
<summary>1. Why can the diameter of a binary tree NOT pass through the root?</summary>

The longest path might connect two nodes deep in the same subtree. For example, in a tree where the left subtree is much deeper than the right, the diameter could be entirely within the left subtree, never visiting the root's right child.
</details>

<details>
<summary>2. In Maximum Path Sum, why do we clamp subtree gains to 0?</summary>

If a subtree's maximum gain is negative, including it would reduce the total path sum. It is better to skip that subtree entirely (start or end the path at the current node). Clamping to 0 effectively means "do not extend in that direction."
</details>

<details>
<summary>3. What is the difference between returning the "arch" and returning a "single-side path" in Max Path Sum?</summary>

The arch (node + left gain + right gain) goes through both children and cannot extend further upward — it is a complete path. The single-side path (node + max(left, right)) only extends in one direction, so the parent can continue the path. We track the arch globally but return the single-side value.
</details>

<details>
<summary>4. In the balanced tree check, what does returning -1 signify?</summary>

It signals that the subtree is already unbalanced. This acts as an early termination flag — once any subtree is found to be imbalanced, all ancestors return -1 immediately without further computation, keeping the algorithm O(n).
</details>

<details>
<summary>5. Can you solve Right Side View without BFS?</summary>

Yes, using DFS. Traverse the right subtree first. The first node encountered at each new depth level is the rightmost node at that level. Track depths with `result.Count` to know when you are visiting a depth for the first time.
</details>
