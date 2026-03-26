# Binary Search Trees

## The BST Property

A Binary Search Tree (BST) is a binary tree where for every node:
- All values in the **left** subtree are **less than** the node's value.
- All values in the **right** subtree are **greater than** the node's value.

```
  Valid BST:                    Invalid BST:

         8                           8
        / \                         / \
       3   10                      3   10
      / \    \                    / \    \
     1   6   14                  1   9   14
        / \  /                      / \  /
       4  7 13                     4  7 13

  In the invalid tree, 9 is in the left subtree of 8 but 9 > 8.
```

> **Callout:** The BST property must hold for the **entire** subtree, not just immediate children. A common mistake is checking only `node.Left.Val < node.Val`.

---

## BST Operations

### Search — O(h)

```csharp
public TreeNode? Search(TreeNode? root, int target)
{
    if (root is null || root.Val == target)
        return root;

    return target < root.Val
        ? Search(root.Left, target)
        : Search(root.Right, target);
}
```

### Insert — O(h)

Find the correct null position and create the node.

```
  Insert 5 into BST:

       8              8
      / \    =>      / \
     3   10         3   10
      \              \
       6              6
                     /
                    5   <-- new node
```

```csharp
public TreeNode Insert(TreeNode? root, int val)
{
    if (root is null)
        return new TreeNode(val);

    if (val < root.Val)
        root.Left = Insert(root.Left, val);
    else
        root.Right = Insert(root.Right, val);

    return root;
}
```

### Delete — O(h)

Three cases:
1. **Leaf node:** Simply remove it.
2. **One child:** Replace node with its child.
3. **Two children:** Replace with inorder successor (smallest in right subtree), then delete the successor.

```csharp
public TreeNode? DeleteNode(TreeNode? root, int key)
{
    if (root is null) return null;

    if (key < root.Val)
    {
        root.Left = DeleteNode(root.Left, key);
    }
    else if (key > root.Val)
    {
        root.Right = DeleteNode(root.Right, key);
    }
    else
    {
        // Case 1 & 2: zero or one child
        if (root.Left is null) return root.Right;
        if (root.Right is null) return root.Left;

        // Case 3: two children — find inorder successor
        var successor = root.Right;
        while (successor.Left is not null)
            successor = successor.Left;

        root.Val = successor.Val;
        root.Right = DeleteNode(root.Right, successor.Val);
    }
    return root;
}
```

---

## Inorder Traversal Gives Sorted Output

```csharp
// Inorder of BST: always produces values in ascending order
public void Inorder(TreeNode? node, List<int> sorted)
{
    if (node is null) return;
    Inorder(node.Left, sorted);
    sorted.Add(node.Val);
    Inorder(node.Right, sorted);
}
```

```
  BST:       8
            / \
           3   10
          / \    \
         1   6   14

  Inorder: 1, 3, 6, 8, 10, 14  (sorted!)
```

---

## Balanced vs Unbalanced

| Shape     | Height | Search/Insert/Delete |
|-----------|--------|----------------------|
| Balanced  | O(log n) | O(log n)           |
| Skewed    | O(n)     | O(n) — degenerates to linked list |

```
  Balanced:          Skewed (worst case):

       4                1
      / \                \
     2   6                2
    / \ / \                \
   1  3 5  7                3
                             \
                              4

  Both have 4+ nodes but very different heights.
```

> **Callout:** Self-balancing trees (AVL, Red-Black) guarantee O(log n) height. C#'s `SortedSet<T>` and `SortedDictionary<TKey, TValue>` use Red-Black trees internally.

---

## BST Insertion Step-by-Step Example

Insert sequence: 8, 3, 10, 1, 6, 14, 4, 7, 13

```
  Step 1: Insert 8        Step 2: Insert 3       Step 3: Insert 10
       8                       8                       8
                              /                       / \
                             3                       3   10

  Step 4: Insert 1        Step 5: Insert 6       Step 6: Insert 14
       8                       8                       8
      / \                     / \                     / \
     3   10                  3   10                  3   10
    /                       / \                     / \    \
   1                       1   6                   1   6   14

  Steps 7-9: Insert 4, 7, 13
                  8
                 / \
                3   10
               / \    \
              1   6   14
                 / \  /
                4  7 13
```

---

## Complexity Table

| Operation | Average    | Worst (skewed) |
|-----------|------------|----------------|
| Search    | O(log n)   | O(n)           |
| Insert    | O(log n)   | O(n)           |
| Delete    | O(log n)   | O(n)           |
| Inorder   | O(n)       | O(n)           |

---

## Practice Problem 1: Validate BST

**Problem:** Determine if a binary tree is a valid BST.

**Approach:** Pass down valid ranges. Each node must be within `(min, max)`.

```csharp
public bool IsValidBST(TreeNode? root)
{
    return Validate(root, long.MinValue, long.MaxValue);
}

private bool Validate(TreeNode? node, long min, long max)
{
    if (node is null) return true;

    if (node.Val <= min || node.Val >= max)
        return false;

    // Left subtree: all values must be < node.Val
    // Right subtree: all values must be > node.Val
    return Validate(node.Left, min, node.Val)
        && Validate(node.Right, node.Val, max);
}
```

