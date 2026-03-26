# Knapsack Problems

*Selecting items with constraints to optimize value*

The knapsack problem is one of the most fundamental DP patterns. Given items with weights and values, select items to maximize value without exceeding a weight capacity. Variations of this pattern appear in countless interview and real-world problems.

## 0/1 Knapsack Concept

You have `n` items, each with a weight and a value, and a knapsack with capacity `W`. Each item can be taken **at most once**. Maximize the total value.

**State:** `dp[i][w]` = maximum value using items `0..i-1` with capacity `w`

**Recurrence:**
- Skip item `i`: `dp[i][w] = dp[i-1][w]`
- Take item `i` (if `weights[i-1] <= w`): `dp[i][w] = dp[i-1][w - weights[i-1]] + values[i-1]`
- `dp[i][w] = max(skip, take)`

**Base case:** `dp[0][w] = 0` for all `w` (no items, no value)

### Table Construction Step by Step

```
Items: weights = [1, 3, 4], values = [15, 20, 30], capacity = 4

        w=0  w=1  w=2  w=3  w=4
i=0     [ 0    0    0    0    0 ]   (no items)
i=1     [ 0   15   15   15   15 ]   (item 0: w=1, v=15)
i=2     [ 0   15   15   20   35 ]   (item 1: w=3, v=20)
i=3     [ 0   15   15   20   35 ]   (item 2: w=4, v=30)

dp[2][4] = max(dp[1][4], dp[1][4-3]+20) = max(15, 15+20) = 35
dp[3][4] = max(dp[2][4], dp[2][4-4]+30) = max(35, 0+30)  = 35

Answer: 35 (take items 0 and 1, total weight = 4)
```

### Full 2D Implementation

```csharp
public class Knapsack
{
    public int Solve01(int[] weights, int[] values, int capacity)
    {
        int n = weights.Length;
        var dp = new int[n + 1, capacity + 1];

        for (int i = 1; i <= n; i++)
        {
            for (int w = 0; w <= capacity; w++)
            {
                dp[i, w] = dp[i - 1, w]; // skip item i

                if (weights[i - 1] <= w)
                {
                    dp[i, w] = Math.Max(
                        dp[i, w],
                        dp[i - 1, w - weights[i - 1]] + values[i - 1] // take item i
                    );
                }
            }
        }

        return dp[n, capacity];
    }
}
```

## Space Optimization: 2D to 1D

Since row `i` only depends on row `i-1`, we can use a single 1D array. The key insight: **iterate capacity in reverse** to avoid using an item twice.

```csharp
public int Solve01Optimized(int[] weights, int[] values, int capacity)
{
    int n = weights.Length;
    var dp = new int[capacity + 1];

    for (int i = 0; i < n; i++)
    {
        // REVERSE order: ensures dp[w - weights[i]] is from the previous row
        for (int w = capacity; w >= weights[i]; w--)
        {
            dp[w] = Math.Max(dp[w], dp[w - weights[i]] + values[i]);
        }
    }

    return dp[capacity];
}
```

> **Warning:** If you iterate forward, `dp[w - weights[i]]` may already include item `i` from this iteration, effectively allowing unlimited copies (this is actually the unbounded knapsack approach).

## Unbounded Knapsack

Each item can be used **unlimited times**. The only change: iterate capacity **forward**.

```csharp
public int SolveUnbounded(int[] weights, int[] values, int capacity)
{
    var dp = new int[capacity + 1];

    for (int i = 0; i < weights.Length; i++)
    {
        // FORWARD order: allows reusing item i multiple times
        for (int w = weights[i]; w <= capacity; w++)
        {
            dp[w] = Math.Max(dp[w], dp[w - weights[i]] + values[i]);
        }
    }

    return dp[capacity];
}
```

### 0/1 vs Unbounded — The Loop Direction

```
0/1 Knapsack:        for w = capacity DOWN TO weight[i]
Unbounded Knapsack:  for w = weight[i] UP TO capacity

This single difference controls whether items are reused.
```

---

## Practice Problems

