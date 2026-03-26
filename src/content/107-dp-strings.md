# DP on Strings

*Palindromes, subsequences, and pattern matching*

String DP problems are among the most frequently asked in interviews. They combine sequence manipulation with dynamic programming patterns like LCS, edit distance, and interval DP. This lesson focuses on palindrome detection, subsequence counting, and regex matching.

## String DP Patterns

| Pattern | Key Idea | Example |
|---------|----------|---------|
| Two-string comparison | `dp[i][j]` on prefixes of both strings | LCS, Edit Distance |
| Palindrome detection | Expand from center or `dp[i][j]` on substrings | Longest Palindromic Substring |
| Subsequence counting | `dp[i][j]` counts matches between strings | Distinct Subsequences |
| Pattern matching | `dp[i][j]` matches string prefix to pattern prefix | Regex Matching |
| Palindrome partitioning | Combine palindrome check with cutting DP | Palindrome Partitioning |

## Palindrome Detection Techniques

### Expand Around Center — O(n^2) time, O(1) space

For each possible center (including between characters), expand outward while characters match.

- String: "abacaba"
- Centers: — a — b — a — c — a — b — a
- ↑ — ↑ — ↑
- single char centers + between-char centers
- Expanding from center 'c' (index 3):
- c — aca — bacab — abacaba — full palindrome found


### DP Table — O(n^2) time, O(n^2) space

`dp[i][j]` = true if `s[i..j]` is a palindrome.

```
String: "abba"

     a  b  b  a
a  [ T  F  F  T ]   dp[0][3] = (s[0]==s[3]) && dp[1][2] = T
b  [ .  T  T  F ]   dp[1][2] = (s[1]==s[2]) && dp[2][1]... (len≤2 check)
b  [ .  .  T  F ]
a  [ .  .  .  T ]

Recurrence: dp[i][j] = (s[i] == s[j]) && (j-i < 3 || dp[i+1][j-1])
```

---

## Practice Problems

### Problem 1: Longest Palindromic Substring (LeetCode 5)

**Problem:** Given a string `s`, return the longest palindromic substring.

#### Approach 1: Expand Around Center

For each of the `2n - 1` centers (n single chars + n-1 gaps), expand outward.

```csharp
public class Solution
{
    public string LongestPalindrome(string s)
    {
        if (s.Length < 2) return s;

        int start = 0, maxLen = 1;

        for (int i = 0; i < s.Length; i++)
        {
            // Odd-length palindromes (center is s[i])
            int len1 = ExpandAroundCenter(s, i, i);
            // Even-length palindromes (center between s[i] and s[i+1])
            int len2 = ExpandAroundCenter(s, i, i + 1);

            int len = Math.Max(len1, len2);
            if (len > maxLen)
            {
                maxLen = len;
                start = i - (len - 1) / 2;
            }
        }

        return s.Substring(start, maxLen);
    }

    private int ExpandAroundCenter(string s, int left, int right)
    {
        while (left >= 0 && right < s.Length && s[left] == s[right])
        {
            left--;
            right++;
        }
        return right - left - 1; // length of palindrome
    }
}
```

**Complexity:** O(n^2) time, O(1) space.

#### Approach 2: DP Table

```csharp
public class Solution
{
    public string LongestPalindromeDP(string s)
    {
        int n = s.Length;
        var dp = new bool[n, n];
        int start = 0, maxLen = 1;

        // All single characters are palindromes
        for (int i = 0; i < n; i++)
            dp[i, i] = true;

        // Check substrings of increasing length
        for (int len = 2; len <= n; len++)
        {
            for (int i = 0; i <= n - len; i++)
            {
                int j = i + len - 1;

                if (s[i] == s[j])
                {
                    // Length 2 or 3: automatically palindrome if ends match
                    // Length > 3: check inner substring
                    dp[i, j] = (len <= 3) || dp[i + 1, j - 1];
                }

                if (dp[i, j] && len > maxLen)
                {
                    start = i;
                    maxLen = len;
                }
            }
        }

        return s.Substring(start, maxLen);
    }
}
```

**Complexity:** O(n^2) time, O(n^2) space.

---

### Problem 2: Palindrome Partitioning (LeetCode 131)

**Problem:** Given a string `s`, partition it such that every substring in the partition is a palindrome. Return all possible palindrome partitions.

**Approach:** Use backtracking with a precomputed palindrome DP table for O(1) palindrome checks.

