# Binary Search — Complete Guide

## How Binary Search Works

Binary search finds a target in a **sorted** collection by repeatedly halving the search space. At each step, compare the middle element to the target and eliminate one half.

**Binary Search Steps**

Searching for `target = 7` in `[1, 3, 5, 7, 9, 11, 13]`:

| Step | lo | hi | mid | arr[mid] | Action |
|---|---|---|---|---|---|
| 1 | 0 | 6 | 3 | 7 | Found! Return 3 |

Searching for `target = 4`:

| Step | lo | hi | mid | arr[mid] | Action |
|---|---|---|---|---|---|
| 1 | 0 | 6 | 3 | 7 | 4 < 7 → hi = 2 |
| 2 | 0 | 2 | 1 | 3 | 4 > 3 → lo = 2 |
| 3 | 2 | 2 | 2 | 5 | 4 < 5 → hi = 1 |
| 4 | 2 | 1 | — | — | lo > hi → not found |

Each step eliminates half the remaining elements → O(log n).

---

## Complexity

| Aspect      | Complexity |
|-------------|-----------|
| Time        | **O(log n)** — halving reduces search space exponentially |
| Space       | **O(1)** iterative, **O(log n)** recursive (call stack) |

**Binary Search Steps**

Searching for `target = 7` in `[1, 3, 5, 7, 9, 11, 13]`:

| Step | lo | hi | mid | arr[mid] | Action |
|---|---|---|---|---|---|
| 1 | 0 | 6 | 3 | 7 | Found! Return 3 |

Searching for `target = 4`:

| Step | lo | hi | mid | arr[mid] | Action |
|---|---|---|---|---|---|
| 1 | 0 | 6 | 3 | 7 | 4 < 7 → hi = 2 |
| 2 | 0 | 2 | 1 | 3 | 4 > 3 → lo = 2 |
| 3 | 2 | 2 | 2 | 5 | 4 < 5 → hi = 1 |
| 4 | 2 | 1 | — | — | lo > hi → not found |

Each step eliminates half the remaining elements → O(log n).

---

## Iterative Implementation

```csharp
public int BinarySearch(int[] nums, int target)
{
    int lo = 0, hi = nums.Length - 1;

    while (lo <= hi)                          // <= because lo == hi is valid
    {
        int mid = lo + (hi - lo) / 2;        // avoids integer overflow

        if (nums[mid] == target)
            return mid;
        else if (nums[mid] < target)
            lo = mid + 1;                     // target is in right half
        else
            hi = mid - 1;                     // target is in left half
    }

    return -1;  // not found
}
```

> **Callout:** Always use `lo + (hi - lo) / 2` instead of `(lo + hi) / 2` to prevent integer overflow when `lo + hi` exceeds `int.MaxValue`.

---

## Recursive Implementation

```csharp
public int BinarySearchRecursive(int[] nums, int target, int lo, int hi)
{
    if (lo > hi)
        return -1;

    int mid = lo + (hi - lo) / 2;

    if (nums[mid] == target)
        return mid;
    else if (nums[mid] < target)
        return BinarySearchRecursive(nums, target, mid + 1, hi);
    else
        return BinarySearchRecursive(nums, target, lo, mid - 1);
}

// Call: BinarySearchRecursive(nums, target, 0, nums.Length - 1);
```

> **Callout:** Prefer the iterative version in interviews and production code — it avoids stack overflow on large inputs and is easier to reason about.

---

## The Off-by-One Trap: `lo < hi` vs `lo <= hi`

This is the #1 source of bugs in binary search. The choice depends on **what the search space represents**.

### Pattern A: `lo <= hi` (closed interval `[lo, hi]`)

```csharp
// Looking for exact match. hi = nums.Length - 1.
// Loop exits when lo > hi (empty interval).
int lo = 0, hi = nums.Length - 1;
while (lo <= hi)
{
    int mid = lo + (hi - lo) / 2;
    if (nums[mid] == target) return mid;
    else if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
}
```

### Pattern B: `lo < hi` (search space shrinks to one element)

