# Analytic Functions in Oracle

*Chapter 10.4 — Oracle SQL for Data Engineers*

---

## Overview

Analytic (window) functions are one of the most powerful features in SQL, and Oracle was
an early pioneer — supporting them since Oracle 8i (1999), years before SQL Server added
comparable support. While the core window functions (`ROW_NUMBER`, `RANK`, `LAG`, `LEAD`)
work almost identically in both engines, Oracle has several extensions that SQL Server
either lacks or handles differently: `RATIO_TO_REPORT`, `KEEP (DENSE_RANK FIRST/LAST)`,
and the `MODEL` clause.

As a Data Engineer migrating CMiC data from Oracle to SQL Server, you will encounter
analytic functions in views, reports, and ETL procedures. This lesson covers the syntax
differences, Oracle-exclusive features, and migration strategies.

---

## Core Concepts

### 1. The OVER Clause — Anatomy

Both Oracle and SQL Server use the same general structure:

```
function_name(...) OVER (
    [PARTITION BY col1, col2, ...]
    [ORDER BY col3 [ASC|DESC], ...]
    [windowing_clause]
)
```

The **windowing clause** (ROWS or RANGE) defines which rows in the partition are included
in the calculation relative to the current row.

### 2. Standard Ranking Functions

| Function | Behavior | Oracle | SQL Server |
|----------|---------|--------|-----------|
| `ROW_NUMBER()` | Unique sequential number | Same syntax | Same syntax |
| `RANK()` | Rank with gaps for ties | Same syntax | Same syntax |
| `DENSE_RANK()` | Rank without gaps | Same syntax | Same syntax |
| `NTILE(n)` | Divide into n buckets | Same syntax | Same syntax |

These work identically in both engines.

### 3. Offset Functions — LAG and LEAD

```sql
LAG(expr [, offset [, default]]) OVER (PARTITION BY ... ORDER BY ...)
LEAD(expr [, offset [, default]]) OVER (PARTITION BY ... ORDER BY ...)
```

- `offset` defaults to 1
- `default` is returned when the offset goes beyond the partition boundary (defaults to
  NULL)
- **Same syntax in both Oracle and SQL Server** (SQL Server 2012+)

### 4. FIRST_VALUE and LAST_VALUE

```sql
FIRST_VALUE(expr) OVER (PARTITION BY ... ORDER BY ... ROWS BETWEEN ...)
LAST_VALUE(expr)  OVER (PARTITION BY ... ORDER BY ... ROWS BETWEEN ...)
```

**Critical gotcha**: The default window frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND
CURRENT ROW`. This means `LAST_VALUE` returns the current row's value, not the last row
in the partition. You almost always need to specify:

```sql
LAST_VALUE(expr) OVER (
    PARTITION BY ...
    ORDER BY ...
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
)
```

This applies to **both** Oracle and SQL Server.

### 5. ROWS vs RANGE

| Frame Type | Behavior |
|-----------|---------|
| `ROWS BETWEEN ...` | Physical row offsets |
| `RANGE BETWEEN ...` | Logical value offsets |

Example: with `ORDER BY amount`, `RANGE BETWEEN 100 PRECEDING AND 100 FOLLOWING` includes
all rows where `amount` is within 100 of the current row's amount.

Oracle supports `RANGE` with numeric and date intervals. SQL Server supports `RANGE` only
with `UNBOUNDED` and `CURRENT ROW` — not arbitrary numeric offsets.

### 6. Oracle-Exclusive: RATIO_TO_REPORT

```sql
RATIO_TO_REPORT(expr) OVER ([PARTITION BY ...])
```

Returns the ratio of `expr` to the sum of `expr` over the partition. Result is between
0 and 1.

SQL Server equivalent:

```sql
expr * 1.0 / SUM(expr) OVER (PARTITION BY ...)
```

### 7. Oracle-Exclusive: KEEP (DENSE_RANK FIRST/LAST)

This is a powerful Oracle feature that selects a value from the first or last row in an
ordered group:

```sql
MIN(amount) KEEP (DENSE_RANK FIRST ORDER BY entry_date) OVER (PARTITION BY job_id)
```

This returns the minimum `amount` among the rows with the earliest `entry_date` for each
`job_id`.

SQL Server has no direct equivalent. Use a subquery or `FIRST_VALUE` / `LAST_VALUE` with
appropriate framing.

### 8. Oracle-Exclusive: PERCENTILE_CONT and PERCENTILE_DISC

Oracle supports these as both aggregate and analytic functions:

```sql
-- As analytic function (Oracle)
PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)
    OVER (PARTITION BY job_id)

