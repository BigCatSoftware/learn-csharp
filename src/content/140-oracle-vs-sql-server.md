# Oracle vs SQL Server — Key Differences

*Chapter 10.1 — Oracle SQL for Data Engineers*

---

## Overview

If you write SQL Server queries by day and Oracle queries by night (or vice versa), you
already know the pain: the syntax is *almost* the same — just different enough to trip you
up every time. This lesson is a side-by-side cheat sheet covering the most common
divergences between Oracle Database and Microsoft SQL Server. Everything here is written
from the perspective of a Data Engineer who needs to **read** Oracle, **write** migrations,
and **land data** in SQL Server.

We will cover NULL handling, string operations, date functions, pagination, schema models,
transaction behavior, the DUAL table, case sensitivity, and data dictionary access.

---

## Core Concepts

### 1. NULL Handling

| Oracle | SQL Server | Notes |
|--------|-----------|-------|
| `NVL(expr, replacement)` | `ISNULL(expr, replacement)` | Both return the replacement when expr is NULL |
| `NVL2(expr, not_null_val, null_val)` | No direct equivalent — use `CASE` or `IIF` | NVL2 is a 3-argument form |
| `COALESCE(a, b, c)` | `COALESCE(a, b, c)` | ANSI standard — works in both |
| Empty string `''` is NULL | Empty string `''` is NOT NULL | **This is the #1 migration bug** |

Oracle treats an empty string as NULL. SQL Server does not. This single difference causes
more data-quality bugs during migration than any other.

### 2. String Concatenation

| Oracle | SQL Server |
|--------|-----------|
| `first_name \|\| ' ' \|\| last_name` | `first_name + ' ' + last_name` |
| `CONCAT(a, b)` (2 args only until 21c) | `CONCAT(a, b, c, ...)` (variadic) |

In Oracle, concatenation with a NULL yields the other operand. In SQL Server, `+` with a
NULL yields NULL unless `CONCAT_NULL_YIELDS_NULL` is OFF (almost never).

### 3. Date Functions

| Task | Oracle | SQL Server |
|------|--------|-----------|
| Current date/time | `SYSDATE`, `SYSTIMESTAMP` | `GETDATE()`, `SYSDATETIME()` |
| Add days | `SYSDATE + 7` | `DATEADD(DAY, 7, GETDATE())` |
| Difference in days | `date1 - date2` (returns number) | `DATEDIFF(DAY, date2, date1)` |
| Add months | `ADD_MONTHS(dt, 3)` | `DATEADD(MONTH, 3, dt)` |
| Months between | `MONTHS_BETWEEN(d1, d2)` | `DATEDIFF(MONTH, d2, d1)` |
| Truncate to day | `TRUNC(SYSDATE)` | `CAST(GETDATE() AS DATE)` |
| Format | `TO_CHAR(dt, 'YYYY-MM-DD')` | `FORMAT(dt, 'yyyy-MM-dd')` or `CONVERT` |

### 4. Pagination — TOP vs ROWNUM vs FETCH FIRST

| Oracle (pre-12c) | Oracle (12c+) | SQL Server |
|-------------------|--------------|-----------|
| `WHERE ROWNUM <= 10` | `FETCH FIRST 10 ROWS ONLY` | `SELECT TOP 10 ...` |
| Subquery + ROWNUM for offset | `OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY` | `OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY` (2012+) |

### 5. Schema Model

- **Oracle**: A *schema* = a *user*. `CREATE USER bob` also creates the `BOB` schema.
  Objects live inside `SCHEMA.TABLE`. Cross-schema access requires grants.
- **SQL Server**: A database contains schemas, schemas contain objects. A schema is NOT
  tied to a login. Default schema is `dbo`.

### 6. Transaction Model

- **Oracle**: DDL (`CREATE TABLE`, `ALTER TABLE`) triggers an **implicit commit** before
  and after. DML requires an explicit `COMMIT`.
- **SQL Server**: By default, each statement auto-commits (unless inside `BEGIN TRAN`). DDL
  is transactional — you can roll back a `CREATE TABLE`.

### 7. DUAL Table

Oracle requires a `FROM` clause on every `SELECT`. The `DUAL` table is a one-row,
one-column dummy table:

```sql
SELECT SYSDATE FROM DUAL;
```

SQL Server lets you write `SELECT GETDATE();` with no `FROM`.

