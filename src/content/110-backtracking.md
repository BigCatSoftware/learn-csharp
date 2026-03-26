# Backtracking

## What Is Backtracking?

**Backtracking** is a systematic method for exploring all potential solutions by building candidates incrementally and abandoning ("pruning") a candidate as soon as it cannot lead to a valid solution. Think of it as a depth-first search through a **state space tree**.

- Backtracking = Explore + Prune
- [1] — [2] — choices at each level
- / — \ — \
- [1,2] — [1,3] — [2,3] — extend candidates
- [1,2,3] — complete solution (leaf)
- ✗ = pruned branch (constraint violated, stop exploring)
- ✓ = valid solution (add to results)


> **Key Idea:** Instead of generating all 2^n or n! possibilities and filtering, backtracking prunes entire subtrees that cannot lead to valid solutions, often dramatically reducing the search space.

## The Backtracking Template in C#

Almost every backtracking problem follows this pattern:

```csharp
public class Solution
{
    private IList<IList<int>> results = new List<IList<int>>();

    public IList<IList<int>> Solve(int[] nums)
    {
        Backtrack(nums, new List<int>(), /* other state */);
        return results;
    }

    private void Backtrack(int[] nums, List<int> current, /* state */)
    {
        // 1. BASE CASE: Is current a complete solution?
        if (/* goal condition */)
        {
            results.Add(new List<int>(current)); // copy!
            return;
        }

        // 2. EXPLORE: Try each candidate choice
        for (int i = /* start */; i < nums.Length; i++)
        {
            // 3. PRUNE: Skip invalid choices
            if (/* constraint violated */) continue;

            // 4. CHOOSE: Add candidate to current solution
            current.Add(nums[i]);

            // 5. RECURSE: Explore further with this choice
            Backtrack(nums, current, /* updated state */);

            // 6. UN-CHOOSE: Remove candidate (backtrack)
            current.RemoveAt(current.Count - 1);
        }
    }
}
```

> **Critical:** Always make a **copy** of the current list when adding to results. Otherwise all results will reference the same (eventually empty) list.

## State Space Tree and Pruning

```
Decision Tree for Subsets of {1, 2, 3}:

Level 0:                          {}
                            /      |      \
Level 1:                {1}       {2}      {3}
                        / \        |
Level 2:           {1,2}  {1,3}  {2,3}
                    /
Level 3:       {1,2,3}

At each node, we decide: include the next element or skip it?
All nodes are valid subsets: {}, {1}, {2}, {3}, {1,2}, {1,3}, {2,3}, {1,2,3}
```

**Pruning strategies:**
- **Constraint pruning:** Skip choices that violate constraints (e.g., sum exceeds target)
- **Symmetry pruning:** Skip duplicate elements to avoid generating the same result twice
- **Bound pruning:** If remaining elements can't possibly satisfy the goal, prune early
- **Sorting:** Sorting input enables efficient pruning (stop early when values get too large)

## Complexity Reference

| Problem | Time | Space | Notes |
|---|---|---|---|
| Subsets | O(n * 2^n) | O(n) | 2^n subsets, O(n) to copy each |
| Permutations | O(n * n!) | O(n) | n! permutations |
| Combination Sum | O(2^t) | O(t) | t = target/min_candidate |
| N-Queens | O(n!) | O(n) | Pruning reduces from n^n |
| Word Search | O(m*n * 3^L) | O(L) | 3 directions (not revisiting) |
| Sudoku Solver | O(9^empty) | O(1) | Constraint propagation helps |

---

## Practice Problems

### Problem 1: Subsets

**Statement:** Given an integer array `nums` of unique elements, return all possible subsets (the power set).

**Approach:** At each recursive call, we choose to include or exclude the current element. Use a start index to avoid duplicates.

> Decision tree for [1,2,3]:
> backtrack(start=0, current=[])
> add 1 → backtrack(start=1, current=[1])
> add 2 → backtrack(start=2, current=[1,2])
> add 3 → backtrack(start=3, current=[1,2,3]) → RESULT
> → RESULT [1,2]
> add 3 → backtrack(start=3, current=[1,3]) → RESULT
> → RESULT [1]
> add 2 → backtrack(start=2, current=[2])
> add 3 → backtrack(start=3, current=[2,3]) → RESULT
> → RESULT [2]
> add 3 → backtrack(start=3, current=[3]) → RESULT
> → RESULT []


```csharp
public class Solution
{
    public IList<IList<int>> Subsets(int[] nums)
    {
        var results = new List<IList<int>>();
        Backtrack(nums, 0, new List<int>(), results);
        return results;
    }

    private void Backtrack(int[] nums, int start, List<int> current,
                           List<IList<int>> results)
    {
        // Every node in the tree is a valid subset
        results.Add(new List<int>(current));

        for (int i = start; i < nums.Length; i++)
        {
            current.Add(nums[i]);             // choose
            Backtrack(nums, i + 1, current, results); // explore
            current.RemoveAt(current.Count - 1);      // un-choose
        }
    }
}
```