```csharp
// Finding a boundary (first/last occurrence, insert position).
// hi = nums.Length (or some upper bound). Loop exits when lo == hi.
int lo = 0, hi = nums.Length;
while (lo < hi)
{
    int mid = lo + (hi - lo) / 2;
    if (condition(mid))
        hi = mid;        // mid might be the answer
    else
        lo = mid + 1;    // mid is definitely not the answer
}
return lo;  // lo == hi == answer
```

> **Rule of thumb:** Use `lo <= hi` for exact-match searches. Use `lo < hi` for boundary/condition searches (first true, last false).

---

## Finding First and Last Occurrence

```csharp
// Find the FIRST index where nums[i] >= target (lower bound)
public int LowerBound(int[] nums, int target)
{
    int lo = 0, hi = nums.Length;
    while (lo < hi)
    {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] < target)
            lo = mid + 1;
        else
            hi = mid;       // nums[mid] >= target, could be first
    }
    return lo;
}

// Find the FIRST index where nums[i] > target (upper bound)
public int UpperBound(int[] nums, int target)
{
    int lo = 0, hi = nums.Length;
    while (lo < hi)
    {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] <= target)
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo;
}
```

```
nums = [1, 3, 3, 3, 5, 7]    target = 3

LowerBound(3) = 1   (first index of 3)
UpperBound(3) = 4   (first index after last 3)
Count of 3s = UpperBound - LowerBound = 4 - 1 = 3
```

---

## Array.BinarySearch Quirks

C# provides `Array.BinarySearch` and `List<T>.BinarySearch`, but they have tricky behaviour:

```csharp
int[] arr = { 1, 3, 5, 7, 9 };

int idx = Array.BinarySearch(arr, 5);
// idx = 2 (found at index 2)

int notFound = Array.BinarySearch(arr, 4);
// notFound = -3 (negative!)
// The bitwise complement ~(-3) = 2 gives the insertion point
int insertAt = ~notFound;  // 2 — where 4 would be inserted to keep order
```

| Return Value | Meaning |
|-------------|---------|
| `>= 0`     | Index of the found element |
| `< 0`      | `~returnValue` gives insertion point |

> **Callout:** When duplicates exist, `Array.BinarySearch` does **not** guarantee which duplicate is returned. If you need first or last occurrence, write your own binary search.

```csharp
// Using bitwise complement for insertion point
int pos = Array.BinarySearch(arr, target);
int insertionPoint = pos >= 0 ? pos : ~pos;
```

---

## Binary Search on the Answer

Sometimes you binary search not on an array but on a **range of possible answers**. The key insight: if `f(x) = true` implies `f(x+1) = true`, binary search finds the boundary.

```
Answer space: [lo ............................ hi]
               false false false TRUE TRUE TRUE
                                 ^
                          find this boundary
```

---

## Practice Problems

### Problem 1 — Binary Search (LeetCode 704)

**Statement:** Given a sorted array `nums` and a `target`, return its index or -1.

**Approach:** Standard binary search, closed interval.

```csharp
public int Search(int[] nums, int target)
{
    int lo = 0, hi = nums.Length - 1;

    while (lo <= hi)
    {
        int mid = lo + (hi - lo) / 2;

        if (nums[mid] == target)
            return mid;
        else if (nums[mid] < target)
            lo = mid + 1;
        else
            hi = mid - 1;
    }

    return -1;
}
```

**Complexity:** Time O(log n), Space O(1).
**Edge cases:** Single element, target not in array, target at boundaries.

---

### Problem 2 — Find Minimum in Rotated Sorted Array (LeetCode 153)

**Statement:** A sorted array was rotated at some pivot. Find the minimum element. No duplicates.

**Approach:** The minimum is the only element where `nums[mid] > nums[mid+1]` or where `nums[mid] < nums[mid-1]`. Compare `mid` to `hi` to decide which half contains the minimum.

```csharp
public int FindMin(int[] nums)
{
    int lo = 0, hi = nums.Length - 1;

    while (lo < hi)
    {
        int mid = lo + (hi - lo) / 2;

        if (nums[mid] > nums[hi])
            lo = mid + 1;   // min is in the right half
        else
            hi = mid;       // mid could be the min
    }

    return nums[lo];
}
```

