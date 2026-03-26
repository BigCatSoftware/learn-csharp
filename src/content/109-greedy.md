# Greedy Algorithms

## What Makes an Algorithm Greedy?

A **greedy algorithm** makes the locally optimal choice at each step, hoping that these local choices lead to a globally optimal solution. Unlike dynamic programming, greedy algorithms never reconsider previous choices.

- Greedy Strategy:
- Step 1: Choose the BEST option available right now
- Step 2: Commit to it (no going back)
- Step 3: Repeat until the problem is solved
- Problem — Local Choice — Local Choice — ... — Global Solution
- "best now" — "best now"


> **Key Insight:** Greedy works when a problem has the **greedy choice property** (a locally optimal choice leads to a globally optimal solution) and **optimal substructure** (an optimal solution contains optimal solutions to subproblems).

## When Does Greedy Work? The Exchange Argument

The **exchange argument** is the standard proof technique: assume an optimal solution differs from the greedy solution, then show you can "exchange" a non-greedy choice for the greedy one without making the solution worse.

- Optimal solution: — [A, B, C, D] — suppose B is not the greedy choice
- Greedy solution: — [A, G, ?, ?] — G is the greedy choice at step 2
- Exchange argument: — Replace B with G in the optimal solution
- [A, G, C, D] — show this is still valid and no worse
- Therefore greedy is also optimal ✓


## Greedy vs Dynamic Programming

| Aspect | Greedy | Dynamic Programming |
|---|---|---|
| Approach | Make best local choice | Try all subproblems |
| Backtracking | Never | Builds on all subproblems |
| Proof | Exchange argument | Bellman principle |
| Speed | Usually faster | Usually slower |
| When to use | Greedy choice property holds | Overlapping subproblems |
| Example | Activity selection | 0/1 Knapsack |

> **Rule of Thumb:** Try greedy first. If you can find a counterexample where the greedy choice fails, switch to DP.

## Complexity Reference

| Problem | Greedy Strategy | Time | Space |
|---|---|---|---|
| Jump Game | Track max reachable | O(n) | O(1) |
| Jump Game II | BFS-style levels | O(n) | O(1) |
| Gas Station | Track running surplus | O(n) | O(1) |
| Merge Intervals | Sort + merge | O(n log n) | O(n) |
| Non-Overlapping Intervals | Sort by end, count overlaps | O(n log n) | O(1) |
| Partition Labels | Last occurrence + window | O(n) | O(1) |

---

## Practice Problems

### Problem 1: Jump Game

**Statement:** Given an integer array `nums` where each element represents your maximum jump length from that position, determine if you can reach the last index starting from index 0.

**Why Greedy Works:** At each position, we only care about the farthest index we can reach. If we can reach position `i`, we can also reach every position before `i`. We never need to reconsider — extending our reach is always beneficial.

**Approach:** Track the farthest reachable index. Scan left to right; if the current index exceeds what we can reach, we're stuck.

```csharp
public class Solution
{
    public bool CanJump(int[] nums)
    {
        int maxReach = 0; // farthest index reachable so far

        for (int i = 0; i < nums.Length; i++)
        {
            // If current index is beyond our reach, we can't proceed
            if (i > maxReach) return false;

            // Extend our reach greedily
            maxReach = Math.Max(maxReach, i + nums[i]);

            // Early exit: we can already reach the end
            if (maxReach >= nums.Length - 1) return true;
        }

        return true;
    }
}
```

**Complexity:** Time O(n), Space O(1).

---

### Problem 2: Jump Game II

**Statement:** Given the same setup as Jump Game, return the **minimum number of jumps** to reach the last index. You can assume you can always reach the end.

**Why Greedy Works:** Think of it as BFS by levels. Each "level" is the range of indices reachable with the current number of jumps. We greedily expand to the farthest point in each level.

