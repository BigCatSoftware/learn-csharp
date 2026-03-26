# Reading Oracle Execution Plans

*Chapter 10.8 — Oracle SQL for Data Engineers*

## Overview

An execution plan is Oracle's step-by-step blueprint for retrieving data. It shows
which tables are accessed, how they are joined, whether indexes are used, and in what
order operations happen. For a data engineer running multi-million-row extractions from
CMiC, reading execution plans is the single most important skill for diagnosing slow
queries.

This lesson covers how to generate plans, how to read them, what the key operations
mean, and how Oracle plans compare to SQL Server plans — a critical skill when you
work across both databases daily.

## Core Concepts

### How Oracle Chooses a Plan

The Cost-Based Optimizer (CBO) evaluates multiple possible plans and picks the one
with the lowest estimated **cost**. Cost is an abstract number representing estimated
resource consumption (CPU + I/O). The optimizer uses:

- **Table statistics**: Row count, average row length, block count.
- **Column statistics**: Number of distinct values (NDV), null counts, histograms.
- **Index statistics**: Clustering factor, leaf blocks, distinct keys.
- **System statistics**: I/O speed, CPU speed (optional).

### Three Ways to Get a Plan

| Method | When to Use | What It Shows |
|---|---|---|
| `EXPLAIN PLAN FOR` | Before running the query | Estimated plan |
| `DBMS_XPLAN.DISPLAY_CURSOR` | After running the query | Actual plan with runtime stats |
| `V$SQL_PLAN` | Querying cached plans | Plans already in the shared pool |

### Key Plan Operations

| Operation | Meaning | Performance Implication |
|---|---|---|
| TABLE ACCESS FULL | Reads every block in the table | Expensive for large tables unless using parallelism |
| TABLE ACCESS BY INDEX ROWID | Looks up a row using a ROWID from an index | Efficient for selective queries |
| INDEX UNIQUE SCAN | Finds exactly one index entry | Very fast — primary key or unique index lookup |
| INDEX RANGE SCAN | Reads a range of index entries | Efficient for range predicates |
| INDEX FULL SCAN | Reads the entire index in order | Avoids a sort but reads all entries |
| INDEX FAST FULL SCAN | Reads the entire index using multi-block I/O | Faster than full scan when you only need indexed columns |
| NESTED LOOPS | For each row in outer, probe inner | Good when outer is small |
| HASH JOIN | Builds hash table from smaller input, probes with larger | Best for large-to-large joins |
| SORT MERGE JOIN | Sorts both inputs, then merges | Good when data is already sorted |
| SORT ORDER BY | Sorts result set | Expensive for large result sets |
| HASH GROUP BY | Groups using a hash table | Standard for GROUP BY |
| FILTER | Applies a predicate | Can hide subquery execution |
| PARTITION RANGE | Accesses specific partitions | Partition pruning indicator |

## Code Examples

### Method 1: EXPLAIN PLAN FOR

```sql
-- Generate the estimated plan
EXPLAIN PLAN FOR
SELECT j.job_number, j.cost_code, j.amount, p.project_name
FROM cmic_job_cost j
JOIN cmic_projects p ON p.project_id = j.project_id
WHERE j.posting_date >= DATE '2024-01-01'
  AND p.status = 'ACTIVE';

-- Display the plan
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(
    format => 'TYPICAL +PREDICATE +COST'
));
```

Sample output:

```
------------------------------------------------------------------------------------------
| Id  | Operation                    | Name              | Rows  | Bytes | Cost  | Time  |
------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT             |                   |  125K | 9750K |  4521 | 00:01 |
|*  1 |  HASH JOIN                   |                   |  125K | 9750K |  4521 | 00:01 |
|*  2 |   TABLE ACCESS FULL          | CMIC_PROJECTS     |    42 |  1680 |    12 | 00:01 |
|*  3 |   TABLE ACCESS BY INDEX ROWID| CMIC_JOB_COST     |  250K |  10M  |  4502 | 00:01 |
|*  4 |    INDEX RANGE SCAN          | IDX_JC_POST_DATE  |  250K |       |   712 | 00:01 |
------------------------------------------------------------------------------------------

Predicate Information:
  1 - access("P"."PROJECT_ID"="J"."PROJECT_ID")
  2 - filter("P"."STATUS"='ACTIVE')
  3 - filter(/* no additional filter */)
  4 - access("J"."POSTING_DATE">=TO_DATE('2024-01-01','YYYY-MM-DD'))
```

### Method 2: DBMS_XPLAN.DISPLAY_CURSOR (Actual Plan)

