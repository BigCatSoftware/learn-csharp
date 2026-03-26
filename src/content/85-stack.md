# Stack — Theory and Implementation

## What Is a Stack?

A **stack** is a linear data structure that follows the **LIFO** (Last In, First Out) principle. The last element added is the first one removed — like a stack of plates.

**Stack State (LIFO)**

Operations always happen at the **top** of the stack:

- `Push(30)` → adds 30 on top
- `Push(20)` → adds 20 on top of 30
- `Push(10)` → adds 10 on top of 20
- `Pop()` → removes and returns 10 (the top)
- `Peek()` → returns 20 (new top) without removing

Think of it like a stack of plates — you can only add/remove from the top.

> **Key insight:** You can only access the **top** element. No random access, no peeking at the middle.

---

## Core Operations

| Operation | Description                | Time  | Space |
|-----------|----------------------------|-------|-------|
| `Push`    | Add element to top         | O(1)* | O(1)  |
| `Pop`     | Remove and return top      | O(1)  | O(1)  |
| `Peek`    | View top without removing  | O(1)  | O(1)  |
| `IsEmpty` | Check if stack is empty    | O(1)  | O(1)  |
| `Count`   | Number of elements         | O(1)  | O(1)  |

*Amortised O(1) for array-backed stacks due to occasional resizing.

---

## Stack\<T\> in C#

The built-in `System.Collections.Generic.Stack<T>` covers most needs:

```csharp
var stack = new Stack<int>();

stack.Push(10);
stack.Push(20);
stack.Push(30);

Console.WriteLine(stack.Peek());  // 30
Console.WriteLine(stack.Pop());   // 30
Console.WriteLine(stack.Count);   // 2

// Safe alternative to Pop/Peek when stack might be empty
if (stack.TryPop(out int val))
    Console.WriteLine(val);       // 20

if (stack.TryPeek(out int top))
    Console.WriteLine(top);       // 10
```

> **Callout:** `Stack<T>` is backed by an array internally. It doubles capacity when full, giving amortised O(1) push.

---

## Implement Stack from Scratch — Array-Based

```csharp
public class ArrayStack<T>
{
    private T[] _items;
    private int _count;

    public ArrayStack(int capacity = 4)
    {
        _items = new T[capacity];
        _count = 0;
    }

    public int Count => _count;
    public bool IsEmpty => _count == 0;

    // Push: add to top, resize if needed
    public void Push(T item)
    {
        if (_count == _items.Length)
            Resize(_items.Length * 2);   // double the array

        _items[_count++] = item;
    }

    // Pop: remove and return top element
    public T Pop()
    {
        if (IsEmpty)
            throw new InvalidOperationException("Stack is empty.");

        T item = _items[--_count];
        _items[_count] = default!;       // avoid memory leak

        // Shrink if only 25 % full (optional optimisation)
        if (_count > 0 && _count == _items.Length / 4)
            Resize(_items.Length / 2);

        return item;
    }

    // Peek: view top without removing
    public T Peek()
    {
        if (IsEmpty)
            throw new InvalidOperationException("Stack is empty.");
        return _items[_count - 1];
    }

    private void Resize(int newCapacity)
    {
        var copy = new T[newCapacity];
        Array.Copy(_items, copy, _count);
        _items = copy;
    }
}
```

### Push / Pop State Diagram

> Push(1) | Push(2) | Push(3) | Pop() | Pop()
> 3 | top
> 2 | top | 2 | 2 | top
> 1 | top | 1 | 1 | 1 | 1 | top
> cnt=1 | cnt=2 | cnt=3 | cnt=2 | cnt=1
> ret 3 | ret 2


---

## Implement Stack — Linked-List-Based

```csharp
public class LinkedStack<T>
{
    private class Node
    {
        public T Value;
        public Node? Next;
        public Node(T value, Node? next) { Value = value; Next = next; }
    }

    private Node? _top;
    private int _count;

    public int Count => _count;
    public bool IsEmpty => _top is null;

    public void Push(T item)
    {
        _top = new Node(item, _top);    // new node points to old top
        _count++;
    }

    public T Pop()
    {
        if (_top is null)
            throw new InvalidOperationException("Stack is empty.");

        T value = _top.Value;
        _top = _top.Next;               // move top down
        _count--;
        return value;
    }

    public T Peek()
    {
        if (_top is null)
            throw new InvalidOperationException("Stack is empty.");
        return _top.Value;
    }
}
```

> **Array vs Linked List:** Array-based has better cache locality and no per-node allocation overhead. Linked-list never wastes space on unused slots and never needs resizing. For most workloads, **array-based wins** (and is what .NET uses internally).

---

## Common Use Cases

| Use Case                | Why a Stack?                              |
|-------------------------|-------------------------------------------|
| Undo / Redo             | Most recent action reversed first (LIFO)  |
| Expression evaluation   | Operator precedence via nested push/pop   |
| DFS (iterative)         | Explicit stack replaces recursion          |
| Parentheses matching    | Open bracket pushed, popped on close      |
| Browser back/forward    | History stacks                            |
| Function call stack     | Runtime uses a stack for calls/returns    |

---

## Practice Problems

### Problem 1 — Valid Parentheses (LeetCode 20)

**Statement:** Given a string `s` containing just `(`, `)`, `{`, `}`, `[`, `]`, determine if the input string is valid. Every open bracket must be closed by the same type in the correct order.

**Approach:** Push each opening bracket. On a closing bracket, pop and check it matches. At the end, the stack must be empty.

```csharp
public bool IsValid(string s)
{
    var stack = new Stack<char>();

    foreach (char c in s)
    {
        // Push the expected closing bracket
        if (c == '(') stack.Push(')');
        else if (c == '{') stack.Push('}');
        else if (c == '[') stack.Push(']');
        else
        {
            // Closing bracket: must match top of stack
            if (stack.Count == 0 || stack.Pop() != c)
                return false;
        }
    }

    return stack.Count == 0;  // all brackets matched
}
```