```csharp
public class Solution
{
    public IList<IList<string>> Partition(string s)
    {
        int n = s.Length;
        var result = new List<IList<string>>();

        // Precompute palindrome table
        var isPalin = new bool[n, n];
        for (int len = 1; len <= n; len++)
        {
            for (int i = 0; i <= n - len; i++)
            {
                int j = i + len - 1;
                if (s[i] == s[j])
                    isPalin[i, j] = (len <= 3) || isPalin[i + 1, j - 1];
            }
        }

        Backtrack(s, 0, new List<string>(), result, isPalin);
        return result;
    }

    private void Backtrack(string s, int start, List<string> current,
                           List<IList<string>> result, bool[,] isPalin)
    {
        if (start == s.Length)
        {
            result.Add(new List<string>(current));
            return;
        }

        for (int end = start; end < s.Length; end++)
        {
            if (isPalin[start, end])
            {
                current.Add(s.Substring(start, end - start + 1));
                Backtrack(s, end + 1, current, result, isPalin);
                current.RemoveAt(current.Count - 1);
            }
        }
    }
}
```

**Complexity:** O(n * 2^n) time (worst case: all partitions are valid, e.g., "aaa"). O(n^2) space for the palindrome table.

---

### Problem 3: Distinct Subsequences (LeetCode 115)

**Problem:** Given strings `s` and `t`, return the number of distinct subsequences of `s` that equal `t`.

**State:** `dp[i][j]` = number of ways to form `t[0..j-1]` from `s[0..i-1]`

**Recurrence:**
- If `s[i-1] == t[j-1]`: `dp[i][j] = dp[i-1][j-1] + dp[i-1][j]`
  - Use `s[i-1]` to match `t[j-1]` + skip `s[i-1]`
- Else: `dp[i][j] = dp[i-1][j]` (skip `s[i-1]`)

**Base cases:** `dp[i][0] = 1` (empty `t` matches any prefix once), `dp[0][j>0] = 0`

> Example: s = "rabbbit", t = "rabbit"
> "" | r | a | b | b | i | t
> "" | [ | 1 | 0 | 0 | 0 | 0 | 0 | 0 ]
> r | [ | 1 | 1 | 0 | 0 | 0 | 0 | 0 ]
> a | [ | 1 | 1 | 1 | 0 | 0 | 0 | 0 ]
> b | [ | 1 | 1 | 1 | 1 | 0 | 0 | 0 ]
> b | [ | 1 | 1 | 1 | 2 | 1 | 0 | 0 ]
> b | [ | 1 | 1 | 1 | 3 | 3 | 0 | 0 ]
> i | [ | 1 | 1 | 1 | 3 | 3 | 3 | 0 ]
> t | [ | 1 | 1 | 1 | 3 | 3 | 3 | 3 ] | answer = 3


```csharp
public class Solution
{
    public int NumDistinct(string s, string t)
    {
        int m = s.Length, n = t.Length;
        // Use long to avoid overflow for large inputs
        var dp = new long[m + 1, n + 1];

        // Base case: empty t can be formed from any prefix
        for (int i = 0; i <= m; i++)
            dp[i, 0] = 1;

        for (int i = 1; i <= m; i++)
        {
            for (int j = 1; j <= n; j++)
            {
                dp[i, j] = dp[i - 1, j]; // skip s[i-1]

                if (s[i - 1] == t[j - 1])
                    dp[i, j] += dp[i - 1, j - 1]; // use s[i-1]
            }
        }

        return (int)dp[m, n];
    }
}
```

**Complexity:** O(m * n) time, O(m * n) space. Can be optimized to O(n) with a single row (iterate `j` in reverse).

---

### Problem 4: Regular Expression Matching (LeetCode 10)

**Problem:** Implement regex matching with `.` (matches any single character) and `*` (matches zero or more of the preceding element).

**State:** `dp[i][j]` = true if `s[0..i-1]` matches `p[0..j-1]`

**Recurrence:**
- If `p[j-1]` is a letter or `.`:
  - `dp[i][j] = dp[i-1][j-1] && (s[i-1] == p[j-1] || p[j-1] == '.')`
- If `p[j-1]` is `*`:
  - Zero occurrences: `dp[i][j] = dp[i][j-2]` (skip `x*`)
  - One+ occurrences: `dp[i][j] = dp[i-1][j] && (s[i-1] == p[j-2] || p[j-2] == '.')`

**Base case:** `dp[0][0] = true`. `dp[0][j]` = true if `p[0..j-1]` is all `x*` pairs.