```sql
-- Run the query first (with statistics gathering)
SELECT /*+ GATHER_PLAN_STATISTICS */
    j.job_number, j.cost_code, j.amount
FROM cmic_job_cost j
WHERE j.posting_date >= DATE '2024-01-01'
  AND j.status = 'POSTED';

-- Then get the actual execution plan with runtime stats
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(
    sql_id  => NULL,   -- NULL = last executed statement
    cursor_child_no => NULL,
    format  => 'ALLSTATS LAST +PREDICATE +COST'
));
```

Sample output with actual vs estimated rows:

```
-----------------------------------------------------------------------------------------------------
| Id  | Operation                    | Name             | Starts | E-Rows | A-Rows | Buffers | Time |
-----------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT             |                  |      1 |        |  95201 |   48210 | 2.3s |
|*  1 |  TABLE ACCESS BY INDEX ROWID | CMIC_JOB_COST    |      1 |   250K |  95201 |   48210 | 2.3s |
|*  2 |   INDEX RANGE SCAN           | IDX_JC_POST_DATE |      1 |   250K |  95201 |    1420 | 0.1s |
-----------------------------------------------------------------------------------------------------

Predicate Information:
  1 - filter("J"."STATUS"='POSTED')
  2 - access("J"."POSTING_DATE">=TO_DATE('2024-01-01','YYYY-MM-DD'))
```

### Method 3: V$SQL_PLAN

```sql
-- Find the plan for a specific SQL statement
SELECT
    sp.id,
    sp.parent_id,
    LPAD(' ', 2 * sp.depth) || sp.operation || ' ' || sp.options AS operation,
    sp.object_name,
    sp.cardinality AS est_rows,
    sp.cost,
    sp.bytes
FROM v$sql_plan sp
WHERE sp.sql_id = 'abc123def456'
  AND sp.child_number = 0
ORDER BY sp.id;

-- Find SQL_ID for a query containing specific text
SELECT sql_id, sql_text, executions, elapsed_time / 1000000 AS elapsed_secs
FROM v$sql
WHERE sql_text LIKE '%cmic_job_cost%'
  AND sql_text NOT LIKE '%v$sql%'
ORDER BY elapsed_time DESC
FETCH FIRST 10 ROWS ONLY;
```

### Reading the Plan: Indentation Rules

```sql
-- The plan reads from the most-indented child upward to the parent
-- Execution order: 4 -> 3 -> 2 -> 1 -> 0

-- Id 0: SELECT STATEMENT
--   Id 1: HASH JOIN                  <-- step 3: join results of 2 and 3
--     Id 2: TABLE ACCESS FULL CMIC_PROJECTS  <-- step 1: scan projects
--     Id 3: TABLE ACCESS BY INDEX ROWID      <-- step 2: fetch job cost rows
--       Id 4: INDEX RANGE SCAN               <-- step 0: scan the index first
```

The rule: **start from the deepest indentation, work up. Among siblings at the
same depth, the first child executes first.**

### Comparing Estimated vs Actual Rows

```sql
-- The most important diagnostic: E-Rows vs A-Rows
-- If these differ by 10x or more, the optimizer chose a bad plan

-- Example: optimizer estimated 250K rows but only 95K came back
-- E-Rows: 250K  A-Rows: 95201
-- This 2.6x difference is acceptable

-- Example: optimizer estimated 100 rows but 5 million came back
-- E-Rows: 100   A-Rows: 5000000
-- This 50000x difference means STALE STATISTICS — gather stats immediately
```

### Generating Plans in C#

