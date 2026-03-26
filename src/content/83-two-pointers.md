# Two Pointers Pattern

## Overview

The **two pointers** pattern uses two indices to traverse an array simultaneously. It typically reduces O(n^2) brute force to O(n) by exploiting sorted order or structural properties.

### Two Main Variants

**Two Pointer Movement**

For a sorted array, place `left` at index 0 and `right` at the last index. Compare the sum at both pointers to the target:

- **Sum too small** → move `left` rightward (increase sum)
- **Sum too large** → move `right` leftward (decrease sum)
- **Sum matches** → found the pair

The pointers converge toward each other, scanning O(n) total.

### When to Use Each

| Variant | Use when... | Examples |
|---|---|---|
| **Left/Right** | Array is sorted or you need to compare ends | Two Sum II, Container With Most Water, 3Sum |
| **Fast/Slow** | Removing duplicates, partitioning, cycle detection | Valid Palindrome, Remove Duplicates, Linked List Cycle |

---

## The Left/Right Template

```csharp
int left = 0, right = arr.Length - 1;

while (left < right)
{
    // Compute something with arr[left] and arr[right]

    if (/* condition to move left */)
        left++;
    else if (/* condition to move right */)
        right--;
    else
        // Found answer, or move both
        break;
}
```

## The Fast/Slow Template

```csharp
int slow = 0;

for (int fast = 0; fast < arr.Length; fast++)
{
    if (/* condition to keep arr[fast] */)
    {
        arr[slow] = arr[fast];
        slow++;
    }
}
// slow = count of kept elements
```

---

## Practice Problems

### Problem 1: Valid Palindrome (LeetCode 125)

**Problem:** Given a string, determine if it is a palindrome considering only alphanumeric characters and ignoring case.

**Approach:** Use left/right pointers. Skip non-alphanumeric characters. Compare characters case-insensitively.

> Input: "A man, a plan, a canal: Panama"
> Cleaned: "amanaplanacanalpanama"
> left | right
> a | m | a | n | a | p | l | a | n | a | c | a | n | a | l | p | a | n | a | m | a
> a == a ✓ → move both inward
> m == m ✓ → move both inward
> ... all match → palindrome!


```csharp
public class Solution
{
    public bool IsPalindrome(string s)
    {
        int left = 0, right = s.Length - 1;

        while (left < right)
        {
            // Skip non-alphanumeric from left
            while (left < right && !char.IsLetterOrDigit(s[left]))
                left++;
            // Skip non-alphanumeric from right
            while (left < right && !char.IsLetterOrDigit(s[right]))
                right--;

            if (char.ToLower(s[left]) != char.ToLower(s[right]))
                return false;

            left++;
            right--;
        }

        return true;
    }
}
```

**Complexity:**
- **Time:** O(n) — each character visited at most once
- **Space:** O(1) — no extra data structures

---

### Problem 2: Two Sum II — Input Array Is Sorted (LeetCode 167)

**Problem:** Given a **1-indexed sorted** array and a target, find two numbers that add up to target.

**Approach:** Left pointer at start, right pointer at end. If sum is too small, move left forward. If sum is too large, move right backward.

```
  numbers = [2, 7, 11, 15], target = 9

  left=0, right=3: 2 + 15 = 17 > 9  → right--
  left=0, right=2: 2 + 11 = 13 > 9  → right--
  left=0, right=1: 2 +  7 =  9 == 9 → return [1, 2]  (1-indexed)
```

```csharp
public class Solution
{
    public int[] TwoSum(int[] numbers, int target)
    {
        int left = 0, right = numbers.Length - 1;

        while (left < right)
        {
            int sum = numbers[left] + numbers[right];

            if (sum == target)
                return new int[] { left + 1, right + 1 }; // 1-indexed
            else if (sum < target)
                left++;
            else
                right--;
        }

        throw new ArgumentException("No solution");
    }
}
```

**Complexity:**
- **Time:** O(n) — each pointer moves at most n times total
- **Space:** O(1)

> **Note:** This only works because the array is sorted. On an unsorted array, use the hash map approach from lesson 81.

---

### Problem 3: Container With Most Water (LeetCode 11)

**Problem:** Given `n` vertical lines at positions `0..n-1` with heights `height[i]`, find two lines that together with the x-axis form a container holding the most water.

**Approach:** Start with the widest container (left=0, right=n-1). The area is `min(height[left], height[right]) * (right - left)`. Move the pointer pointing to the shorter line inward — moving the taller one can never increase the area.

```
  height = [1, 8, 6, 2, 5, 4, 8, 3, 7]

  Step 1: left=0(h=1), right=8(h=7) → area = 1*8 = 8  → move left (shorter)
  Step 2: left=1(h=8), right=8(h=7) → area = 7*7 = 49  → move right
  Step 3: left=1(h=8), right=7(h=3) → area = 3*6 = 18  → move right
  Step 4: left=1(h=8), right=6(h=8) → area = 8*5 = 40  → move either
  ...
  Max area = 49
```

```csharp
public class Solution
{
    public int MaxArea(int[] height)
    {
        int left = 0, right = height.Length - 1;
        int maxArea = 0;

        while (left < right)
        {
            int h = Math.Min(height[left], height[right]);
            int w = right - left;
            maxArea = Math.Max(maxArea, h * w);

            if (height[left] < height[right])
                left++;
            else
                right--;
        }

        return maxArea;
    }
}
```

**Complexity:**
- **Time:** O(n) — single pass
- **Space:** O(1)

---

### Problem 4: 3Sum (LeetCode 15)

**Problem:** Find all unique triplets `[a, b, c]` in the array such that `a + b + c = 0`.

