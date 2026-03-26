# Segment Trees and Fenwick Trees

## Segment Tree Concept

A **segment tree** is a binary tree where each node stores aggregate information (sum, min, max) about a range of the original array. It supports both **range queries** and **point updates** in O(log n) time.

```
Array: [2, 1, 5, 3, 4]

Segment Tree (range sums):

                    [0..4] = 15
                   /          \
            [0..2] = 8       [3..4] = 7
            /      \          /      \
       [0..1]=3  [2..2]=5  [3..3]=3  [4..4]=4
       /    \
  [0..0]=2  [1..1]=1

Each node covers a contiguous range of the array.
Leaves = individual elements.
Internal nodes = aggregate of children.
```

## Segment Tree — Array Representation

We store the tree in a flat array of size `4n` (safe upper bound). For node at index `i`:
- Left child: `2*i + 1`
- Right child: `2*i + 2`
- Parent: `(i - 1) / 2`

```
Array index mapping (for array of size 5):

Index:    0     1        2       3      4      5      6      7    8
Node:  [0..4] [0..2]  [3..4]  [0..1] [2..2] [3..3] [4..4] [0..0][1..1]
Value:   15     8       7       3      5      3      4      2     1
```

## Full C# Segment Tree Implementation

```csharp
public class SegmentTree
{
    private int[] tree;
    private int n;

    public SegmentTree(int[] nums)
    {
        n = nums.Length;
        tree = new int[4 * n]; // safe upper bound
        Build(nums, 0, 0, n - 1);
    }

    // Build the tree recursively
    private void Build(int[] nums, int node, int start, int end)
    {
        if (start == end)
        {
            tree[node] = nums[start]; // leaf node
            return;
        }

        int mid = (start + end) / 2;
        Build(nums, 2 * node + 1, start, mid);      // build left
        Build(nums, 2 * node + 2, mid + 1, end);    // build right
        tree[node] = tree[2 * node + 1] + tree[2 * node + 2]; // merge
    }

    // Point update: set nums[idx] = val
    public void Update(int idx, int val)
    {
        Update(0, 0, n - 1, idx, val);
    }

    private void Update(int node, int start, int end, int idx, int val)
    {
        if (start == end)
        {
            tree[node] = val; // update leaf
            return;
        }

        int mid = (start + end) / 2;
        if (idx <= mid)
            Update(2 * node + 1, start, mid, idx, val);
        else
            Update(2 * node + 2, mid + 1, end, idx, val);

        tree[node] = tree[2 * node + 1] + tree[2 * node + 2]; // recalculate
    }

    // Range query: sum of nums[l..r]
    public int Query(int l, int r)
    {
        return Query(0, 0, n - 1, l, r);
    }

    private int Query(int node, int start, int end, int l, int r)
    {
        if (r < start || end < l) return 0;          // no overlap
        if (l <= start && end <= r) return tree[node]; // total overlap

        int mid = (start + end) / 2;
        int leftSum = Query(2 * node + 1, start, mid, l, r);
        int rightSum = Query(2 * node + 2, mid + 1, end, l, r);
        return leftSum + rightSum;
    }
}
```

## Lazy Propagation

For **range updates** (update all elements in a range), naive segment tree is O(n log n). **Lazy propagation** defers updates to children, achieving O(log n) per range update.

