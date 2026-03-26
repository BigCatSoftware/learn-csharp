# Dynamic Programming — Fundamentals

*Solving complex problems by breaking them into overlapping subproblems*

Dynamic Programming (DP) is an optimization technique that solves problems by combining solutions to overlapping subproblems. If a problem has **overlapping subproblems** and **optimal substructure**, DP can transform an exponential brute-force solution into a polynomial one.

## Two Key Properties

### 1. Overlapping Subproblems

The same subproblem is solved multiple times. Consider the recursion tree for Fibonacci(5):

- fib(5)
- fib(4) — fib(3)
- / — \ — / — \
- fib(3) — fib(2) — fib(2) fib(1)
- / — \ — / \ — / \
- fib(2) fib(1) fib(0) fib(1) fib(0)
- fib(1) fib(0)
- fib(2) is computed 3 times!
- fib(3) is computed 2 times!
- Total calls: 15 (exponential growth)


### 2. Optimal Substructure

An optimal solution to the problem contains optimal solutions to its subproblems. For example, the shortest path from A to C through B consists of the shortest path from A to B plus the shortest path from B to C.

## Top-Down (Memoization) vs Bottom-Up (Tabulation)

### Top-Down: Memoization

Start from the original problem, recurse into subproblems, and cache results.

```csharp
public class TopDownFibonacci
{
    private Dictionary<int, long> _memo = new();

    public long Fib(int n)
    {
        if (n <= 1) return n;
        if (_memo.ContainsKey(n)) return _memo[n];

        _memo[n] = Fib(n - 1) + Fib(n - 2);
        return _memo[n];
    }
}
```

### Bottom-Up: Tabulation

Build the solution iteratively from the smallest subproblems upward.

```csharp
public class BottomUpFibonacci
{
    public long Fib(int n)
    {
        if (n <= 1) return n;

        var dp = new long[n + 1];
        dp[0] = 0;
        dp[1] = 1;

        for (int i = 2; i <= n; i++)
            dp[i] = dp[i - 1] + dp[i - 2];

        return dp[n];
    }
}
- ### Comparison
- | Aspect — | Top-Down (Memoization) — | Bottom-Up (Tabulation) — |
- |---------------------|----------------------------|------------------------------|
- | Direction — | Problem — subproblems — | Subproblems — problem — |
- | Implementation — | Recursion + cache — | Iterative + array — |
- | Subproblems solved — | Only those needed — | All subproblems — |
- | Stack overflow risk | Yes (deep recursion) — | No — |
- | Space optimization — | Harder — | Easier (can drop old states) |
- | Ease of writing — | Often more intuitive — | Requires knowing the order — |
- > **Tip:** Start with top-down memoization to verify correctness, then convert to bottom-up for performance if needed.
- ## How to Identify DP Problems
- Look for these signals:
- 1. **"Find the minimum/maximum..."** — optimization problems
- 2. **"Count the number of ways..."** — combinatorial problems
- 3. **"Is it possible to..."** — feasibility problems (sometimes)
- 4. **"Find the longest/shortest..."** — sequence problems
- 5. The problem can be broken into similar, smaller subproblems
- 6. Brute force would involve making choices at each step
- > **Warning:** Not every optimization problem is DP. Greedy problems have the greedy-choice property — a locally optimal choice leads to a global optimum. DP problems require considering all subproblem combinations.
- ## The DP Framework
- Follow these four steps for every DP problem:
- ### Step 1: Define the State
- What does `dp[i]` (or `dp[i][j]`) represent? This is the most critical decision.
- ### Step 2: Write the Recurrence Relation
- How does `dp[i]` relate to previous states? This is the transition formula.
- ### Step 3: Identify Base Cases
- What are the smallest subproblems you can solve directly?
- ### Step 4: Determine the Computation Order
- In bottom-up, ensure every state is computed before it is needed.
- ## Converting Recursive to Iterative

Recursive (top-down)           Iterative (bottom-up)
                                                     
1. Identify parameters     →   These become your dp dimensions
2. Identify base cases     →   Initialize dp array
3. Identify recurrence     →   Fill dp array in correct order
4. Identify answer         →   Return dp[target]
```

## Space Optimization

When `dp[i]` only depends on `dp[i-1]` (or a few recent states), you can reduce space from O(n) to O(1):

```csharp
// O(n) space
var dp = new long[n + 1];
dp[0] = 0; dp[1] = 1;
for (int i = 2; i <= n; i++)
    dp[i] = dp[i - 1] + dp[i - 2];

// O(1) space — only keep last two values
long prev2 = 0, prev1 = 1;
for (int i = 2; i <= n; i++)
{
    long curr = prev1 + prev2;
    prev2 = prev1;
    prev1 = curr;
}
// Answer is prev1
```

---

## Practice Problems

### Problem 1: Fibonacci Number (LeetCode 509)

**Problem:** Return the nth Fibonacci number. F(0) = 0, F(1) = 1, F(n) = F(n-1) + F(n-2).

**State:** `dp[i]` = ith Fibonacci number.

**Recurrence:** `dp[i] = dp[i-1] + dp[i-2]`

