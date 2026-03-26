# Interval DP and Advanced DP

*Solving problems over ranges, chains, and non-trivial structures*

Interval DP operates on contiguous subranges of an array or sequence. Instead of building up from single elements, we consider all possible ways to split an interval and combine the results. Advanced DP also covers DP on trees and scheduling problems with sorting-based optimization.

## Interval DP Concept

**State:** `dp[i][j]` = optimal answer for the subrange `[i, j]`

**Recurrence:** Try every possible split point `k` in `[i, j)`:
```
dp[i][j] = optimize over k in [i, j):
               dp[i][k] + dp[k+1][j] + cost(i, k, j)
```

**Fill order:** By increasing interval length (small intervals before large ones).

### Visualization

```
Array indices:  0   1   2   3   4

Length 1: dp[0][0]  dp[1][1]  dp[2][2]  dp[3][3]  dp[4][4]  (base cases)

Length 2: dp[0][1]  dp[1][2]  dp[2][3]  dp[3][4]
              k=0       k=1       k=2       k=3

Length 3: dp[0][2]       dp[1][3]       dp[2][4]
          k=0,1          k=1,2          k=2,3

Length 4: dp[0][3]              dp[1][4]
          k=0,1,2               k=1,2,3

Length 5: dp[0][4]
          k=0,1,2,3

Fill order: diagonal by diagonal (bottom-left to top-right)
```

### Matrix Chain Multiplication (Classic Example)

Given matrices A1(10x30), A2(30x5), A3(5x60), find the parenthesization that minimizes scalar multiplications.

```
dp[i][j] = min cost to multiply matrices i through j

For matrices with dimensions: dims = [10, 30, 5, 60]

dp[1][1] = 0, dp[2][2] = 0, dp[3][3] = 0

dp[1][2] = 10 * 30 * 5 = 1500        (A1 * A2)
dp[2][3] = 30 * 5 * 60 = 9000        (A2 * A3)

dp[1][3] = min(
  dp[1][1] + dp[2][3] + 10*30*60 = 0 + 9000 + 18000 = 27000,  split at k=1
  dp[1][2] + dp[3][3] + 10*5*60  = 1500 + 0 + 3000  = 4500    split at k=2
) = 4500

Optimal: (A1 * A2) * A3
```

```csharp
public class MatrixChainMultiplication
{
    public int MinCost(int[] dims)
    {
        // dims[i-1] x dims[i] is the dimension of matrix i
        int n = dims.Length - 1; // number of matrices
        var dp = new int[n + 1, n + 1];

        // len = chain length
        for (int len = 2; len <= n; len++)
        {
            for (int i = 1; i <= n - len + 1; i++)
            {
                int j = i + len - 1;
                dp[i, j] = int.MaxValue;

                for (int k = i; k < j; k++)
                {
                    int cost = dp[i, k] + dp[k + 1, j]
                             + dims[i - 1] * dims[k] * dims[j];
                    dp[i, j] = Math.Min(dp[i, j], cost);
                }
            }
        }

        return dp[1, n];
    }
}
```

## DP on Trees

Tree DP computes values bottom-up from leaves to the root. Common pattern: for each node, combine results from its children.

```
       1
      / \
     2   3
    / \
   4   5

Post-order traversal: compute dp[4], dp[5] → dp[2], dp[3] → dp[1]
```

---

## Practice Problems

### Problem 1: Burst Balloons (LeetCode 312)

**Problem:** Given `n` balloons with values in `nums`, bursting balloon `i` earns `nums[i-1] * nums[i] * nums[i+1]` coins. Find the maximum coins by bursting all balloons optimally.

**Key Insight:** Instead of thinking about which balloon to burst *first*, think about which balloon to burst *last* in each interval. If balloon `k` is the last one burst in interval `(i, j)`, the neighbors are `nums[i]` and `nums[j]` (the boundaries).

**State:** `dp[i][j]` = max coins from bursting all balloons in the open interval `(i, j)`

**Recurrence:** `dp[i][j] = max over k in (i,j): dp[i][k] + dp[k][j] + nums[i]*nums[k]*nums[j]`

**Setup:** Pad the array with 1s on both ends: `[1, nums[0], nums[1], ..., nums[n-1], 1]`

```
Example: nums = [3, 1, 5, 8]
Padded: [1, 3, 1, 5, 8, 1]
Indices:  0  1  2  3  4  5

dp[0][5] = max coins for all balloons

For interval (0, 5), last balloon k:
  k=1: dp[0][1] + dp[1][5] + 1*3*1 = 0 + ... + 3
  k=2: dp[0][2] + dp[2][5] + 1*1*1 = ...
  k=3: dp[0][3] + dp[3][5] + 1*5*1 = ...
  k=4: dp[0][4] + dp[4][5] + 1*8*1 = ...
```

