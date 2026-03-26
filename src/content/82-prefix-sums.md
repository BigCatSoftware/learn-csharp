# Prefix Sums

## What Are Prefix Sums?

A **prefix sum** (also called a cumulative sum) is a technique where you precompute the running total of an array. This allows you to answer **range sum queries** in O(1) after an O(n) preprocessing step.

**Prefix Sum Construction**

Given array `[2, 4, 1, 3, 5]`, the prefix sum array is built left to right:

| Index | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **Original** | 2 | 4 | 1 | 3 | 5 |
| **Prefix Sum** | 2 | 6 | 7 | 10 | 15 |

Each prefix sum value = previous prefix sum + current element. Range sum `[i..j]` = `prefix[j] - prefix[i-1]` in O(1).

### Building the Prefix Sum

```
  Step-by-step construction:

  nums =    [ 2,  4,  1,  3,  5 ]

  prefix[0] = 0                          (sentinel)
  prefix[1] = 0 + 2 = 2                  (sum of nums[0..0])
  prefix[2] = 2 + 4 = 6                  (sum of nums[0..1])
  prefix[3] = 6 + 1 = 7                  (sum of nums[0..2])
  prefix[4] = 7 + 3 = 10                 (sum of nums[0..3])
  prefix[5] = 10 + 5 = 15                (sum of nums[0..4])

  prefix =  [ 0,  2,  6,  7, 10, 15 ]
```

```csharp
int[] BuildPrefixSum(int[] nums)
{
    int[] prefix = new int[nums.Length + 1];
    for (int i = 0; i < nums.Length; i++)
    {
        prefix[i + 1] = prefix[i] + nums[i];
    }
    return prefix;
}
```

---

## Range Sum Queries in O(1)

Once you have the prefix array, the sum of any subarray `nums[left..right]` (inclusive) is:

```
  sum(left, right) = prefix[right + 1] - prefix[left]
```

> Example: sum of nums[1..3] = sum of [4, 1, 3] = 8
> prefix[4] - prefix[1] = 10 - 2 = 8 | ✓
> Visual:
> prefix: | [ 0, | 2, | 6, | 7, 10, 15 ]
> prefix[1]=2 | prefix[4]=10
> 10 - 2 = 8


| Operation | Without prefix sum | With prefix sum |
|---|---|---|
| Build | — | O(n) one-time |
| Single range sum query | O(n) | **O(1)** |
| q range sum queries | O(n * q) | **O(n + q)** |

> **Note:** The sentinel `prefix[0] = 0` eliminates edge cases. Without it, you'd need special handling when `left == 0`.

---

## 2D Prefix Sums

For a 2D matrix, the prefix sum at `(r, c)` represents the sum of all elements in the rectangle from `(0,0)` to `(r-1, c-1)`.

> Matrix: | 2D Prefix Sum:
> 1 | 2 | 3 | 0 | 0 | 0 | 0
> 4 | 5 | 6 | 0 | 1 | 3 | 6
> 7 | 8 | 9 | 0 | 5 | 12 | 21
> 0 | 12 | 27 | 45
> Formula to build:
> P[r][c] = matrix[r-1][c-1] + P[r-1][c] + P[r][c-1] - P[r-1][c-1]
> Range sum query for rectangle (r1,c1) to (r2,c2):
> sum = P[r2+1][c2+1] - P[r1][c2+1] - P[r2+1][c1] + P[r1][c1]


```csharp
int[,] Build2DPrefix(int[,] matrix)
{
    int rows = matrix.GetLength(0);
    int cols = matrix.GetLength(1);
    int[,] prefix = new int[rows + 1, cols + 1];

    for (int r = 1; r <= rows; r++)
    {
        for (int c = 1; c <= cols; c++)
        {
            prefix[r, c] = matrix[r - 1, c - 1]
                         + prefix[r - 1, c]
                         + prefix[r, c - 1]
                         - prefix[r - 1, c - 1];
        }
    }

    return prefix;
}

int RangeSum2D(int[,] prefix, int r1, int c1, int r2, int c2)
{
    return prefix[r2 + 1, c2 + 1]
         - prefix[r1, c2 + 1]
         - prefix[r2 + 1, c1]
         + prefix[r1, c1];
}
```

> **Tip:** The 2D prefix sum uses **inclusion-exclusion**: add two rectangles, subtract the overlap that was counted twice.

---

## Practice Problems

### Problem 1: Range Sum Query — Immutable (LeetCode 303)

**Problem:** Design a class that accepts an integer array and handles multiple range sum queries efficiently.

**Approach:** Precompute the prefix sum in the constructor. Each query is then a simple subtraction.

```csharp
public class NumArray
{
    private readonly int[] _prefix;

    public NumArray(int[] nums)
    {
        _prefix = new int[nums.Length + 1];
        for (int i = 0; i < nums.Length; i++)
        {
            _prefix[i + 1] = _prefix[i] + nums[i];
        }
    }

    public int SumRange(int left, int right)
    {
        return _prefix[right + 1] - _prefix[left];
    }
}
```

**Complexity:**
- **Time:** O(n) constructor, O(1) per query
- **Space:** O(n) for the prefix array

---

### Problem 2: Subarray Sum Equals K (LeetCode 560)

**Problem:** Given an array `nums` and integer `k`, return the total number of subarrays whose sum equals `k`.

**Approach:** As we build the prefix sum, we track how many times each prefix sum value has appeared using a hash map. If `prefix[j] - prefix[i] == k`, then the subarray `nums[i..j-1]` sums to `k`. So at each index `j`, we check how many previous prefix sums equal `currentPrefix - k`.

