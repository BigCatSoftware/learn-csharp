# Common Table Expressions (CTEs)

*Chapter 9.3 — T-SQL for Data Engineers*

## Overview

CTEs are named, temporary result sets that exist only for the duration of a single statement. They make complex queries readable, enable recursive traversal of hierarchical data, and let you break multi-step transformations into named logical steps. For a Data Engineer at a construction company, CTEs are essential for two reasons: first, construction data is inherently hierarchical (Work Breakdown Structures, org charts, cost code trees, Bills of Materials), and recursive CTEs are the cleanest way to traverse those hierarchies. Second, ETL transformations often involve multiple stages of filtering, joining, and aggregating — CTEs let you name each stage instead of nesting five levels of subqueries.

## Core Concepts

### Non-Recursive CTEs

A CTE is defined with the `WITH` keyword, followed by a name, optional column list, and the query body.

```sql
WITH project_spend AS (
    SELECT
        ProjectID,
        SUM(Amount) AS TotalSpend
    FROM dbo.JobCost
    GROUP BY ProjectID
)
SELECT
    p.ProjectNumber,
    p.ProjectName,
    ps.TotalSpend
FROM dbo.Project AS p
INNER JOIN project_spend AS ps ON ps.ProjectID = p.ProjectID
WHERE ps.TotalSpend > 1000000
ORDER BY ps.TotalSpend DESC;
```

Key properties of non-recursive CTEs:
- Scoped to a single statement (the immediately following SELECT, INSERT, UPDATE, DELETE, or MERGE).
- Not materialized — the optimizer inlines the CTE definition into the main query, just like a derived table.
- Can reference other CTEs defined earlier in the same WITH block.
- Can be referenced multiple times in the outer query (but each reference may be re-evaluated).

### Multiple CTEs in One Query

You can chain CTEs by separating them with commas. Each CTE can reference any CTE defined before it.

```sql
WITH
-- Step 1: Aggregate job costs per project/cost code
actuals AS (
    SELECT
        ProjectID,
        CostCode,
        SUM(Amount) AS ActualSpend
    FROM dbo.JobCost
    GROUP BY ProjectID, CostCode
),
-- Step 2: Aggregate committed costs (open POs)
committed AS (
    SELECT
        ProjectID,
        CostCode,
        SUM(RemainingAmount) AS CommittedCost
    FROM dbo.PurchaseOrder
    WHERE POStatus = 'Open'
    GROUP BY ProjectID, CostCode
),
-- Step 3: Join budget, actuals, and committed into a cost report
cost_report AS (
    SELECT
        b.ProjectID,
        b.CostCode,
        b.BudgetAmount,
        ISNULL(a.ActualSpend, 0)    AS ActualSpend,
        ISNULL(c.CommittedCost, 0)  AS CommittedCost,
        b.BudgetAmount
            - ISNULL(a.ActualSpend, 0)
            - ISNULL(c.CommittedCost, 0) AS ProjectedVariance
    FROM dbo.Budget AS b
    LEFT JOIN actuals AS a
        ON a.ProjectID = b.ProjectID AND a.CostCode = b.CostCode
    LEFT JOIN committed AS c
        ON c.ProjectID = b.ProjectID AND c.CostCode = b.CostCode
)
-- Step 4: Surface only over-budget lines
SELECT
    p.ProjectNumber,
    cr.CostCode,
    cr.BudgetAmount,
    cr.ActualSpend,
    cr.CommittedCost,
    cr.ProjectedVariance
FROM cost_report AS cr
INNER JOIN dbo.Project AS p ON p.ProjectID = cr.ProjectID
WHERE cr.ProjectedVariance < 0
ORDER BY cr.ProjectedVariance ASC;
```

This is far more readable than nesting three derived tables inside each other.

### Recursive CTEs

A recursive CTE has two parts:
1. **Anchor member** — the base case (non-recursive SELECT)
2. **Recursive member** — references the CTE itself, joined to produce the next level

```sql
WITH cte AS (
    -- Anchor: base case
    SELECT ...
    FROM ...
    WHERE [root condition]

    UNION ALL

    -- Recursive: references cte
    SELECT ...
    FROM ... INNER JOIN cte ON [parent-child relationship]
)
SELECT * FROM cte
OPTION (MAXRECURSION 100);  -- safety limit, default is 100
```