```csharp
public class Solution
{
    public int MaxCoins(int[] nums)
    {
        int n = nums.Length;

        // Pad with 1s on both ends
        var vals = new int[n + 2];
        vals[0] = 1;
        vals[n + 1] = 1;
        for (int i = 0; i < n; i++)
            vals[i + 1] = nums[i];

        var dp = new int[n + 2, n + 2];

        // Enumerate by interval length
        for (int len = 2; len <= n + 1; len++)
        {
            for (int i = 0; i + len <= n + 1; i++)
            {
                int j = i + len;

                // Try each balloon k as the LAST to burst in (i, j)
                for (int k = i + 1; k < j; k++)
                {
                    int coins = dp[i, k] + dp[k, j]
                              + vals[i] * vals[k] * vals[j];
                    dp[i, j] = Math.Max(dp[i, j], coins);
                }
            }
        }

        return dp[0, n + 1];
    }
}
```

**Complexity:** O(n^3) time, O(n^2) space.

---

### Problem 2: Strange Printer (LeetCode 664)

**Problem:** A printer can print a sequence of the same character in one turn, covering any range. It can overwrite previously printed characters. Given a string `s`, find the minimum number of turns to print it.

**Key Insight:** `dp[i][j]` = minimum turns to print `s[i..j]`. If `s[i] == s[k]` for some `k > i`, we can extend the first print of `s[i]` to cover position `k`, reducing the problem.

**State:** `dp[i][j]` = minimum turns to print `s[i..j]`

**Recurrence:**
- Start with `dp[i][j] = dp[i][j-1] + 1` (print `s[j]` alone in a new turn)
- For each `k` in `[i, j)` where `s[k] == s[j]`: `dp[i][j] = min(dp[i][j], dp[i][k] + dp[k+1][j-1])`
  - Print `s[k]` and `s[j]` together (extend the turn that prints `s[k]` to also cover `s[j]`)

**Base case:** `dp[i][i] = 1` (one character, one turn)

```csharp
public class Solution
{
    public int StrangePrinter(string s)
    {
        // Remove consecutive duplicates (they don't add turns)
        var sb = new System.Text.StringBuilder();
        sb.Append(s[0]);
        for (int i = 1; i < s.Length; i++)
        {
            if (s[i] != s[i - 1])
                sb.Append(s[i]);
        }
        string t = sb.ToString();
        int n = t.Length;

        var dp = new int[n, n];

        // Base case: single characters
        for (int i = 0; i < n; i++)
            dp[i, i] = 1;

        // Fill by increasing length
        for (int len = 2; len <= n; len++)
        {
            for (int i = 0; i <= n - len; i++)
            {
                int j = i + len - 1;
                dp[i, j] = dp[i, j - 1] + 1; // print s[j] alone

                // Try merging s[j] with a matching s[k]
                for (int k = i; k < j; k++)
                {
                    if (t[k] == t[j])
                    {
                        int cost = dp[i, k] + (k + 1 <= j - 1 ? dp[k + 1, j - 1] : 0);
                        dp[i, j] = Math.Min(dp[i, j], cost);
                    }
                }
            }
        }

        return dp[0, n - 1];
    }
}
```

**Complexity:** O(n^3) time, O(n^2) space after deduplication.

---

### Problem 3: Maximum Profit in Job Scheduling (LeetCode 1235)

**Problem:** Given `n` jobs with start times, end times, and profits, find the maximum profit such that no two selected jobs overlap.

**Approach:** This is not interval DP per se, but an advanced 1D DP combined with sorting and binary search.

1. Sort jobs by end time.
2. `dp[i]` = max profit considering jobs `0..i`.
3. For each job `i`, use binary search to find the latest non-overlapping job `j`.
4. `dp[i] = max(dp[i-1], profit[i] + dp[j])`

```
Jobs sorted by end time:
  Job 0: [1, 3) profit=50
  Job 1: [2, 5) profit=20
  Job 2: [4, 6) profit=70
  Job 3: [6, 7) profit=60

dp[0] = 50 (take job 0)
dp[1] = max(50, 20 + 0) = 50 (skip job 1)
dp[2] = max(50, 70 + 50) = 120 (take job 2, chain with job 0)
dp[3] = max(120, 60 + 120) = 180 (take job 3, chain with job 2)
```

