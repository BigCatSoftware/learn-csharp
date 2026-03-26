# Geometry Problems

## Matrix Manipulation Patterns

Matrix problems are a staple of coding interviews. They test your ability to manipulate 2D arrays in-place, reason about indices, and handle boundary conditions.

```
Common matrix patterns:
  1. Layer-by-layer processing (rotation, spiral)
  2. In-place marking (use matrix itself as storage)
  3. Transpose + reverse (rotation shortcut)
  4. Direction arrays for traversal
```

> **Key Insight:** Most matrix problems can be solved in O(1) extra space by using the matrix itself to store state — typically the first row/column as markers.

## Direction Arrays

A reusable pattern for traversing grids in 4 or 8 directions:

```csharp
// 4 directions: right, down, left, up
int[] dr = { 0, 1, 0, -1 };
int[] dc = { 1, 0, -1, 0 };

// 8 directions (including diagonals)
int[] dr8 = { -1, -1, -1, 0, 0, 1, 1, 1 };
int[] dc8 = { -1, 0, 1, -1, 1, -1, 0, 1 };

// Usage
for (int d = 0; d < 4; d++)
{
    int newRow = row + dr[d];
    int newCol = col + dc[d];
    if (newRow >= 0 && newRow < m && newCol >= 0 && newCol < n)
    {
        // process (newRow, newCol)
    }
}
```

## Matrix Rotation — The Transpose + Reverse Trick

```
Rotate 90° clockwise = Transpose + Reverse each row

Original:        Transpose:        Reverse rows:
1  2  3          1  4  7           7  4  1
4  5  6    →     2  5  8     →     8  5  2
7  8  9          3  6  9           9  6  3

Rotate 90° counter-clockwise = Transpose + Reverse each column
Rotate 180° = Reverse each row, then reverse each column
```

## Complexity Reference

| Problem | Time | Space | Key Technique |
|---|---|---|---|
| Rotate Image | O(n^2) | O(1) | Transpose + reverse rows |
| Spiral Matrix | O(m*n) | O(1) | Layer-by-layer or direction change |
| Set Matrix Zeroes | O(m*n) | O(1) | First row/col as markers |
| Detect Squares | O(n) per query | O(n) | HashMap of points by x-coord |

---

## Practice Problems

### Problem 1: Rotate Image (In-Place)

**Statement:** Given an n x n 2D matrix representing an image, rotate it 90 degrees clockwise **in-place**.

**Approach:** Two-step process: (1) Transpose the matrix (swap rows and columns), (2) Reverse each row.

```
Step-by-step for 4x4 matrix:

Original:               Transpose (swap [i][j] ↔ [j][i]):
 1   2   3   4           1   5   9  13
 5   6   7   8    →      2   6  10  14
 9  10  11  12           3   7  11  15
13  14  15  16           4   8  12  16

Reverse each row:
13   9   5   1
14  10   6   2
15  11   7   3
16  12   8   4    ✓ Rotated 90° clockwise!
```

```csharp
public class Solution
{
    public void Rotate(int[][] matrix)
    {
        int n = matrix.Length;

        // Step 1: Transpose — swap matrix[i][j] with matrix[j][i]
        for (int i = 0; i < n; i++)
        {
            for (int j = i + 1; j < n; j++) // j starts at i+1 to avoid double-swap
            {
                (matrix[i][j], matrix[j][i]) = (matrix[j][i], matrix[i][j]);
            }
        }

        // Step 2: Reverse each row
        for (int i = 0; i < n; i++)
        {
            int left = 0, right = n - 1;
            while (left < right)
            {
                (matrix[i][left], matrix[i][right]) = (matrix[i][right], matrix[i][left]);
                left++;
                right--;
            }
        }
    }
}
```

**Alternative: Layer-by-Layer Rotation**

Rotate four elements at a time, working from the outermost layer inward.

> Layer 0 (outermost): | Layer 1 (inner):
> 1 | 2 | 3 | 4 | 6 | 7
> 5 | 7 | 8 | 10 11
> 9 10 11 12
> 13 14 15 16
> For each position in a layer, rotate 4 elements:
> top-left | → top-right | → bottom-right → bottom-left → top-left


```csharp
public void RotateLayerByLayer(int[][] matrix)
{
    int n = matrix.Length;

    for (int layer = 0; layer < n / 2; layer++)
    {
        int first = layer;
        int last = n - 1 - layer;

        for (int i = first; i < last; i++)
        {
            int offset = i - first;

            // Save top-left
            int temp = matrix[first][i];

            // bottom-left → top-left
            matrix[first][i] = matrix[last - offset][first];

            // bottom-right → bottom-left
            matrix[last - offset][first] = matrix[last][last - offset];

            // top-right → bottom-right
            matrix[last][last - offset] = matrix[i][last];

            // saved top-left → top-right
            matrix[i][last] = temp;
        }
    }
}
```