> nums = [1, 1, 1], k = 2
> Index: | 0 | 1 | 2
> prefix: | 0 | 1 | 2 | 3
> At prefix=2: check map for 2-2=0 → found 1 time
> At prefix=3: check map for 3-2=1 → found 1 time
> Total count = 2
> Subarrays: [1,1] (index 0-1), [1,1] (index 1-2)


```csharp
public class Solution
{
    public int SubarraySum(int[] nums, int k)
    {
        // Map: prefix sum value → how many times it has appeared
        var prefixCount = new Dictionary<int, int>();
        prefixCount[0] = 1; // sentinel: empty prefix sum = 0 seen once

        int currentSum = 0;
        int count = 0;

        foreach (int num in nums)
        {
            currentSum += num;

            // How many previous prefixes give us a subarray summing to k?
            if (prefixCount.TryGetValue(currentSum - k, out int times))
                count += times;

            prefixCount[currentSum] = prefixCount.GetValueOrDefault(currentSum, 0) + 1;
        }

        return count;
    }
}
```

**Complexity:**
- **Time:** O(n) — single pass with O(1) hash map lookups
- **Space:** O(n) — hash map storing prefix sums

> **Warning:** You cannot use a sliding window here because the array may contain **negative numbers**. The prefix sum + hash map approach handles negatives correctly.

---

### Problem 3: Product of Array Except Self (LeetCode 238)

**Problem:** Given an array `nums`, return an array where `result[i]` is the product of all elements except `nums[i]`. You must not use division.

**Approach:** Build a **prefix product** (left to right) and a **suffix product** (right to left). For each index, `result[i] = leftProduct[i] * rightProduct[i]`. Optimize space by building the left pass into `result`, then applying the right pass in a second sweep.

```
  nums =    [ 1,  2,  3,  4 ]

  Left products:
  left[0] = 1        (nothing to the left)
  left[1] = 1
  left[2] = 1 * 2 = 2
  left[3] = 1 * 2 * 3 = 6

  Right products:
  right[3] = 1       (nothing to the right)
  right[2] = 4
  right[1] = 4 * 3 = 12
  right[0] = 4 * 3 * 2 = 24

  result[i] = left[i] * right[i]:
  result =  [24, 12,  8,  6]
```

```csharp
public class Solution
{
    public int[] ProductExceptSelf(int[] nums)
    {
        int n = nums.Length;
        int[] result = new int[n];

        // Left pass: result[i] = product of all elements to the left
        result[0] = 1;
        for (int i = 1; i < n; i++)
        {
            result[i] = result[i - 1] * nums[i - 1];
        }

        // Right pass: multiply by product of all elements to the right
        int rightProduct = 1;
        for (int i = n - 1; i >= 0; i--)
        {
            result[i] *= rightProduct;
            rightProduct *= nums[i];
        }

        return result;
    }
}
```

**Complexity:**
- **Time:** O(n) — two passes
- **Space:** O(1) extra (the output array doesn't count per problem statement)

---

## Common Mistakes

1. **Off-by-one in prefix indices** — Remember `prefix` has length `n + 1`. The range sum for `nums[left..right]` is `prefix[right + 1] - prefix[left]`, not `prefix[right] - prefix[left - 1]` (which fails when `left == 0`).
2. **Forgetting the sentinel** — Always initialize `prefix[0] = 0` (or `prefixCount[0] = 1` for the hash map approach). Missing this causes incorrect counts for subarrays starting at index 0.
3. **Integer overflow** — For large arrays with large values, prefix sums can overflow `int`. Use `long` when the problem constraints suggest it.
4. **Using sliding window instead of prefix sums** — Sliding window requires all-positive values to maintain the monotonic property. If negatives are possible, use prefix sums.

---

## Interview Tips

- Prefix sums are the go-to when you see **"subarray sum"** in a problem.
- The combination of **prefix sum + hash map** is extremely powerful — it reduces "find subarray with property X" from O(n^2) to O(n).
- For 2D problems, know the **inclusion-exclusion** formula without hesitation.
- If the interviewer says "no division", think **prefix product + suffix product**.
- Prefix sums generalize: prefix XOR, prefix GCD, prefix min/max (sparse table) all follow the same pattern.

---

## Quiz

<details>
<summary><strong>Q1:</strong> What is the time complexity of a range sum query using a precomputed prefix sum array?</summary>

**O(1)** — It's a single subtraction: `prefix[right + 1] - prefix[left]`.
</details>

<details>
<summary><strong>Q2:</strong> Why do we initialize the prefix sum array with a 0 at index 0?</summary>

The sentinel `prefix[0] = 0` represents the sum of zero elements. It ensures the formula `prefix[right + 1] - prefix[left]` works correctly when `left == 0`, avoiding special-case logic.
</details>

<details>
<summary><strong>Q3:</strong> In the "Subarray Sum Equals K" problem, why can't we use a sliding window?</summary>

Sliding window requires that expanding the window always increases the sum and contracting always decreases it. With **negative numbers**, this monotonic property breaks — expanding the window might decrease the sum. The prefix sum + hash map approach handles negatives correctly.
</details>

<details>
<summary><strong>Q4:</strong> What is the inclusion-exclusion formula for 2D range sum queries?</summary>

`sum = P[r2+1][c2+1] - P[r1][c2+1] - P[r2+1][c1] + P[r1][c1]`

We subtract two overlapping rectangles, then add back the corner that was subtracted twice.
</details>

<details>
<summary><strong>Q5:</strong> In "Product of Array Except Self," why do we use two passes instead of division?</summary>

The problem explicitly forbids division (and division fails if any element is zero). Instead, we compute prefix products from the left and suffix products from the right, then multiply them together at each index.
</details>