The engine executes the anchor, then repeatedly executes the recursive member using the previous iteration's output until no new rows are produced.

**MAXRECURSION** — Default is 100. Set to 0 for unlimited (dangerous for circular references). Always set an explicit limit unless you are certain the hierarchy is acyclic and bounded.

### CTE vs Subquery vs Temp Table — Decision Guide

| Factor | CTE | Derived Table / Subquery | Temp Table |
|---|---|---|---|
| Readability | Best for multi-step | OK for single step | Verbose but explicit |
| Materialization | Not materialized (inlined) | Not materialized (inlined) | Physically stored in TempDB |
| Re-use in same query | Can reference multiple times* | Must repeat the subquery | Can reference anywhere |
| Statistics | Uses base table stats | Uses base table stats | Has its own statistics |
| Indexing | No | No | Yes — can add indexes |
| Scope | Single statement | Single statement | Session or batch |
| Recursive queries | Yes | No | No (but you can loop) |
| Row count threshold | < ~100K rows typically | < ~100K rows | Any size |

*When a CTE is referenced multiple times, the optimizer may re-evaluate it each time. If the CTE is expensive, a temp table is better.

**Rule of thumb:**
- Use CTEs for readability and recursive queries.
- Use temp tables when the intermediate result is large, needs indexes, is referenced multiple times, or when the optimizer produces bad plans due to cardinality misestimation.
- Avoid subqueries nested more than 2 levels deep — refactor to CTEs.

## Code Examples

### Recursive CTE: Work Breakdown Structure (WBS)

Construction projects use a hierarchical WBS to decompose work into manageable pieces. A typical structure:

```
Project 1001
├── Phase: 01 - Sitework
│   ├── 01.100 - Excavation
│   ├── 01.200 - Grading
│   └── 01.300 - Utilities
├── Phase: 02 - Concrete
│   ├── 02.100 - Foundations
│   └── 02.200 - Slabs
```

```sql
-- Table structure for WBS
-- CREATE TABLE dbo.WBS (
--     WBSID       INT PRIMARY KEY,
--     ProjectID   INT NOT NULL,
--     ParentWBSID INT NULL,          -- NULL = root node
--     WBSCode     VARCHAR(20),
--     Description NVARCHAR(200),
--     BudgetAmount DECIMAL(18,2)
-- );

-- Recursive CTE to traverse the full WBS tree
WITH wbs_tree AS (
    -- Anchor: root nodes (no parent)
    SELECT
        WBSID,
        ProjectID,
        ParentWBSID,
        WBSCode,
        Description,
        BudgetAmount,
        0                           AS TreeLevel,
        CAST(WBSCode AS VARCHAR(500)) AS TreePath
    FROM dbo.WBS
    WHERE ParentWBSID IS NULL
      AND ProjectID = 1001

    UNION ALL

    -- Recursive: children joined to their parents
    SELECT
        child.WBSID,
        child.ProjectID,
        child.ParentWBSID,
        child.WBSCode,
        child.Description,
        child.BudgetAmount,
        parent.TreeLevel + 1,
        CAST(parent.TreePath + ' > ' + child.WBSCode AS VARCHAR(500))
    FROM dbo.WBS AS child
    INNER JOIN wbs_tree AS parent
        ON parent.WBSID = child.ParentWBSID
)
SELECT
    REPLICATE('  ', TreeLevel) + WBSCode AS IndentedCode,
    Description,
    BudgetAmount,
    TreeLevel,
    TreePath
FROM wbs_tree
ORDER BY TreePath;
```

### Recursive CTE: Bill of Materials (BOM)

Construction BOMs can be deeply nested — an assembly contains sub-assemblies that contain components.