```csharp
using Oracle.ManagedDataAccess.Client;

public class PlanAnalyzer
{
    /// <summary>
    /// Retrieves the execution plan for a SQL statement without executing it.
    /// Useful for validating ETL query performance before running full extractions.
    /// </summary>
    public async Task<string> GetExplainPlanAsync(
        OracleConnection connection,
        string sql)
    {
        // Generate the plan
        var explainSql = $"EXPLAIN PLAN FOR {sql}";
        using (var cmd = new OracleCommand(explainSql, connection))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        // Retrieve the plan
        const string displaySql =
            "SELECT plan_table_output FROM TABLE(DBMS_XPLAN.DISPLAY(format => 'TYPICAL'))";
        using var displayCmd = new OracleCommand(displaySql, connection);
        using var reader = await displayCmd.ExecuteReaderAsync();

        var planLines = new List<string>();
        while (await reader.ReadAsync())
        {
            planLines.Add(reader.GetString(0));
        }

        return string.Join(Environment.NewLine, planLines);
    }

    /// <summary>
    /// Executes a query and retrieves the actual execution plan with runtime stats.
    /// </summary>
    public async Task<(List<T> Results, string Plan)> ExecuteWithPlanAsync<T>(
        OracleConnection connection,
        string sql,
        Func<OracleDataReader, T> mapper)
    {
        // Add GATHER_PLAN_STATISTICS hint if not present
        var hintedSql = sql.Contains("GATHER_PLAN_STATISTICS")
            ? sql
            : sql.Replace("SELECT", "SELECT /*+ GATHER_PLAN_STATISTICS */",
                           StringComparison.OrdinalIgnoreCase);

        // Execute the query
        var results = new List<T>();
        using (var cmd = new OracleCommand(hintedSql, connection))
        using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                results.Add(mapper(reader));
            }
        }

        // Get the actual plan
        const string planSql = @"
            SELECT plan_table_output
            FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(
                sql_id => NULL,
                cursor_child_no => NULL,
                format => 'ALLSTATS LAST'))";

        using var planCmd = new OracleCommand(planSql, connection);
        using var planReader = await planCmd.ExecuteReaderAsync();

        var planLines = new List<string>();
        while (await planReader.ReadAsync())
        {
            planLines.Add(planReader.GetString(0));
        }

        return (results, string.Join(Environment.NewLine, planLines));
    }
}
```

## Common Patterns

### Pattern 1: Diagnose a Slow ETL Query

```sql
-- Step 1: Run with GATHER_PLAN_STATISTICS
SELECT /*+ GATHER_PLAN_STATISTICS */
    j.job_number, j.cost_code, SUM(j.amount)
FROM cmic_job_cost j
WHERE j.fiscal_year = 2024
GROUP BY j.job_number, j.cost_code;

-- Step 2: Check the actual plan
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(format => 'ALLSTATS LAST'));

-- Step 3: Look for E-Rows vs A-Rows mismatches
-- Step 4: Look for TABLE ACCESS FULL on tables that should use indexes
-- Step 5: Look for NESTED LOOPS where HASH JOIN would be better
```

### Pattern 2: Compare Two Plan Alternatives

```sql
-- Plan A: Let optimizer choose
EXPLAIN PLAN SET STATEMENT_ID = 'PLAN_A' FOR
SELECT j.*, p.project_name
FROM cmic_job_cost j JOIN cmic_projects p ON p.project_id = j.project_id
WHERE j.posting_date >= DATE '2024-01-01';

-- Plan B: Force hash join with parallelism
EXPLAIN PLAN SET STATEMENT_ID = 'PLAN_B' FOR
SELECT /*+ USE_HASH(j p) PARALLEL(j, 4) FULL(j) */
    j.*, p.project_name
FROM cmic_job_cost j JOIN cmic_projects p ON p.project_id = j.project_id
WHERE j.posting_date >= DATE '2024-01-01';

-- Compare both plans
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(statement_id => 'PLAN_A'));
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(statement_id => 'PLAN_B'));
```

### Pattern 3: Find the Most Expensive Queries

```sql
-- Top 10 queries by total elapsed time
SELECT
    sql_id,
    executions,
    ROUND(elapsed_time / 1000000, 2) AS total_elapsed_secs,
    ROUND(elapsed_time / NULLIF(executions, 0) / 1000000, 2) AS avg_elapsed_secs,
    ROUND(buffer_gets / NULLIF(executions, 0)) AS avg_buffer_gets,
    SUBSTR(sql_text, 1, 100) AS sql_preview
FROM v$sql
WHERE parsing_schema_name = 'CMIC_OWNER'
  AND elapsed_time > 0
ORDER BY elapsed_time DESC
FETCH FIRST 10 ROWS ONLY;
```

## Gotchas and Pitfalls

### 1. EXPLAIN PLAN Shows Estimated, Not Actual

`EXPLAIN PLAN FOR` shows what the optimizer **thinks** will happen. The actual plan
can differ due to bind variable peeking, adaptive plans, or resource constraints. Always
verify with `DBMS_XPLAN.DISPLAY_CURSOR` after execution for critical queries.

### 2. E-Rows vs A-Rows Mismatch

The number one cause of bad plans. If estimated rows are 100 but actual rows are
5 million, the optimizer picked a nested loop when it should have picked a hash join.
Fix by gathering fresh statistics:

```sql
BEGIN
    DBMS_STATS.GATHER_TABLE_STATS(
        ownname => 'CMIC_OWNER',
        tabname => 'CMIC_JOB_COST',
        method_opt => 'FOR ALL INDEXED COLUMNS SIZE AUTO',
        cascade => TRUE,
        degree => 4
    );
END;
/
```

### 3. Reading Indentation Wrong