```
Example: [4, 5, 6, 7, 0, 1, 2]

Step 1: lo=0, hi=6, mid=3 → nums[3]=7 > nums[6]=2 → lo=4
Step 2: lo=4, hi=6, mid=5 → nums[5]=1 < nums[6]=2 → hi=5
Step 3: lo=4, hi=5, mid=4 → nums[4]=0 < nums[5]=1 → hi=4
lo == hi == 4 → nums[4] = 0 ✓
```

**Complexity:** Time O(log n), Space O(1).
**Edge cases:** Not rotated (already sorted), rotated by 1, two elements.

---

### Problem 3 — Search in Rotated Sorted Array (LeetCode 33)

**Statement:** Search for a target in a rotated sorted array. Return its index or -1. No duplicates.

**Approach:** At each step, one half is always sorted. Determine which half is sorted, then check if the target lies in that sorted half.

```csharp
public int Search(int[] nums, int target)
{
    int lo = 0, hi = nums.Length - 1;

    while (lo <= hi)
    {
        int mid = lo + (hi - lo) / 2;

        if (nums[mid] == target)
            return mid;

        // Left half [lo..mid] is sorted
        if (nums[lo] <= nums[mid])
        {
            if (target >= nums[lo] && target < nums[mid])
                hi = mid - 1;     // target is in sorted left half
            else
                lo = mid + 1;     // target is in right half
        }
        // Right half [mid..hi] is sorted
        else
        {
            if (target > nums[mid] && target <= nums[hi])
                lo = mid + 1;     // target is in sorted right half
            else
                hi = mid - 1;     // target is in left half
        }
    }

    return -1;
}
```

```
Example: [4, 5, 6, 7, 0, 1, 2], target = 0

Step 1: lo=0, hi=6, mid=3 → nums[3]=7 ≠ 0
        Left [4,5,6,7] sorted. 0 not in [4,7] → lo=4

Step 2: lo=4, hi=6, mid=5 → nums[5]=1 ≠ 0
        Left [0,1] — nums[4]=0 ≤ nums[5]=1 sorted. 0 in [0,1) → hi=4

Step 3: lo=4, hi=4, mid=4 → nums[4]=0 ✓ Found!
```

**Complexity:** Time O(log n), Space O(1).
**Edge cases:** Target at pivot, single element, target not in array.

---

### Problem 4 — Koko Eating Bananas (LeetCode 875)

**Statement:** Koko has `piles` of bananas and `h` hours. She eats at speed `k` bananas/hour (one pile at a time, if a pile has fewer than `k`, she finishes and waits). Find the minimum `k` so she finishes in `h` hours.

**Approach:** **Binary search on the answer.** The answer `k` is in `[1, max(piles)]`. For a given `k`, compute total hours; if it fits in `h`, try smaller `k`.

```csharp
public int MinEatingSpeed(int[] piles, int h)
{
    int lo = 1;
    int hi = piles.Max();

    while (lo < hi)
    {
        int mid = lo + (hi - lo) / 2;

        if (CanFinish(piles, mid, h))
            hi = mid;        // mid might be the answer, try smaller
        else
            lo = mid + 1;    // mid is too slow
    }

    return lo;
}

private bool CanFinish(int[] piles, int speed, int h)
{
    long hours = 0;
    foreach (int pile in piles)
    {
        // Ceiling division: (pile + speed - 1) / speed
        hours += (pile + speed - 1) / speed;
    }
    return hours <= h;
}
```

```
Example: piles = [3, 6, 7, 11], h = 8

Binary search on k in [1, 11]:
  k=6:  ceil(3/6)+ceil(6/6)+ceil(7/6)+ceil(11/6) = 1+1+2+2 = 6 ≤ 8 → hi=6
  k=3:  1+2+3+4 = 10 > 8 → lo=4
  k=5:  1+2+2+3 = 8 ≤ 8 → hi=5
  k=4:  1+2+2+3 = 8 ≤ 8 → hi=4
  lo == hi == 4 → answer is 4
```

**Complexity:** Time O(n * log(max)), Space O(1).
**Edge cases:** Single pile, `h == piles.Length` (must eat each pile in one hour), very large piles.

