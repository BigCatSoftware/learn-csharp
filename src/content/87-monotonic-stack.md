# Monotonic Stack

## What Is a Monotonic Stack?

A **monotonic stack** is a stack whose elements are always in sorted order — either entirely non-decreasing or entirely non-increasing from bottom to top. When a new element would violate that order, you pop elements until the invariant is restored.

**Monotonic Stack Trace**

For input `[73, 74, 75, 71, 69, 72, 76, 73]` (Daily Temperatures):

| Step | Current | Stack (indices) | Action |
|---|---|---|---|
| 1 | 73 | [0] | Push |
| 2 | 74 | [1] | Pop 0 (73<74), Push |
| 3 | 75 | [2] | Pop 1 (74<75), Push |
| 4 | 71 | [2,3] | Push (71<75) |
| 5 | 69 | [2,3,4] | Push (69<71) |
| 6 | 72 | [2,5] | Pop 4,3 (69,71<72), Push |
| 7 | 76 | [6] | Pop 5,2 (72,75<76), Push |
| 8 | 73 | [6,7] | Push (73<76) |

When we pop index `i` at step `j`, the answer for `i` is `j - i` days.

> **Key insight:** The popping step is where the real work happens. Each popped element has just found its "answer" — typically the next greater or next smaller element.

---

## When to Use a Monotonic Stack

| Problem Pattern                      | Stack Type        |
|--------------------------------------|-------------------|
| **Next Greater Element** to the right | Decreasing stack  |
| **Next Smaller Element** to the right | Increasing stack  |
| **Previous Greater Element**          | Decreasing stack  |
| **Previous Smaller Element**          | Increasing stack  |
| Span / Stock span problems           | Decreasing stack  |
| Largest rectangle in histogram       | Increasing stack  |
| Trapping rain water (stack approach) | Decreasing stack  |

> **Callout:** "Decreasing" means the stack values decrease from bottom to top. When a larger value arrives, smaller values get popped. The popped elements' "next greater" is the arriving value.

---

## The Template

Almost every monotonic stack problem follows this skeleton:

```csharp
public int[] NextGreaterElement(int[] nums)
{
    int n = nums.Length;
    int[] result = new int[n];
    Array.Fill(result, -1);              // default: no greater element

    var stack = new Stack<int>();        // stores indices

    for (int i = 0; i < n; i++)
    {
        // Pop while current element is greater than stack top
        while (stack.Count > 0 && nums[stack.Peek()] < nums[i])
        {
            int idx = stack.Pop();
            result[idx] = nums[i];      // nums[i] is the next greater element
        }
        stack.Push(i);
    }

    return result;
}
```

### Step-by-Step: Next Greater Element for [2, 1, 5, 3, 4]

```
i=0, val=2:  stack=[]          → push 0          stack=[0]
i=1, val=1:  1 < 2 (no pop)   → push 1          stack=[0,1]
i=2, val=5:  5 > nums[1]=1    → pop 1, res[1]=5
             5 > nums[0]=2    → pop 0, res[0]=5
                               → push 2          stack=[2]
i=3, val=3:  3 < 5 (no pop)   → push 3          stack=[2,3]
i=4, val=4:  4 > nums[3]=3    → pop 3, res[3]=4
             4 < 5 (stop)     → push 4          stack=[2,4]

Remaining in stack: indices 2,4 → res[2]=-1, res[4]=-1

Result: [5, 5, -1, 4, -1]
```

---

## Complexity Analysis

Every monotonic stack algorithm shares the same complexity:

| Aspect | Complexity | Reason |
|--------|-----------|--------|
| Time   | **O(n)**  | Each element is pushed once and popped at most once |
| Space  | **O(n)**  | Stack holds at most n elements in the worst case |

> This is the magic: despite the nested `while` loop inside the `for` loop, the total number of pops across all iterations is at most n.

---

## Practice Problems

### Problem 1 — Daily Temperatures (LeetCode 739)

**Statement:** Given `temperatures`, return an array where `answer[i]` is the number of days until a warmer temperature. If no warmer day exists, `answer[i] = 0`.

**Approach:** Monotonic decreasing stack of indices. When a warmer day arrives, pop all cooler days — they found their answer.

```csharp
public int[] DailyTemperatures(int[] temperatures)
{
    int n = temperatures.Length;
    int[] answer = new int[n];
    var stack = new Stack<int>();   // indices of days awaiting a warmer day

    for (int i = 0; i < n; i++)
    {
        // Current temp is warmer than days on the stack
        while (stack.Count > 0 && temperatures[stack.Peek()] < temperatures[i])
        {
            int prev = stack.Pop();
            answer[prev] = i - prev;    // distance in days
        }
        stack.Push(i);
    }

    return answer;
}
```