New engineers often read the plan top-to-bottom. Plans read **deepest child first**,
then upward. The most-indented line executes first.

### 4. Ignoring the Predicate Section

The `Predicate Information` section at the bottom shows `access` vs `filter` predicates.
An `access` predicate drives an index lookup. A `filter` predicate is applied after
rows are retrieved. If your WHERE clause appears as a `filter` on a TABLE ACCESS FULL,
you are scanning the entire table and then discarding rows.

### 5. Cost Is Relative, Not Absolute

A cost of 4521 does not mean "4521 seconds" or any specific time. Cost is only
meaningful for comparing alternative plans for the **same** query. Do not compare
costs across different queries.

### 6. Adaptive Plans in 12c+

Oracle 12c introduced adaptive plans that can change the join method at runtime.
The `EXPLAIN PLAN` might show a nested loop, but the actual execution switches to
a hash join mid-flight. Use `DISPLAY_CURSOR` with `+ADAPTIVE` format to see this.

## Performance Considerations

### What to Look for in ETL Plans

| Red Flag | What It Means | Fix |
|---|---|---|
| TABLE ACCESS FULL on a lookup table | Scanning a small table that should use an index | Check for missing index or stale stats |
| NESTED LOOPS with A-Rows > 100K on inner | Inner table probed too many times | Switch to HASH JOIN |
| SORT ORDER BY with huge row count | Sorting millions of rows in temp space | Remove ORDER BY if not needed, or add index |
| E-Rows: 1, A-Rows: 5000000 | Statistics are wildly wrong | Gather fresh statistics |
| HASH JOIN with 0 bytes temp | Hash table spilled to disk | Increase PGA_AGGREGATE_TARGET |
| Buffers: 50000000 | Excessive logical reads | Query is reading too much data — add filters |

### Oracle vs SQL Server Plan Comparison

| Oracle Operation | SQL Server Equivalent | Notes |
|---|---|---|
| TABLE ACCESS FULL | Clustered Index Scan / Table Scan | SQL Server always has a clustered index |
| INDEX RANGE SCAN | Index Seek | Same concept |
| INDEX UNIQUE SCAN | Index Seek (unique) | Same concept |
| HASH JOIN | Hash Match | Same algorithm |
| NESTED LOOPS | Nested Loops | Same algorithm |
| SORT MERGE JOIN | Merge Join | Same algorithm |
| PARTITION RANGE | Partition elimination | Same concept |
| DBMS_XPLAN.DISPLAY | SET SHOWPLAN_ALL ON / Include Actual Plan | Different tools, same idea |

### Tools Comparison

| Task | Oracle | SQL Server |
|---|---|---|
| Estimated plan | `EXPLAIN PLAN FOR` | `SET SHOWPLAN_ALL ON` |
| Actual plan | `DBMS_XPLAN.DISPLAY_CURSOR` | Include Actual Execution Plan (SSMS) |
| Plan cache | `V$SQL_PLAN` | `sys.dm_exec_query_plan` |
| Force plan | SQL Plan Baselines | Query Store forced plans |

## BNBuilders Context

### CMiC ERP on Oracle

CMiC's Oracle schema has hundreds of tables. The most common performance issues for
data engineers at BNBuilders:

- **Job cost aggregation queries**: These join `job_cost` to `projects`, `cost_codes`,
  `phases`, and `vendors`. Check that the plan uses HASH JOIN for the large joins and
  INDEX access for the small dimension lookups.
- **Payroll data extraction**: Payroll tables often have row-level security (VPD).
  The plan may show a FILTER operation for the security predicate — this is normal.
- **Change order reporting**: Complex multi-table joins. Use `LEADING` hints if the
  optimizer picks a bad join order, but verify with `DISPLAY_CURSOR` first.

### Oracle-to-SQL Server Migration

When migrating queries from Oracle to SQL Server:

1. Run the Oracle plan to understand the current access patterns.
2. Create equivalent indexes on SQL Server.
3. Run the SQL Server plan and compare operations.
4. If Oracle uses HASH JOIN, SQL Server should too — if it picks NESTED LOOPS,
   check statistics.
5. Oracle's `cost` and SQL Server's `estimated subtree cost` are not comparable.

### Practical Workflow

```bash
# Save plans to files for comparison during migration
sqlplus cmic_user/password@oracle_db <<EOF
SET LINESIZE 200
SET PAGESIZE 0
SPOOL /tmp/oracle_plan.txt
EXPLAIN PLAN FOR
SELECT j.*, p.project_name
FROM cmic_job_cost j JOIN cmic_projects p ON p.project_id = j.project_id
WHERE j.fiscal_year = 2024;
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);
SPOOL OFF
EOF
```

