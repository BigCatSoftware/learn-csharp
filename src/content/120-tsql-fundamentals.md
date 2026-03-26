# T-SQL Fundamentals Review

*Chapter 9.1 — T-SQL for Data Engineers*

## Overview

If you are a Data Engineer at a construction company running a Microsoft stack, T-SQL is the language you think in. Every ETL pipeline you build, every BI report you feed, every data quality check you run comes down to well-written SQL. This lesson is not a beginner introduction. It is a structured review of the fundamentals that senior DEs must have at instant recall: SELECT pipelines, all join types including APPLY, SET operations, and the subquery-vs-join decision. We ground every concept in the kind of tables you actually touch — job costs, projects, budgets, vendors, purchase orders, and change orders.

## Core Concepts

### The Logical Query Processing Order

T-SQL has a specific logical evaluation order that differs from the order you write clauses. Understanding this order is what separates a DE who guesses from one who knows.

```
1. FROM        (including JOINs)
2. WHERE
3. GROUP BY
4. HAVING
5. SELECT      (including expressions, aliases)
6. DISTINCT
7. ORDER BY
8. TOP / OFFSET-FETCH
```

This is why you cannot reference a column alias from SELECT in your WHERE clause — WHERE is evaluated before SELECT. You *can* reference a SELECT alias in ORDER BY because ORDER BY runs last.

### SELECT, WHERE, and Filtering

The SELECT clause projects columns. WHERE filters rows before grouping.

```sql
SELECT
    p.ProjectNumber,
    p.ProjectName,
    jc.CostCode,
    jc.Amount
FROM dbo.Project AS p
INNER JOIN dbo.JobCost AS jc ON jc.ProjectID = p.ProjectID
WHERE jc.PostingDate >= '2025-01-01'
  AND jc.CostType = 'L'          -- Labor costs only
  AND p.IsActive = 1;
```

Key filtering principles:
- Use **SARGable** predicates. `WHERE YEAR(PostingDate) = 2025` cannot use an index on PostingDate. Rewrite as a range.
- Avoid functions on indexed columns in WHERE.
- Use `IS NULL` / `IS NOT NULL`, never `= NULL`.

### JOIN Types — Complete Reference

#### INNER JOIN
Returns only rows that match in both tables.

```sql
-- All job costs that have a matching budget line
SELECT jc.CostCode, jc.Amount, b.BudgetAmount
FROM dbo.JobCost AS jc
INNER JOIN dbo.Budget AS b
    ON b.ProjectID = jc.ProjectID
   AND b.CostCode  = jc.CostCode;
```

#### LEFT OUTER JOIN
Returns all rows from the left table; NULLs where the right has no match.

```sql
-- All budget lines, even those with zero spend
SELECT
    b.ProjectID,
    b.CostCode,
    b.BudgetAmount,
    ISNULL(SUM(jc.Amount), 0) AS ActualSpend
FROM dbo.Budget AS b
LEFT JOIN dbo.JobCost AS jc
    ON jc.ProjectID = b.ProjectID
   AND jc.CostCode  = b.CostCode
GROUP BY b.ProjectID, b.CostCode, b.BudgetAmount;
```

#### RIGHT OUTER JOIN
Same as LEFT but preserves the right table. Rarely used — most DEs just flip the table order and use LEFT JOIN for readability.

#### FULL OUTER JOIN
Preserves unmatched rows from both sides. Essential for reconciliation queries.

```sql
-- Reconcile Oracle source vs SQL Server target after migration
SELECT
    COALESCE(src.JobCostID, tgt.JobCostID) AS JobCostID,
    src.Amount  AS Oracle_Amount,
    tgt.Amount  AS SQLServer_Amount,
    CASE
        WHEN src.JobCostID IS NULL THEN 'Missing in Oracle'
        WHEN tgt.JobCostID IS NULL THEN 'Missing in SQL Server'
        WHEN src.Amount <> tgt.Amount THEN 'Amount Mismatch'
        ELSE 'Match'
    END AS ReconciliationStatus
FROM OracleStaging.dbo.JobCost AS src
FULL OUTER JOIN dbo.JobCost AS tgt
    ON tgt.JobCostID = src.JobCostID;
```