```csharp
public class LazySegmentTree
{
    private int[] tree, lazy;
    private int n;

    public LazySegmentTree(int[] nums)
    {
        n = nums.Length;
        tree = new int[4 * n];
        lazy = new int[4 * n]; // pending updates
        Build(nums, 0, 0, n - 1);
    }

    private void Build(int[] nums, int node, int start, int end)
    {
        if (start == end) { tree[node] = nums[start]; return; }
        int mid = (start + end) / 2;
        Build(nums, 2 * node + 1, start, mid);
        Build(nums, 2 * node + 2, mid + 1, end);
        tree[node] = tree[2 * node + 1] + tree[2 * node + 2];
    }

    // Push pending updates to children
    private void PushDown(int node, int start, int end)
    {
        if (lazy[node] != 0)
        {
            int mid = (start + end) / 2;
            // Apply to left child
            tree[2 * node + 1] += lazy[node] * (mid - start + 1);
            lazy[2 * node + 1] += lazy[node];
            // Apply to right child
            tree[2 * node + 2] += lazy[node] * (end - mid);
            lazy[2 * node + 2] += lazy[node];
            // Clear current lazy
            lazy[node] = 0;
        }
    }

    // Range update: add val to all elements in [l, r]
    public void RangeUpdate(int l, int r, int val)
    {
        RangeUpdate(0, 0, n - 1, l, r, val);
    }

    private void RangeUpdate(int node, int start, int end, int l, int r, int val)
    {
        if (r < start || end < l) return;
        if (l <= start && end <= r)
        {
            tree[node] += val * (end - start + 1);
            lazy[node] += val;
            return;
        }
        PushDown(node, start, end);
        int mid = (start + end) / 2;
        RangeUpdate(2 * node + 1, start, mid, l, r, val);
        RangeUpdate(2 * node + 2, mid + 1, end, l, r, val);
        tree[node] = tree[2 * node + 1] + tree[2 * node + 2];
    }

    public int Query(int l, int r) => Query(0, 0, n - 1, l, r);

    private int Query(int node, int start, int end, int l, int r)
    {
        if (r < start || end < l) return 0;
        if (l <= start && end <= r) return tree[node];
        PushDown(node, start, end);
        int mid = (start + end) / 2;
        return Query(2 * node + 1, start, mid, l, r)
             + Query(2 * node + 2, mid + 1, end, l, r);
    }
}
```

## Fenwick Tree (Binary Indexed Tree)

A simpler alternative for **prefix sum queries** and **point updates**. Uses the binary representation of indices to determine which ranges each node covers.

> Fenwick Tree for array [2, 1, 5, 3, 4]:
> Index (1-based): | 1 | 2 | 3 | 4 | 5
> Original array: | 2 | 1 | 5 | 3 | 4
> BIT array: | 2 | 3 | 5 | 11 | 4
> Responsible for: [1,1] [1,2] [3,3] [1,4] [5,5]
> Key: BIT[i] covers range ending at i with length = lowest set bit of i
> BIT[1] (0001): covers 1 element | → [1]
> BIT[2] (0010): covers 2 elements → [1,2]
> BIT[3] (0011): covers 1 element | → [3]
> BIT[4] (0100): covers 4 elements → [1,2,3,4]
> BIT[5] (0101): covers 1 element | → [5]


```csharp
public class FenwickTree
{
    private int[] bit; // 1-indexed
    private int n;

    public FenwickTree(int n)
    {
        this.n = n;
        bit = new int[n + 1]; // 1-indexed, bit[0] unused
    }

    // Build from array in O(n)
    public FenwickTree(int[] nums) : this(nums.Length)
    {
        for (int i = 0; i < nums.Length; i++)
            Update(i, nums[i]);
    }

    // Point update: add delta to index i (0-indexed input)
    public void Update(int i, int delta)
    {
        i++; // convert to 1-indexed
        while (i <= n)
        {
            bit[i] += delta;
            i += i & (-i); // move to parent: add lowest set bit
        }
    }

    // Prefix sum: sum of [0, i] (0-indexed input)
    public int PrefixSum(int i)
    {
        i++; // convert to 1-indexed
        int sum = 0;
        while (i > 0)
        {
            sum += bit[i];
            i -= i & (-i); // move to predecessor: remove lowest set bit
        }
        return sum;
    }

    // Range sum: sum of [l, r] (0-indexed)
    public int RangeSum(int l, int r)
    {
        return PrefixSum(r) - (l > 0 ? PrefixSum(l - 1) : 0);
    }
}
```

## Comparison: Segment Tree vs Fenwick Tree

