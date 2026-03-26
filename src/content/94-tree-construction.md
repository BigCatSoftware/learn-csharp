# Binary Tree Construction and Serialization

## Building Trees from Traversal Arrays

Given two traversal orders, you can uniquely reconstruct a binary tree. The most common combination is **Preorder + Inorder**.

**Key insight:** Preorder's first element is always the root. Find that root in the inorder array to determine the left and right subtrees.

```
  Preorder: [3, 9, 20, 15, 7]    (Root, Left, Right)
  Inorder:  [9, 3, 15, 20, 7]    (Left, Root, Right)

  Step 1: Root = 3 (first in preorder)
  Step 2: Find 3 in inorder at index 1
          Left subtree inorder:  [9]         (indices 0..0)
          Right subtree inorder: [15, 20, 7] (indices 2..4)

  Step 3: Left subtree has 1 node -> preorder [9]
          Right subtree has 3 nodes -> preorder [20, 15, 7]

  Step 4: Recurse:
          Left:  root=9, no children
          Right: root=20, left=15, right=7

  Result:
         3
        / \
       9   20
          /  \
         15   7
```

---

## Serialization Formats

Serialization converts a tree into a string; deserialization reconstructs it.

```
  Tree:       1
             / \
            2   3
               / \
              4   5

  Level-order serialization: "1,2,3,null,null,4,5"
  Preorder serialization:    "1,2,null,null,3,4,null,null,5,null,null"
```

> **Callout:** Without null markers, a single traversal cannot uniquely identify a tree. Preorder alone (without inorder) is ambiguous — but preorder **with nulls** is sufficient.

---

## Practice Problem 1: Build Tree from Preorder and Inorder

**Problem:** Given preorder and inorder traversal arrays, construct the binary tree.

**Approach:** Use a HashMap for O(1) lookup of root positions in the inorder array. Recursively split into left and right subtrees.

### Step-by-step Reconstruction

```
  preorder = [3, 9, 20, 15, 7]
  inorder  = [9, 3, 15, 20, 7]

  Call 1: root=3, inorder split at index 1
    Left inorder:  [9]        -> preorder [9]
    Right inorder: [15,20,7]  -> preorder [20,15,7]

  Call 2 (left): root=9, inorder = [9]
    No left or right children -> leaf node

  Call 3 (right): root=20, inorder split at index 1 (relative)
    Left inorder:  [15]  -> preorder [15]
    Right inorder: [7]   -> preorder [7]

  Call 4 (right-left): root=15 -> leaf
  Call 5 (right-right): root=7 -> leaf

  Final tree:
         3
        / \
       9   20
          /  \
         15   7
```

```csharp
public class Solution
{
    private Dictionary<int, int> _inorderMap = new();
    private int _preIndex = 0;

    public TreeNode? BuildTree(int[] preorder, int[] inorder)
    {
        // Map each value to its index in inorder for O(1) lookup
        for (int i = 0; i < inorder.Length; i++)
            _inorderMap[inorder[i]] = i;

        return Build(preorder, 0, inorder.Length - 1);
    }

    private TreeNode? Build(int[] preorder, int inLeft, int inRight)
    {
        if (inLeft > inRight) return null;

        // The current root is the next element in preorder
        int rootVal = preorder[_preIndex++];
        var root = new TreeNode(rootVal);

        // Find root's position in inorder
        int inRootIndex = _inorderMap[rootVal];

        // Build left subtree (elements before root in inorder)
        root.Left = Build(preorder, inLeft, inRootIndex - 1);
        // Build right subtree (elements after root in inorder)
        root.Right = Build(preorder, inRootIndex + 1, inRight);

        return root;
    }
}
```

**Complexity:** O(n) time (each node processed once, O(1) map lookups), O(n) space (HashMap + recursion stack).

> **Callout:** The preorder index `_preIndex` advances globally — it does not reset for subtrees. This works because preorder visits root, then all left descendants, then all right descendants, matching our recursive call order.

---

## Practice Problem 2: Convert Sorted Array to BST