#### CROSS JOIN
Cartesian product. Every row in the left matches every row in the right.

```sql
-- Generate a scaffold of all projects x all cost codes (for budget templates)
SELECT
    p.ProjectID,
    p.ProjectNumber,
    cc.CostCode,
    cc.CostCodeDescription
FROM dbo.Project AS p
CROSS JOIN dbo.CostCode AS cc
WHERE p.IsActive = 1;
```

#### CROSS APPLY and OUTER APPLY

APPLY is like a correlated join to a table-valued expression. CROSS APPLY behaves like INNER JOIN (no match = row dropped). OUTER APPLY behaves like LEFT JOIN (no match = NULLs).

```sql
-- For each project, get the top 3 most expensive change orders
SELECT
    p.ProjectNumber,
    p.ProjectName,
    co.ChangeOrderNumber,
    co.Amount
FROM dbo.Project AS p
CROSS APPLY (
    SELECT TOP 3
        ChangeOrderNumber,
        Amount
    FROM dbo.ChangeOrder AS c
    WHERE c.ProjectID = p.ProjectID
    ORDER BY c.Amount DESC
) AS co;
```

```sql
-- OUTER APPLY: keep projects even if they have no change orders
SELECT
    p.ProjectNumber,
    p.ProjectName,
    co.ChangeOrderNumber,
    co.Amount
FROM dbo.Project AS p
OUTER APPLY (
    SELECT TOP 3
        ChangeOrderNumber,
        Amount
    FROM dbo.ChangeOrder AS c
    WHERE c.ProjectID = p.ProjectID
    ORDER BY c.Amount DESC
) AS co;
```

APPLY is invaluable when you need to call a table-valued function per row or when you need TOP N per group without window functions.

### GROUP BY and HAVING

GROUP BY collapses rows by grouping columns. HAVING filters *after* aggregation.

```sql
-- Cost codes where actual spend exceeds budget by more than 10%
SELECT
    b.ProjectID,
    b.CostCode,
    b.BudgetAmount,
    SUM(jc.Amount)          AS ActualSpend,
    SUM(jc.Amount) - b.BudgetAmount AS Variance
FROM dbo.Budget AS b
INNER JOIN dbo.JobCost AS jc
    ON jc.ProjectID = b.ProjectID
   AND jc.CostCode  = b.CostCode
GROUP BY b.ProjectID, b.CostCode, b.BudgetAmount
HAVING SUM(jc.Amount) > b.BudgetAmount * 1.10
ORDER BY Variance DESC;
```

Common mistake: putting aggregate filters in WHERE instead of HAVING. WHERE runs before GROUP BY, so `WHERE SUM(jc.Amount) > 1000` is a syntax error.

### ORDER BY

ORDER BY is the only clause that can reference SELECT aliases. It can also reference column ordinal positions, but that is fragile and discouraged.

```sql
SELECT ProjectNumber, SUM(Amount) AS TotalCost
FROM dbo.JobCost AS jc
INNER JOIN dbo.Project AS p ON p.ProjectID = jc.ProjectID
GROUP BY ProjectNumber
ORDER BY TotalCost DESC;    -- alias works here
```

### SET Operations

#### UNION / UNION ALL
Combine result sets vertically. UNION removes duplicates (expensive sort). UNION ALL keeps everything.

```sql
-- Combine current-year and archived job costs
SELECT ProjectID, CostCode, Amount, PostingDate
FROM dbo.JobCost
WHERE PostingDate >= '2025-01-01'

UNION ALL

SELECT ProjectID, CostCode, Amount, PostingDate
FROM dbo.JobCostArchive
WHERE PostingDate >= '2025-01-01';
```

Rule of thumb: always use UNION ALL unless you specifically need deduplication. In ETL pipelines, you almost always want UNION ALL.

#### INTERSECT
Returns rows that exist in both result sets.