### 8. Case Sensitivity

- **Oracle**: Unquoted identifiers are stored UPPER CASE. `SELECT * FROM jobs` resolves
  to `JOBS`. If you create `"MixedCase"` with quotes, you **must** always quote it.
- **SQL Server**: Default collation is case-*insensitive*. `SELECT * FROM Jobs` and
  `select * from JOBS` both work.

### 9. Data Dictionary vs sys Tables

| Oracle | SQL Server | Purpose |
|--------|-----------|---------|
| `ALL_TABLES` | `sys.tables` | List tables |
| `ALL_TAB_COLUMNS` | `sys.columns` / `INFORMATION_SCHEMA.COLUMNS` | Column metadata |
| `ALL_INDEXES` | `sys.indexes` | Index metadata |
| `ALL_CONSTRAINTS` | `sys.key_constraints`, `sys.check_constraints` | Constraints |
| `ALL_SOURCE` | `sys.sql_modules` | Stored procedure source |
| `V$SESSION` | `sys.dm_exec_sessions` | Active sessions |
| `V$SQL` | `sys.dm_exec_query_stats` | Query stats |

---

## Code Examples

### Rewriting NVL to COALESCE

```sql
-- Oracle
SELECT NVL(phone_number, 'N/A') FROM hr.employees;

-- SQL Server (prefer COALESCE for portability)
SELECT COALESCE(phone_number, 'N/A') FROM hr.employees;
```

### Empty String Trap

```sql
-- Oracle: these two are identical
SELECT * FROM jobs WHERE description IS NULL;
SELECT * FROM jobs WHERE description = '';  -- also returns NULLs!

-- SQL Server: NOT the same
SELECT * FROM jobs WHERE description IS NULL;   -- only NULLs
SELECT * FROM jobs WHERE description = '';      -- only empty strings
```

### Date Arithmetic

```sql
-- Oracle: add 30 days to a date column
SELECT job_name, start_date + 30 AS due_date
FROM   cmic_jobs;

-- SQL Server equivalent
SELECT job_name, DATEADD(DAY, 30, start_date) AS due_date
FROM   cmic_jobs;
```

### Pagination

```sql
-- Oracle pre-12c: rows 21–30
SELECT *
FROM (
    SELECT t.*, ROWNUM rn
    FROM   cmic_cost_entries t
    WHERE  ROWNUM <= 30
)
WHERE rn > 20;

-- Oracle 12c+
SELECT *
FROM   cmic_cost_entries
ORDER  BY entry_date DESC
OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;

-- SQL Server 2012+
SELECT *
FROM   cmic_cost_entries
ORDER  BY entry_date DESC
OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;
```

### Querying the Data Dictionary

```sql
-- Oracle: list all tables you can see in the CMIC schema
SELECT table_name, num_rows
FROM   all_tables
WHERE  owner = 'CMIC'
ORDER  BY num_rows DESC NULLS LAST;

-- SQL Server equivalent
SELECT t.name AS table_name, p.rows
FROM   sys.tables t
JOIN   sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
WHERE  SCHEMA_NAME(t.schema_id) = 'cmic'
ORDER  BY p.rows DESC;
```

### Transaction Behavior

```sql
-- Oracle: DDL auto-commits
CREATE TABLE temp_staging (id NUMBER);
-- ^ implicit COMMIT happened here — no rollback possible

INSERT INTO temp_staging VALUES (1);
INSERT INTO temp_staging VALUES (2);
ROLLBACK;  -- only the INSERTs are rolled back; table still exists

-- SQL Server: DDL is transactional
BEGIN TRAN;
CREATE TABLE temp_staging (id INT);
INSERT INTO temp_staging VALUES (1);
ROLLBACK;  -- table creation AND insert are both rolled back
```

---

## Common Patterns

### Pattern 1 — Portable NULL Replacement

Use `COALESCE` everywhere. It is ANSI SQL, works in both engines, and accepts multiple
arguments. Avoid `NVL` in new code if portability matters.

### Pattern 2 — String Concatenation in Migrations

When converting Oracle `||` to SQL Server, replace with `CONCAT()` rather than `+`. The
`CONCAT` function handles NULLs gracefully in both engines.

### Pattern 3 — Existence Checks