**Complexity:** O(n) time, O(h) space.

> **Callout:** Use `long` for min/max to handle edge cases where node values equal `int.MinValue` or `int.MaxValue`.

---

## Practice Problem 2: Lowest Common Ancestor of BST

**Problem:** Find the lowest common ancestor (LCA) of two nodes in a BST.

**Approach:** Exploit the BST property. If both values are smaller, go left. If both are larger, go right. Otherwise, the current node is the LCA.

```
  Find LCA of 1 and 6 in:
         8
        / \
       3   10
      / \
     1   6

  At 8: both 1 and 6 < 8, go left
  At 3: 1 < 3 and 6 > 3, so 3 is the LCA
```

```csharp
public TreeNode LowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q)
{
    var current = root;

    while (current is not null)
    {
        if (p.Val < current.Val && q.Val < current.Val)
            current = current.Left!;
        else if (p.Val > current.Val && q.Val > current.Val)
            current = current.Right!;
        else
            return current; // split point = LCA
    }

    return root; // should not reach here for valid input
}
```

**Complexity:** O(h) time, O(1) space (iterative).

---

## Practice Problem 3: Kth Smallest Element in BST

**Problem:** Return the kth smallest value in a BST (1-indexed).

**Approach:** Inorder traversal visits nodes in sorted order. Count nodes as you visit them; stop at k.

```csharp
public int KthSmallest(TreeNode root, int k)
{
    var stack = new Stack<TreeNode>();
    var current = root;

    while (current is not null || stack.Count > 0)
    {
        while (current is not null)
        {
            stack.Push(current);
            current = current.Left;
        }

        current = stack.Pop();
        k--;
        if (k == 0) return current.Val; // found kth smallest

        current = current.Right;
    }

    throw new ArgumentException("k is larger than tree size");
}
```

**Complexity:** O(h + k) time, O(h) space.

---

## Practice Problem 4: Delete Node in a BST

**Problem:** Delete a node with a given key and return the updated root.

This was covered in the operations section above. The full implementation handles all three cases (leaf, one child, two children). Review the `DeleteNode` method.

**Key insight for the two-children case:**

```
  Delete 3 from:
       8               8
      / \     =>       / \
     3   10           4   10
    / \    \         / \    \
   1   6   14       1   6   14
      /                /
     4                (4 moved up as inorder successor of 3's position)
```

Actually, the inorder successor of 3 is 4 (smallest in right subtree). We copy 4's value to 3's position, then delete the original 4 node.

**Complexity:** O(h) time, O(h) space (recursive stack).

---

## Common Mistakes

1. **Validating BST by checking only immediate children.** The value `[5, 1, 7, null, null, 3, 8]` has `3` in the right subtree of `5`, which violates the BST property even though `3 < 7`.
2. **Not using `long` for range boundaries** — if the tree contains `int.MinValue`, your initial bound of `int.MinValue` fails the `<=` check.
3. **Forgetting that BST does not allow duplicates** in the standard definition. Clarify with the interviewer.
4. **Not handling the two-children delete case** — you must find and remove the inorder successor, not just copy its value.
5. **Assuming the BST is balanced** — always discuss the worst-case O(n) scenario.

---

## Interview Tips

- **State the BST property explicitly** at the start. It shows precision.
- **Mention self-balancing variants** (AVL, Red-Black) when discussing worst-case performance.
- **Use iterative solutions for LCA** — it is O(1) space and cleaner than recursion.
- **For kth smallest**, mention that if this query is frequent, you could augment nodes with subtree counts for O(h) lookups without full traversal.
- **Know C# standard library equivalents:** `SortedSet<T>` for a balanced BST set, `SortedDictionary<K,V>` for a balanced BST map.

---

## Quiz

<details>
<summary>1. What is the time complexity of searching in a skewed BST with n nodes?</summary>

**O(n)**. A skewed BST degenerates into a linked list, so search must traverse all nodes in the worst case.
</details>

<details>
<summary>2. Why does inorder traversal of a BST produce sorted output?</summary>

Inorder visits Left, Root, Right. In a BST, all left descendants are smaller and all right descendants are larger. By visiting left first, we process all smaller values before the current node, and all larger values after — yielding ascending order.
</details>

<details>
<summary>3. When deleting a node with two children, why do we use the inorder successor specifically?</summary>

The inorder successor (smallest node in the right subtree) is the smallest value greater than the deleted node. Replacing with it preserves the BST property: it is still greater than all left descendants and (after removal from the right subtree) the right subtree remains valid.
</details>

<details>
<summary>4. What C# collection uses a Red-Black tree internally?</summary>

**`SortedSet<T>`** and **`SortedDictionary<TKey, TValue>`**. Both guarantee O(log n) for insert, delete, and search operations.
</details>

<details>
<summary>5. Can a BST have duplicate values?</summary>

The standard definition says no. However, some variants allow duplicates by convention (e.g., duplicates go to the left or right subtree). Always clarify with the interviewer. If duplicates are allowed, adjust the validation logic from `<` to `<=`.
</details>
