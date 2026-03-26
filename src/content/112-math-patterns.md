# Math Patterns

## Modular Arithmetic

Modular arithmetic is essential for problems involving large numbers, cyclic patterns, and hash functions.

- Key Properties:
- (a + b) % m = ((a % m) + (b % m)) % m
- (a * b) % m = ((a % m) * (b % m)) % m
- (a - b) % m = ((a % m) - (b % m) + m) % m — add m to avoid negatives
- Warning: Division does NOT distribute over mod.
- (a / b) % m ≠ ((a % m) / (b % m)) % m
- Instead, use modular inverse: a / b ≡ a * b^(-1) (mod m)


> **C# Note:** The `%` operator in C# can return negative results for negative operands: `-7 % 3 = -1` (not 2). Use `((a % m) + m) % m` to ensure a positive result.

## Integer Overflow Handling

```csharp
// Method 1: checked context (throws OverflowException)
checked
{
    int result = int.MaxValue + 1; // throws!
}

// Method 2: Use long to avoid overflow
long product = (long)a * b; // safe even if a*b > int.MaxValue

// Method 3: Check before operating
if (a > int.MaxValue - b) { /* would overflow */ }

// Method 4: Use BigInteger for arbitrary precision
using System.Numerics;
BigInteger big = BigInteger.Pow(2, 1000);
```

## GCD and LCM — Euclidean Algorithm

> GCD(a, b) using Euclidean algorithm:
> GCD(48, 18):
> 48 = 18 * 2 + 12 | → GCD(18, 12)
> 18 = 12 * 1 + 6 | → GCD(12, 6)
> 12 = 6 | * 2 + 0 | → GCD(6, 0) = 6
> LCM(a, b) = a / GCD(a, b) * b | divide first to avoid overflow


```csharp
// Euclidean algorithm — iterative (preferred)
public static int Gcd(int a, int b)
{
    while (b != 0)
    {
        int temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

// LCM using GCD (divide first to prevent overflow)
public static long Lcm(long a, long b)
{
    return a / Gcd(a, b) * b;
}

// Recursive version
public static int GcdRecursive(int a, int b) => b == 0 ? a : GcdRecursive(b, a % b);
```

## Sieve of Eratosthenes

Find all prime numbers up to `n` in O(n log log n) time.

```
Sieve of Eratosthenes for n = 30:

Start:  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30

p=2:    2  3  ✗  5  ✗  7  ✗  9  ✗ 11  ✗ 13  ✗ 15  ✗ 17  ✗ 19  ✗ 21  ✗ 23  ✗ 25  ✗ 27  ✗ 29  ✗
        (cross out multiples of 2 starting from 2²=4)

p=3:    2  3     5     7     ✗    11    13    ✗    17    19    ✗    23    25    ✗    29
        (cross out multiples of 3 starting from 3²=9)

p=5:    2  3     5     7         11    13         17    19         23    ✗         29
        (cross out 25, the only remaining multiple of 5)

Done (√30 ≈ 5.5, so we stop after p=5):
Primes: 2  3  5  7  11  13  17  19  23  29
```

```csharp
public static List<int> SieveOfEratosthenes(int n)
{
    bool[] isComposite = new bool[n + 1];
    var primes = new List<int>();

    for (int p = 2; p <= n; p++)
    {
        if (isComposite[p]) continue;

        primes.Add(p);

        // Start marking from p*p (smaller multiples already marked)
        // Use long to avoid overflow when p*p > int.MaxValue
        for (long j = (long)p * p; j <= n; j += p)
        {
            isComposite[(int)j] = true;
        }
    }

    return primes;
}
```

## Fast Exponentiation (Binary Exponentiation)

Compute `x^n` in O(log n) time by squaring repeatedly.

```
Example: 3^13

13 in binary = 1101
3^13 = 3^8 * 3^4 * 3^1

  n = 13 (1101):  result *= base (3),     base = 3² = 9
  n = 6  (0110):  skip,                   base = 9² = 81
  n = 3  (0011):  result *= base (81),    base = 81² = 6561
  n = 1  (0001):  result *= base (6561),  done

  result = 3 * 81 * 6561 = 1594323 = 3^13 ✓
```