```csharp
public class Solution
{
    public int JobScheduling(int[] startTime, int[] endTime, int[] profit)
    {
        int n = startTime.Length;

        // Create and sort jobs by end time
        var jobs = new int[n][];
        for (int i = 0; i < n; i++)
            jobs[i] = new int[] { startTime[i], endTime[i], profit[i] };

        Array.Sort(jobs, (a, b) => a[1].CompareTo(b[1]));

        // dp[i] = max profit using first i jobs (1-indexed)
        var dp = new int[n + 1];

        for (int i = 1; i <= n; i++)
        {
            int jobStart = jobs[i - 1][0];
            int jobProfit = jobs[i - 1][2];

            // Binary search: find latest job that ends <= jobStart
            int lo = 0, hi = i - 1;
            while (lo < hi)
            {
                int mid = lo + (hi - lo + 1) / 2;
                if (jobs[mid - 1][1] <= jobStart) // mid is 1-indexed
                    lo = mid;
                else
                    hi = mid - 1;
            }

            // Check if the found job is valid
            int prev = (lo > 0 && jobs[lo - 1][1] <= jobStart) ? lo : 0;

            dp[i] = Math.Max(
                dp[i - 1],           // skip this job
                jobProfit + dp[prev]  // take this job
            );
        }

        return dp[n];
    }
}
```

**Complexity:** O(n log n) time (sorting + binary search per job), O(n) space.

---

## Interval DP Template

```csharp
// Generic interval DP template
public int IntervalDP(int[] arr)
{
    int n = arr.Length;
    var dp = new int[n, n];

    // Base cases: intervals of length 1
    for (int i = 0; i < n; i++)
        dp[i, i] = /* base value */;

    // Fill by increasing interval length
    for (int len = 2; len <= n; len++)
    {
        for (int i = 0; i <= n - len; i++)
        {
            int j = i + len - 1;
            dp[i, j] = /* initial value (e.g., int.MaxValue or 0) */;

            // Try all split points
            for (int k = i; k < j; k++)
            {
                int candidate = dp[i, k] + dp[k + 1, j] + /* merge cost */;
                dp[i, j] = Math.Min(dp[i, j], candidate); // or Max
            }
        }
    }

    return dp[0, n - 1];
}
```

## Complexity Summary

| Problem | Time | Space | Technique |
|---------|------|-------|-----------|
| Matrix Chain Multiplication | O(n^3) | O(n^2) | Interval DP |
| Burst Balloons | O(n^3) | O(n^2) | Interval DP (last burst) |
| Strange Printer | O(n^3) | O(n^2) | Interval DP (merge prints) |
| Job Scheduling | O(n log n) | O(n) | Sort + Binary Search + DP |

## Common Mistakes

1. **Wrong interval DP fill order** — You must fill by increasing length. Filling row by row or column by column will reference uncomputed states.
2. **Burst Balloons: thinking about first burst instead of last** — The "last balloon burst" insight eliminates the dependency on what has already been burst. It makes the subproblems independent.
3. **Job Scheduling: not sorting** — Without sorting by end time, binary search for non-overlapping jobs does not work.
4. **Off-by-one in split points** — For interval `[i, j]`, split at `k` produces `[i, k]` and `[k+1, j]`. Ensure `k` ranges from `i` to `j-1` (not `j`).

## Interview Tips

- Interval DP problems are relatively rare in interviews but appear at the hard level. Recognizing the pattern — "optimize over a contiguous range" — is the key.
- For Burst Balloons, clearly explain the "last burst" insight. This is the hardest conceptual leap.
- Job Scheduling combines multiple techniques (sorting, binary search, DP). Practice explaining each layer.
- When the interviewer says "minimize/maximize cost of combining," think interval DP or matrix chain multiplication.
- Tree DP is tested more often than interval DP. Practice post-order traversal DP on binary trees.

---

## Quiz

<details>
<summary>1. Why must interval DP be filled by increasing interval length?</summary>

Because `dp[i][j]` depends on `dp[i][k]` and `dp[k+1][j]`, which are both shorter intervals. If we have not computed shorter intervals first, these values are undefined. Filling by length ensures all dependencies are resolved before they are needed.
</details>

<details>
<summary>2. In Burst Balloons, why do we think about the "last balloon to burst" instead of the first?</summary>

If we pick which balloon to burst first, the two resulting subproblems are NOT independent — the neighbors change as balloons are removed. By picking the LAST balloon to burst in an interval, the boundaries (nums[i] and nums[j]) are fixed, making the left and right subproblems independent.
</details>

<details>
<summary>3. What is the time complexity of interval DP and why?</summary>

O(n^3). There are O(n^2) intervals (pairs i, j). For each interval, we try O(n) split points. Total: O(n^2) * O(n) = O(n^3).
</details>

<details>
<summary>4. In Job Scheduling, why do we sort by end time rather than start time?</summary>

Sorting by end time allows efficient binary search for the latest compatible (non-overlapping) job. When considering job `i`, we need the latest job `j` with `endTime[j] <= startTime[i]`. With jobs sorted by end time, this is a standard binary search on the end times array.
</details>

<details>
<summary>5. How would you approach a tree DP problem where you need the maximum independent set?</summary>

For each node, compute two values: the maximum if the node IS included and the maximum if it is NOT included. A node can be included only if none of its children are included. Process in post-order (children before parent). This runs in O(n) time since each node is visited once.
</details>
