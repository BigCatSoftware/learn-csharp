# Sliding Window Pattern

## Overview

The **sliding window** technique maintains a contiguous subarray (or substring) that "slides" across the input. It converts brute-force O(n^2) or O(n*k) approaches into O(n) by reusing computation from the previous window position.

**Sliding Window**

The window is defined by two pointers `left` and `right`:

1. **Expand** — move `right` forward to include more elements
2. **Check** — evaluate the window (sum, count, character frequency)
3. **Shrink** — move `left` forward when the window condition is violated

The key insight: both pointers only move forward, so total work is O(n) not O(n²).

---

## Fixed vs Variable Size Windows

| Type | Window size | Typical goal | How it moves |
|---|---|---|---|
| **Fixed** | Constant `k` | Max/min sum of k elements | Right expands by 1, left shrinks by 1 |
| **Variable** | Changes dynamically | Longest/shortest subarray with property X | Right always expands; left contracts when condition violated |

---

## Fixed Window Template

```csharp
// Find maximum sum of any subarray of size k
int MaxSumFixedWindow(int[] nums, int k)
{
    int windowSum = 0;

    // Build initial window
    for (int i = 0; i < k; i++)
        windowSum += nums[i];

    int maxSum = windowSum;

    // Slide: add right element, remove left element
    for (int i = k; i < nums.Length; i++)
    {
        windowSum += nums[i];       // expand right
        windowSum -= nums[i - k];   // shrink left
        maxSum = Math.Max(maxSum, windowSum);
    }

    return maxSum;
}
```

---

## Variable Window Template

```csharp
// General template for "find longest/shortest subarray with property X"
int left = 0;

for (int right = 0; right < n; right++)
{
    // EXPAND: add nums[right] to window state

    while (/* window is invalid */)
    {
        // CONTRACT: remove nums[left] from window state
        left++;
    }

    // UPDATE: window [left..right] is valid
    // maxLength = Math.Max(maxLength, right - left + 1);
}
```

> Variable window — finding longest valid substring:
> "a b c a b c b b"
> L R | window = "a" | → valid, expand
> L | R | window = "ab" | → valid, expand
> L | R | window = "abc" → valid, expand
> L | R | window = "abca" → 'a' repeated! contract left
> L | R | window = "bca" | → valid, expand
> ...and so on


> **Note:** The key insight is that the left pointer **never moves backward**. Both pointers move forward, giving O(n) total even though there's a nested `while` loop.

---

## Practice Problems

### Problem 1: Best Time to Buy and Sell Stock (LeetCode 121)

**Problem:** Given stock prices where `prices[i]` is the price on day `i`, find the maximum profit from one buy-sell transaction.

**Approach:** Track the minimum price seen so far (the left pointer conceptually) and compute the profit at each day. This is a simplified sliding window / one-pass greedy.

> prices = [7, 1, 5, 3, 6, 4]
> Day 0: price=7, minPrice=7, profit=0
> Day 1: price=1, minPrice=1, profit=0
> Day 2: price=5, minPrice=1, profit=4 | buy at 1, sell at 5
> Day 3: price=3, minPrice=1, profit=4
> Day 4: price=6, minPrice=1, profit=5 | buy at 1, sell at 6 ★ best
> Day 5: price=4, minPrice=1, profit=5


```csharp
public class Solution
{
    public int MaxProfit(int[] prices)
    {
        int minPrice = int.MaxValue;
        int maxProfit = 0;

        foreach (int price in prices)
        {
            if (price < minPrice)
                minPrice = price;
            else
                maxProfit = Math.Max(maxProfit, price - minPrice);
        }

        return maxProfit;
    }
}
```

**Complexity:**
- **Time:** O(n) — single pass
- **Space:** O(1)

---

### Problem 2: Longest Substring Without Repeating Characters (LeetCode 3)

**Problem:** Given a string, find the length of the longest substring without repeating characters.

**Approach:** Variable-size sliding window. Use a `HashSet` to track characters in the current window. Expand right; if a duplicate is found, contract from the left until the duplicate is removed.

```
  s = "abcabcbb"

  Window states:
  [a] b c a b c b b       len=1
  [a b] c a b c b b       len=2
  [a b c] a b c b b       len=3
   a [b c a] b c b b      len=3  (removed 'a' from left, added 'a' on right)
   a b [c a b] c b b      len=3
   a b c [a b c] b b      len=3
   a b c a b [c b] b      len=2
   a b c a b c [b] b      len=1

  Answer: 3
```

