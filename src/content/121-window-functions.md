# Window Functions in T-SQL

*Chapter 9.2 — T-SQL for Data Engineers*

## Overview

Window functions are the single most important T-SQL feature for a Data Engineer. They let you compute aggregations, rankings, and row comparisons without collapsing your result set. Before window functions, you needed self-joins, correlated subqueries, or cursors for things like running totals, previous-row comparisons, and top-N-per-group. Now you write one OVER clause and the engine handles it. At BNBuilders, you will use window functions daily: ranking vendors by spend, computing running cost totals per project, detecting month-over-month cost spikes, and building cumulative budget burn-down curves for BI dashboards.

## Core Concepts

### The OVER Clause

Every window function uses the OVER clause to define its "window" — the set of rows it operates on. The OVER clause has three optional components:

```
function_name(...) OVER (
    [PARTITION BY columns]     -- divide rows into groups
    [ORDER BY columns]         -- define row order within each partition
    [ROWS|RANGE frame_spec]    -- limit the window frame
)
```

- **PARTITION BY** — like GROUP BY, but does not collapse rows. Each partition is an independent window.
- **ORDER BY** — defines the logical order within each partition. Required for ranking and offset functions.
- **Frame specification** — defines which rows relative to the current row are included in the calculation.

### Ranking Functions

#### ROW_NUMBER()

Assigns a unique sequential integer to each row within a partition. No ties — if two rows are equal, the assignment is non-deterministic unless the ORDER BY is fully deterministic.

```sql
-- Number each job cost entry per project, ordered by posting date
SELECT
    ProjectID,
    CostCode,
    Amount,
    PostingDate,
    ROW_NUMBER() OVER (
        PARTITION BY ProjectID
        ORDER BY PostingDate, JobCostID  -- JobCostID breaks ties
    ) AS RowNum
FROM dbo.JobCost;
```

#### RANK()

Like ROW_NUMBER but ties get the same rank, and the next rank skips. If two rows tie at rank 2, the next row is rank 4.

```sql
-- Rank vendors by total spend per project (ties get same rank)
SELECT
    ProjectID,
    VendorID,
    TotalSpend,
    RANK() OVER (
        PARTITION BY ProjectID
        ORDER BY TotalSpend DESC
    ) AS SpendRank
FROM (
    SELECT ProjectID, VendorID, SUM(Amount) AS TotalSpend
    FROM dbo.JobCost
    WHERE CostType = 'S'   -- subcontractor costs
    GROUP BY ProjectID, VendorID
) AS vendor_spend;
```

#### DENSE_RANK()

Like RANK but no gaps. If two rows tie at rank 2, the next row is rank 3.

```sql
-- Dense rank cost codes by total spend (no gaps in ranking)
SELECT
    CostCode,
    SUM(Amount) AS TotalSpend,
    DENSE_RANK() OVER (ORDER BY SUM(Amount) DESC) AS DenseRank
FROM dbo.JobCost
GROUP BY CostCode;
```

#### NTILE(n)

Divides the partition into n roughly equal groups.

```sql
-- Divide projects into 4 quartiles by total cost
SELECT
    ProjectID,
    TotalCost,
    NTILE(4) OVER (ORDER BY TotalCost DESC) AS CostQuartile
FROM (
    SELECT ProjectID, SUM(Amount) AS TotalCost
    FROM dbo.JobCost
    GROUP BY ProjectID
) AS project_totals;
```

### Offset Functions

#### LAG and LEAD

LAG looks backward; LEAD looks forward. Essential for comparing a row to its predecessor or successor.

```sql
-- Compare each month's spend to the previous month per project
SELECT
    ProjectID,
    PostingMonth,
    MonthlySpend,
    LAG(MonthlySpend, 1, 0) OVER (
        PARTITION BY ProjectID
        ORDER BY PostingMonth
    ) AS PreviousMonthSpend,
    MonthlySpend - LAG(MonthlySpend, 1, 0) OVER (
        PARTITION BY ProjectID
        ORDER BY PostingMonth
    ) AS MonthOverMonthChange
FROM (
    SELECT
        ProjectID,
        DATEFROMPARTS(YEAR(PostingDate), MONTH(PostingDate), 1) AS PostingMonth,
        SUM(Amount) AS MonthlySpend
    FROM dbo.JobCost
    GROUP BY ProjectID, DATEFROMPARTS(YEAR(PostingDate), MONTH(PostingDate), 1)
) AS monthly;
```

LAG syntax: `LAG(column, offset, default)` — offset defaults to 1, default value defaults to NULL.