## Interview / Senior Dev Questions

1. **Q: What is the difference between E-Rows and A-Rows, and why does it matter?**
   A: E-Rows is the optimizer's estimated row count; A-Rows is the actual row count
   observed during execution. A large mismatch (10x+) means the optimizer's cost
   calculations are wrong, likely leading to a suboptimal plan. The fix is usually
   gathering fresh statistics or adding histograms on skewed columns.

2. **Q: You see TABLE ACCESS FULL on a table with an index on the WHERE clause column.
   Why might the optimizer choose a full scan?**
   A: If the query returns a large percentage of the table (typically >5-10%), a full
   scan with multi-block I/O is cheaper than individual index lookups. Also: the
   index might have a high clustering factor, statistics might be stale, or the
   predicate might apply a function to the column (disabling the index).

3. **Q: How do you read the execution order of an Oracle plan?**
   A: Start from the most-indented (deepest) operation. Among siblings at the same
   depth, the first listed child executes first. Work upward to the parent. The
   parent operation consumes rows from its children.

4. **Q: What is the difference between an access predicate and a filter predicate?**
   A: An access predicate drives how data is retrieved (e.g., the key lookup in an
   INDEX RANGE SCAN). A filter predicate is applied after data is retrieved to
   eliminate non-matching rows. Moving a filter predicate to an access predicate
   (by adding it to an index) can dramatically improve performance.

## Quiz

**Question 1:** You see this in an execution plan:

```
|*  1 |  TABLE ACCESS FULL | CMIC_JOB_COST | E-Rows: 500 | A-Rows: 2500000 |
```

What does this tell you, and what should you do?

<details>
<summary>Show Answer</summary>

The optimizer estimated 500 rows but the actual query returned 2.5 million rows — a
5000x mismatch. The optimizer likely chose a suboptimal plan (possibly nested loops
instead of hash join, or skipped parallelism). You should gather fresh statistics on
the `CMIC_JOB_COST` table with histograms on the filtered columns:

```sql
BEGIN
    DBMS_STATS.GATHER_TABLE_STATS(
        ownname => 'CMIC_OWNER',
        tabname => 'CMIC_JOB_COST',
        method_opt => 'FOR ALL INDEXED COLUMNS SIZE 254',
        cascade => TRUE
    );
END;
/
```
</details>

**Question 2:** What is the execution order for this plan?

```
| Id | Operation              | Name           |
|  0 | SELECT STATEMENT       |                |
|  1 |  HASH JOIN             |                |
|  2 |   TABLE ACCESS FULL    | CMIC_PROJECTS  |
|  3 |   INDEX RANGE SCAN     | IDX_JC_DATE    |
```

<details>
<summary>Show Answer</summary>

Execution order is: **2 -> 3 -> 1 -> 0**.

1. First, Id 2: Full scan of `CMIC_PROJECTS` (builds the hash table).
2. Then, Id 3: Index range scan on `IDX_JC_DATE` (probes the hash table).
3. Then, Id 1: Hash join combines the results.
4. Finally, Id 0: Returns the result set.

Among siblings at the same depth (Id 2 and Id 3), the first listed child (Id 2)
executes first. For a hash join, the first child is the build input and the second
is the probe input.
</details>

**Question 3:** When should you use `EXPLAIN PLAN FOR` vs `DBMS_XPLAN.DISPLAY_CURSOR`?

<details>
<summary>Show Answer</summary>

Use `EXPLAIN PLAN FOR` when you want to preview the plan **before** running a
potentially expensive query. It shows the estimated plan only.

Use `DBMS_XPLAN.DISPLAY_CURSOR` **after** running the query to see the actual plan
with runtime statistics (A-Rows, Buffers, Time). This is more accurate because it
reflects what actually happened, including adaptive plan changes and actual row counts.

For ETL development, always validate critical queries with `DISPLAY_CURSOR` before
promoting to production.
</details>

**Question 4:** Your Oracle query uses HASH JOIN but the equivalent SQL Server query
uses NESTED LOOPS and is much slower. What might be wrong?

<details>
<summary>Show Answer</summary>

SQL Server's optimizer likely has inaccurate statistics for one or both tables, causing
it to underestimate the row count and choose nested loops. Solutions:

1. Update statistics: `UPDATE STATISTICS dbo.cmic_job_cost WITH FULLSCAN`.
2. Check that the SQL Server table has equivalent indexes.
3. If statistics are correct but the plan is still wrong, use a query hint:
   `OPTION (HASH JOIN)`.
4. Verify the join column data types match — implicit conversion can prevent
   hash join selection.
</details>