```sql
WITH bom_tree AS (
    -- Anchor: top-level assembly
    SELECT
        b.ComponentID,
        b.ParentComponentID,
        b.ComponentName,
        b.Quantity,
        b.UnitCost,
        b.Quantity * b.UnitCost AS ExtendedCost,
        0 AS BOMLevel
    FROM dbo.BillOfMaterials AS b
    WHERE b.ParentComponentID IS NULL
      AND b.AssemblyID = 500

    UNION ALL

    -- Recursive: child components
    SELECT
        child.ComponentID,
        child.ParentComponentID,
        child.ComponentName,
        child.Quantity * parent.Quantity,       -- multiply quantities down the tree
        child.UnitCost,
        child.Quantity * parent.Quantity * child.UnitCost,
        parent.BOMLevel + 1
    FROM dbo.BillOfMaterials AS child
    INNER JOIN bom_tree AS parent
        ON parent.ComponentID = child.ParentComponentID
)
SELECT
    REPLICATE('  ', BOMLevel) + ComponentName AS IndentedComponent,
    Quantity,
    UnitCost,
    ExtendedCost,
    BOMLevel
FROM bom_tree
ORDER BY BOMLevel, ComponentName;
```

### Recursive CTE: Organization Chart

```sql
-- Who reports to whom (for construction PM hierarchy)
WITH org_chart AS (
    SELECT
        EmployeeID,
        ManagerID,
        FullName,
        Title,
        0 AS OrgLevel,
        CAST(FullName AS VARCHAR(1000)) AS ReportingChain
    FROM dbo.Employee
    WHERE ManagerID IS NULL  -- CEO / top of org

    UNION ALL

    SELECT
        e.EmployeeID,
        e.ManagerID,
        e.FullName,
        e.Title,
        o.OrgLevel + 1,
        CAST(o.ReportingChain + ' > ' + e.FullName AS VARCHAR(1000))
    FROM dbo.Employee AS e
    INNER JOIN org_chart AS o ON o.EmployeeID = e.ManagerID
)
SELECT
    REPLICATE('  ', OrgLevel) + FullName AS IndentedName,
    Title,
    OrgLevel,
    ReportingChain
FROM org_chart
ORDER BY ReportingChain;
```

### Aggregating Up a Hierarchy

A common DE task: roll up actual costs from leaf nodes to parent nodes in the WBS.

```sql
WITH wbs_tree AS (
    SELECT WBSID, ParentWBSID, WBSCode, Description
    FROM dbo.WBS
    WHERE ProjectID = 1001
),
leaf_costs AS (
    -- Get actual costs at the leaf level
    SELECT
        w.WBSID,
        ISNULL(SUM(jc.Amount), 0) AS LeafCost
    FROM wbs_tree AS w
    LEFT JOIN dbo.JobCost AS jc ON jc.WBSID = w.WBSID
    GROUP BY w.WBSID
),
-- Recursive: walk from leaves up to root, accumulating cost
rollup AS (
    -- Anchor: leaf nodes (no children)
    SELECT
        w.WBSID,
        w.ParentWBSID,
        lc.LeafCost AS RolledUpCost
    FROM wbs_tree AS w
    INNER JOIN leaf_costs AS lc ON lc.WBSID = w.WBSID
    WHERE NOT EXISTS (
        SELECT 1 FROM wbs_tree AS child WHERE child.ParentWBSID = w.WBSID
    )

    UNION ALL

    -- Recursive: parent gets sum of children
    SELECT
        w.WBSID,
        w.ParentWBSID,
        r.RolledUpCost
    FROM wbs_tree AS w
    INNER JOIN rollup AS r ON r.ParentWBSID = w.WBSID
)
SELECT
    w.WBSCode,
    w.Description,
    SUM(r.RolledUpCost) AS TotalCost
FROM rollup AS r
INNER JOIN wbs_tree AS w ON w.WBSID = r.WBSID
GROUP BY w.WBSCode, w.Description
ORDER BY w.WBSCode;
```

### CTE for ETL Deduplication

```sql
-- Deduplicate Oracle staging data before loading to production
WITH deduped AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY SourceSystemKey
            ORDER BY ExtractTimestamp DESC
        ) AS rn
    FROM staging.CMiC_JobCost
)
INSERT INTO dbo.JobCost (ProjectID, CostCode, Amount, PostingDate, SourceSystemKey)
SELECT ProjectID, CostCode, Amount, PostingDate, SourceSystemKey
FROM deduped
WHERE rn = 1;
```