#### FIRST_VALUE and LAST_VALUE

Return the first or last value in the window frame.

```sql
-- For each cost entry, show the first and most recent amount for that cost code
SELECT
    ProjectID,
    CostCode,
    PostingDate,
    Amount,
    FIRST_VALUE(Amount) OVER (
        PARTITION BY ProjectID, CostCode
        ORDER BY PostingDate
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS FirstAmount,
    LAST_VALUE(Amount) OVER (
        PARTITION BY ProjectID, CostCode
        ORDER BY PostingDate
        ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
    ) AS LastAmount
FROM dbo.JobCost;
```

**Critical gotcha with LAST_VALUE**: The default frame is `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, which means LAST_VALUE returns the *current* row's value. You almost always want `ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING` or `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.

### Aggregate Window Functions

Any standard aggregate (SUM, AVG, COUNT, MIN, MAX) can be used as a window function.

```sql
-- Running total of spend per project, ordered by posting date
SELECT
    ProjectID,
    PostingDate,
    Amount,
    SUM(Amount) OVER (
        PARTITION BY ProjectID
        ORDER BY PostingDate
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS RunningTotal
FROM dbo.JobCost;
```

```sql
-- Percentage of total: each cost code's share of total project spend
SELECT
    ProjectID,
    CostCode,
    SUM(Amount) AS CodeSpend,
    SUM(SUM(Amount)) OVER (PARTITION BY ProjectID) AS ProjectTotal,
    CAST(
        SUM(Amount) * 100.0
        / SUM(SUM(Amount)) OVER (PARTITION BY ProjectID)
        AS DECIMAL(5,2)
    ) AS PctOfProject
FROM dbo.JobCost
GROUP BY ProjectID, CostCode;
```

### Frame Specifications

The frame determines which rows within the partition are included in the calculation relative to the current row.

**ROWS** — physical row count:
- `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — all rows from start to current (running total)
- `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` — 3-row window (moving average)
- `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` — entire partition

**RANGE** — logical value range:
- `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — default when ORDER BY is present
- RANGE treats ties as the same position, which means a running total with RANGE may include multiple rows at the same ORDER BY value

```sql
-- ROWS vs RANGE demonstration
-- If two rows have the same PostingDate:
-- ROWS running total: accumulates one row at a time
-- RANGE running total: accumulates all rows with the same date at once

-- ROWS-based running total (deterministic, preferred)
SELECT
    PostingDate,
    Amount,
    SUM(Amount) OVER (
        ORDER BY PostingDate
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS RunningTotal_Rows
FROM dbo.JobCost
WHERE ProjectID = 1001;

-- RANGE-based running total (ties are grouped together)
SELECT
    PostingDate,
    Amount,
    SUM(Amount) OVER (
        ORDER BY PostingDate
        RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS RunningTotal_Range
FROM dbo.JobCost
WHERE ProjectID = 1001;
```

### Moving Averages

```sql
-- 3-month moving average of monthly spend per project
SELECT
    ProjectID,
    PostingMonth,
    MonthlySpend,
    AVG(MonthlySpend) OVER (
        PARTITION BY ProjectID
        ORDER BY PostingMonth
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS MovingAvg3Month
FROM (
    SELECT
        ProjectID,
        DATEFROMPARTS(YEAR(PostingDate), MONTH(PostingDate), 1) AS PostingMonth,
        SUM(Amount) AS MonthlySpend
    FROM dbo.JobCost
    GROUP BY ProjectID, DATEFROMPARTS(YEAR(PostingDate), MONTH(PostingDate), 1)
) AS monthly;
```

## Code Examples

### Detecting Cost Spikes with LAG

```sql
-- Flag months where spend increased more than 50% over previous month
WITH monthly_spend AS (
    SELECT
        p.ProjectNumber,
        p.ProjectName,
        DATEFROMPARTS(YEAR(jc.PostingDate), MONTH(jc.PostingDate), 1) AS PostingMonth,
        SUM(jc.Amount) AS MonthlySpend
    FROM dbo.JobCost AS jc
    INNER JOIN dbo.Project AS p ON p.ProjectID = jc.ProjectID
    WHERE p.IsActive = 1
    GROUP BY p.ProjectNumber, p.ProjectName,
             DATEFROMPARTS(YEAR(jc.PostingDate), MONTH(jc.PostingDate), 1)
),
with_lag AS (
    SELECT
        *,
        LAG(MonthlySpend) OVER (
            PARTITION BY ProjectNumber ORDER BY PostingMonth
        ) AS PrevMonthSpend
    FROM monthly_spend
)
SELECT
    ProjectNumber,
    ProjectName,
    PostingMonth,
    PrevMonthSpend,
    MonthlySpend,
    CAST(
        (MonthlySpend - PrevMonthSpend) * 100.0 / NULLIF(PrevMonthSpend, 0)
        AS DECIMAL(10,2)
    ) AS PctChange
FROM with_lag
WHERE PrevMonthSpend > 0
  AND MonthlySpend > PrevMonthSpend * 1.50
ORDER BY ProjectNumber, PostingMonth;
```