**Complexity:** Time O(n^2), Space O(1).

---

### Problem 2: Spiral Matrix

**Statement:** Given an m x n matrix, return all elements in spiral order.

**Approach:** Maintain four boundaries (top, bottom, left, right) and traverse: right across top row, down right column, left across bottom row, up left column. Shrink boundaries after each traversal.

> Spiral traversal of 3x4 matrix:
> 1 → 2 → 3 → 4
> 5 | 6 | 7 | 8
> ↑ | ↓
> 9 | 10 | 11 | 12
> Then inner: 6 → 7 → 10 | (middle portion, not shown in full)
> Order: 1,2,3,4,8,12,11,10,9,5,6,7


```csharp
public class Solution
{
    public IList<int> SpiralOrder(int[][] matrix)
    {
        var result = new List<int>();
        if (matrix.Length == 0) return result;

        int top = 0, bottom = matrix.Length - 1;
        int left = 0, right = matrix[0].Length - 1;

        while (top <= bottom && left <= right)
        {
            // Traverse right across top row
            for (int col = left; col <= right; col++)
                result.Add(matrix[top][col]);
            top++;

            // Traverse down right column
            for (int row = top; row <= bottom; row++)
                result.Add(matrix[row][right]);
            right--;

            // Traverse left across bottom row (if rows remain)
            if (top <= bottom)
            {
                for (int col = right; col >= left; col--)
                    result.Add(matrix[bottom][col]);
                bottom--;
            }

            // Traverse up left column (if columns remain)
            if (left <= right)
            {
                for (int row = bottom; row >= top; row--)
                    result.Add(matrix[row][left]);
                left++;
            }
        }

        return result;
    }
}
```

**Complexity:** Time O(m * n), Space O(1) (excluding output).

---

### Problem 3: Set Matrix Zeroes

**Statement:** Given an m x n matrix, if an element is 0, set its entire row and column to 0. Do it **in-place**.

**Approach:** Use the first row and first column as markers. If `matrix[i][j] == 0`, mark `matrix[i][0] = 0` and `matrix[0][j] = 0`. Then use these markers to zero out cells. Handle the first row and column separately to avoid conflicts.

```
Original:              Mark first row/col:      Apply markers:
1  1  1                1  1  1                  1  1  1
1  0  1        →       0  0  1          →       0  0  0
1  1  1                1  1  1                  1  0  1

First row/col markers:
  matrix[1][0] = 0  (row 1 has a zero)
  matrix[0][1] = 0  (col 1 has a zero)
```

```csharp
public class Solution
{
    public void SetZeroes(int[][] matrix)
    {
        int m = matrix.Length, n = matrix[0].Length;
        bool firstRowZero = false;
        bool firstColZero = false;

        // Check if first row/column have any zeros
        for (int j = 0; j < n; j++)
            if (matrix[0][j] == 0) firstRowZero = true;
        for (int i = 0; i < m; i++)
            if (matrix[i][0] == 0) firstColZero = true;

        // Use first row/column as markers
        for (int i = 1; i < m; i++)
        {
            for (int j = 1; j < n; j++)
            {
                if (matrix[i][j] == 0)
                {
                    matrix[i][0] = 0; // mark row
                    matrix[0][j] = 0; // mark column
                }
            }
        }

        // Zero out cells based on markers (skip first row/col)
        for (int i = 1; i < m; i++)
        {
            for (int j = 1; j < n; j++)
            {
                if (matrix[i][0] == 0 || matrix[0][j] == 0)
                    matrix[i][j] = 0;
            }
        }

        // Handle first row
        if (firstRowZero)
            for (int j = 0; j < n; j++)
                matrix[0][j] = 0;

        // Handle first column
        if (firstColZero)
            for (int i = 0; i < m; i++)
                matrix[i][0] = 0;
    }
}
```

**Complexity:** Time O(m * n), Space O(1).

---

### Problem 4: Detect Squares

**Statement:** Design a data structure that supports adding points on a 2D plane and counting the number of axis-aligned squares that can be formed with a given query point.

**Approach:** Store points in a dictionary mapping each point to its count. For a query point `(qx, qy)`, iterate over all points with the same x-coordinate. For each such point `(qx, py)`, the side length is `|qy - py|`. Check if the two other corners exist.