**Approach:** Sort the array. For each element `nums[i]`, use two pointers on the remaining subarray to find pairs that sum to `-nums[i]`. Skip duplicates at every level.

```csharp
public class Solution
{
    public IList<IList<int>> ThreeSum(int[] nums)
    {
        Array.Sort(nums);
        var result = new List<IList<int>>();

        for (int i = 0; i < nums.Length - 2; i++)
        {
            // Skip duplicate values for i
            if (i > 0 && nums[i] == nums[i - 1])
                continue;

            // Early termination: if smallest value > 0, no solution
            if (nums[i] > 0) break;

            int left = i + 1, right = nums.Length - 1;
            int target = -nums[i];

            while (left < right)
            {
                int sum = nums[left] + nums[right];

                if (sum == target)
                {
                    result.Add(new List<int> { nums[i], nums[left], nums[right] });

                    // Skip duplicates for left and right
                    while (left < right && nums[left] == nums[left + 1]) left++;
                    while (left < right && nums[right] == nums[right - 1]) right--;

                    left++;
                    right--;
                }
                else if (sum < target)
                    left++;
                else
                    right--;
            }
        }

        return result;
    }
}
```

**Complexity:**
- **Time:** O(n^2) — outer loop O(n) * inner two-pointer O(n)
- **Space:** O(1) extra (excluding output and sort space)

> **Tip:** The duplicate-skipping logic is the hardest part. Walk through `[-1, -1, 0, 1, 1]` by hand to understand why each skip is needed.

---

### Problem 5: Trapping Rain Water (LeetCode 42)

**Problem:** Given `n` bars of elevation, compute how much water can be trapped after rain.

**Approach:** Use two pointers with running maximums. At each position, the water level is determined by the minimum of the maximum height to the left and maximum height to the right. Process the side with the smaller max first.

```
  height = [0,1,0,2,1,0,1,3,2,1,2,1]

  Elevation:          █
            █ . . █ . . █ █ █ . █
            █ █ . █ █ . █ █ █ █ █ █
  Index:    0 1 2 3 4 5 6 7 8 9 10 11

  Water:        1   1 2 1         1     = 6 units
```

```csharp
public class Solution
{
    public int Trap(int[] height)
    {
        int left = 0, right = height.Length - 1;
        int leftMax = 0, rightMax = 0;
        int water = 0;

        while (left < right)
        {
            if (height[left] < height[right])
            {
                if (height[left] >= leftMax)
                    leftMax = height[left];
                else
                    water += leftMax - height[left];
                left++;
            }
            else
            {
                if (height[right] >= rightMax)
                    rightMax = height[right];
                else
                    water += rightMax - height[right];
                right--;
            }
        }

        return water;
    }
}
```

**Complexity:**
- **Time:** O(n) — single pass
- **Space:** O(1) — just four variables

---

## Common Mistakes

1. **Using two pointers on unsorted arrays** — The left/right converging pattern requires sorted order (or a specific structural property like Container With Most Water). Check if sorting is needed first.
2. **Infinite loops** — Forgetting to advance a pointer in some branch causes an infinite loop. Every iteration must move at least one pointer.
3. **Not handling duplicates in 3Sum** — Forgetting to skip duplicates produces repeated triplets. You must skip at the outer loop AND the inner loop.
4. **Off-by-one in while condition** — Use `left < right` (strict) for pair-finding. Use `left <= right` only when you need to process the element where they meet.

---

## Interview Tips

- If the array is **sorted** and you need to find pairs, two pointers is almost always the answer.
- 3Sum is a **classic** — know it cold. The pattern extends to 4Sum, kSum.
- For Trapping Rain Water, know both the **two-pointer** and **stack-based** approaches. Interviewers often ask for multiple solutions.
- When explaining, draw the pointer positions. Interviewers appreciate visual communication.
- Two pointers often pairs with **sorting** — the O(n log n) sort is a small price for O(n) pair-finding.

---

## Quiz

<details>
<summary><strong>Q1:</strong> Why does the two-pointer approach work for Two Sum on a sorted array?</summary>

If the sum is too small, moving the left pointer right increases the sum. If the sum is too large, moving the right pointer left decreases it. The sorted order guarantees this monotonic behavior, ensuring we converge on the answer without checking all pairs.
</details>

<details>
<summary><strong>Q2:</strong> In Container With Most Water, why do we move the pointer at the shorter line?</summary>

The area is limited by the shorter line (`min(h[left], h[right]) * width`). Moving the taller line inward reduces width while the height stays capped by the shorter line — area can only decrease. Moving the shorter line gives a chance to find a taller line, potentially increasing the area.
</details>

<details>
<summary><strong>Q3:</strong> What is the time complexity of 3Sum using sorting + two pointers?</summary>

**O(n^2).** Sorting is O(n log n). The outer loop runs O(n) times, and each inner two-pointer sweep is O(n). Total: O(n log n + n^2) = O(n^2).
</details>

<details>
<summary><strong>Q4:</strong> In Trapping Rain Water, why do we process the side with the smaller maximum height first?</summary>

If `leftMax < rightMax`, the water at the left pointer is determined by `leftMax` — because we know there's a taller bar somewhere to the right. The exact value of rightMax doesn't matter as long as it's at least as large as leftMax. This guarantees the water calculation is correct.
</details>

<details>
<summary><strong>Q5:</strong> Can two pointers be used on unsorted arrays?</summary>

Yes, in specific cases. Container With Most Water and Trapping Rain Water use two pointers on unsorted arrays because their logic doesn't depend on sorted order — it depends on comparing heights. However, problems like Two Sum II require sorted order. Always analyze **why** the pointer movement is correct.
</details>