```csharp
public class Solution
{
    public int LengthOfLongestSubstring(string s)
    {
        var window = new HashSet<char>();
        int left = 0;
        int maxLen = 0;

        for (int right = 0; right < s.Length; right++)
        {
            // Contract until no duplicate
            while (window.Contains(s[right]))
            {
                window.Remove(s[left]);
                left++;
            }

            window.Add(s[right]);
            maxLen = Math.Max(maxLen, right - left + 1);
        }

        return maxLen;
    }
}
```

**Complexity:**
- **Time:** O(n) — each character is added and removed from the set at most once
- **Space:** O(min(n, m)) — where m is the character set size (26 for lowercase, 128 for ASCII)

> **Tip:** For a faster approach, use a `Dictionary<char, int>` mapping each character to its latest index. When a duplicate is found, jump `left` directly to `map[ch] + 1` instead of incrementing one at a time.

---

### Problem 3: Minimum Window Substring (LeetCode 76)

**Problem:** Given strings `s` and `t`, find the minimum window in `s` that contains all characters of `t`.

**Approach:** Variable window. Expand right until all characters of `t` are covered. Then contract left to minimize the window while still covering all of `t`. Track character frequencies with dictionaries.

```
  s = "ADOBECODEBANC", t = "ABC"

  Expand until valid:
  [ADOBEC] ODEBANC     → contains A,B,C → window=6, try to shrink
   A [DOBEC] ODEBANC   → missing A → expand
   A [DOBECODEBA] NC   → contains A,B,C → window=10, try to shrink
   ...
   ADOBECODE [BANC]    → contains A,B,C → window=4 ★ best

  Answer: "BANC"
```

```csharp
public class Solution
{
    public string MinWindow(string s, string t)
    {
        if (s.Length < t.Length) return "";

        // Count characters needed from t
        var need = new Dictionary<char, int>();
        foreach (char c in t)
            need[c] = need.GetValueOrDefault(c, 0) + 1;

        var window = new Dictionary<char, int>();
        int have = 0, total = need.Count; // count of chars fully satisfied
        int left = 0;
        int minLen = int.MaxValue;
        int minStart = 0;

        for (int right = 0; right < s.Length; right++)
        {
            char c = s[right];
            window[c] = window.GetValueOrDefault(c, 0) + 1;

            // Check if this char is now fully satisfied
            if (need.ContainsKey(c) && window[c] == need[c])
                have++;

            // Contract while window is valid
            while (have == total)
            {
                // Update result
                int windowLen = right - left + 1;
                if (windowLen < minLen)
                {
                    minLen = windowLen;
                    minStart = left;
                }

                // Remove left char
                char leftChar = s[left];
                window[leftChar]--;
                if (need.ContainsKey(leftChar) && window[leftChar] < need[leftChar])
                    have--;

                left++;
            }
        }

        return minLen == int.MaxValue ? "" : s.Substring(minStart, minLen);
    }
}
```

**Complexity:**
- **Time:** O(|s| + |t|) — each character in `s` is visited at most twice (once by right, once by left)
- **Space:** O(|s| + |t|) — two frequency dictionaries

> **Warning:** This is a hard problem. The `have` / `total` trick avoids comparing entire frequency maps on every step, which would make it O(n * 52) or worse.

---

### Problem 4: Permutation in String (LeetCode 567)

**Problem:** Given two strings `s1` and `s2`, return `true` if `s2` contains a permutation of `s1`.

**Approach:** Fixed-size sliding window of length `s1.Length` over `s2`. Maintain a frequency count. If the frequency of the window matches the frequency of `s1`, return true.

```csharp
public class Solution
{
    public bool CheckInclusion(string s1, string s2)
    {
        if (s1.Length > s2.Length) return false;

        int[] s1Count = new int[26];
        int[] windowCount = new int[26];

        // Build frequency of s1 and initial window
        for (int i = 0; i < s1.Length; i++)
        {
            s1Count[s1[i] - 'a']++;
            windowCount[s2[i] - 'a']++;
        }

        // Count how many of 26 chars have matching frequencies
        int matches = 0;
        for (int i = 0; i < 26; i++)
        {
            if (s1Count[i] == windowCount[i])
                matches++;
        }

        // Slide the window
        for (int i = s1.Length; i < s2.Length; i++)
        {
            if (matches == 26) return true;

            // Add new right character
            int right = s2[i] - 'a';
            windowCount[right]++;
            if (windowCount[right] == s1Count[right])
                matches++;
            else if (windowCount[right] == s1Count[right] + 1)
                matches--;

            // Remove old left character
            int left = s2[i - s1.Length] - 'a';
            windowCount[left]--;
            if (windowCount[left] == s1Count[left])
                matches++;
            else if (windowCount[left] == s1Count[left] - 1)
                matches--;
        }

        return matches == 26;
    }
}
```