**Complexity:** Time O(n), Space O(n).
**Edge cases:** Empty string (valid), single bracket (invalid), interleaved `([)]` (invalid).

---

### Problem 2 — Min Stack (LeetCode 155)

**Statement:** Design a stack that supports `Push`, `Pop`, `Top`, and `GetMin` — all in O(1).

**Approach:** Keep a parallel stack that tracks the current minimum at each level.

```csharp
public class MinStack
{
    private readonly Stack<int> _data = new();
    private readonly Stack<int> _mins = new();

    // Push value and update min stack
    public void Push(int val)
    {
        _data.Push(val);
        int currentMin = _mins.Count == 0 ? val : Math.Min(val, _mins.Peek());
        _mins.Push(currentMin);
    }

    public void Pop()
    {
        _data.Pop();
        _mins.Pop();     // keep stacks in sync
    }

    public int Top() => _data.Peek();
    public int GetMin() => _mins.Peek();
}
```

> State after Push(5), Push(3), Push(7):
> _data | _mins
> 7 | 3 | min is still 3
> 3 | 3 | min became 3
> 5 | 5 | min was 5


**Complexity:** All operations O(1) time, O(n) extra space.
**Edge cases:** Duplicate minimums (push same min again), single element.

---

### Problem 3 — Evaluate Reverse Polish Notation (LeetCode 150)

**Statement:** Evaluate an arithmetic expression in Reverse Polish Notation. Valid operators are `+`, `-`, `*`, `/`. Each operand may be an integer or another expression.

**Approach:** Push numbers. On an operator, pop two operands, compute, push result.

```csharp
public int EvalRPN(string[] tokens)
{
    var stack = new Stack<int>();

    foreach (string t in tokens)
    {
        if (int.TryParse(t, out int num))
        {
            stack.Push(num);
        }
        else
        {
            int b = stack.Pop();   // second operand popped first
            int a = stack.Pop();   // first operand
            int result = t switch
            {
                "+" => a + b,
                "-" => a - b,
                "*" => a * b,
                "/" => a / b,      // truncates toward zero in C#
                _   => throw new ArgumentException($"Unknown operator: {t}")
            };
            stack.Push(result);
        }
    }

    return stack.Pop();
}
```

**Complexity:** Time O(n), Space O(n).
**Edge cases:** Negative numbers as tokens (`"-3"`), division truncation toward zero.

---

### Problem 4 — Daily Temperatures (LeetCode 739)

**Statement:** Given an array `temperatures`, return an array `answer` where `answer[i]` is the number of days until a warmer temperature. If no future day is warmer, set `answer[i] = 0`.

**Approach:** Use a stack of indices. For each day, pop all days that are cooler than today — those days found their answer.

```csharp
public int[] DailyTemperatures(int[] temperatures)
{
    int n = temperatures.Length;
    int[] answer = new int[n];
    var stack = new Stack<int>();  // stores indices

    for (int i = 0; i < n; i++)
    {
        // Pop indices whose temperature is less than current
        while (stack.Count > 0 && temperatures[stack.Peek()] < temperatures[i])
        {
            int prev = stack.Pop();
            answer[prev] = i - prev;
        }
        stack.Push(i);
    }

    // Remaining indices in stack have no warmer day → answer stays 0
    return answer;
}
```

**Complexity:** Time O(n) — each index pushed and popped at most once. Space O(n).
**Edge cases:** Monotonically decreasing temps (all zeros), all same temp, single element.

---

## Common Mistakes

1. **Popping from an empty stack** — always check `Count > 0` or use `TryPop`.
2. **Forgetting operand order in RPN** — the first popped value is the *right* operand.
3. **Not clearing references after pop** (array-based) — can cause memory leaks with reference types.
4. **Using a `List<T>` as a stack** — it works but `Stack<T>` communicates intent and has `TryPeek`/`TryPop`.

---

## Interview Tips

- If the problem involves **nested structures** (brackets, HTML tags) or **most-recent-first** access, think stack.
- Iterative DFS uses an explicit stack and is often preferred in interviews over recursion (no stack overflow risk).
- Monotonic stack (see lesson 87) is a specialised pattern — mention it if asked about "next greater element" type problems.
- Always clarify edge cases: empty input, single element, all duplicates.

---

## Quiz

<details>
<summary>1. What does LIFO stand for, and why does it describe a stack?</summary>

**Last In, First Out.** The most recently pushed element is the first one returned by `Pop`. Like a stack of plates — you take from the top.
</details>

<details>
<summary>2. What is the amortised time complexity of Push on an array-backed stack?</summary>

**O(1) amortised.** Most pushes are O(1). Occasionally the array doubles, costing O(n), but spread over n pushes the average cost is O(1).
</details>

<details>
<summary>3. Why does the MinStack need a second stack instead of just a single variable tracking the minimum?</summary>

A single variable cannot restore the *previous* minimum after a `Pop`. The min-stack records the minimum at every level, so popping always reveals the correct minimum for the remaining elements.
</details>

<details>
<summary>4. In the Daily Temperatures problem, why does the stack hold indices rather than temperatures?</summary>

We need to compute `i - prev` (the number of days to wait). Indices let us both look up the temperature via `temperatures[index]` and calculate the distance. Storing just temperatures would lose positional information.
</details>

<details>
<summary>5. When would you prefer a linked-list stack over an array-based stack?</summary>

When the maximum size is completely unpredictable and you want to avoid the occasional O(n) resize cost of an array. In practice, array-based stacks are almost always faster due to better cache locality and lower allocation overhead.
</details>