-- SQL Server supports these as aggregate functions only (2012+)
-- For analytic use, wrap in a subquery
```

### 9. The MODEL Clause — Spreadsheet Calculations

Oracle's `MODEL` clause turns SQL result sets into spreadsheet-like structures with cell
references and iterative calculations:

```sql
SELECT *
FROM   sales_data
MODEL
    PARTITION BY (region)
    DIMENSION BY (month_num)
    MEASURES (revenue, forecast)
    RULES (
        forecast[ANY] = (revenue[CV() - 1] + revenue[CV() - 2]) / 2
    );
```

This is extremely powerful but rarely used in practice. SQL Server has no equivalent.
When migrating, rewrite using window functions, CTEs, or application-layer logic.

---

## Code Examples

### ROW_NUMBER for Deduplication

```sql
-- Oracle: keep only the latest cost entry per job + cost code
SELECT *
FROM (
    SELECT jcd.*,
           ROW_NUMBER() OVER (
               PARTITION BY job_id, cost_code
               ORDER BY entry_date DESC, entry_id DESC
           ) AS rn
    FROM   cmic.job_cost_detail jcd
)
WHERE rn = 1;

-- SQL Server: identical pattern
SELECT *
FROM (
    SELECT jcd.*,
           ROW_NUMBER() OVER (
               PARTITION BY job_id, cost_code
               ORDER BY entry_date DESC, entry_id DESC
           ) AS rn
    FROM   cmic.job_cost_detail jcd
) sub
WHERE sub.rn = 1;
```

### Running Total with SUM OVER

```sql
-- Oracle: running total of costs per job, ordered by date
SELECT job_id,
       entry_date,
       amount,
       SUM(amount) OVER (
           PARTITION BY job_id
           ORDER BY entry_date
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS running_total
FROM   cmic.job_cost_detail;

-- SQL Server: identical syntax (2012+)
```

### LAG — Period-over-Period Comparison

```sql
-- Oracle: compare each month's cost to the previous month
SELECT job_id,
       period_month,
       total_cost,
       LAG(total_cost, 1, 0) OVER (
           PARTITION BY job_id
           ORDER BY period_month
       ) AS prev_month_cost,
       total_cost - LAG(total_cost, 1, 0) OVER (
           PARTITION BY job_id
           ORDER BY period_month
       ) AS month_over_month_change
FROM   cmic.monthly_job_summary;
```

### RANK and DENSE_RANK — Top N per Group

```sql
-- Oracle: top 3 highest cost entries per job
SELECT *
FROM (
    SELECT job_id, cost_code, amount,
           DENSE_RANK() OVER (
               PARTITION BY job_id
               ORDER BY amount DESC
           ) AS cost_rank
    FROM   cmic.job_cost_detail
)
WHERE cost_rank <= 3;
```

### RATIO_TO_REPORT — Percentage of Total

```sql
-- Oracle: what percentage of total job cost does each cost code represent?
SELECT job_id,
       cost_code,
       amount,
       ROUND(RATIO_TO_REPORT(amount) OVER (PARTITION BY job_id) * 100, 2)
           AS pct_of_job_cost
FROM   cmic.job_cost_detail
WHERE  job_id = 'J-1001';

-- SQL Server equivalent
SELECT job_id,
       cost_code,
       amount,
       ROUND(amount * 100.0 / SUM(amount) OVER (PARTITION BY job_id), 2)
           AS pct_of_job_cost
FROM   cmic.job_cost_detail
WHERE  job_id = 'J-1001';
```

### KEEP (DENSE_RANK FIRST/LAST)

```sql
-- Oracle: for each job, get the cost code of the earliest entry
-- and the cost code of the most expensive entry
SELECT job_id,
       MIN(cost_code) KEEP (DENSE_RANK FIRST ORDER BY entry_date ASC)
           AS earliest_cost_code,
       MIN(cost_code) KEEP (DENSE_RANK FIRST ORDER BY amount DESC)
           AS most_expensive_code
FROM   cmic.job_cost_detail
GROUP  BY job_id;

-- SQL Server equivalent using subqueries
SELECT j.job_id,
       (SELECT TOP 1 cost_code FROM cmic.job_cost_detail
        WHERE job_id = j.job_id ORDER BY entry_date ASC) AS earliest_cost_code,
       (SELECT TOP 1 cost_code FROM cmic.job_cost_detail
        WHERE job_id = j.job_id ORDER BY amount DESC) AS most_expensive_code
FROM   (SELECT DISTINCT job_id FROM cmic.job_cost_detail) j;

-- SQL Server alternative using FIRST_VALUE
SELECT DISTINCT
       job_id,
       FIRST_VALUE(cost_code) OVER (
           PARTITION BY job_id ORDER BY entry_date ASC
           ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
       ) AS earliest_cost_code,
       FIRST_VALUE(cost_code) OVER (
           PARTITION BY job_id ORDER BY amount DESC
           ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
       ) AS most_expensive_code
FROM   cmic.job_cost_detail;
```

### NTILE — Splitting Work into Buckets

```sql
-- Oracle: divide jobs into 4 quartiles by total cost
SELECT job_id,
       total_cost,
       NTILE(4) OVER (ORDER BY total_cost DESC) AS cost_quartile
FROM   cmic.job_summary;
```

### Moving Average

```sql
-- Oracle: 3-month moving average of job costs
SELECT job_id,
       period_month,
       monthly_cost,
       AVG(monthly_cost) OVER (
           PARTITION BY job_id
           ORDER BY period_month
           ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
       ) AS moving_avg_3mo
FROM   cmic.monthly_job_summary;
```

### PERCENTILE_CONT — Median Calculation

```sql
-- Oracle: median cost per job (as analytic function)
SELECT job_id,
       cost_code,
       amount,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)
           OVER (PARTITION BY job_id) AS median_cost