**Complexity:**
- **Time:** O(n) — where n = length of `s2`; each slide is O(1) because we track `matches` incrementally
- **Space:** O(1) — two fixed-size arrays of 26 integers

> **Tip:** The `matches` counter is the key optimization. Instead of comparing 26 frequencies every step (O(26) per step), we maintain matches incrementally in O(1) per step.

---

## Common Mistakes

1. **Forgetting to update window state when contracting** — When moving `left` forward, you must remove `nums[left]` from your window sum/set/map BEFORE incrementing `left`.
2. **Off-by-one in fixed windows** — The window `[i-k+1 .. i]` has size `k`. Double-check your indexing when removing the leftmost element.
3. **Using sliding window with negative numbers for sum problems** — Sliding window assumes expanding the window increases the sum. With negatives, use prefix sums instead (see lesson 82).
4. **Not handling empty results** — For Minimum Window Substring, the answer might be the empty string. Always check edge cases.
5. **O(26) comparisons per step** — Comparing entire frequency arrays each step works but is slower than tracking a `matches` counter. Interviewers prefer the O(1) incremental approach.

---

## Interview Tips

- Sliding window is the go-to for **"longest/shortest subarray/substring with property X"** problems.
- Always clarify: can values be negative? If yes, sliding window for sum-based problems won't work.
- Know both **fixed** and **variable** templates cold. The variable template is more common in interviews.
- For string problems, a frequency array `int[26]` is faster and cleaner than `Dictionary<char, int>`.
- Minimum Window Substring is considered a **hard** problem. If you can solve it cleanly in an interview, you're in excellent shape.
- The total work of the `while` loop inside the `for` loop is still O(n), not O(n^2) — explain this to interviewers by noting each element enters and leaves the window at most once.

---

## Summary: Choosing the Right Pattern

> Is the array sorted?
> Yes → Two Pointers (lesson 83)
> Need subarray sum with negatives? → Prefix Sum (lesson 82)
> Need existence check or counting? → Hash Map (lesson 81)
> Need longest/shortest contiguous subarray?
> Sliding Window (this lesson)


---

## Quiz

<details>
<summary><strong>Q1:</strong> What makes the sliding window O(n) even though there's a nested while loop?</summary>

Each element is processed at most **twice** — once when `right` adds it to the window, and once when `left` removes it. The `left` pointer only moves forward, never backward. So the total work across all iterations of the inner loop is O(n), not O(n) per outer iteration.
</details>

<details>
<summary><strong>Q2:</strong> When should you use a fixed-size window vs a variable-size window?</summary>

Use a **fixed-size** window when the problem specifies a window size (e.g., "max sum of k consecutive elements" or "find permutation of length-k string"). Use a **variable-size** window when you need to find the longest or shortest subarray satisfying a condition.
</details>

<details>
<summary><strong>Q3:</strong> Why doesn't sliding window work for "Subarray Sum Equals K" when negatives are present?</summary>

The sliding window assumes that expanding the window increases the sum and contracting decreases it. With negative numbers, adding an element might decrease the sum, breaking the logic for when to expand vs. contract. Use prefix sums + hash map instead.
</details>

<details>
<summary><strong>Q4:</strong> In Permutation in String, why track a <code>matches</code> counter instead of comparing frequency arrays?</summary>

Comparing two 26-element arrays takes O(26) per step, making the total O(26n). Tracking `matches` incrementally costs O(1) per step (updating at most 2 characters), making the total O(n). While both are technically O(n) with a constant factor, the incremental approach is cleaner and faster — and interviewers prefer it.
</details>

<details>
<summary><strong>Q5:</strong> What is the space complexity of the Minimum Window Substring solution?</summary>

**O(|s| + |t|)** in the worst case for the two dictionaries. In practice, the dictionaries hold at most 52 entries (uppercase + lowercase letters), so it's effectively O(1) for the character set. The dominant space usage depends on the character set size.
</details>