| Feature | Segment Tree | Fenwick Tree |
|---|---|---|
| Point update | O(log n) | O(log n) |
| Range query | O(log n) | O(log n) |
| Range update | O(log n) with lazy | Complex (needs 2 BITs) |
| Space | 4n | n + 1 |
| Code complexity | Higher | Lower |
| Flexibility | Any associative op | Mainly sum/XOR |
| Constant factor | Larger | Smaller |

---

## Practice Problems

### Problem 1: Range Sum Query — Mutable

**Statement:** Given an integer array `nums`, implement a class that supports: (1) `Update(index, val)` — set `nums[index]` to `val`, and (2) `SumRange(left, right)` — return the sum of elements between indices `left` and `right` inclusive.

**Approach:** Use a Fenwick tree. For updates, compute the delta (`val - current`) and update the BIT.

```csharp
public class NumArray
{
    private int[] nums;
    private int[] bit;
    private int n;

    public NumArray(int[] nums)
    {
        this.n = nums.Length;
        this.nums = new int[n];
        this.bit = new int[n + 1];

        // Build BIT by updating each element
        for (int i = 0; i < n; i++)
        {
            this.nums[i] = nums[i];
            BITUpdate(i, nums[i]);
        }
    }

    private void BITUpdate(int i, int delta)
    {
        i++; // 1-indexed
        while (i <= n)
        {
            bit[i] += delta;
            i += i & (-i);
        }
    }

    private int BITPrefixSum(int i)
    {
        i++; // 1-indexed
        int sum = 0;
        while (i > 0)
        {
            sum += bit[i];
            i -= i & (-i);
        }
        return sum;
    }

    public void Update(int index, int val)
    {
        int delta = val - nums[index]; // compute change
        nums[index] = val;             // update local copy
        BITUpdate(index, delta);       // update BIT
    }

    public int SumRange(int left, int right)
    {
        int rightSum = BITPrefixSum(right);
        int leftSum = left > 0 ? BITPrefixSum(left - 1) : 0;
        return rightSum - leftSum;
    }
}
```

**Complexity:** Construction O(n log n). Update O(log n). Query O(log n). Space O(n).

---

### Problem 2: Count of Smaller Numbers After Self

**Statement:** Given an integer array `nums`, return a new array `counts` where `counts[i]` is the number of elements to the right of `nums[i]` that are strictly smaller than `nums[i]`.

**Approach:** Process the array from right to left. Use a Fenwick tree indexed by value (after coordinate compression). For each element, query the prefix sum of values less than the current element, then update the BIT.

```csharp
public class Solution
{
    public IList<int> CountSmaller(int[] nums)
    {
        int n = nums.Length;
        int[] result = new int[n];

        // Coordinate compression: map values to ranks 1..k
        int[] sorted = nums.Distinct().OrderBy(x => x).ToArray();
        var rankMap = new Dictionary<int, int>();
        for (int i = 0; i < sorted.Length; i++)
            rankMap[sorted[i]] = i + 1; // 1-indexed rank

        int maxRank = sorted.Length;
        int[] bit = new int[maxRank + 1];

        // BIT update: add 1 at position idx
        void BITUpdate(int idx)
        {
            while (idx <= maxRank)
            {
                bit[idx]++;
                idx += idx & (-idx);
            }
        }

        // BIT query: prefix sum [1..idx]
        int BITQuery(int idx)
        {
            int sum = 0;
            while (idx > 0)
            {
                sum += bit[idx];
                idx -= idx & (-idx);
            }
            return sum;
        }

        // Process from right to left
        for (int i = n - 1; i >= 0; i--)
        {
            int rank = rankMap[nums[i]];

            // Count elements with rank < current rank (strictly smaller)
            result[i] = BITQuery(rank - 1);

            // Add current element to the BIT
            BITUpdate(rank);
        }

        return result.ToList();
    }
}
```

**Complexity:** Time O(n log n) for sorting + O(n log k) for BIT operations where k = distinct values. Space O(n).

---

## Construction Diagram — Step by Step