**Complexity:** Time O(n * 2^n), Space O(n) recursion depth.

---

### Problem 2: Permutations

**Statement:** Given an array `nums` of distinct integers, return all possible permutations.

**Approach:** At each level, pick any unused element. Use a boolean array to track which elements are in the current permutation.

```csharp
public class Solution
{
    public IList<IList<int>> Permute(int[] nums)
    {
        var results = new List<IList<int>>();
        bool[] used = new bool[nums.Length];
        Backtrack(nums, used, new List<int>(), results);
        return results;
    }

    private void Backtrack(int[] nums, bool[] used, List<int> current,
                           List<IList<int>> results)
    {
        // Base case: permutation is complete
        if (current.Count == nums.Length)
        {
            results.Add(new List<int>(current));
            return;
        }

        for (int i = 0; i < nums.Length; i++)
        {
            if (used[i]) continue; // prune: already used

            used[i] = true;                          // choose
            current.Add(nums[i]);
            Backtrack(nums, used, current, results); // explore
            current.RemoveAt(current.Count - 1);     // un-choose
            used[i] = false;
        }
    }
}
```

**Complexity:** Time O(n * n!), Space O(n).

---

### Problem 3: Combination Sum

**Statement:** Given an array of **distinct** integers `candidates` and a target, return all unique combinations where the chosen numbers sum to target. The same number may be used unlimited times.

**Approach:** Sort candidates. At each step, try adding each candidate (allowing reuse by not incrementing start). Prune when the running sum exceeds the target.

```csharp
public class Solution
{
    public IList<IList<int>> CombinationSum(int[] candidates, int target)
    {
        var results = new List<IList<int>>();
        Array.Sort(candidates); // sort to enable pruning
        Backtrack(candidates, target, 0, new List<int>(), results);
        return results;
    }

    private void Backtrack(int[] candidates, int remaining, int start,
                           List<int> current, List<IList<int>> results)
    {
        if (remaining == 0)
        {
            results.Add(new List<int>(current)); // found valid combination
            return;
        }

        for (int i = start; i < candidates.Length; i++)
        {
            // Prune: since array is sorted, all further candidates are too large
            if (candidates[i] > remaining) break;

            current.Add(candidates[i]);                           // choose
            // Pass i (not i+1) to allow reuse of the same element
            Backtrack(candidates, remaining - candidates[i], i,
                      current, results);                          // explore
            current.RemoveAt(current.Count - 1);                  // un-choose
        }
    }
}
```

**Complexity:** Time O(2^(t/m)) where t = target, m = min candidate. Space O(t/m) recursion depth.

---

### Problem 4: N-Queens

**Statement:** Place n queens on an n x n chessboard so that no two queens attack each other. Return all distinct solutions.

**Approach:** Place queens row by row. For each row, try each column and check if it's safe (no queen in the same column or diagonals). Use sets to track occupied columns and diagonals.

```csharp
public class Solution
{
    public IList<IList<string>> SolveNQueens(int n)
    {
        var results = new List<IList<string>>();
        var board = new char[n][];
        for (int i = 0; i < n; i++)
        {
            board[i] = new char[n];
            Array.Fill(board[i], '.');
        }

        var cols = new HashSet<int>();      // occupied columns
        var diag1 = new HashSet<int>();     // occupied \ diagonals (row - col)
        var diag2 = new HashSet<int>();     // occupied / diagonals (row + col)

        Backtrack(board, 0, n, cols, diag1, diag2, results);
        return results;
    }

    private void Backtrack(char[][] board, int row, int n,
                           HashSet<int> cols, HashSet<int> diag1,
                           HashSet<int> diag2, List<IList<string>> results)
    {
        if (row == n)
        {
            // All queens placed — record the board
            results.Add(board.Select(r => new string(r)).ToList());
            return;
        }

        for (int col = 0; col < n; col++)
        {
            // Prune: check if column or diagonals are attacked
            if (cols.Contains(col) || diag1.Contains(row - col)
                || diag2.Contains(row + col))
                continue;

            // Choose: place queen
            board[row][col] = 'Q';
            cols.Add(col);
            diag1.Add(row - col);
            diag2.Add(row + col);

            Backtrack(board, row + 1, n, cols, diag1, diag2, results);

            // Un-choose: remove queen
            board[row][col] = '.';
            cols.Remove(col);
            diag1.Remove(row - col);
            diag2.Remove(row + col);
        }
    }
}
```

**Complexity:** Time O(n!), Space O(n^2) for the board.

---

### Problem 5: Word Search

**Statement:** Given an `m x n` board of characters and a string `word`, determine if the word exists in the grid. The word can be constructed from letters of sequentially adjacent cells (horizontal/vertical), and each cell may be used only once.