### Diagram: temperatures = [73, 74, 75, 71, 69, 72, 76, 73]

```
i=0 (73):  stack=[0]
i=1 (74):  pop 0→ans[0]=1          stack=[1]
i=2 (75):  pop 1→ans[1]=1          stack=[2]
i=3 (71):  71<75, push             stack=[2,3]
i=4 (69):  69<71, push             stack=[2,3,4]
i=5 (72):  pop 4→ans[4]=1
           pop 3→ans[3]=2          stack=[2,5]
i=6 (76):  pop 5→ans[5]=1
           pop 2→ans[2]=4          stack=[6]
i=7 (73):  73<76, push             stack=[6,7]

Result: [1, 1, 4, 2, 1, 1, 0, 0]
```

**Complexity:** Time O(n), Space O(n).
**Edge cases:** Monotonically decreasing (all zeros), all equal temps, single day.

---

### Problem 2 — Largest Rectangle in Histogram (LeetCode 84)

**Statement:** Given an array `heights` representing histogram bar heights (each bar has width 1), find the area of the largest rectangle.

**Approach:** Use a monotonic **increasing** stack. When a shorter bar arrives, pop taller bars — each popped bar can form a rectangle extending left (to the new stack top) and right (to the current index).

```csharp
public int LargestRectangleArea(int[] heights)
{
    int n = heights.Length;
    int maxArea = 0;
    var stack = new Stack<int>();   // stores indices, heights are increasing

    for (int i = 0; i <= n; i++)
    {
        // Use height 0 as a sentinel to flush remaining bars
        int currentHeight = (i == n) ? 0 : heights[i];

        while (stack.Count > 0 && heights[stack.Peek()] > currentHeight)
        {
            int height = heights[stack.Pop()];
            // Width: from (top of stack + 1) to (i - 1)
            int width = stack.Count == 0 ? i : i - stack.Peek() - 1;
            maxArea = Math.Max(maxArea, height * width);
        }

        stack.Push(i);
    }

    return maxArea;
}
```

### Diagram: heights = [2, 1, 5, 6, 2, 3]

> Heights:
> 5 ████
> ████ | 3
> ████ | ██
> 2 ████ | 2 | ████
> ████████████████
> 1 ██████████████
> 0 | 1 | 2 | 3 | 4 | 5
> Largest rectangle: height=5, width=2 (bars at index 2-3) → area=10
> Actually: height=2, width=4 (indices 2-5) → area=8...
> But 5×2=10 wins.


```
Stack trace:
i=0, h=2: push 0                        stack=[0]
i=1, h=1: pop 0(h=2), width=1, area=2   stack=[1]
i=2, h=5: push 2                        stack=[1,2]
i=3, h=6: push 3                        stack=[1,2,3]
i=4, h=2: pop 3(h=6), w=1, area=6
           pop 2(h=5), w=2, area=10     stack=[1,4]
i=5, h=3: push 5                        stack=[1,4,5]
i=6, h=0: pop 5(h=3), w=1, area=3
           pop 4(h=2), w=4, area=8
           pop 1(h=1), w=6, area=6      stack=[]

maxArea = 10
```

**Complexity:** Time O(n), Space O(n).
**Edge cases:** Single bar, all bars same height, strictly ascending, strictly descending.

---

### Problem 3 — Trapping Rain Water (LeetCode 42)

**Statement:** Given `height[i]` representing elevation at each bar, compute how much water can be trapped after rain.

**Approach (Stack):** Use a monotonic decreasing stack. When a taller bar arrives, water is trapped between the new bar and the bar beneath the popped one. Calculate water layer by layer.

```csharp
public int Trap(int[] height)
{
    int water = 0;
    var stack = new Stack<int>();  // indices, decreasing heights

    for (int i = 0; i < height.Length; i++)
    {
        // While current bar is taller than the bar at stack top
        while (stack.Count > 0 && height[i] > height[stack.Peek()])
        {
            int bottom = stack.Pop();   // the trapped "valley"

            if (stack.Count == 0)
                break;                  // no left wall

            int leftWall = stack.Peek();
            int width = i - leftWall - 1;
            int boundedHeight = Math.Min(height[leftWall], height[i]) - height[bottom];
            water += width * boundedHeight;
        }

        stack.Push(i);
    }

    return water;
}
```

