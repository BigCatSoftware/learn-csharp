# Bit Manipulation

## Binary Representation

Every integer in a computer is stored as a sequence of bits (0s and 1s). In C#, `int` is 32 bits (signed) and `uint` is 32 bits (unsigned).

```
Decimal 13 in binary:

  Bit position:  7  6  5  4  3  2  1  0
  Value:         0  0  0  0  1  1  0  1  = 8 + 4 + 1 = 13

  Powers of 2:  128 64 32 16  8  4  2  1
```

## Two's Complement

C# uses **two's complement** for signed integers. The most significant bit is the sign bit (0 = positive, 1 = negative).

```
 5  in 32-bit: 00000000 00000000 00000000 00000101
-5  in 32-bit: 11111111 11111111 11111111 11111011

To negate: flip all bits, then add 1
  5 = 00000101
      11111010  (flip)
     +        1
  -5 = 11111011
```

## C# Bitwise Operators

| Operator | Name | Example | Result | Description |
|---|---|---|---|---|
| `&` | AND | `0b1100 & 0b1010` | `0b1000` | 1 if both bits are 1 |
| `\|` | OR | `0b1100 \| 0b1010` | `0b1110` | 1 if either bit is 1 |
| `^` | XOR | `0b1100 ^ 0b1010` | `0b0110` | 1 if bits differ |
| `~` | NOT | `~0b1100` | `...0011` | Flips all bits |
| `<<` | Left shift | `1 << 3` | `8` | Shift bits left (multiply by 2^n) |
| `>>` | Right shift | `16 >> 2` | `4` | Shift bits right (divide by 2^n) |

> **Note:** In C#, `>>` is arithmetic shift for signed types (preserves sign bit) and logical shift for unsigned types. Use `>>>` (C# 11+) for unsigned right shift on signed types.

## Common Bit Tricks

| Trick | Expression | Why It Works |
|---|---|---|
| Check if bit `k` is set | `(n >> k) & 1` | Shifts bit k to position 0, masks it |
| Set bit `k` | `n \| (1 << k)` | OR with a mask that has only bit k set |
| Clear bit `k` | `n & ~(1 << k)` | AND with mask that has bit k cleared |
| Toggle bit `k` | `n ^ (1 << k)` | XOR flips only bit k |
| Check power of 2 | `n > 0 && (n & (n-1)) == 0` | Powers of 2 have exactly one set bit |
| Get lowest set bit | `n & (-n)` | Two's complement trick isolates lowest 1 |
| Clear lowest set bit | `n & (n - 1)` | Turns off the rightmost 1-bit |
| Count set bits (Kernighan) | Loop: `n &= (n - 1)`, count++ | Each iteration clears one set bit |

```csharp
// Kernighan's algorithm — count set bits
int CountBits(int n)
{
    int count = 0;
    while (n != 0)
    {
        n &= (n - 1); // clear lowest set bit
        count++;
    }
    return count;
}
```

```
Example: n = 13 (1101)
  1101 & 1100 = 1100  (count = 1, cleared bit 0)
  1100 & 1011 = 1000  (count = 2, cleared bit 2)
  1000 & 0111 = 0000  (count = 3, cleared bit 3)
  → 3 set bits ✓
```

## XOR Properties (Essential for Interviews)

```
a ^ a = 0        (any number XOR itself is 0)
a ^ 0 = a        (XOR with 0 is identity)
a ^ b = b ^ a    (commutative)
(a ^ b) ^ c = a ^ (b ^ c)  (associative)
```

> **Key Trick:** XOR all elements in an array — duplicates cancel out, leaving the unique element.

## Complexity Reference

| Problem | Time | Space | Key Trick |
|---|---|---|---|
| Single Number | O(n) | O(1) | XOR all elements |
| Number of 1 Bits | O(1) | O(1) | Kernighan's (max 32 iterations) |
| Counting Bits | O(n) | O(n) | DP with `i & (i-1)` |
| Reverse Bits | O(1) | O(1) | Bit-by-bit or divide and conquer |
| Missing Number | O(n) | O(1) | XOR with indices |
| Sum of Two Integers | O(1) | O(1) | XOR + carry with AND+shift |

---

## Practice Problems

### Problem 1: Single Number

**Statement:** Given a non-empty array where every element appears twice except for one, find the single element. Must run in O(n) time and O(1) space.