```csharp
public static long FastPow(long baseVal, long exp, long mod)
{
    long result = 1;
    baseVal %= mod;

    while (exp > 0)
    {
        if ((exp & 1) == 1)         // if current bit is 1
            result = result * baseVal % mod;

        exp >>= 1;                  // shift to next bit
        baseVal = baseVal * baseVal % mod;  // square the base
    }

    return result;
}
```

## Complexity Reference

| Algorithm | Time | Space |
|---|---|---|
| GCD (Euclidean) | O(log(min(a,b))) | O(1) |
| Sieve of Eratosthenes | O(n log log n) | O(n) |
| Fast Exponentiation | O(log n) | O(1) |
| Pow(x, n) | O(log n) | O(1) |
| Happy Number | O(log n) per step | O(1) with Floyd |
| Plus One | O(n) | O(1) |
| Multiply Strings | O(m * n) | O(m + n) |

---

## Practice Problems

### Problem 1: Pow(x, n)

**Statement:** Implement `pow(x, n)`, computing x raised to the power n.

**Approach:** Use binary exponentiation. Handle negative exponents by computing `1 / pow(x, -n)`. Watch for `n = int.MinValue` (negating it overflows).

```csharp
public class Solution
{
    public double MyPow(double x, int n)
    {
        // Handle negative exponent
        // Use long to avoid overflow when n = int.MinValue
        long exp = n;
        if (exp < 0)
        {
            x = 1.0 / x;
            exp = -exp;
        }

        double result = 1.0;
        double current = x;

        while (exp > 0)
        {
            if ((exp & 1) == 1)   // odd exponent: multiply result by current
                result *= current;

            current *= current;   // square the base
            exp >>= 1;           // halve the exponent
        }

        return result;
    }
}
```

**Complexity:** Time O(log n), Space O(1).

---

### Problem 2: Happy Number

**Statement:** A number is "happy" if repeatedly replacing it with the sum of the squares of its digits eventually reaches 1. If it loops endlessly, it's not happy. Determine if `n` is happy.

**Approach:** Use Floyd's cycle detection (slow/fast pointers) to detect loops without a HashSet, achieving O(1) space.

```csharp
public class Solution
{
    public bool IsHappy(int n)
    {
        int slow = n;
        int fast = GetNext(n);

        // Floyd's cycle detection
        while (fast != 1 && slow != fast)
        {
            slow = GetNext(slow);        // move 1 step
            fast = GetNext(GetNext(fast)); // move 2 steps
        }

        return fast == 1;
    }

    private int GetNext(int n)
    {
        int sum = 0;
        while (n > 0)
        {
            int digit = n % 10;
            sum += digit * digit;
            n /= 10;
        }
        return sum;
    }
}
// Example: n = 19
// 19 → 1² + 9² = 82 → 64 + 4 = 68 → 36 + 64 = 100 → 1 + 0 + 0 = 1 ✓
```

**Complexity:** Time O(log n) per step, O(1) space with Floyd's.

---

### Problem 3: Plus One

**Statement:** Given a number represented as an array of digits (most significant first), add one to the number.

**Approach:** Start from the least significant digit. If it's less than 9, increment and return. If it's 9, set to 0 and carry. If all digits are 9, prepend a 1.

```csharp
public class Solution
{
    public int[] PlusOne(int[] digits)
    {
        // Work from right to left
        for (int i = digits.Length - 1; i >= 0; i--)
        {
            if (digits[i] < 9)
            {
                digits[i]++;
                return digits; // no carry, done
            }
            digits[i] = 0; // carry: set to 0, continue left
        }

        // All digits were 9 (e.g., 999 → 1000)
        int[] result = new int[digits.Length + 1];
        result[0] = 1; // rest are already 0
        return result;
    }
}
```

**Complexity:** Time O(n), Space O(1) unless all 9s, then O(n).

---

### Problem 4: Multiply Strings

**Statement:** Given two non-negative integers represented as strings, return their product as a string. You cannot use built-in BigInteger or convert the inputs to integers directly.

**Approach:** Simulate grade-school multiplication. For digits at positions `i` and `j`, their product contributes to positions `i+j` and `i+j+1` in the result.