## Common Patterns

### CTE + UPDATE (modify based on calculated values)

```sql
WITH over_budget AS (
    SELECT
        b.BudgetID,
        b.BudgetAmount,
        ISNULL(SUM(jc.Amount), 0) AS ActualSpend,
        CASE
            WHEN ISNULL(SUM(jc.Amount), 0) > b.BudgetAmount THEN 'Over'
            WHEN ISNULL(SUM(jc.Amount), 0) > b.BudgetAmount * 0.9 THEN 'Warning'
            ELSE 'OK'
        END AS BudgetStatus
    FROM dbo.Budget AS b
    LEFT JOIN dbo.JobCost AS jc
        ON jc.ProjectID = b.ProjectID AND jc.CostCode = b.CostCode
    GROUP BY b.BudgetID, b.BudgetAmount, b.ProjectID, b.CostCode
)
UPDATE b
SET b.BudgetStatus = ob.BudgetStatus
FROM dbo.Budget AS b
INNER JOIN over_budget AS ob ON ob.BudgetID = b.BudgetID;
```

### CTE + DELETE (remove duplicates)

```sql
WITH dupes AS (
    SELECT
        ROW_NUMBER() OVER (
            PARTITION BY ProjectID, VendorID, InvoiceNumber
            ORDER BY LoadTimestamp DESC
        ) AS rn
    FROM staging.Invoice
)
DELETE FROM dupes WHERE rn > 1;
```

### Generate date series with recursive CTE

```sql
-- Generate a calendar table for the current fiscal year
WITH dates AS (
    SELECT CAST('2025-01-01' AS DATE) AS dt

    UNION ALL

    SELECT DATEADD(DAY, 1, dt)
    FROM dates
    WHERE dt < '2025-12-31'
)
SELECT
    dt AS CalendarDate,
    DATEPART(WEEKDAY, dt) AS DayOfWeek,
    DATENAME(MONTH, dt) AS MonthName,
    DATEPART(ISO_WEEK, dt) AS ISOWeek
FROM dates
OPTION (MAXRECURSION 366);
```

### Numbered sequences for batch processing

```sql
-- Generate batch numbers for chunked processing
WITH batches AS (
    SELECT 1 AS BatchNum
    UNION ALL
    SELECT BatchNum + 1 FROM batches WHERE BatchNum < 50
)
SELECT BatchNum,
       (BatchNum - 1) * 10000 + 1 AS StartID,
       BatchNum * 10000 AS EndID
FROM batches;
```

## Gotchas and Pitfalls

1. **CTEs are not materialized** — The optimizer inlines the CTE. If you reference a CTE twice, the query inside it may execute twice. If the CTE is expensive (big aggregation), use a temp table instead.

```sql
-- This CTE executes the aggregation TWICE
WITH expensive AS (
    SELECT ProjectID, SUM(Amount) AS Total
    FROM dbo.JobCost     -- 50 million rows
    GROUP BY ProjectID
)
SELECT a.ProjectID, a.Total, b.Total
FROM expensive AS a
CROSS JOIN expensive AS b;  -- two scans of JobCost
```

2. **Recursive CTE infinite loops** — If your hierarchy has circular references (NodeA -> NodeB -> NodeA), the recursion never terminates. MAXRECURSION protects you but throws an error. Always validate hierarchy integrity before running recursive CTEs.

```sql
-- Check for circular references before recursion
SELECT child.WBSID, child.ParentWBSID
FROM dbo.WBS AS child
INNER JOIN dbo.WBS AS parent ON parent.WBSID = child.ParentWBSID
WHERE child.WBSID = parent.ParentWBSID;  -- direct cycle
```

3. **MAXRECURSION default is 100** — If your hierarchy is deeper than 100 levels, the query fails without an explicit `OPTION (MAXRECURSION 0)` or a higher value. Construction WBS trees rarely exceed 10 levels, but date generation CTEs need 365+.

4. **Semicolon requirement** — The WITH keyword can be ambiguous if the preceding statement does not end with a semicolon. Best practice: always prefix CTE definitions with a semicolon or ensure the prior statement is properly terminated.