```csharp
public class Solution
{
    public bool IsMatch(string s, string p)
    {
        int m = s.Length, n = p.Length;
        var dp = new bool[m + 1, n + 1];
        dp[0, 0] = true;

        // Base case: patterns like a*, a*b*, a*b*c* match empty string
        for (int j = 2; j <= n; j++)
        {
            if (p[j - 1] == '*')
                dp[0, j] = dp[0, j - 2];
        }

        for (int i = 1; i <= m; i++)
        {
            for (int j = 1; j <= n; j++)
            {
                if (p[j - 1] == '*')
                {
                    // Zero occurrences of preceding element
                    dp[i, j] = dp[i, j - 2];

                    // One or more occurrences
                    if (p[j - 2] == s[i - 1] || p[j - 2] == '.')
                        dp[i, j] = dp[i, j] || dp[i - 1, j];
                }
                else if (p[j - 1] == '.' || p[j - 1] == s[i - 1])
                {
                    dp[i, j] = dp[i - 1, j - 1];
                }
                // else dp[i,j] remains false
            }
        }

        return dp[m, n];
    }
}
```

**Complexity:** O(m * n) time, O(m * n) space.

---

## DP Table Reference: LCS

This table pattern recurs across many string problems.

```
Strings: "ABCBDAB" and "BDCAB"

       ""  B  D  C  A  B
  ""  [ 0  0  0  0  0  0 ]
   A  [ 0  0  0  0  1  1 ]
   B  [ 0  1  1  1  1  2 ]
   C  [ 0  1  1  2  2  2 ]
   B  [ 0  1  1  2  2  3 ]
   D  [ 0  1  2  2  2  3 ]
   A  [ 0  1  2  2  3  3 ]
   B  [ 0  1  2  2  3  4 ]

LCS = "BCAB" (length 4)

Match: dp[i][j] = dp[i-1][j-1] + 1
No match: dp[i][j] = max(dp[i-1][j], dp[i][j-1])
```

## Common Mistakes

1. **Palindrome DP fill order** — You must fill by increasing substring length, not by row. `dp[i][j]` depends on `dp[i+1][j-1]`, which has a larger `i`.
2. **Regex `*` handling** — The `*` applies to the character before it, not after. `dp[i][j-2]` skips the pair `p[j-2]p[j-1]`, not just the `*`.
3. **Distinct Subsequences overflow** — Counts grow fast. Use `long` to avoid overflow.
4. **Off-by-one in expand around center** — After the while loop, `left` and `right` are one step past the palindrome boundary. The length is `right - left - 1`.

## Interview Tips

- For palindrome problems, expand-around-center is simpler to code and uses O(1) space. Mention the DP approach as an alternative.
- For regex matching, draw the DP table with a small example before coding. The `*` cases are easy to get wrong.
- Distinct Subsequences is a classic "use it or skip it" pattern, the same as knapsack.
- When asked "how many ways" on strings, think: is this a subsequence counting problem or a partition counting problem?

---

## Quiz

<details>
<summary>1. In the expand-around-center approach, why are there 2n-1 centers for a string of length n?</summary>

There are `n` centers on characters (for odd-length palindromes) and `n-1` centers between adjacent characters (for even-length palindromes). Total = `2n - 1`.
</details>

<details>
<summary>2. In Regular Expression Matching, what does dp[i][j-2] represent when p[j-1] is '*'?</summary>

It represents matching `s[0..i-1]` against `p[0..j-3]`, effectively using zero occurrences of the element before `*`. We skip the entire `x*` pattern pair.
</details>

<details>
<summary>3. Why does Distinct Subsequences only add dp[i-1][j-1] when characters match, rather than replacing dp[i-1][j]?</summary>

Because we can BOTH use `s[i-1]` to match `t[j-1]` (contributing `dp[i-1][j-1]` ways) AND skip `s[i-1]` (contributing `dp[i-1][j]` ways). These are independent choices, so we ADD them: `dp[i][j] = dp[i-1][j] + dp[i-1][j-1]`.
</details>

<details>
<summary>4. What is the space-optimized approach for the palindrome DP table?</summary>

For Longest Palindromic Substring, the expand-around-center approach inherently uses O(1) space. For the DP table approach, space cannot easily be reduced below O(n^2) because `dp[i][j]` depends on `dp[i+1][j-1]` (diagonal), requiring access to multiple rows simultaneously.
</details>

<details>
<summary>5. For Palindrome Partitioning, why precompute the palindrome table instead of checking on the fly?</summary>

Without precomputation, checking if `s[i..j]` is a palindrome takes O(n) time per check. With the `O(n^2)` precomputed table, each check is O(1). Since the backtracking explores many substrings, this avoids redundant O(n) palindrome checks and significantly improves practical performance.
</details>