```sql
-- Cost codes used in BOTH Project 1001 and Project 1002
SELECT CostCode
FROM dbo.JobCost WHERE ProjectID = 1001
INTERSECT
SELECT CostCode
FROM dbo.JobCost WHERE ProjectID = 1002;
```

INTERSECT treats NULLs as equal, unlike a regular join on nullable columns.

#### EXCEPT
Returns rows in the first set that are not in the second set.

```sql
-- Cost codes in the budget that have zero actuals (never invoiced)
SELECT CostCode FROM dbo.Budget WHERE ProjectID = 1001
EXCEPT
SELECT CostCode FROM dbo.JobCost WHERE ProjectID = 1001;
```

### Subqueries vs Joins

**Correlated subquery** — re-executes for each outer row:

```sql
-- Projects where the latest job cost entry exceeds $100K
SELECT p.ProjectNumber, p.ProjectName
FROM dbo.Project AS p
WHERE EXISTS (
    SELECT 1
    FROM dbo.JobCost AS jc
    WHERE jc.ProjectID = p.ProjectID
      AND jc.Amount > 100000
);
```

**Derived table (inline subquery)** — evaluated once, joined:

```sql
SELECT p.ProjectNumber, agg.TotalSpend
FROM dbo.Project AS p
INNER JOIN (
    SELECT ProjectID, SUM(Amount) AS TotalSpend
    FROM dbo.JobCost
    GROUP BY ProjectID
) AS agg ON agg.ProjectID = p.ProjectID
WHERE agg.TotalSpend > 500000;
```

**Decision guide:**
| Scenario | Preferred approach |
|---|---|
| Existence check | `EXISTS` subquery |
| Need columns from both sides | JOIN or derived table |
| TOP N per group | CROSS APPLY or window function |
| Simple lookup | JOIN |
| Complex pre-aggregation | CTE or derived table |

## Code Examples

### Real-World: Project Cost Summary Report

```sql
-- Full project cost summary with budget, actuals, committed, and variance
SELECT
    p.ProjectNumber,
    p.ProjectName,
    p.Region,
    b.CostCode,
    cc.CostCodeDescription,
    b.BudgetAmount                                      AS OriginalBudget,
    ISNULL(co_sum.ApprovedCOAmount, 0)                  AS ApprovedChanges,
    b.BudgetAmount + ISNULL(co_sum.ApprovedCOAmount, 0) AS RevisedBudget,
    ISNULL(act.ActualSpend, 0)                          AS ActualToDate,
    ISNULL(cmt.CommittedCost, 0)                        AS CommittedCost,
    (b.BudgetAmount + ISNULL(co_sum.ApprovedCOAmount, 0))
        - ISNULL(act.ActualSpend, 0)
        - ISNULL(cmt.CommittedCost, 0)                  AS ProjectedVariance
FROM dbo.Budget AS b
INNER JOIN dbo.Project AS p
    ON p.ProjectID = b.ProjectID
INNER JOIN dbo.CostCode AS cc
    ON cc.CostCode = b.CostCode
LEFT JOIN (
    SELECT ProjectID, CostCode, SUM(Amount) AS ActualSpend
    FROM dbo.JobCost
    WHERE CostType IN ('L', 'M', 'S', 'E')   -- Labor, Material, Sub, Equipment
    GROUP BY ProjectID, CostCode
) AS act
    ON act.ProjectID = b.ProjectID AND act.CostCode = b.CostCode
LEFT JOIN (
    SELECT ProjectID, CostCode, SUM(RemainingAmount) AS CommittedCost
    FROM dbo.PurchaseOrder
    WHERE POStatus = 'Open'
    GROUP BY ProjectID, CostCode
) AS cmt
    ON cmt.ProjectID = b.ProjectID AND cmt.CostCode = b.CostCode
LEFT JOIN (
    SELECT ProjectID, CostCode, SUM(Amount) AS ApprovedCOAmount
    FROM dbo.ChangeOrder
    WHERE Status = 'Approved'
    GROUP BY ProjectID, CostCode
) AS co_sum
    ON co_sum.ProjectID = b.ProjectID AND co_sum.CostCode = b.CostCode
WHERE p.IsActive = 1
ORDER BY p.ProjectNumber, b.CostCode;
```