```sql
-- Oracle idiom
SELECT 1 FROM DUAL WHERE EXISTS (SELECT 1 FROM cmic_jobs WHERE job_id = 'J-1001');

-- SQL Server idiom
IF EXISTS (SELECT 1 FROM cmic_jobs WHERE job_id = 'J-1001')
    PRINT 'Found';
```

### Pattern 4 — Sequences vs IDENTITY

Oracle traditionally uses sequences; SQL Server uses `IDENTITY`. When migrating, decide
whether to use SQL Server `SEQUENCE` objects (closer to Oracle) or `IDENTITY` columns.

### Pattern 5 — Schema-Qualified References

Always schema-qualify table references in migration scripts:

```sql
-- Oracle
SELECT * FROM CMIC.JOB_COST_HEADER;

-- SQL Server
SELECT * FROM cmic.JobCostHeader;
```

---

## Gotchas and Pitfalls

1. **Empty string = NULL in Oracle.** Your `WHERE col = ''` filters will behave
   differently after migration. Add explicit NULL checks.

2. **Oracle DATE includes time.** If you migrate an Oracle `DATE` to SQL Server `date`
   (no time), you will silently lose the time portion.

3. **ROWNUM is evaluated before ORDER BY.** `WHERE ROWNUM <= 10 ORDER BY name` does NOT
   give you the first 10 alphabetically — it gives you 10 arbitrary rows, then sorts them.

4. **DDL commits in Oracle.** If you run a `CREATE TABLE` in the middle of a transaction,
   everything before it is committed. No take-backs.

5. **Implicit type conversions differ.** Oracle is more lenient about converting strings to
   numbers. SQL Server may throw conversion errors where Oracle silently succeeds.

6. **Case sensitivity on identifiers.** If someone created `"jobCost"` with double quotes
   in Oracle, you must always refer to it as `"jobCost"`. Migration to SQL Server's
   case-insensitive world can hide these issues.

7. **GROUP BY strictness.** Oracle (with certain settings) and SQL Server both require
   non-aggregated columns in the GROUP BY. But Oracle's error messages are less helpful.

8. **MINUS vs EXCEPT.** Oracle uses `MINUS`; SQL Server uses `EXCEPT`. Same operation.

---

## Performance Considerations

- **Optimizer differences**: Oracle uses a cost-based optimizer (CBO) that relies heavily
  on statistics gathered by `DBMS_STATS`. SQL Server uses a similar CBO but the hint
  syntax and plan shapes differ. Plans from one engine cannot be assumed to work the same
  way on the other.

- **Index usage with NVL**: In Oracle, `NVL(col, 'X') = 'X'` typically cannot use an
  index on `col`. Rewrite as `col IS NULL OR col = 'X'`.

- **ROWNUM short-circuits**: `WHERE ROWNUM <= N` can act as an early exit — Oracle stops
  after N rows. `TOP N` in SQL Server does the same, but `OFFSET ... FETCH` must sort
  first.

- **Linked Server overhead**: When querying Oracle from SQL Server via a linked server, be
  aware that SQL Server may pull entire tables across the network and filter locally. Use
  `OPENQUERY` with a full Oracle query to push filters to the Oracle side.

- **Parallel query**: Oracle's parallel query (`/*+ PARALLEL(t, 4) */`) has no direct SQL
  Server equivalent. SQL Server uses MAXDOP, but the behavior is different.

---

## BNBuilders Context

As a Data Engineer at BNBuilders — a construction company running CMiC ERP on Oracle —
you face these real-world situations:

- **CMiC schema naming**: CMiC stores data in schemas like `CABORGS`, `CABJOBS`,
  `CABEQUIP`. These Oracle schemas need to map to SQL Server schemas or prefixed table
  names during migration.

- **Job cost data**: The `JOB_COST_DETAIL` and `JOB_COST_HEADER` tables often have
  millions of rows. Pagination (ROWNUM / FETCH FIRST) is critical when previewing data
  during validation.

- **Equipment tracking**: Equipment tables use Oracle `DATE` columns that include
  timestamps for checkout/return times. Make sure these map to `datetime2` in SQL Server,
  not `date`.

- **Field data integration**: Field data collected via mobile apps often flows into Oracle
  staging tables. Empty strings from JSON fields become NULL in Oracle but remain empty
  strings when loaded directly into SQL Server. Normalize during ETL.