---

## Step-by-Step Binary Search Diagram

```
Index:    0    1    2    3    4    5    6    7    8    9
Value:  [ 1,   3,   5,   8,  12,  15,  19,  23,  27,  31 ]
Target: 19

Round 1:  lo=0                    hi=9
          [  1,  3,  5,  8, 12, 15, 19, 23, 27, 31 ]
                          ↑ mid=4, val=12 < 19 → lo=5

Round 2:               lo=5           hi=9
          [                  15, 19, 23, 27, 31 ]
                                 ↑ mid=7, val=23 > 19 → hi=6

Round 3:               lo=5  hi=6
          [                  15, 19 ]
                             ↑ mid=5, val=15 < 19 → lo=6

Round 4:                  lo=6=hi
          [                      19 ]
                                 ↑ mid=6, val=19 == 19 ✓ Found!
```

---

## Common Mistakes

1. **Integer overflow in `mid`** — use `lo + (hi - lo) / 2`, not `(lo + hi) / 2`.
2. **Wrong loop condition** — `lo <= hi` for closed interval exact match, `lo < hi` for boundary search.
3. **Infinite loop** — if you use `lo < hi` but set `lo = mid` (not `mid + 1`) when `mid == lo`, you loop forever. Always ensure the search space shrinks.
4. **Forgetting to check the array is sorted** — binary search on unsorted data gives wrong results.
5. **Off-by-one in `hi` initialisation** — `hi = n - 1` for closed interval, `hi = n` for half-open interval.
6. **Not handling duplicates** — `Array.BinarySearch` returns an arbitrary duplicate. Use custom lower/upper bound.

---

## Interview Tips

- Binary search is deceptively tricky. **Practice the exact template** until it is muscle memory.
- When asked "find minimum X such that..." or "find maximum X such that...", think **binary search on the answer**.
- Always state your **invariant** explicitly: "At every step, the answer is in `[lo, hi]`."
- Rotated sorted array problems are interview favourites. The key insight: one half is always sorted.
- If unsure about `<` vs `<=`, mentally trace through a 2-element array. This catches most off-by-one bugs.
- For `Array.BinarySearch`, mention the bitwise complement trick (`~result`) — it shows you know the API well.

---

## Quiz

<details>
<summary>1. Why do we compute mid as lo + (hi - lo) / 2 instead of (lo + hi) / 2?</summary>

To prevent **integer overflow**. If `lo` and `hi` are both large (close to `int.MaxValue`), their sum overflows. `lo + (hi - lo) / 2` avoids this because `hi - lo` is always non-negative and smaller than `int.MaxValue`.
</details>

<details>
<summary>2. When should you use lo <= hi vs lo < hi?</summary>

Use `lo <= hi` (closed interval `[lo, hi]`) when searching for an **exact match** — the loop must check the case where `lo == hi`. Use `lo < hi` when searching for a **boundary** (first/last occurrence, insert position) — the loop exits when `lo == hi`, which is your answer.
</details>

<details>
<summary>3. In Search in Rotated Sorted Array, how do you decide which half to search?</summary>

Check which half is **sorted** by comparing `nums[lo]` with `nums[mid]`. If `nums[lo] <= nums[mid]`, the left half is sorted — check if the target falls in `[nums[lo], nums[mid])`. Otherwise, the right half is sorted — check if the target falls in `(nums[mid], nums[hi]]`. Search the sorted half if the target is in range; otherwise search the other half.
</details>

<details>
<summary>4. What does a negative return value from Array.BinarySearch mean?</summary>

The element was not found. The **bitwise complement** (`~returnValue`) gives the index where the element would be inserted to maintain sorted order. For example, a return value of -3 means `~(-3) = 2`, so the element should be inserted at index 2.
</details>

<details>
<summary>5. What is "binary search on the answer" and when is it applicable?</summary>

Instead of searching within an array, you binary search over the **range of possible answer values**. It applies when: (1) the answer lies in a bounded range, and (2) there is a **monotonic** feasibility function — if answer `x` works, then all larger (or all smaller) values also work. Examples: minimum speed to finish a task, maximum distance between elements, etc.
</details>