```
nums = [2, 3, 1, 1, 4]

Level 0: index 0           (0 jumps, can reach up to index 2)
Level 1: indices 1..2      (1 jump,  can reach up to index 4)
Level 2: indices 3..4      (2 jumps, reached the end!)

Answer: 2
```

```csharp
public class Solution
{
    public int Jump(int[] nums)
    {
        int jumps = 0;
        int currentEnd = 0;   // end of current BFS level
        int farthest = 0;     // farthest we can reach from this level

        // We don't need to process the last index
        for (int i = 0; i < nums.Length - 1; i++)
        {
            farthest = Math.Max(farthest, i + nums[i]);

            // Reached the end of this level — must jump
            if (i == currentEnd)
            {
                jumps++;
                currentEnd = farthest;

                if (currentEnd >= nums.Length - 1) break;
            }
        }

        return jumps;
    }
}
```

**Complexity:** Time O(n), Space O(1).

---

### Problem 3: Gas Station

**Statement:** There are `n` gas stations in a circle. `gas[i]` is the fuel at station `i`, and `cost[i]` is the fuel needed to travel from station `i` to `i+1`. Find the starting station index to complete the circuit, or return -1 if impossible.

**Why Greedy Works:** If total gas >= total cost, a solution exists. If starting from station `s` we run out at station `f`, then no station between `s` and `f` can be a valid start either (they would have even less fuel at `f`). So we skip to `f+1`.

```csharp
public class Solution
{
    public int CanCompleteCircuit(int[] gas, int[] cost)
    {
        int totalSurplus = 0;  // total gas - total cost
        int currentTank = 0;   // running tank from candidate start
        int startStation = 0;  // candidate starting station

        for (int i = 0; i < gas.Length; i++)
        {
            int net = gas[i] - cost[i];
            totalSurplus += net;
            currentTank += net;

            // If tank goes negative, we can't start from startStation
            // (or any station between startStation and i)
            if (currentTank < 0)
            {
                startStation = i + 1;  // try next station
                currentTank = 0;       // reset tank
            }
        }

        // If total gas >= total cost, startStation is valid
        return totalSurplus >= 0 ? startStation : -1;
    }
}
```

**Complexity:** Time O(n), Space O(1).

---

### Problem 4: Merge Intervals

**Statement:** Given an array of intervals `[start, end]`, merge all overlapping intervals.

**Why Greedy Works:** After sorting by start time, we process intervals left-to-right. If the current interval overlaps with the previous merged interval, we extend it. Sorting ensures we never miss an overlap.

```csharp
public class Solution
{
    public int[][] Merge(int[][] intervals)
    {
        // Sort by start time
        Array.Sort(intervals, (a, b) => a[0].CompareTo(b[0]));

        var merged = new List<int[]>();
        merged.Add(intervals[0]);

        for (int i = 1; i < intervals.Length; i++)
        {
            int[] last = merged[^1]; // last merged interval

            if (intervals[i][0] <= last[1])
            {
                // Overlapping — extend the end
                last[1] = Math.Max(last[1], intervals[i][1]);
            }
            else
            {
                // No overlap — add new interval
                merged.Add(intervals[i]);
            }
        }

        return merged.ToArray();
    }
}
```

**Complexity:** Time O(n log n) for sorting, Space O(n) for result.

---

### Problem 5: Non-Overlapping Intervals

**Statement:** Given an array of intervals, return the minimum number of intervals to remove so that the rest don't overlap.

**Why Greedy Works:** Sort by **end time**. Always keep the interval that ends earliest — it leaves the most room for future intervals. This is the classic activity selection problem.

```csharp
public class Solution
{
    public int EraseOverlapIntervals(int[][] intervals)
    {
        // Sort by end time — greedy: keep the one that ends earliest
        Array.Sort(intervals, (a, b) => a[1].CompareTo(b[1]));

        int removals = 0;
        int prevEnd = intervals[0][1];

        for (int i = 1; i < intervals.Length; i++)
        {
            if (intervals[i][0] < prevEnd)
            {
                // Overlap detected — remove this interval (it ends later)
                removals++;
            }
            else
            {
                // No overlap — update the boundary
                prevEnd = intervals[i][1];
            }
        }

        return removals;
    }
}
```