**Problem:** Given a sorted (ascending) integer array, convert it to a height-balanced BST.

**Approach:** The middle element becomes the root (ensures balance). Recursively build left and right subtrees from the left and right halves.

```
  Input: [-10, -3, 0, 5, 9]

  Step 1: mid = 2, root = 0
          Left: [-10, -3]   Right: [5, 9]

  Step 2a: mid = 0, root = -10      Step 2b: mid = 0, root = 5
           Left: []                           Left: []
           Right: [-3]                        Right: [9]

  Result:
           0
          / \
        -3    9
        /    /
      -10   5

  (Other valid balanced BSTs exist depending on mid choice)
```

```csharp
public TreeNode? SortedArrayToBST(int[] nums)
{
    return Build(nums, 0, nums.Length - 1);
}

private TreeNode? Build(int[] nums, int left, int right)
{
    if (left > right) return null;

    int mid = left + (right - left) / 2;  // avoid overflow
    var root = new TreeNode(nums[mid]);

    root.Left = Build(nums, left, mid - 1);
    root.Right = Build(nums, mid + 1, right);

    return root;
}
```

**Complexity:** O(n) time (every element becomes a node), O(log n) space (recursion depth of a balanced tree).

---

## Practice Problem 3: Serialize and Deserialize Binary Tree

**Problem:** Design an algorithm to serialize a binary tree to a string and deserialize that string back to the original tree. No restriction on format.

**Approach:** Use preorder traversal with null markers. This uniquely identifies the tree structure.

```
  Tree:       1
             / \
            2   3
               / \
              4   5

  Serialize (preorder with nulls):
  "1,2,null,null,3,4,null,null,5,null,null"

  Deserialize: consume tokens left to right
  Token "1"    -> create node 1, build its left
  Token "2"    -> create node 2, build its left
  Token "null" -> return null (2's left)
  Token "null" -> return null (2's right) -> node 2 complete
  Token "3"    -> create node 3, build its left
  Token "4"    -> create node 4
  Token "null" -> null (4's left)
  Token "null" -> null (4's right) -> node 4 complete
  Token "5"    -> create node 5
  Token "null" -> null (5's left)
  Token "null" -> null (5's right) -> node 5 complete -> node 3 complete -> node 1 complete
```

```csharp
public class Codec
{
    private const string Null = "null";
    private const char Delimiter = ',';

    // Serialize: preorder traversal, null markers for missing children
    public string Serialize(TreeNode? root)
    {
        var sb = new StringBuilder();
        SerializeHelper(root, sb);
        return sb.ToString();
    }

    private void SerializeHelper(TreeNode? node, StringBuilder sb)
    {
        if (node is null)
        {
            sb.Append(Null).Append(Delimiter);
            return;
        }
        sb.Append(node.Val).Append(Delimiter);
        SerializeHelper(node.Left, sb);
        SerializeHelper(node.Right, sb);
    }

    // Deserialize: consume tokens in order using a queue
    public TreeNode? Deserialize(string data)
    {
        var tokens = new Queue<string>(data.Split(Delimiter,
            StringSplitOptions.RemoveEmptyEntries));
        return DeserializeHelper(tokens);
    }

    private TreeNode? DeserializeHelper(Queue<string> tokens)
    {
        if (tokens.Count == 0) return null;

        string val = tokens.Dequeue();
        if (val == Null) return null;

        var node = new TreeNode(int.Parse(val));
        node.Left = DeserializeHelper(tokens);   // build left subtree
        node.Right = DeserializeHelper(tokens);  // build right subtree
        return node;
    }
}
```

**Complexity:**
| Operation   | Time | Space |
|-------------|------|-------|
| Serialize   | O(n) | O(n) for the string |
| Deserialize | O(n) | O(n) for the queue + O(h) recursion |

> **Callout:** Using a `Queue<string>` for deserialization ensures tokens are consumed in order. An index variable works too, but a queue is more intuitive and avoids passing a mutable reference.

---

## Alternative: Level-Order Serialization