FROM   cmic.job_cost_detail;

-- SQL Server: use as aggregate with GROUP BY, then join back
SELECT jcd.job_id, jcd.cost_code, jcd.amount, med.median_cost
FROM   cmic.job_cost_detail jcd
JOIN   (
    SELECT job_id,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) AS median_cost
    FROM   cmic.job_cost_detail
    GROUP  BY job_id
) med ON jcd.job_id = med.job_id;
```

---

## Common Patterns

### Pattern 1 — Deduplication with ROW_NUMBER

The most common analytic function pattern in ETL. Partition by the natural key, order by
a tiebreaker (usually timestamp DESC), and keep `rn = 1`. Works identically in Oracle and
SQL Server.

### Pattern 2 — Running Totals for Financial Reporting

Cumulative budget consumption, running commitment totals, earned value calculations. All
use `SUM() OVER (ORDER BY ... ROWS UNBOUNDED PRECEDING)`.

### Pattern 3 — Gap and Island Detection

Use `ROW_NUMBER()` or `LAG/LEAD` to detect gaps in sequential data (missing daily reports,
equipment log gaps). The difference between a sequence number and ROW_NUMBER identifies
groups of consecutive rows.

### Pattern 4 — Percent of Total

Oracle's `RATIO_TO_REPORT` is cleaner, but `expr / SUM(expr) OVER (PARTITION BY ...)`
works in both engines. Use for cost code breakdown reports.

### Pattern 5 — Change Detection with LAG

Compare current row to prior row to flag changes. Useful for tracking status changes on
jobs, cost code reclassifications, and equipment moves.

---

## Gotchas and Pitfalls

1. **LAST_VALUE default frame.** The default window frame (`RANGE BETWEEN UNBOUNDED
   PRECEDING AND CURRENT ROW`) makes `LAST_VALUE` return the current row. Always specify
   `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` for true last value.

2. **RANGE vs ROWS with ORDER BY.** If the ORDER BY column has duplicates, `RANGE` and
   `ROWS` produce different results. `RANGE` includes all tied rows; `ROWS` includes
   exactly the specified number. In Oracle, the default is `RANGE`. This catches people
   off guard with running sums that seem to "skip ahead."

3. **RATIO_TO_REPORT does not exist in SQL Server.** Every instance must be rewritten
   as `col / SUM(col) OVER (PARTITION BY ...)`.

4. **KEEP (DENSE_RANK FIRST/LAST) has no SQL Server equivalent.** Requires a subquery,
   `FIRST_VALUE`, or `CROSS APPLY` rewrite.

5. **NULL ordering differs.** Oracle sorts NULLs last by default (ascending). SQL Server
   sorts NULLs first. Oracle has `NULLS FIRST` / `NULLS LAST` syntax; SQL Server does
   not. Use a `CASE` expression in the ORDER BY to control NULL position in SQL Server:
   `ORDER BY CASE WHEN col IS NULL THEN 1 ELSE 0 END, col`.

6. **PERCENTILE_CONT as analytic.** Oracle supports it in the OVER clause. SQL Server
   only supports it as an aggregate (with GROUP BY). Migration requires a join-back.

7. **Window function in WHERE clause.** Neither Oracle nor SQL Server allows window
   functions in the WHERE clause. You must wrap in a subquery/CTE. This is the same in
   both, but worth remembering when migrating complex queries.

8. **Performance with unbounded frames.** `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED
   FOLLOWING` forces a full partition scan for every row. On million-row tables, this is
   expensive. Use the narrowest frame that meets your needs.

---

## Performance Considerations

- **Partition size matters.** A `PARTITION BY job_id` with 10,000 rows per partition is
  fine. A partition with 10 million rows will consume significant memory for sorting.
  Oracle may spill to temp tablespace; SQL Server spills to tempdb.

- **Index support.** An index on `(partition_col, order_col)` can eliminate sorts for
  analytic functions. In Oracle, the optimizer may use an index to provide the ordering.
  In SQL Server, look for Sort operators in the execution plan.

- **Multiple window functions.** If several analytic functions share the same `OVER`
  clause, Oracle and SQL Server can compute them in a single pass. When they differ, each
  requires a separate sort.

- **ROW_NUMBER vs RANK for Top N.** `ROW_NUMBER` is generally faster because it does not
  need to handle ties. Use `RANK` only when you need tie-aware behavior.

- **Avoid unnecessary OVER clauses.** `COUNT(*) OVER ()` on a 10-million-row table
  computes the total count for every row. If you just need the total, use a separate
  scalar subquery or variable.

- **MODEL clause performance.** The MODEL clause is notoriously slow for large datasets.
  If encountered in migration, rewrite with window functions or move the logic to
  application code.

---

## BNBuilders Context

Analytic functions are heavily used in construction data engineering:

- **Cost overrun detection**: `LAG` and running totals identify when cumulative costs
  exceed budget thresholds. CMiC reports use these to flag jobs that have crossed 80% or
  100% of their approved budget.

- **Deduplication in staging**: Oracle staging tables from field apps (daily reports,
  inspection forms) often have duplicate submissions. `ROW_NUMBER` partitioned by
  `(job_id, report_date, submitted_by)` ordered by `submission_time DESC` keeps the
  latest submission.

- **Cost code analysis**: `RATIO_TO_REPORT` (or its SQL Server equivalent) calculates
  what percentage of total job cost each cost code represents — critical for project
  managers comparing estimated vs actual cost distribution.

- **Equipment utilization**: `LEAD`/`LAG` on equipment checkout/return timestamps
  calculates idle time between assignments. This helps the equipment department optimize
  fleet allocation.

- **Period-over-period reporting**: Month-over-month cost comparisons using `LAG` feed
  into Power BI dashboards that project managers and executives review at BNBuilders.

- **Hierarchy rollup**: While CONNECT BY handles the hierarchy traversal, analytic
  functions with PARTITION BY are used to compute percentages and ranks within each
  level of the cost code hierarchy.

---

## Interview / Senior Dev Questions

1. **Q: What is the default window frame when ORDER BY is specified in an OVER clause?
   How does this affect LAST_VALUE?**
   A: The default is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. This means
   `LAST_VALUE` returns the current row's value (or a tied row's value with RANGE), not
   the actual last row in the partition. You must explicitly specify `ROWS BETWEEN
   UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` to get the true last value.

2. **Q: How do you migrate Oracle's KEEP (DENSE_RANK FIRST ORDER BY date) to SQL Server?**
   A: Use `FIRST_VALUE(col) OVER (PARTITION BY ... ORDER BY date ROWS BETWEEN UNBOUNDED
   PRECEDING AND UNBOUNDED FOLLOWING)`, or use a `CROSS APPLY` with `TOP 1`. The KEEP
   syntax has no direct SQL Server equivalent.

3. **Q: A running total query returns unexpected results — some rows show the same running
   total. What is likely wrong?**
   A: The ORDER BY column has duplicate values, and the default frame is `RANGE` (not
   `ROWS`). RANGE includes all tied rows, so multiple rows get the same cumulative sum.
   Fix by adding a tiebreaker column to the ORDER BY or switching to `ROWS`.

4. **Q: How would you calculate the median salary per department in SQL Server without
   PERCENTILE_CONT as an analytic function?**
   A: Use PERCENTILE_CONT as an aggregate with GROUP BY, then join back:
   ```sql
   SELECT d.*, med.median_sal
   FROM employees d
   JOIN (SELECT dept, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) AS median_sal
         FROM employees GROUP BY dept) med ON d.dept = med.dept
   ```
   Or use two ROW_NUMBER columns (ascending/descending) and average the middle values.

---

## Quiz

### Question 1
What is the default window frame when you specify ORDER BY in an analytic function's OVER
clause? Why does this matter for LAST_VALUE?

<details>
<summary>Show Answer</summary>

The default window frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. This
means `LAST_VALUE()` only looks from the start of the partition up to the current row, so
it always returns the current row's value (not the actual last row in the partition). To
get the true last value, you must specify `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED
FOLLOWING`.
</details>

### Question 2
Rewrite this Oracle query for SQL Server:
```sql
SELECT job_id,
       RATIO_TO_REPORT(amount) OVER (PARTITION BY job_id) AS pct