### Top N Per Group with ROW_NUMBER

```sql
-- Top 3 highest-cost invoices per project
WITH ranked_invoices AS (
    SELECT
        p.ProjectNumber,
        v.VendorName,
        i.InvoiceNumber,
        i.InvoiceAmount,
        i.InvoiceDate,
        ROW_NUMBER() OVER (
            PARTITION BY i.ProjectID
            ORDER BY i.InvoiceAmount DESC
        ) AS rn
    FROM dbo.Invoice AS i
    INNER JOIN dbo.Project AS p ON p.ProjectID = i.ProjectID
    INNER JOIN dbo.Vendor AS v ON v.VendorID = i.VendorID
    WHERE i.InvoiceStatus = 'Paid'
)
SELECT *
FROM ranked_invoices
WHERE rn <= 3
ORDER BY ProjectNumber, rn;
```

### Cumulative Budget Burn-Down

```sql
-- Show how budget is consumed over time (for Power BI burn-down chart)
WITH daily_spend AS (
    SELECT
        ProjectID,
        PostingDate,
        SUM(Amount) AS DailySpend
    FROM dbo.JobCost
    GROUP BY ProjectID, PostingDate
),
cumulative AS (
    SELECT
        ds.ProjectID,
        ds.PostingDate,
        ds.DailySpend,
        SUM(ds.DailySpend) OVER (
            PARTITION BY ds.ProjectID
            ORDER BY ds.PostingDate
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS CumulativeSpend
    FROM daily_spend AS ds
)
SELECT
    p.ProjectNumber,
    b.TotalBudget,
    c.PostingDate,
    c.DailySpend,
    c.CumulativeSpend,
    b.TotalBudget - c.CumulativeSpend AS RemainingBudget,
    CAST(c.CumulativeSpend * 100.0 / NULLIF(b.TotalBudget, 0) AS DECIMAL(5,2)) AS PctBurned
FROM cumulative AS c
INNER JOIN dbo.Project AS p ON p.ProjectID = c.ProjectID
INNER JOIN (
    SELECT ProjectID, SUM(BudgetAmount) AS TotalBudget
    FROM dbo.Budget
    GROUP BY ProjectID
) AS b ON b.ProjectID = c.ProjectID
ORDER BY p.ProjectNumber, c.PostingDate;
```

### De-duplication with ROW_NUMBER

```sql
-- Remove duplicate vendor records from staging (keep most recently modified)
WITH dupes AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY VendorTaxID
            ORDER BY ModifiedDate DESC
        ) AS rn
    FROM staging.Vendor
)
DELETE FROM dupes WHERE rn > 1;
```

This is one of the most common ETL patterns. You can also use it to SELECT only the latest record per key without deleting.

## Common Patterns

### Running total with reset

```sql
-- Running total of costs per project, resetting at each new fiscal year
SELECT
    ProjectID,
    FiscalYear,
    PostingDate,
    Amount,
    SUM(Amount) OVER (
        PARTITION BY ProjectID, FiscalYear
        ORDER BY PostingDate
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS FYRunningTotal
FROM dbo.JobCost;
```

### Gaps and islands

```sql
-- Identify consecutive months with no spend (gaps in project activity)
WITH months_with_spend AS (
    SELECT DISTINCT
        ProjectID,
        DATEFROMPARTS(YEAR(PostingDate), MONTH(PostingDate), 1) AS ActiveMonth
    FROM dbo.JobCost
),
numbered AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY ProjectID ORDER BY ActiveMonth) AS rn,
        DATEADD(MONTH, -ROW_NUMBER() OVER (PARTITION BY ProjectID ORDER BY ActiveMonth), ActiveMonth) AS grp
    FROM months_with_spend
)
SELECT
    ProjectID,
    MIN(ActiveMonth) AS IslandStart,
    MAX(ActiveMonth) AS IslandEnd,
    DATEDIFF(MONTH, MIN(ActiveMonth), MAX(ActiveMonth)) + 1 AS ConsecutiveMonths
FROM numbered
GROUP BY ProjectID, grp
ORDER BY ProjectID, IslandStart;
```