```csharp
public string SerializeLevelOrder(TreeNode? root)
{
    if (root is null) return "";

    var sb = new StringBuilder();
    var queue = new Queue<TreeNode?>();
    queue.Enqueue(root);

    while (queue.Count > 0)
    {
        var node = queue.Dequeue();
        if (node is null)
        {
            sb.Append("null,");
            continue;
        }
        sb.Append(node.Val).Append(',');
        queue.Enqueue(node.Left);
        queue.Enqueue(node.Right);
    }
    return sb.ToString().TrimEnd(',');
}
```

> **Callout:** Level-order serialization matches LeetCode's tree format. Preorder serialization is simpler to implement and deserialize. Pick whichever the problem or interviewer prefers.

---

## Which Traversal Pairs Uniquely Define a Tree?

| Pair                    | Unique Tree? | Notes                                  |
|-------------------------|--------------|----------------------------------------|
| Preorder + Inorder      | Yes          | Most common interview question          |
| Postorder + Inorder     | Yes          | Same logic, process from end            |
| Preorder + Postorder    | No*          | Ambiguous for trees with single children |
| Single traversal + nulls| Yes          | Preorder with null markers suffices      |

*Unique only for full binary trees (every node has 0 or 2 children).

---

## Common Mistakes

1. **Using a global index that resets** — the preorder index must advance globally across recursive calls, never resetting for subtrees.
2. **Forgetting the inorder map** — linear search in inorder for each node makes the algorithm O(n^2). Always use a HashMap.
3. **Off-by-one in subtree boundaries** — double-check that `inLeft` to `inRootIndex - 1` is the left subtree and `inRootIndex + 1` to `inRight` is the right.
4. **Not handling empty trees in serialization** — `Serialize(null)` should return a valid string that `Deserialize` can reconstruct as `null`.
5. **Sorted array to BST: using `(left + right) / 2`** — this can overflow for large indices. Use `left + (right - left) / 2`.

---

## Interview Tips

- **Build Tree from traversals** is a classic Medium problem. Practice until you can write it without hesitation.
- **Know why two traversals are needed** — a single traversal (without null markers) is ambiguous. Be ready to explain this.
- **For serialization**, the preorder + null markers approach is the cleanest to implement. Level-order is more complex due to queue management.
- **Sorted array to BST** is a great warm-up problem. It is simple but demonstrates divide-and-conquer on trees.
- **Discuss the space complexity** of your serialized string. For n nodes, the string contains n values and n+1 null markers, so O(n) total.

---

## Quiz

<details>
<summary>1. Why can't preorder alone (without inorder) reconstruct a unique binary tree?</summary>

Multiple trees can produce the same preorder sequence. For example, preorder `[1, 2]` could be a root 1 with left child 2 OR root 1 with right child 2. The inorder array resolves this ambiguity by telling us which elements are in the left vs right subtree.
</details>

<details>
<summary>2. In the Build Tree problem, why does the preorder index advance globally and not reset per subtree?</summary>

Preorder visits root, then ALL left descendants, then ALL right descendants. The global index tracks our position in this sequence. After building the entire left subtree, the index has advanced past all left nodes and points to the right subtree's root. Resetting it would revisit already-used nodes.
</details>

<details>
<summary>3. Why does choosing the middle element of a sorted array produce a balanced BST?</summary>

The middle element splits the remaining elements into two roughly equal halves. The left half becomes the left subtree and the right half becomes the right subtree. Since both halves have approximately n/2 elements, the resulting tree has height O(log n) — the definition of balanced.
</details>

<details>
<summary>4. What is the time complexity of deserialization using a queue?</summary>

**O(n)**. Each token is dequeued and processed exactly once. Each dequeue operation is O(1). The initial `String.Split` is also O(n). Total: O(n).
</details>

<details>
<summary>5. Can you reconstruct a BST from preorder traversal alone (without inorder)?</summary>

Yes! Because the BST property implicitly defines the inorder traversal (sorted order). Given preorder, you can infer the inorder by sorting. Alternatively, use upper/lower bounds: for each value, determine if it belongs to the current subtree based on the BST constraint. This runs in O(n) time.
</details>