FROM cmic.job_cost_detail;
```

<details>
<summary>Show Answer</summary>

```sql
SELECT job_id,
       amount * 1.0 / SUM(amount) OVER (PARTITION BY job_id) AS pct
FROM cmic.job_cost_detail;
```

SQL Server does not have `RATIO_TO_REPORT`. The equivalent is dividing the value by the
`SUM` over the same partition. Multiply by `1.0` to avoid integer division.
</details>

### Question 3
Oracle sorts NULLs last (ascending) by default. SQL Server sorts NULLs first. How do you
make SQL Server match Oracle's behavior?

<details>
<summary>Show Answer</summary>

Add a CASE expression to the ORDER BY:

```sql
ORDER BY CASE WHEN col IS NULL THEN 1 ELSE 0 END, col ASC
```

This sorts non-NULL values first (0 before 1), then NULL values at the end. Oracle
natively supports `ORDER BY col ASC NULLS LAST`, but SQL Server does not have the
`NULLS LAST` syntax.
</details>

### Question 4
What does `KEEP (DENSE_RANK FIRST ORDER BY entry_date)` do in Oracle, and how would you
replicate it in SQL Server?

<details>
<summary>Show Answer</summary>

`KEEP (DENSE_RANK FIRST ORDER BY entry_date)` selects value(s) from the row(s) that have
the lowest `entry_date`. If used with `MIN(amount)`, it returns the minimum amount among
the rows with the earliest date.

In SQL Server, use `FIRST_VALUE`:
```sql
FIRST_VALUE(amount) OVER (PARTITION BY job_id ORDER BY entry_date
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
```

Or use `CROSS APPLY` / subquery with `TOP 1 ORDER BY entry_date`.
</details>