```
        1 2 3    (num1, indices 0,1,2)
      ×   4 5    (num2, indices 0,1)
      -------
    positions in result array (length = m + n):
      num1[i] * num2[j] → result[i + j + 1] (ones), result[i + j] (carry)
```

```csharp
public class Solution
{
    public string Multiply(string num1, string num2)
    {
        int m = num1.Length, n = num2.Length;
        int[] result = new int[m + n]; // max digits in product

        // Multiply each pair of digits
        for (int i = m - 1; i >= 0; i--)
        {
            for (int j = n - 1; j >= 0; j--)
            {
                int mul = (num1[i] - '0') * (num2[j] - '0');
                int p1 = i + j;      // carry position
                int p2 = i + j + 1;  // ones position

                int sum = mul + result[p2]; // add to existing value

                result[p2] = sum % 10;     // ones digit
                result[p1] += sum / 10;     // carry
            }
        }

        // Build result string, skip leading zeros
        var sb = new System.Text.StringBuilder();
        foreach (int digit in result)
        {
            if (sb.Length == 0 && digit == 0) continue; // skip leading zeros
            sb.Append(digit);
        }

        return sb.Length == 0 ? "0" : sb.ToString();
    }
}
```

**Complexity:** Time O(m * n), Space O(m + n).

---

## Common Mistakes

1. **Integer overflow.** Multiplying two `int` values can overflow. Cast to `long` first: `(long)a * b`.
2. **Negative modulo.** C#'s `%` can return negative values. Use `((x % m) + m) % m`.
3. **`int.MinValue` negation.** `-int.MinValue` overflows because `|int.MinValue| > int.MaxValue`. Cast to `long` first.
4. **Sieve starting from `p*p`.** Don't start from `2*p` — it works but is slower. And cast to `long` to avoid `p*p` overflow.
5. **Forgetting edge case "0" in Multiply Strings.** If either input is "0", the result must be "0", not an empty string.

## Interview Tips

- **Ask about constraints:** Number ranges determine if you need `long`, `BigInteger`, or modular arithmetic.
- **Know the Euclidean algorithm** by heart. It's fast to write and appears in many problems.
- **For "detect cycle" problems** (like Happy Number), mention Floyd's algorithm for O(1) space.
- **Grade-school multiplication** is a common interview pattern — understand the index math for the result array.
- **Modular exponentiation** is essential for cryptography-related problems and large number computations.

---

## Quiz

<details>
<summary>1. Why does the Euclidean algorithm work for computing GCD?</summary>

It relies on the property that `GCD(a, b) = GCD(b, a % b)`. Any common divisor of `a` and `b` also divides `a % b` (since `a % b = a - q*b`). The remainder strictly decreases each step, so the algorithm terminates when `b = 0`, and `a` holds the GCD.
</details>

<details>
<summary>2. In the Sieve of Eratosthenes, why do we start marking multiples from p*p instead of 2*p?</summary>

All multiples of `p` smaller than `p*p` have already been marked by smaller primes. For example, when `p=5`, the multiples `10, 15, 20` were already crossed out when processing `p=2` and `p=3`. The first unmarked multiple of `p` is always `p*p`.
</details>

<details>
<summary>3. Why do we use `long exp = n` in Pow(x, n) when n is int.MinValue?</summary>

`int.MinValue` is `-2147483648`. Negating it (`-int.MinValue`) would be `2147483648`, which exceeds `int.MaxValue` (2147483647), causing an overflow. By storing `n` in a `long` first, the negation fits safely within the `long` range.
</details>

<details>
<summary>4. In Multiply Strings, why is the result array of size m + n?</summary>

The maximum number of digits in the product of an m-digit number and an n-digit number is `m + n`. For example, 99 (2 digits) * 99 (2 digits) = 9801 (4 digits = 2 + 2). The result array may have a leading zero, which is skipped when building the output string.
</details>

<details>
<summary>5. How does Floyd's cycle detection work in the Happy Number problem, and why is it O(1) space?</summary>

The sequence of digit-square-sums either reaches 1 or enters a cycle. We use two pointers: `slow` advances one step and `fast` advances two steps per iteration. If there's a cycle, they will meet. If `fast` reaches 1, the number is happy. This uses only two integer variables regardless of cycle length, so it's O(1) space — unlike a HashSet approach which stores all visited numbers.
</details>