### Real-World: Vendor Spend Analysis with APPLY

```sql
-- For each vendor, get their top 5 invoices across all projects
SELECT
    v.VendorName,
    v.VendorType,
    inv.InvoiceNumber,
    inv.ProjectNumber,
    inv.InvoiceAmount,
    inv.InvoiceDate
FROM dbo.Vendor AS v
CROSS APPLY (
    SELECT TOP 5
        i.InvoiceNumber,
        p.ProjectNumber,
        i.InvoiceAmount,
        i.InvoiceDate
    FROM dbo.Invoice AS i
    INNER JOIN dbo.Project AS p ON p.ProjectID = i.ProjectID
    WHERE i.VendorID = v.VendorID
      AND i.InvoiceStatus = 'Paid'
    ORDER BY i.InvoiceAmount DESC
) AS inv
WHERE v.IsActive = 1
ORDER BY v.VendorName, inv.InvoiceAmount DESC;
```

## Common Patterns

### Anti-join (find rows with no match)

```sql
-- Budget lines with no actuals (LEFT JOIN + IS NULL pattern)
SELECT b.ProjectID, b.CostCode
FROM dbo.Budget AS b
LEFT JOIN dbo.JobCost AS jc
    ON jc.ProjectID = b.ProjectID
   AND jc.CostCode  = b.CostCode
WHERE jc.ProjectID IS NULL;
```

Equivalent with NOT EXISTS (often better optimized):

```sql
SELECT b.ProjectID, b.CostCode
FROM dbo.Budget AS b
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.JobCost AS jc
    WHERE jc.ProjectID = b.ProjectID
      AND jc.CostCode  = b.CostCode
);
```

### Semi-join (EXISTS)

```sql
-- Projects that have at least one open purchase order
SELECT p.ProjectNumber, p.ProjectName
FROM dbo.Project AS p
WHERE EXISTS (
    SELECT 1
    FROM dbo.PurchaseOrder AS po
    WHERE po.ProjectID = p.ProjectID
      AND po.POStatus = 'Open'
);
```

### Conditional aggregation

```sql
SELECT
    ProjectID,
    SUM(CASE WHEN CostType = 'L' THEN Amount ELSE 0 END) AS LaborCost,
    SUM(CASE WHEN CostType = 'M' THEN Amount ELSE 0 END) AS MaterialCost,
    SUM(CASE WHEN CostType = 'S' THEN Amount ELSE 0 END) AS SubcontractCost,
    SUM(CASE WHEN CostType = 'E' THEN Amount ELSE 0 END) AS EquipmentCost,
    SUM(Amount)                                            AS TotalCost
FROM dbo.JobCost
GROUP BY ProjectID;
```

## Gotchas and Pitfalls

1. **NULL arithmetic** — Any arithmetic with NULL returns NULL. `100 + NULL = NULL`. Use `ISNULL()` or `COALESCE()` to guard against this in cost calculations.

2. **Implicit conversions** — Joining a `VARCHAR` column to an `NVARCHAR` column forces an implicit conversion, which can kill index usage. Oracle migrations often introduce this when source columns are VARCHAR2 and targets are NVARCHAR.

3. **UNION vs UNION ALL** — Using UNION when you mean UNION ALL forces a DISTINCT sort. On a 10-million-row job cost archive, that is a massive performance hit for no benefit.

4. **Predicate placement with OUTER JOINs** — Putting a filter on the RIGHT table of a LEFT JOIN in the WHERE clause converts it to an INNER JOIN. Put the filter in the ON clause instead:

```sql
-- WRONG: this becomes an inner join
SELECT p.*, jc.Amount
FROM dbo.Project AS p
LEFT JOIN dbo.JobCost AS jc ON jc.ProjectID = p.ProjectID
WHERE jc.CostType = 'L';

-- RIGHT: filter stays in ON clause
SELECT p.*, jc.Amount
FROM dbo.Project AS p
LEFT JOIN dbo.JobCost AS jc
    ON jc.ProjectID = p.ProjectID
   AND jc.CostType = 'L';
```