```
Building segment tree for [2, 1, 5, 3, 4]:

Step 1: Build leaves
  [2]  [1]  [5]  [3]  [4]

Step 2: Build level 2 (merge pairs)
  [2+1=3]  [5]  [3+4=7]

Step 3: Build level 1
  [3+5=8]  [7]

Step 4: Build root
  [8+7=15]

Final tree:
              15
            /    \
          8        7
        /   \    /   \
       3     5  3     4
      / \
     2   1

Query sum(1, 3) = sum of indices 1,2,3 = 1+5+3 = 9
  Node [0..4]: partial overlap → recurse
    Node [0..2]: partial overlap → recurse
      Node [0..1]: partial overlap → recurse
        Node [0..0]: no overlap → 0
        Node [1..1]: total overlap → 1
      Node [2..2]: total overlap → 5
    Node [3..4]: partial overlap → recurse
      Node [3..3]: total overlap → 3
      Node [4..4]: no overlap → 0
  Answer: 0 + 1 + 5 + 3 + 0 = 9 ✓
```

---

## Common Mistakes

1. **Array size.** Segment tree needs `4 * n` elements, not `2 * n`. A `2 * n` array can cause index-out-of-bounds for certain sizes.
2. **1-indexed vs 0-indexed.** Fenwick trees are traditionally 1-indexed. Forgetting the `i++` conversion leads to infinite loops or wrong results.
3. **Forgetting to push down lazy values** before querying children in lazy propagation.
4. **Coordinate compression.** In "Count Smaller", values can be negative or large. Map them to ranks before using as BIT indices.
5. **Update delta vs absolute value.** In BIT, `Update` adds a delta. To set a value, compute `delta = newVal - oldVal` first.

## Interview Tips

- **Know when to use which:** Fenwick tree for simple prefix sums. Segment tree for more complex operations (min/max, lazy range updates).
- **Fenwick tree is preferred** in interviews when it suffices — it's shorter and less error-prone.
- **Mention lazy propagation** even if you don't implement it — it shows you understand range-update optimization.
- **Coordinate compression** is a common preprocessing step — mention it when values are large or negative.
- **Practice the BIT update/query loops** until they're automatic: `i += i & (-i)` for update, `i -= i & (-i)` for query.

---

## Quiz

<details>
<summary>1. Why does a segment tree use 4n space instead of 2n?</summary>

A segment tree is a complete binary tree when `n` is a power of 2 (requiring `2n` space). For other values of `n`, the tree can be deeper, with the last level partially filled. The `4n` bound guarantees enough space for all cases. Specifically, the tree height is `ceil(log2(n))`, and a full tree of that height has up to `4n` nodes.
</details>

<details>
<summary>2. How does `i & (-i)` work in a Fenwick tree, and what does it represent?</summary>

`i & (-i)` isolates the lowest set bit of `i`. In two's complement, `-i` flips all bits and adds 1, so ANDing with `i` gives only the lowest set bit. In a BIT, this value equals the number of elements that `BIT[i]` is responsible for. Adding it moves to the parent (for updates), and subtracting it moves to the predecessor (for queries).
</details>

<details>
<summary>3. What is lazy propagation, and when is it needed?</summary>

Lazy propagation defers updates to child nodes until they are actually needed (during a query or another update that reaches them). Without it, a range update would need to touch every affected leaf — O(n) worst case. With lazy propagation, range updates and range queries are both O(log n) because pending updates are propagated only when necessary.
</details>

<details>
<summary>4. In "Count of Smaller Numbers After Self", why do we process the array from right to left?</summary>

We need to count elements **to the right** of each position that are smaller. By processing right to left, when we reach index `i`, all elements at indices `i+1` through `n-1` have already been inserted into the BIT. A prefix sum query on ranks less than `nums[i]`'s rank gives exactly the count of smaller elements to the right.
</details>

<details>
<summary>5. When would you choose a Fenwick tree over a segment tree in an interview?</summary>

Use a Fenwick tree when you only need prefix sums (or XOR) with point updates — it's shorter to code, uses less memory (n+1 vs 4n), and has a smaller constant factor. Use a segment tree when you need range min/max queries, non-invertible operations, or lazy propagation for range updates. If unsure, a segment tree is always safe but takes longer to implement.
</details>