- **Reporting migration**: CMiC reports may use Oracle-specific SQL (DECODE, NVL2,
  CONNECT BY). Each must be rewritten for SQL Server or Power BI DirectQuery.

- **Microsoft shop alignment**: BNBuilders uses Power BI, Azure Data Factory, and SSMS.
  Understanding the Oracle-to-SQL-Server mapping is essential for building ADF pipelines
  that read from Oracle sources and write to SQL Server sinks.

---

## Interview / Senior Dev Questions

1. **Q: You're migrating a CMiC table that stores phone numbers as VARCHAR2(20). Some rows
   have empty strings. How do you handle this in SQL Server?**
   A: In Oracle, those "empty strings" are actually NULL. Verify by checking `IS NULL`.
   In SQL Server, decide on a convention: keep them as NULL (matching Oracle behavior) or
   explicitly default to empty string. Document the choice and add a CHECK constraint or
   DEFAULT if needed.

2. **Q: A developer says "just change NVL to ISNULL." Why might that cause bugs?**
   A: `ISNULL` returns the data type of the first argument, potentially truncating the
   replacement value. `NVL` follows Oracle's type promotion rules. `COALESCE` is safer
   because it returns the highest-precedence type. Also, `NVL2` has no ISNULL equivalent.

3. **Q: The Oracle query uses `ORDER BY name FETCH FIRST 10 ROWS ONLY`. A junior dev
   rewrites it as `SELECT TOP 10 ... ORDER BY name` for SQL Server. Is this correct?**
   A: Yes, functionally equivalent. However, if ties exist and deterministic results are
   needed, use `TOP 10 WITH TIES` or add a tiebreaker column to the ORDER BY.

4. **Q: An Oracle stored procedure uses DDL inside a transaction. After migration to SQL
   Server, the behavior changes. Why?**
   A: Oracle DDL forces an implicit commit, so anything before the DDL is committed and
   cannot be rolled back. SQL Server DDL is transactional — the entire block can be rolled
   back. The migration may expose bugs that were hidden by Oracle's implicit commits.

5. **Q: How do you query Oracle metadata from SQL Server for an ADF pipeline?**
   A: Use a Linked Server with `OPENQUERY` to hit `ALL_TABLES`, `ALL_TAB_COLUMNS`, etc.
   Alternatively, use ADF's Oracle connector with a metadata-driven pipeline that queries
   the Oracle data dictionary to discover source tables dynamically.

---

## Quiz

### Question 1
What does Oracle do with an empty string (`''`) that SQL Server does not?

<details>
<summary>Show Answer</summary>

Oracle treats an empty string as `NULL`. So `'' IS NULL` evaluates to TRUE in Oracle but
FALSE in SQL Server. This is the single most common source of data-quality bugs during
Oracle-to-SQL-Server migration.
</details>

### Question 2
You have this Oracle query:
```sql
SELECT job_name, start_date + 90 FROM cmic_jobs;
```
Rewrite it for SQL Server.

<details>
<summary>Show Answer</summary>

```sql
SELECT job_name, DATEADD(DAY, 90, start_date) FROM cmic_jobs;
```
Oracle allows direct arithmetic on dates (adding integers as days). SQL Server requires
`DATEADD`.
</details>

### Question 3
Why is `WHERE ROWNUM <= 10 ORDER BY name` dangerous in Oracle?

<details>
<summary>Show Answer</summary>

`ROWNUM` is assigned **before** the `ORDER BY` is applied. So Oracle picks 10 arbitrary
rows first, then sorts them by name. To get the first 10 by name, you must sort in a
subquery first, then apply ROWNUM in the outer query — or use `FETCH FIRST 10 ROWS ONLY`
(12c+).
</details>

### Question 4
Oracle uses `MINUS` for set difference. What is the SQL Server equivalent?

<details>
<summary>Show Answer</summary>

`EXCEPT`. The behavior is identical — returns rows from the first query that do not appear
in the second. Both eliminate duplicates.
</details>

### Question 5
A CREATE TABLE statement is issued inside a transaction in Oracle. Can you ROLLBACK the
table creation?

<details>
<summary>Show Answer</summary>

No. In Oracle, DDL statements trigger an implicit commit both before and after execution.
The table creation is permanent the moment it executes, and any prior uncommitted DML is
also committed. In SQL Server, DDL is transactional and can be rolled back.
</details>