### Median calculation

```sql
-- Median invoice amount per project using PERCENTILE_CONT
SELECT DISTINCT
    ProjectID,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY InvoiceAmount)
        OVER (PARTITION BY ProjectID) AS MedianInvoice
FROM dbo.Invoice
WHERE InvoiceStatus = 'Paid';
```

## Gotchas and Pitfalls

1. **Default frame with ORDER BY** — When you specify ORDER BY in an OVER clause without an explicit frame, the default is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. This means SUM(...) OVER (ORDER BY col) gives you a running total, not a partition total. If you want the full partition total with ORDER BY present, you must specify `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.

2. **LAST_VALUE default frame** — As mentioned above, LAST_VALUE with the default frame returns the current row. You almost always need to explicitly set the frame to `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.

3. **ROW_NUMBER ties** — ROW_NUMBER on a non-unique ORDER BY key produces non-deterministic numbering. Two runs of the same query may assign different row numbers to tied rows. Always add a tiebreaker column.

4. **Window functions in WHERE** — You cannot use a window function in a WHERE clause. The fix is to wrap in a CTE or derived table and filter in the outer query.

```sql
-- WRONG: window function in WHERE
SELECT * FROM dbo.JobCost
WHERE ROW_NUMBER() OVER (PARTITION BY ProjectID ORDER BY Amount DESC) <= 5;

-- RIGHT: wrap in CTE
WITH ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY ProjectID ORDER BY Amount DESC) AS rn
    FROM dbo.JobCost
)
SELECT * FROM ranked WHERE rn <= 5;
```

5. **Performance of multiple window functions** — Each distinct OVER clause definition may require a separate sort in the execution plan. If you have five window functions with five different PARTITION BY / ORDER BY combinations, expect five sorts. Try to align your OVER clauses to share the same sort.

## Performance Considerations

- **Sort cost** — Window functions require sorted data. The optimizer inserts Sort operators when no suitable index exists. For large tables, these sorts spill to TempDB. Create indexes that match your PARTITION BY + ORDER BY to provide pre-sorted data.
- **Index strategy** — For `PARTITION BY ProjectID ORDER BY PostingDate`, an index on `(ProjectID, PostingDate)` eliminates the sort.
- **Batch mode** — SQL Server 2019+ can use batch mode on rowstore for window functions (batch mode on rowstore), which dramatically speeds up window function computation. Ensure compatibility level is 150+.
- **Multiple passes** — If you need both `SUM(...) OVER (PARTITION BY A ORDER BY B)` and `RANK() OVER (PARTITION BY A ORDER BY C)`, these require different sorts. Consider whether you can restructure to use a single ordering.
- **Frame choice** — ROWS is generally faster than RANGE because RANGE must handle duplicates in the ORDER BY values. Always prefer ROWS unless you specifically need RANGE semantics.

## BNBuilders Context

Window functions are the backbone of construction BI reporting at BNBuilders:

- **Budget burn-down curves** — `SUM(Amount) OVER (PARTITION BY ProjectID ORDER BY PostingDate ROWS UNBOUNDED PRECEDING)` creates the cumulative spend line that PMs compare against the S-curve.
- **Vendor ranking** — `RANK() OVER (PARTITION BY ProjectID ORDER BY TotalSpend DESC)` identifies top subcontractors per project for rebate negotiations.
- **Cost spike detection** — `LAG(MonthlySpend) OVER (PARTITION BY ProjectID ORDER BY Month)` feeds alerts when monthly spend jumps abnormally.
- **Deduplication after CMiC extract** — Oracle extracts often contain duplicate records from multi-table joins. `ROW_NUMBER() OVER (PARTITION BY NaturalKey ORDER BY ModifiedDate DESC)` keeps the freshest.
- **Percentage-of-completion** — `CumulativeSpend / TotalBudget` per project is a core construction accounting metric. Window functions make it easy to compute at any date granularity.
- **Equipment utilization trends** — `AVG(HoursUsed) OVER (PARTITION BY EquipmentID ORDER BY WeekDate ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)` gives a 4-week moving average of equipment usage.

## Interview / Senior Dev Questions

**Q1: What is the difference between RANK, DENSE_RANK, and ROW_NUMBER? When would you choose each?**