**Approach:** XOR all elements. Pairs cancel out (a ^ a = 0), leaving only the unique number.

```csharp
public class Solution
{
    public int SingleNumber(int[] nums)
    {
        int result = 0;
        foreach (int num in nums)
        {
            result ^= num; // pairs cancel: a ^ a = 0
        }
        return result; // only the unique number remains
    }
}
// Example: [4, 1, 2, 1, 2]
// 0 ^ 4 = 4, 4 ^ 1 = 5, 5 ^ 2 = 7, 7 ^ 1 = 6, 6 ^ 2 = 4
// Answer: 4 ✓
```

**Complexity:** Time O(n), Space O(1).

---

### Problem 2: Number of 1 Bits

**Statement:** Given a positive integer, return the number of set bits (1s) in its binary representation (also called **Hamming weight**).

**Approach:** Use Kernighan's trick: `n & (n-1)` clears the lowest set bit. Count iterations until n becomes 0.

```csharp
public class Solution
{
    public int HammingWeight(int n)
    {
        int count = 0;
        while (n != 0)
        {
            n &= (n - 1); // clear the lowest set bit
            count++;
        }
        return count;
    }

    // Alternative: use built-in (available in .NET)
    public int HammingWeightBuiltIn(int n)
    {
        return int.PopCount(n); // .NET 7+
    }
}
```

**Complexity:** Time O(k) where k = number of set bits (at most 32), Space O(1).

---

### Problem 3: Counting Bits

**Statement:** Given an integer `n`, return an array `ans` of length `n + 1` where `ans[i]` is the number of 1s in the binary representation of `i`.

**Approach:** Use DP with the relation: `bits[i] = bits[i & (i-1)] + 1`. Clearing the lowest set bit gives a smaller number whose answer we already know.

```csharp
public class Solution
{
    public int[] CountBits(int n)
    {
        int[] bits = new int[n + 1];
        // bits[0] = 0 (base case)

        for (int i = 1; i <= n; i++)
        {
            // i & (i-1) clears the lowest set bit
            // So bits[i] = bits[number with one fewer 1-bit] + 1
            bits[i] = bits[i & (i - 1)] + 1;
        }

        return bits;
    }
}
// Example for n = 5:
// bits[0] = 0                         (0 = 000)
// bits[1] = bits[1 & 0] + 1 = 0+1=1  (1 = 001)
// bits[2] = bits[2 & 1] + 1 = 0+1=1  (2 = 010)
// bits[3] = bits[3 & 2] + 1 = 1+1=2  (3 = 011)
// bits[4] = bits[4 & 3] + 1 = 0+1=1  (4 = 100)
// bits[5] = bits[5 & 4] + 1 = 1+1=2  (5 = 101)
```

**Complexity:** Time O(n), Space O(n).

---

### Problem 4: Reverse Bits

**Statement:** Reverse the bits of a given 32-bit unsigned integer.

**Approach:** Extract each bit from the right, place it at the corresponding position from the left.

```csharp
public class Solution
{
    public uint reverseBits(uint n)
    {
        uint result = 0;
        for (int i = 0; i < 32; i++)
        {
            // Extract the rightmost bit of n
            uint bit = n & 1;

            // Place it at position (31 - i) in result
            result = (result << 1) | bit;

            // Shift n right to process next bit
            n >>= 1;
        }
        return result;
    }
}
```

```
Example: n = 0000...1011 (11 in decimal)

Iteration 0: bit=1, result=1
Iteration 1: bit=1, result=11
Iteration 2: bit=0, result=110
Iteration 3: bit=1, result=1101
... (remaining 28 zeros shift result left)
Result: 1101 0000...0000
```

**Complexity:** Time O(1) (always 32 iterations), Space O(1).

---

### Problem 5: Missing Number

**Statement:** Given an array of `n` distinct numbers from `[0, n]`, find the one that is missing.

**Approach:** XOR all numbers with all indices. Every number that is present will cancel with its index. The missing number remains.

```csharp
public class Solution
{
    public int MissingNumber(int[] nums)
    {
        int xor = nums.Length; // start with n (the extra index)

        for (int i = 0; i < nums.Length; i++)
        {
            xor ^= i ^ nums[i]; // XOR index and value
        }

        return xor;
    }

    // Alternative: math approach
    public int MissingNumberMath(int[] nums)
    {
        int n = nums.Length;
        int expectedSum = n * (n + 1) / 2;
        int actualSum = 0;
        foreach (int num in nums) actualSum += num;
        return expectedSum - actualSum;
    }
}
```