### Step-by-Step: height = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]

> Elevation view:
> 2 | ██ | 2 | 2
> 1 | ██ | 1 ████ | 1 | ██
> ██ ████████████████████
> 0 | ████████████████████████ | 1
> 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 11
> Water trapped = 6 units
> Key pops:
> i=2 (h=0): 0 < 1, push
> i=3 (h=2): pop 2(h=0), left=1(h=1), water += 1×min(1,2)-0 = 1
> pop 1(h=1), stack empty, break
> i=5 (h=0): push
> i=6 (h=1): pop 5(h=0), left=4(h=1), water += 1×min(1,1)-0 = 1
> i=7 (h=3): pop 6(h=1), left=4(h=1), water += 2×min(1,3)-1 = 0
> pop 4(h=1), left=3(h=2), water += 3×min(2,3)-1 = 3
> pop 3(h=2), stack empty, break
> ... continuing similarly adds 1 more for total = 6


**Complexity:** Time O(n), Space O(n).
**Edge cases:** Flat terrain (no water), ascending only, descending only, single bar.

> **Callout:** Trapping Rain Water has three classic approaches: (1) prefix max arrays, (2) two pointers, (3) monotonic stack. The stack approach calculates water **horizontally, layer by layer** rather than column by column.

---

## Increasing vs Decreasing — Quick Reference

```
Monotonic DECREASING stack (values decrease bottom→top):
  → Used to find the NEXT GREATER element
  → Pop when a LARGER element arrives
  → Popped element's answer = the arriving element

Monotonic INCREASING stack (values increase bottom→top):
  → Used to find the NEXT SMALLER element
  → Pop when a SMALLER element arrives
  → Popped element's answer = the arriving element
```

---

## Common Mistakes

1. **Storing values instead of indices** — you almost always need indices to compute distances or widths.
2. **Forgetting the sentinel** — in histogram problems, appending a zero height (or iterating to `n`) flushes remaining elements.
3. **Wrong comparison operator** — `<` vs `<=` matters. Use `<=` if you want **strictly** greater; use `<` if equal elements should stay.
4. **Not understanding what the popped element's "answer" is** — the arriving element is the next greater/smaller; the new stack top is the previous greater/smaller.
5. **Confusing increasing vs decreasing** — remember: a "decreasing stack" pops on increase (finding next greater).

---

## Interview Tips

- If you see "next greater element," "next smaller element," "span," or "days until warmer," immediately think monotonic stack.
- Practice explaining the O(n) time despite nested loops: "Each element is pushed and popped at most once, so total operations are O(2n) = O(n)."
- Trapping Rain Water and Largest Rectangle in Histogram are top-tier interview problems. Know at least one approach cold.
- The stack approach is often harder to derive in an interview. If stuck, mention you know a monotonic stack approach and describe the invariant — interviewers value that signal.
- These problems often have alternative solutions (two pointers, prefix arrays). Knowing multiple approaches shows depth.

---

## Quiz

<details>
<summary>1. What makes a stack "monotonic"?</summary>

The elements in the stack are always in sorted order — either non-decreasing or non-increasing from bottom to top. This invariant is maintained by popping elements that would violate the ordering before pushing a new element.
</details>

<details>
<summary>2. Why is the time complexity O(n) even though there is a while loop inside the for loop?</summary>

Each of the n elements is pushed onto the stack exactly once and popped at most once. The total number of push + pop operations across all iterations of the outer loop is at most 2n. Therefore the amortised cost is O(n).
</details>

<details>
<summary>3. For finding the "next greater element," do you use an increasing or decreasing monotonic stack?</summary>

A **monotonic decreasing** stack (values decrease from bottom to top). When a larger element arrives, it causes pops — and the arriving element is the "next greater" for each popped element.
</details>

<details>
<summary>4. In Largest Rectangle in Histogram, why do we process a sentinel bar of height 0 at the end?</summary>

The sentinel (height 0) is shorter than any real bar, so it forces all remaining bars off the stack. Without it, bars that never encounter a shorter bar to their right would never get processed, and their rectangles would be missed.
</details>

<details>
<summary>5. In the stack-based Trapping Rain Water solution, why do we break when the stack is empty after a pop?</summary>

An empty stack means there is no left wall to hold water against. Water can only be trapped between two walls (left and right). Without a left boundary, the popped valley cannot hold any water, so we stop processing.
</details>