```csharp
public class DetectSquares
{
    // Map: (x, y) → count of that point
    private Dictionary<(int x, int y), int> pointCount = new();

    public DetectSquares() { }

    public void Add(int[] point)
    {
        var key = (point[0], point[1]);
        if (!pointCount.ContainsKey(key))
            pointCount[key] = 0;
        pointCount[key]++;
    }

    public int Count(int[] point)
    {
        int qx = point[0], qy = point[1];
        int total = 0;

        foreach (var (p, cnt) in pointCount)
        {
            int px = p.x, py = p.y;

            // Need a diagonal point: same distance in x and y, forming a square
            // The diagonal point must differ in BOTH x and y
            // and |px - qx| must equal |py - qy| (square sides)
            if (Math.Abs(px - qx) == 0 || Math.Abs(px - qx) != Math.Abs(py - qy))
                continue;

            // Check if the other two corners exist
            var corner1 = (qx, py); // same x as query, same y as diagonal
            var corner2 = (px, qy); // same x as diagonal, same y as query

            if (pointCount.ContainsKey(corner1) && pointCount.ContainsKey(corner2))
            {
                total += cnt * pointCount[corner1] * pointCount[corner2];
            }
        }

        return total;
    }
}
```

**Complexity:** `Add` O(1). `Count` O(n) where n is the number of unique points. Space O(n).

---

## Common Mistakes

1. **Double-swapping in transpose.** When transposing, only iterate where `j > i` (upper triangle). Iterating the full matrix swaps everything twice, returning to the original.
2. **Spiral boundary checks.** After moving the top boundary down and right boundary left, check `top <= bottom` and `left <= right` before the bottom and left traversals to avoid duplicating elements.
3. **Set Matrix Zeroes order.** If you zero the first row/column before processing the rest, you lose the marker information. Always process interior cells first.
4. **Off-by-one in layer rotation.** The inner loop runs from `first` to `last - 1` (not `last`), because the last element is the starting point of the next side.
5. **Detect Squares: axis-aligned only.** The square sides must be parallel to the axes, so you only need to check two configurations (left and right of the query point along each diagonal point).

## Interview Tips

- **Draw the matrix** and trace through your algorithm with a small example. This catches index bugs immediately.
- **For rotation:** Know the transpose+reverse trick cold — it's clean, easy to implement, and easy to explain.
- **For O(1) space:** Always consider whether you can use the input matrix itself for bookkeeping (first row/column as markers).
- **Index patterns:** In spiral and rotation, write out the index formulas for one iteration before generalizing.
- **Direction arrays** (`dr`, `dc`) make grid traversal code cleaner and less error-prone than writing 4 separate if-blocks.

---

## Quiz

<details>
<summary>1. Why does "transpose + reverse each row" produce a 90-degree clockwise rotation?</summary>

Transposing swaps `(i, j)` to `(j, i)`, reflecting across the main diagonal. Reversing each row then mirrors horizontally. The combined effect maps `(i, j)` to `(j, n-1-i)`, which is exactly a 90-degree clockwise rotation. You can verify: top-left `(0,0)` goes to `(0, n-1)` (top-right), confirming clockwise rotation.
</details>

<details>
<summary>2. In Set Matrix Zeroes, why do we need separate boolean flags for the first row and column?</summary>

The first row and first column serve double duty: they store markers for other rows/columns AND they may themselves contain original zeros. If we use `matrix[0][0]` to mark both row 0 and column 0, there's an ambiguity. The separate booleans `firstRowZero` and `firstColZero` record whether the first row/column had original zeros, independent of the markers placed by interior cells.
</details>

<details>
<summary>3. In Spiral Matrix, what happens if you omit the `top <= bottom` check before the bottom-row traversal?</summary>

For non-square matrices (e.g., a single row remaining), after traversing right and incrementing `top`, `top` may exceed `bottom`. Without the check, you'd traverse the bottom row again in reverse, producing duplicate elements in the output. The same issue applies to the `left <= right` check for the left-column traversal.
</details>

<details>
<summary>4. How would you rotate a matrix 90 degrees counter-clockwise in-place?</summary>

Transpose the matrix, then reverse each **column** (instead of each row). Alternatively, reverse each row first, then transpose. Both approaches map `(i, j)` to `(n-1-j, i)`, which is a 90-degree counter-clockwise rotation.
</details>

<details>
<summary>5. In Detect Squares, why do we multiply counts of all three corner points rather than just checking existence?</summary>

A point can be added multiple times, and each instance is a distinct point. If corner1 has been added 2 times and corner2 has been added 3 times, there are `2 * 3 = 6` distinct squares using those corners. Multiplying counts correctly handles duplicate points.
</details>