5. **Non-deterministic TOP without ORDER BY** — `SELECT TOP 10 * FROM dbo.JobCost` returns an arbitrary set. Always pair TOP with ORDER BY.

6. **COUNT(*) vs COUNT(column)** — `COUNT(*)` counts all rows. `COUNT(column)` skips NULLs. If a nullable column has NULLs, these return different numbers and both are "correct" depending on what you mean.

## Performance Considerations

- **SARGability** — Ensure your WHERE predicates can seek an index. Avoid wrapping indexed columns in functions. Instead of `WHERE CAST(PostingDate AS DATE) = '2025-06-01'`, use `WHERE PostingDate >= '2025-06-01' AND PostingDate < '2025-06-02'`.
- **Join order** — The query optimizer usually picks the best join order, but bad statistics or stale stats can lead to poor plans. Run `UPDATE STATISTICS` on large tables after bulk loads.
- **EXISTS vs IN** — For large outer sets with small inner sets, IN is fine. For large inner sets, EXISTS often short-circuits faster. The optimizer usually rewrites one to the other, but not always.
- **UNION ALL over UNION** — Avoid the dedup sort when you know the sets are disjoint (e.g., different date ranges from partitioned tables).
- **Avoid SELECT *** — In production queries, always list columns. SELECT * prevents covering index usage and increases I/O.

## BNBuilders Context

At BNBuilders, the core data model revolves around:
- **Project** — each construction project (schools, commercial buildings, tenant improvements)
- **JobCost** — the central fact table; every dollar spent flows through here with CostCode, CostType, Phase, PostingDate
- **Budget** — the original and revised budget lines per project/cost code
- **Vendor** — subcontractors, suppliers, equipment rental companies
- **PurchaseOrder / ChangeOrder** — committed costs and approved changes
- **CMiC** — the ERP system (runs on Oracle); data is replicated or migrated to SQL Server for BI

Common DE tasks using these fundamentals:
- **Cost-to-budget variance reports** — multi-join queries across Budget, JobCost, ChangeOrder, PurchaseOrder
- **Oracle-to-SQL Server reconciliation** — FULL OUTER JOINs comparing staging tables to production
- **Vendor spend aggregation** — GROUP BY with conditional aggregation, fed into Power BI
- **Data quality checks** — anti-joins to find orphan records (job costs without a project, POs without a vendor)
- **CMiC data extraction** — linked server queries from SQL Server to Oracle, using OPENQUERY for performance

```sql
-- Linked server query to Oracle (CMiC) via OPENQUERY for performance
SELECT *
FROM OPENQUERY(CMIC_ORACLE,
    'SELECT PROJECT_ID, COST_CODE, AMOUNT, POSTING_DATE
     FROM CMIC.JOB_COST
     WHERE POSTING_DATE >= DATE ''2025-01-01''')
AS oq;
```

## Interview / Senior Dev Questions

**Q1: When would you choose CROSS APPLY over a LEFT JOIN with a subquery?**

CROSS APPLY is the right choice when you need to reference the outer row inside a table-valued expression — for example, TOP N per group, calling a table-valued function per row, or any scenario where the inner query is correlated and returns a set. LEFT JOIN with a derived table does not allow correlation to the outer query. CROSS APPLY also tends to produce cleaner execution plans for "top N per group" patterns compared to ROW_NUMBER alternatives on very wide tables.

**Q2: A developer writes `SELECT * FROM JobCost WHERE YEAR(PostingDate) = 2025`. What is wrong and how do you fix it?**

The YEAR() function wraps the indexed column, making the predicate non-SARGable. The optimizer cannot seek the index; it must scan. The fix is to rewrite as a range predicate: `WHERE PostingDate >= '2025-01-01' AND PostingDate < '2026-01-01'`. This allows an index seek on PostingDate.