```csharp
public class Solution
{
    private static readonly int[] dx = { 0, 0, 1, -1 };
    private static readonly int[] dy = { 1, -1, 0, 0 };

    public bool Exist(char[][] board, string word)
    {
        int m = board.Length, n = board[0].Length;

        for (int i = 0; i < m; i++)
            for (int j = 0; j < n; j++)
                if (board[i][j] == word[0] && Backtrack(board, word, i, j, 0))
                    return true;

        return false;
    }

    private bool Backtrack(char[][] board, string word, int r, int c, int idx)
    {
        if (idx == word.Length) return true; // all characters matched

        if (r < 0 || r >= board.Length || c < 0 || c >= board[0].Length)
            return false; // out of bounds
        if (board[r][c] != word[idx]) return false; // character mismatch

        char temp = board[r][c];
        board[r][c] = '#'; // mark visited (in-place, no extra space)

        for (int d = 0; d < 4; d++)
        {
            if (Backtrack(board, word, r + dx[d], c + dy[d], idx + 1))
                return true;
        }

        board[r][c] = temp; // un-mark (backtrack)
        return false;
    }
}
```

**Complexity:** Time O(m * n * 3^L) where L = word length. Space O(L) recursion stack.

---

### Problem 6: Sudoku Solver

**Statement:** Fill a 9x9 Sudoku board so every row, column, and 3x3 sub-box contains digits 1-9.

```csharp
public class Solution
{
    public void SolveSudoku(char[][] board)
    {
        Solve(board);
    }

    private bool Solve(char[][] board)
    {
        for (int r = 0; r < 9; r++)
        {
            for (int c = 0; c < 9; c++)
            {
                if (board[r][c] != '.') continue;

                // Try digits 1-9
                for (char d = '1'; d <= '9'; d++)
                {
                    if (IsValid(board, r, c, d))
                    {
                        board[r][c] = d;       // choose

                        if (Solve(board))       // explore
                            return true;        // solution found!

                        board[r][c] = '.';      // un-choose (backtrack)
                    }
                }

                return false; // no digit works — trigger backtracking
            }
        }

        return true; // all cells filled
    }

    private bool IsValid(char[][] board, int row, int col, char digit)
    {
        for (int i = 0; i < 9; i++)
        {
            // Check row and column
            if (board[row][i] == digit) return false;
            if (board[i][col] == digit) return false;

            // Check 3x3 sub-box
            int boxRow = 3 * (row / 3) + i / 3;
            int boxCol = 3 * (col / 3) + i % 3;
            if (board[boxRow][boxCol] == digit) return false;
        }
        return true;
    }
}
```

**Complexity:** Time O(9^empty_cells) worst case, much less with pruning. Space O(81) = O(1).

---

## Common Mistakes

1. **Forgetting to copy the current list** when adding to results. `results.Add(current)` stores a reference that will be modified later.
2. **Not restoring state** after recursion. Every "choose" must have a matching "un-choose".
3. **Using wrong start index.** Subsets/Combinations use `i + 1`, reuse-allowed uses `i`, permutations use `0` with a `used` array.
4. **Not sorting before pruning duplicates.** To skip duplicate elements, the array must be sorted so duplicates are adjacent.
5. **Infinite recursion in Sudoku.** Forgetting to `return false` after trying all digits for an empty cell.

## Interview Tips

- **State the template:** "I'll use the standard backtracking pattern: choose, explore, un-choose."
- **Identify the pruning strategy** early — this is what makes backtracking efficient.
- **Draw the decision tree** for small inputs to verify your logic before coding.
- **Discuss time complexity** in terms of the branching factor and depth of the tree.
- **For optimization problems** (like N-Queens), mention that backtracking explores far fewer states than brute force due to pruning.

---

## Quiz

<details>
<summary>1. What is the critical difference between backtracking and brute force?</summary>

Backtracking **prunes** branches of the search tree as soon as it detects that a partial solution cannot lead to a valid complete solution. Brute force generates all possible solutions and filters afterward. Pruning can reduce exponential search spaces dramatically.
</details>

<details>
<summary>2. Why must you create a copy of the current list when adding to results?</summary>

The `current` list is modified in place throughout the recursion. If you add a reference to it (not a copy), all entries in `results` will point to the same list — which will be empty at the end of the algorithm after all elements are un-chosen.
</details>

<details>
<summary>3. In Combination Sum, why do we pass `i` (not `i+1`) as the start index?</summary>

Because the same number can be reused unlimited times. Passing `i` allows the recursion to pick the same candidate again. Passing `i+1` would prevent reuse, which is the behavior for problems like Subsets or Combinations without repetition.
</details>

<details>
<summary>4. How do the three HashSets in N-Queens enable O(1) conflict checking?</summary>

`cols` tracks occupied columns. `diag1` (row - col) identifies \ diagonals — all cells on the same \ diagonal have the same `row - col` value. `diag2` (row + col) identifies / diagonals. Checking all three sets is O(1) per candidate position, avoiding an O(n) board scan.
</details>

<details>
<summary>5. In Word Search, why do we mark cells with '#' instead of using a separate visited array?</summary>

Marking in-place saves O(m*n) space for a visited matrix. We temporarily replace the character with '#' (which can't match any letter), then restore it during backtracking. This is a common space optimization in grid-based backtracking problems.
</details>