### Problem 1: Classic 0/1 Knapsack

**Problem:** Given `n` items with weights and values, and a knapsack of capacity `W`, find the maximum value you can carry.

```csharp
public class Solution
{
    public int KnapsackMaxValue(int[] weights, int[] values, int W)
    {
        var dp = new int[W + 1];

        for (int i = 0; i < weights.Length; i++)
        {
            for (int w = W; w >= weights[i]; w--)
            {
                dp[w] = Math.Max(dp[w], dp[w - weights[i]] + values[i]);
            }
        }

        return dp[W];
    }
}
```

**Complexity:** O(n * W) time, O(W) space.

---

### Problem 2: Partition Equal Subset Sum (LeetCode 416)

**Problem:** Given a non-empty array of positive integers, determine if it can be partitioned into two subsets with equal sum.

**Approach:** The total sum must be even. Find a subset summing to `totalSum / 2`. This is a 0/1 knapsack where we check feasibility instead of maximizing value.

**State:** `dp[j]` = true if a subset summing to `j` exists

```csharp
public class Solution
{
    public bool CanPartition(int[] nums)
    {
        int totalSum = nums.Sum();

        // If total is odd, cannot split evenly
        if (totalSum % 2 != 0) return false;

        int target = totalSum / 2;
        var dp = new bool[target + 1];
        dp[0] = true; // sum 0 is always achievable

        foreach (int num in nums)
        {
            // Reverse to ensure each number is used at most once
            for (int j = target; j >= num; j--)
            {
                dp[j] = dp[j] || dp[j - num];
            }

            // Early termination
            if (dp[target]) return true;
        }

        return dp[target];
    }
}
```

**Complexity:** O(n * target) time, O(target) space where target = totalSum / 2.

---

### Problem 3: Coin Change II (LeetCode 518)

**Problem:** Given coin denominations and an amount, return the number of combinations that make up that amount. Each coin can be used unlimited times.

**Approach:** This is an **unbounded knapsack** with counting. We count combinations, not permutations, so we iterate coins in the outer loop.

**State:** `dp[j]` = number of ways to make amount `j`

```csharp
public class Solution
{
    public int Change(int amount, int[] coins)
    {
        var dp = new int[amount + 1];
        dp[0] = 1; // one way to make amount 0: use no coins

        foreach (int coin in coins) // outer loop = coins (for combinations)
        {
            // Forward loop: unbounded (each coin can be used multiple times)
            for (int j = coin; j <= amount; j++)
            {
                dp[j] += dp[j - coin];
            }
        }

        return dp[amount];
    }
}
```

> **Important:** If the outer loop iterates over amounts and the inner loop over coins, you count **permutations** (e.g., [1,2] and [2,1] are different). With coins in the outer loop, you count **combinations** (order does not matter).

**Complexity:** O(n * amount) time, O(amount) space.

### Step-by-step Table for coins = [1, 2, 5], amount = 5

```
Initial:  dp = [1, 0, 0, 0, 0, 0]

After coin = 1:
  dp = [1, 1, 1, 1, 1, 1]
  (only 1s: {1}, {1,1}, {1,1,1}, {1,1,1,1}, {1,1,1,1,1})

After coin = 2:
  dp = [1, 1, 2, 2, 3, 3]
  (add: {2}, {1,2}, {2,2}, {1,2,2})

After coin = 5:
  dp = [1, 1, 2, 2, 3, 4]
  (add: {5})

Answer: dp[5] = 4 combinations
```

---

### Problem 4: Last Stone Weight II (LeetCode 1049)

**Problem:** Smash stones together; the result is `|weight_a - weight_b|`. After all smashes, return the smallest possible remaining weight.

**Approach:** This is equivalent to partitioning stones into two groups and minimizing the absolute difference of their sums. Find the largest achievable sum `S1 <= totalSum / 2`. Answer = `totalSum - 2 * S1`.

**State:** `dp[j]` = true if a subset summing to `j` is achievable