**Complexity:** Time O(n log n), Space O(1) (ignoring sort space).

---

### Problem 6: Partition Labels

**Statement:** Given a string `s`, partition it into as many parts as possible so that each letter appears in at most one part. Return the sizes of the parts.

**Why Greedy Works:** For each character in the current partition, we must extend the partition to include its last occurrence. We greedily extend the window and cut when we've included all required characters.

```csharp
public class Solution
{
    public IList<int> PartitionLabels(string s)
    {
        // Record the last occurrence of each character
        int[] lastIndex = new int[26];
        for (int i = 0; i < s.Length; i++)
            lastIndex[s[i] - 'a'] = i;

        var result = new List<int>();
        int start = 0, end = 0;

        for (int i = 0; i < s.Length; i++)
        {
            // Extend partition to include last occurrence of s[i]
            end = Math.Max(end, lastIndex[s[i] - 'a']);

            // If we've reached the end of the partition, cut here
            if (i == end)
            {
                result.Add(end - start + 1);
                start = i + 1;
            }
        }

        return result;
    }
}
```

**Complexity:** Time O(n), Space O(1) (fixed 26-char array).

---

## Common Mistakes

1. **Assuming greedy always works.** Greedy fails on many problems (e.g., 0/1 Knapsack). Always verify the greedy choice property.
2. **Forgetting to sort.** Many greedy problems (intervals, scheduling) require sorting first.
3. **Sorting by the wrong key.** Non-Overlapping Intervals must sort by **end** time, not start time.
4. **Off-by-one in Jump Game II.** Iterating through `nums.Length` instead of `nums.Length - 1` can cause an extra jump.
5. **Not handling edge cases.** Single-element arrays, empty input, or intervals with identical start/end.

## Interview Tips

- **State the greedy strategy explicitly** before coding: "I will always pick the X that minimizes/maximizes Y."
- **Prove correctness** briefly: "This works because picking anything else would only make it worse, by the exchange argument."
- **Compare with DP** when asked: "Greedy works here because we never need to reconsider a choice. If we did, we'd need DP."
- **Time your sort:** If your greedy needs sorting, mention it affects the overall complexity.

---

## Quiz

<details>
<summary>1. What two properties must a problem have for a greedy algorithm to produce an optimal solution?</summary>

The **greedy choice property** (a locally optimal choice is part of a globally optimal solution) and **optimal substructure** (the problem's optimal solution contains optimal solutions to its subproblems).
</details>

<details>
<summary>2. In Non-Overlapping Intervals, why do we sort by end time instead of start time?</summary>

Sorting by end time ensures we always keep the interval that finishes earliest, leaving the maximum room for subsequent intervals. Sorting by start time doesn't guarantee this — an interval starting early could end very late and block many others.
</details>

<details>
<summary>3. In the Gas Station problem, if total gas >= total cost, why is a solution guaranteed to exist?</summary>

If total gas >= total cost, there is enough fuel overall to complete the circuit. The greedy scan finds the unique starting point where the running tank never goes negative. Any station where the prefix sum of `gas[i] - cost[i]` is minimized gives a valid start for the next station.
</details>

<details>
<summary>4. What is the exchange argument, and how does it prove a greedy algorithm is correct?</summary>

The exchange argument assumes an optimal solution that differs from the greedy solution. It then shows that "exchanging" a non-greedy choice for the greedy choice produces a solution that is equally good or better. By induction on all differing choices, the greedy solution is shown to be optimal.
</details>

<details>
<summary>5. Why does Jump Game II work in O(n) time despite finding the minimum number of jumps?</summary>

It uses a BFS-like level approach with a single pass. We track the farthest reachable index within the current "level" (jump count). When we reach the end of a level, we increment the jump count and start the next level. Each index is visited exactly once.
</details>