**Q3: Explain the difference between WHERE and HAVING. Can HAVING exist without GROUP BY?**

WHERE filters individual rows before grouping. HAVING filters groups after aggregation. Technically, HAVING can exist without GROUP BY — the entire result set is treated as a single group — but this is an unusual pattern. A practical example: `SELECT 1 HAVING COUNT(*) > 0` returns 1 if the implicit group (all rows) has at least one row.

**Q4: In an Oracle-to-SQL Server migration, you see row count mismatches after a bulk load. Walk through your debugging approach.**

First, run a FULL OUTER JOIN between the Oracle staging table and the SQL Server target on the natural key, then categorize mismatches: rows only in source, rows only in target, rows with value differences. Check for implicit conversion issues (VARCHAR2 vs NVARCHAR, DATE precision). Check for trailing spaces in string keys (Oracle pads CHAR types). Verify that the ETL did not silently drop rows due to constraint violations by checking the error output table. Finally, compare COUNT(*) and SUM(Amount) as quick checksums before diving into row-level detail.

## Quiz

**1. What is the logical evaluation order of a SELECT statement?**

<details>
<summary>Show Answer</summary>

FROM (including JOINs) -> WHERE -> GROUP BY -> HAVING -> SELECT -> DISTINCT -> ORDER BY -> TOP/OFFSET-FETCH. This is why you cannot use a column alias defined in SELECT inside a WHERE clause.
</details>

**2. You LEFT JOIN table A to table B, then add `WHERE B.Status = 'Active'` to the WHERE clause. What happens to rows in A that have no match in B?**

<details>
<summary>Show Answer</summary>

They are eliminated. When there is no match in B, all B columns are NULL, so `B.Status = 'Active'` evaluates to UNKNOWN (NULL = 'Active'), and the row is filtered out. This effectively converts the LEFT JOIN into an INNER JOIN. To preserve the outer join behavior, move the filter into the ON clause: `LEFT JOIN B ON ... AND B.Status = 'Active'`.
</details>

**3. When should you use UNION ALL instead of UNION?**

<details>
<summary>Show Answer</summary>

Use UNION ALL whenever you know the result sets are disjoint or when you do not need deduplication. UNION forces a sort or hash to remove duplicates, which is expensive on large datasets. In ETL pipelines combining data from partitioned tables or different date ranges, UNION ALL is almost always correct.
</details>

**4. Write a query to find all cost codes that exist in the Budget table for Project 1001 but have no corresponding entries in the JobCost table.**

<details>
<summary>Show Answer</summary>

```sql
-- Using EXCEPT
SELECT CostCode
FROM dbo.Budget
WHERE ProjectID = 1001
EXCEPT
SELECT CostCode
FROM dbo.JobCost
WHERE ProjectID = 1001;

-- Using NOT EXISTS
SELECT DISTINCT b.CostCode
FROM dbo.Budget AS b
WHERE b.ProjectID = 1001
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.JobCost AS jc
      WHERE jc.ProjectID = b.ProjectID
        AND jc.CostCode  = b.CostCode
  );
```

Both approaches work. EXCEPT is more concise. NOT EXISTS is more flexible when you need additional columns from the Budget table.
</details>

**5. A query joining Project, JobCost, Budget, and Vendor runs slowly. The execution plan shows a hash join with a large memory grant. What are your first three things to check?**

<details>
<summary>Show Answer</summary>

1. **Statistics** — Are they up to date? Stale statistics cause the optimizer to choose hash joins because it underestimates row counts. Run `UPDATE STATISTICS` on the tables involved.
2. **Indexes** — Are there indexes on the join columns (ProjectID, CostCode, VendorID)? Missing indexes force table scans, which lead to hash joins.
3. **Data types** — Are join columns the same data type on both sides? Implicit conversions (e.g., VARCHAR to NVARCHAR) prevent index seeks and inflate memory grants. Check with `SET STATISTICS PROFILE ON` or look for CONVERT_IMPLICIT warnings in the plan.
</details>