```csharp
public class Solution
{
    public int LastStoneWeightII(int[] stones)
    {
        int totalSum = stones.Sum();
        int target = totalSum / 2;

        var dp = new bool[target + 1];
        dp[0] = true;

        foreach (int stone in stones)
        {
            for (int j = target; j >= stone; j--)
            {
                dp[j] = dp[j] || dp[j - stone];
            }
        }

        // Find the largest achievable sum <= target
        for (int j = target; j >= 0; j--)
        {
            if (dp[j])
                return totalSum - 2 * j;
        }

        return totalSum; // fallback (should not reach here)
    }
}
```

**Complexity:** O(n * totalSum) time, O(totalSum) space.

---

## Knapsack Variant Summary

| Variant | Item Usage | Loop Direction | Goal |
|---------|-----------|----------------|------|
| 0/1 Knapsack | At most once | Reverse | Max value |
| Unbounded Knapsack | Unlimited | Forward | Max value |
| Subset Sum | At most once | Reverse | Feasibility (bool) |
| Coin Change (min) | Unlimited | Forward | Minimize count |
| Coin Change II | Unlimited | Forward, coins outer | Count combinations |
| Partition Equal Subset | At most once | Reverse | Feasibility (bool) |
| Last Stone Weight II | At most once | Reverse | Minimize difference |

## Common Mistakes

1. **Wrong loop direction** — Forward for 0/1 knapsack allows item reuse (incorrect). Reverse for unbounded prevents reuse (incorrect). Remember: reverse = 0/1, forward = unbounded.
2. **Counting permutations instead of combinations** — In Coin Change II, coins must be the outer loop to avoid counting `[1,2]` and `[2,1]` as different.
3. **Not recognizing the knapsack pattern** — Problems like Partition Equal Subset Sum, Target Sum, and Last Stone Weight II are all knapsack in disguise.
4. **Using `int.MaxValue` with addition** — In minimization problems, initialize with `amount + 1` to avoid overflow when adding 1.

## Interview Tips

- If you see "pick/skip items with a capacity constraint," think knapsack immediately.
- Mention the space optimization from 2D to 1D unprompted — it demonstrates mastery.
- Know how to explain *why* the reverse loop prevents item reuse: when going backward, `dp[w - weight[i]]` has not been updated in this iteration, so it reflects the previous item's state.
- For partition problems, the key insight is: "split into two groups" = "find a subset summing to half the total."

---

## Quiz

<details>
<summary>1. Why does iterating capacity in reverse ensure each item is used at most once?</summary>

When iterating in reverse, `dp[w - weights[i]]` has not yet been updated in the current iteration, so it still holds the value from the previous item (row i-1 in the 2D table). This means item `i` can only be counted once. Forward iteration would use the already-updated value, allowing the same item to contribute multiple times.
</details>

<details>
<summary>2. How is Partition Equal Subset Sum a knapsack problem?</summary>

We need to find a subset that sums to exactly `totalSum / 2`. Each number is an "item" with weight equal to its value. The "knapsack capacity" is `totalSum / 2`. This is a 0/1 knapsack feasibility check (boolean DP).
</details>

<details>
<summary>3. In Coin Change II, what happens if you swap the loop order (amount outer, coins inner)?</summary>

You count permutations instead of combinations. For example, with coins [1,2] and amount 3, the swapped order counts [1,1,2] and [1,2,1] and [2,1,1] as three different ways instead of one combination {1,1,2}.
</details>

<details>
<summary>4. What is the time complexity of the 0/1 knapsack and is it truly polynomial?</summary>

O(n * W) where n = items and W = capacity. This is **pseudo-polynomial** because W is a numeric value, not the input size. The input size for W is log(W) bits, so the algorithm is exponential in the number of bits needed to represent W.
</details>

<details>
<summary>5. How does Last Stone Weight II reduce to a partition problem?</summary>

Smashing all stones is equivalent to assigning a + or - sign to each stone's weight and computing the total. To minimize the result, split stones into two groups with sums as close as possible. This is the same as finding a subset summing to the largest value <= totalSum / 2, giving answer = totalSum - 2 * bestSubsetSum.
</details>