**Base cases:** `dp[0] = 0, dp[1] = 1`

```csharp
public class Solution
{
    // Space-optimized bottom-up
    public int Fib(int n)
    {
        if (n <= 1) return n;

        int prev2 = 0, prev1 = 1;

        for (int i = 2; i <= n; i++)
        {
            int curr = prev1 + prev2;
            prev2 = prev1;
            prev1 = curr;
        }

        return prev1;
    }
}
```

**Complexity:** O(n) time, O(1) space.

---

### Problem 2: Climbing Stairs (LeetCode 70)

**Problem:** You are climbing a staircase with `n` steps. Each time you can climb 1 or 2 steps. How many distinct ways can you reach the top?

**Approach:** At step `i`, you arrived from step `i-1` (one step) or `i-2` (two steps). This is Fibonacci in disguise.

**State:** `dp[i]` = number of ways to reach step `i`

**Recurrence:** `dp[i] = dp[i-1] + dp[i-2]`

**Base cases:** `dp[0] = 1` (one way to stand at ground), `dp[1] = 1`

```csharp
public class Solution
{
    public int ClimbStairs(int n)
    {
        if (n <= 2) return n;

        int prev2 = 1, prev1 = 2;

        for (int i = 3; i <= n; i++)
        {
            int curr = prev1 + prev2;
            prev2 = prev1;
            prev1 = curr;
        }

        return prev1;
    }
}
```

**Complexity:** O(n) time, O(1) space.

---

### Problem 3: Min Cost Climbing Stairs (LeetCode 746)

**Problem:** Given an array `cost` where `cost[i]` is the cost of step `i`, find the minimum cost to reach the top. You can start at index 0 or 1 and climb 1 or 2 steps.

**State:** `dp[i]` = minimum cost to reach step `i`

**Recurrence:** `dp[i] = cost[i] + min(dp[i-1], dp[i-2])`

**Base cases:** `dp[0] = cost[0], dp[1] = cost[1]`

**Answer:** `min(dp[n-1], dp[n-2])` — you can reach the top from either of the last two steps.

```csharp
public class Solution
{
    public int MinCostClimbingStairs(int[] cost)
    {
        int n = cost.Length;

        // Space-optimized: only track last two costs
        int prev2 = cost[0];
        int prev1 = cost[1];

        for (int i = 2; i < n; i++)
        {
            int curr = cost[i] + Math.Min(prev1, prev2);
            prev2 = prev1;
            prev1 = curr;
        }

        // Can reach the "top" (past the last step) from either of the last two
        return Math.Min(prev1, prev2);
    }
}
```

**Complexity:** O(n) time, O(1) space.

---

## Common Mistakes

1. **Wrong state definition** — The most frequent error. If your recurrence does not work cleanly, reconsider what `dp[i]` represents.
2. **Missing base cases** — Always verify with the smallest inputs (n=0, n=1).
3. **Off-by-one errors** — Double-check array sizes: `new int[n]` vs `new int[n + 1]`.
4. **Not considering the answer location** — The final answer is not always `dp[n]`. For Min Cost Climbing Stairs, it is `min(dp[n-1], dp[n-2])`.
5. **Premature space optimization** — Get the O(n) space version working first, then optimize.

## Interview Tips

- Always start by stating the **state definition** and **recurrence** before coding. This shows structured thinking.
- When stuck, solve the problem recursively first, then add memoization.
- Mention space optimization as a follow-up even if the interviewer does not ask.
- Practice recognizing DP patterns: Fibonacci-like, knapsack, LCS, interval DP.
- Time yourself: you should be able to identify the recurrence within 5 minutes for standard problems.

---

## Quiz

<details>
<summary>1. What two properties must a problem have to be solvable with DP?</summary>

**Overlapping subproblems** (the same subproblem is solved multiple times) and **optimal substructure** (an optimal solution contains optimal solutions to subproblems).
</details>

<details>
<summary>2. What is the time complexity of naive recursive Fibonacci vs DP Fibonacci?</summary>

Naive recursive: O(2^n) — exponential due to redundant computation. DP (memoization or tabulation): O(n) — each subproblem is solved exactly once.
</details>

<details>
<summary>3. When is top-down memoization preferred over bottom-up tabulation?</summary>

When only a subset of subproblems are needed (sparse subproblem space), when the problem is easier to think about recursively, or when the computation order is hard to determine. Bottom-up is preferred when you need all subproblems or want to optimize space.
</details>

<details>
<summary>4. How do you optimize space from O(n) to O(1) for Fibonacci-style DP?</summary>

Since `dp[i]` only depends on `dp[i-1]` and `dp[i-2]`, replace the array with two variables (`prev1` and `prev2`) and update them as you iterate.
</details>

<details>
<summary>5. Why is Climbing Stairs equivalent to Fibonacci?</summary>

At each step `i`, the number of ways to arrive = ways from `i-1` + ways from `i-2`. This gives the recurrence `dp[i] = dp[i-1] + dp[i-2]`, which is exactly the Fibonacci recurrence with different base cases.
</details>