**Complexity:** Time O(n), Space O(1).

---

### Problem 6: Sum of Two Integers (Without + Operator)

**Statement:** Calculate the sum of two integers `a` and `b` without using `+` or `-`.

**Approach:** XOR gives the sum without carries. AND followed by left shift gives the carries. Repeat until there are no carries.

```
Example: a = 5 (101), b = 3 (011)

Step 1: sum = 101 ^ 011 = 110   carry = (101 & 011) << 1 = 010
Step 2: sum = 110 ^ 010 = 100   carry = (110 & 010) << 1 = 100
Step 3: sum = 100 ^ 100 = 000   carry = (100 & 100) << 1 = 1000
Step 4: sum = 000 ^ 1000 = 1000 carry = 0
Result: 1000 = 8 ✓  (5 + 3 = 8)
```

```csharp
public class Solution
{
    public int GetSum(int a, int b)
    {
        while (b != 0)
        {
            int carry = (a & b) << 1; // carry bits
            a = a ^ b;                 // sum without carry
            b = carry;                 // propagate carry
        }
        return a;
    }
}
```

**Complexity:** Time O(1) (at most 32 iterations for 32-bit integers), Space O(1).

---

## Common Mistakes

1. **Integer overflow with shifts.** `1 << 31` overflows `int` in C#. Use `1u << 31` or `1L << k` for large shifts.
2. **Signed vs unsigned right shift.** `>>` preserves the sign bit for `int`. Use `>>>` (C# 11+) or cast to `uint` for logical shift.
3. **Forgetting that `~0 = -1`**, not 0. The NOT of all zeros is all ones (which is -1 in two's complement).
4. **Operator precedence.** `&`, `|`, `^` have lower precedence than `==`. Always use parentheses: `(n & 1) == 0`, not `n & 1 == 0`.
5. **Off-by-one in Missing Number.** Initialize XOR with `n`, not `n-1`, since the range is `[0, n]`.

## Interview Tips

- **Know your XOR properties** cold: `a ^ a = 0`, `a ^ 0 = a`. These solve many problems instantly.
- **Kernighan's trick** (`n & (n-1)`) appears constantly. Know it and explain why it works.
- **When you see "without using..."** constraints (no +, no extra space, constant time), think bit manipulation.
- **Practice converting** small numbers to binary mentally — it helps you trace through examples.
- **Mention `int.PopCount()`** and `BitOperations` class in .NET for production code, but implement manually for interviews.

---

## Quiz

<details>
<summary>1. Why does `n & (n - 1)` clear the lowest set bit?</summary>

Subtracting 1 from `n` flips the lowest set bit to 0 and all lower bits to 1. For example, `1010 - 1 = 1001`. ANDing `n` with `n-1` keeps all higher bits unchanged but clears the lowest set bit and all bits below it: `1010 & 1001 = 1000`.
</details>

<details>
<summary>2. How does XOR find the single unique number in an array where all others appear twice?</summary>

XOR is its own inverse: `a ^ a = 0`. When we XOR all elements, each duplicate pair cancels to 0. Since `0 ^ x = x`, only the unique element remains. The order doesn't matter because XOR is commutative and associative.
</details>

<details>
<summary>3. In the Sum of Two Integers problem, why does the loop always terminate?</summary>

Each iteration, the carry (`(a & b) << 1`) has its lowest set bit at least one position higher than before (due to the left shift). After at most 32 iterations (for 32-bit integers), the carry shifts entirely out of the integer range and becomes 0, terminating the loop.
</details>

<details>
<summary>4. What is the difference between `>>` and `>>>` in C#?</summary>

`>>` is arithmetic right shift for signed types — it fills the vacated high bits with the sign bit (0 for positive, 1 for negative). `>>>` (C# 11+) is unsigned (logical) right shift — it always fills with 0. For unsigned types like `uint`, `>>` already behaves as logical shift.
</details>

<details>
<summary>5. Why is `(n & (n-1)) == 0` used to check if n is a power of 2, and why do we also need `n > 0`?</summary>

A power of 2 has exactly one set bit (e.g., `1000`). `n & (n-1)` clears that single set bit, giving 0. We need `n > 0` because `0 & (-1) = 0` would incorrectly pass the check, but 0 is not a power of 2.
</details>