```sql
-- This may fail if prior statement has no semicolon
WITH cte AS (...)
SELECT ...;

-- Safe: prefix with semicolon
;WITH cte AS (...)
SELECT ...;
```

5. **CTEs cannot be nested** — You cannot define a CTE inside another CTE. You can chain them, but the WITH block is always at the top level.

6. **Column naming ambiguity** — If you do not provide an explicit column list for the CTE and the inner query has duplicate column names (from joins), you get an error. You can either alias columns in the inner SELECT or provide a column list.

```sql
-- Explicit column list resolves ambiguity
WITH cte (ProjectID, BudgetAmt, ActualAmt) AS (
    SELECT b.ProjectID, b.BudgetAmount, jc.Amount
    FROM dbo.Budget AS b
    INNER JOIN dbo.JobCost AS jc ON ...
)
SELECT * FROM cte;
```

## Performance Considerations

- **CTE re-evaluation** — If a CTE is referenced more than once and is expensive, materialization into a temp table is a concrete performance win. Check the execution plan: if you see the same subtree appear twice, you are paying double.
- **Recursive CTE cardinality** — The optimizer assumes a recursive CTE returns approximately 10,000 rows. If the actual output is much larger, downstream joins may get bad plans. You can help by inserting the recursive result into a temp table with proper statistics.
- **Index support for recursion** — For recursive CTEs, ensure the parent-child join column (e.g., ParentWBSID -> WBSID) has an index. Without it, every recursion level does a table scan.
- **Spool operators** — The execution plan for a recursive CTE shows a Table Spool (Lazy Spool). This is expected and cannot be eliminated.
- **Alternative to recursive CTE** — For very deep or wide hierarchies (millions of nodes), consider using the `hierarchyid` data type or a closure table pattern. Recursive CTEs are clean but can be slower than materialized hierarchies.

## BNBuilders Context

CTEs are used constantly in BNBuilders data pipelines:

- **WBS traversal** — Construction projects decompose into phases, cost codes, and sub-activities. The WBS table is a self-referencing hierarchy that recursive CTEs navigate naturally. PMs need "roll-up" reports showing costs at every level of the WBS tree.

- **Bill of Materials** — Prefab construction components have nested BOMs. A wall panel assembly contains framing, insulation, sheathing, and hardware — each potentially broken into sub-assemblies. Recursive CTEs compute total material cost for any assembly level.

- **CMiC to SQL Server ETL** — Multi-step transformations (extract from Oracle, cleanse, deduplicate, conform, load) are expressed as chained CTEs. Each CTE is a named stage: `raw_extract -> deduped -> conformed -> enriched`. The final SELECT feeds an INSERT into the target table.

- **Change order lineage** — Change orders reference original budget lines, which reference WBS nodes. CTEs build a clear lineage from the CO back to the original scope.

- **Cost code hierarchy** — BNBuilders uses a multi-level cost code structure (Division -> Section -> Code). A recursive CTE builds the full hierarchy for reporting.

```sql
-- Cost code hierarchy for BNBuilders reporting
WITH cc_tree AS (
    SELECT
        CostCodeID, ParentCostCodeID, CostCode, Description,
        0 AS Level, CAST(CostCode AS VARCHAR(200)) AS FullPath
    FROM dbo.CostCode WHERE ParentCostCodeID IS NULL

    UNION ALL

    SELECT
        child.CostCodeID, child.ParentCostCodeID,
        child.CostCode, child.Description,
        parent.Level + 1,
        CAST(parent.FullPath + '.' + child.CostCode AS VARCHAR(200))
    FROM dbo.CostCode AS child
    INNER JOIN cc_tree AS parent ON parent.CostCodeID = child.ParentCostCodeID
)
SELECT
    REPLICATE('  ', Level) + CostCode + ' - ' + Description AS DisplayName,
    FullPath,
    Level
FROM cc_tree
ORDER BY FullPath;
```

## Interview / Senior Dev Questions

**Q1: A CTE is referenced three times in the outer query and the execution plan shows the CTE's subtree three times. What do you do?**

This confirms the CTE is being re-evaluated on each reference. Materialize it into a temp table with `SELECT ... INTO #temp FROM (CTE body)`, add any needed indexes, then reference #temp in the outer query. The temp table is evaluated once, gets its own statistics, and each reference reads from the already-materialized result.