ROW_NUMBER always assigns unique sequential numbers — no ties. RANK allows ties but leaves gaps (1, 2, 2, 4). DENSE_RANK allows ties without gaps (1, 2, 2, 3). Use ROW_NUMBER when you need exactly N rows per group (top-N queries, deduplication). Use RANK when you want a natural ranking where ties are meaningful and gaps show the true position. Use DENSE_RANK when you need tied ranks but downstream logic depends on contiguous rank values (e.g., "show the top 3 cost tiers" where ties should not consume a tier slot).

**Q2: Explain the difference between ROWS and RANGE frame specifications. Give a scenario where choosing the wrong one produces incorrect results.**

ROWS counts physical rows. RANGE groups rows with equal ORDER BY values. If your ORDER BY column has duplicates (e.g., two transactions on the same date), a RANGE-based running total will include both rows in the same frame step, causing the running total to "jump" past them. With ROWS, each row is accumulated individually. For a running total on a financial ledger where posting dates repeat, ROWS gives the correct incremental accumulation. RANGE would show the same cumulative value for all rows sharing a date, which looks wrong in a row-level report.

**Q3: You need a running total on a 50-million-row table and it's slow. How do you optimize it?**

First, create a nonclustered index that matches the PARTITION BY and ORDER BY columns of the window function, with the aggregated column INCLUDEd. This eliminates the Sort operator. Second, ensure the database compatibility level is 150+ (SQL Server 2019) to enable batch mode on rowstore, which processes window functions in vectorized batches instead of row-by-row. Third, if the window function has a single PARTITION BY + ORDER BY, verify there is only one Sort in the plan — multiple window functions with different orderings cause multiple sorts. Fourth, if TempDB spills are occurring, consider partitioning the computation by processing date ranges in chunks.

**Q4: Can you use a window function in a WHERE clause? Why or why not?**

No. Window functions are evaluated during the SELECT phase of logical query processing, which runs after WHERE. By the time window functions execute, rows have already been filtered. To filter on a window function result, wrap the query in a CTE or derived table and apply the filter in the outer query's WHERE clause.

## Quiz

**1. What is the default frame specification when you include ORDER BY in an OVER clause but do not specify a frame?**

<details>
<summary>Show Answer</summary>

`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. This is important because it means `SUM(Amount) OVER (ORDER BY PostingDate)` gives a running total (not a full partition total), and it uses RANGE semantics, which groups ties together. To get a partition-wide total, omit ORDER BY or explicitly specify `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.
</details>

**2. You write `LAST_VALUE(Amount) OVER (PARTITION BY ProjectID ORDER BY PostingDate)` and it returns the current row's Amount for every row. Why?**

<details>
<summary>Show Answer</summary>

The default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. LAST_VALUE within that frame is always the current row, because the frame ends at the current row. To get the actual last value in the partition, change the frame to `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` or `ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING`.
</details>

**3. Write a query that returns the top 2 most expensive invoices per project using a window function.**

<details>
<summary>Show Answer</summary>

```sql
WITH ranked AS (
    SELECT
        ProjectID,
        InvoiceNumber,
        InvoiceAmount,
        ROW_NUMBER() OVER (
            PARTITION BY ProjectID
            ORDER BY InvoiceAmount DESC
        ) AS rn
    FROM dbo.Invoice
)
SELECT ProjectID, InvoiceNumber, InvoiceAmount
FROM ranked
WHERE rn <= 2
ORDER BY ProjectID, rn;
```

Use ROW_NUMBER (not RANK) if you want exactly 2 rows per project even when there are ties. Use RANK or DENSE_RANK if ties should all be included.
</details>

**4. You have five window functions in a single query, each with a different PARTITION BY and ORDER BY. What is the performance concern?**

<details>
<summary>Show Answer</summary>

Each distinct OVER specification requires a separate Sort operator in the execution plan. Five different PARTITION BY / ORDER BY combinations means up to five sorts on the full dataset. On large tables this causes significant CPU usage and TempDB spills. Mitigation strategies: (1) align window specifications so multiple functions share the same OVER clause, (2) create indexes that pre-sort the data for the most expensive sort, (3) break the query into multiple CTEs that each handle one window specification, allowing the optimizer more flexibility.
</details>

**5. How does SQL Server 2019's "batch mode on rowstore" affect window function performance?**

<details>
<summary>Show Answer</summary>

Prior to SQL Server 2019, window functions on rowstore tables were processed in row mode — one row at a time. Batch mode on rowstore (available at compatibility level 150+) processes window functions in batches of ~900 rows using vectorized operations, which can improve performance by 2-5x or more on analytical queries. This was previously only available for columnstore indexes. The optimizer automatically chooses batch mode when it estimates sufficient row counts. You can verify by checking the execution plan for "batch mode" on Window Spool and Sort operators.
</details>