**Q2: Your recursive CTE for traversing a 6-level WBS runs in 200ms. Then a user adds a circular reference to the WBS table and the query hits MAXRECURSION. How do you make the system resilient?**

Two layers of defense. First, add a CHECK constraint or trigger on the WBS table that prevents circular references at write time (e.g., a child cannot be its own ancestor). Second, in the recursive CTE itself, track visited nodes by accumulating the path in a string column and adding a WHERE clause in the recursive member: `WHERE TreePath NOT LIKE '%' + CAST(child.WBSID AS VARCHAR) + '%'`. This is a belt-and-suspenders approach — prevent bad data at the source and handle it gracefully at query time.

**Q3: When should you use a CTE vs a temp table in an ETL pipeline?**

Use a CTE when the transformation is a single logical flow that will be consumed once in the final SELECT/INSERT. Use a temp table when: (1) the intermediate result is large and you need statistics for the optimizer, (2) you need to reference the result multiple times, (3) you need to add an index for downstream joins, or (4) you want checkpoint visibility during debugging (you can SELECT from the temp table at any point). In multi-step ETL stored procedures, temp tables are usually better because each step can be verified independently.

## Quiz

**1. What happens if a CTE is referenced twice in the outer query?**

<details>
<summary>Show Answer</summary>

The CTE body may be evaluated twice because CTEs are not materialized. The optimizer inlines the CTE definition into each reference point. For expensive CTEs (large aggregations, complex joins), this means double the I/O and CPU. If you need to reference the result multiple times, use a temp table instead.
</details>

**2. Write a recursive CTE that generates the numbers 1 through 10.**

<details>
<summary>Show Answer</summary>

```sql
WITH numbers AS (
    SELECT 1 AS n            -- anchor
    UNION ALL
    SELECT n + 1 FROM numbers WHERE n < 10  -- recursive
)
SELECT n FROM numbers;
```

No `OPTION (MAXRECURSION)` is needed because the default limit of 100 is well above 10.
</details>

**3. You write `;WITH cte AS (SELECT ...)` — why the leading semicolon?**

<details>
<summary>Show Answer</summary>

The `WITH` keyword is overloaded in T-SQL — it is used for CTEs, table hints, and other clauses. If the preceding statement does not end with a semicolon, the parser may misinterpret `WITH` as a table hint rather than a CTE definition. The leading semicolon ensures the prior statement is terminated. Best practice is to always terminate every statement with a semicolon, but the defensive `;WITH` pattern is a widely adopted safety measure.
</details>

**4. A recursive CTE walks a hierarchy of 12 levels, but the query fails with "The maximum recursion 100 has been exhausted." You know 12 levels should be fine. What is wrong?**

<details>
<summary>Show Answer</summary>

The hierarchy likely contains a circular reference. Even though the *expected* depth is 12, a cycle causes the recursion to loop infinitely until it hits the default MAXRECURSION of 100. Debug by adding a path-tracking column (concatenated IDs) to the recursive CTE and checking for duplicates. Fix the source data to remove the cycle, and add validation constraints to prevent future cycles.
</details>

**5. Can you use ORDER BY inside a CTE definition?**

<details>
<summary>Show Answer</summary>

Only if it accompanies a TOP, OFFSET-FETCH, or FOR XML/JSON clause. A bare `ORDER BY` without TOP is not allowed inside a CTE (or any subquery/derived table) because the SQL standard says subqueries return unordered sets. The ORDER BY in the final outer query is where you control the result order.

```sql
-- WRONG
WITH cte AS (SELECT * FROM dbo.JobCost ORDER BY PostingDate)
SELECT * FROM cte;

-- RIGHT: ORDER BY in the outer query
WITH cte AS (SELECT * FROM dbo.JobCost)
SELECT * FROM cte ORDER BY PostingDate;

-- ALSO RIGHT: TOP inside CTE allows ORDER BY
WITH cte AS (SELECT TOP 100 * FROM dbo.JobCost ORDER BY PostingDate)
SELECT * FROM cte;
```
</details>
