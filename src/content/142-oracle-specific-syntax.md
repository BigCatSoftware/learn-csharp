# Oracle-Specific Syntax

*Chapter 10.3 — Oracle SQL for Data Engineers*

---

## Overview

Oracle SQL has a rich set of functions and syntax features that have no direct equivalent
in SQL Server. Some are convenience functions (NVL2, DECODE), some are structural (CONNECT
BY for hierarchies, DUAL table), and some are formatting powerhouses (TO_CHAR, TO_DATE).

This lesson catalogs the Oracle-specific syntax you will encounter when reading CMiC ERP
queries, migrating stored procedures, and building ETL logic. For each feature, we show
the Oracle syntax and the SQL Server equivalent (or workaround).

---

## Core Concepts

### 1. ROWNUM and ROWID

**ROWNUM** is a pseudo-column assigned to each row *as it is returned* from a query. It is
a sequential number starting at 1.

- Assigned **before** ORDER BY
- Cannot use `ROWNUM > N` directly (a row must be assigned ROWNUM 1 before ROWNUM 2
  exists)
- Useful for limiting results in pre-12c Oracle

**ROWID** is the physical address of a row on disk. It uniquely identifies a row within a
table.

- Not portable across export/import or table reorganization
- Useful for update-by-rowid patterns and `DBMS_PARALLEL_EXECUTE` chunking
- Not a substitute for a primary key

### 2. The DUAL Table

`DUAL` is a single-row, single-column table owned by SYS. Oracle requires a FROM clause
on every SELECT, so DUAL serves as a dummy source:

```sql
SELECT SYSDATE FROM DUAL;
SELECT 1 + 1 FROM DUAL;
```

### 3. NVL, NVL2, DECODE

| Function | Behavior | SQL Server Equivalent |
|----------|---------|----------------------|
| `NVL(a, b)` | If a IS NULL, return b | `ISNULL(a, b)` or `COALESCE(a, b)` |
| `NVL2(a, b, c)` | If a IS NOT NULL return b, else return c | `IIF(a IS NOT NULL, b, c)` or `CASE` |
| `DECODE(expr, s1, r1, s2, r2, ..., default)` | Positional IF/ELSE | `CASE expr WHEN s1 THEN r1 WHEN s2 THEN r2 ... ELSE default END` |

`DECODE` treats NULL = NULL as TRUE, which is different from `CASE` where `NULL = NULL` is
UNKNOWN.

### 4. CONNECT BY for Hierarchies

Oracle's proprietary hierarchical query syntax:

```sql
SELECT employee_id, manager_id, LEVEL, SYS_CONNECT_BY_PATH(name, '/')
FROM   employees
START WITH manager_id IS NULL
CONNECT BY PRIOR employee_id = manager_id
ORDER SIBLINGS BY name;
```

Key keywords:
- `START WITH` — root condition
- `CONNECT BY PRIOR` — parent-child relationship
- `LEVEL` — depth in the hierarchy
- `SYS_CONNECT_BY_PATH` — builds a path string
- `ORDER SIBLINGS BY` — orders within each level
- `CONNECT_BY_ISLEAF` — 1 if the row is a leaf node
- `CONNECT_BY_ISCYCLE` — 1 if a cycle is detected (with NOCYCLE)

SQL Server equivalent: recursive CTE.

### 5. LISTAGG for String Aggregation

```sql
SELECT department_id,
       LISTAGG(employee_name, ', ') WITHIN GROUP (ORDER BY employee_name)
FROM   employees
GROUP  BY department_id;
```

SQL Server equivalent: `STRING_AGG(employee_name, ', ') WITHIN GROUP (ORDER BY employee_name)` (2017+).

### 6. REGEXP Functions

| Oracle | Purpose | SQL Server |
|--------|---------|-----------|
| `REGEXP_LIKE(col, pattern)` | Match test | No native function; use `col LIKE` or CLR |
| `REGEXP_REPLACE(col, pattern, repl)` | Replace | No native; use nested `REPLACE` or CLR |
| `REGEXP_SUBSTR(col, pattern)` | Extract match | No native; use `SUBSTRING` + `PATINDEX` |
| `REGEXP_INSTR(col, pattern)` | Position of match | `PATINDEX('%pattern%', col)` (limited) |
| `REGEXP_COUNT(col, pattern)` | Count matches | No native equivalent |

### 7. String Functions — TRIM/LTRIM/RTRIM

Oracle's `TRIM` is more powerful:

```sql
-- Oracle: remove specific characters
SELECT TRIM(BOTH '0' FROM '000123000') FROM DUAL;  -- '123'
SELECT TRIM(LEADING '0' FROM '000123') FROM DUAL;   -- '123'

-- SQL Server: TRIM only removes spaces (pre-2017) or specified chars (2017+)
SELECT TRIM('0' FROM '000123000');  -- SQL Server 2017+
```

Oracle `LTRIM`/`RTRIM` accept a *set* of characters to remove. SQL Server versions remove
only spaces (or a single specified string in newer versions).

### 8. Date/Time Functions

| Oracle | Purpose | Example |
|--------|---------|---------|
| `SYSDATE` | Current date + time | `SELECT SYSDATE FROM DUAL` |
| `SYSTIMESTAMP` | Current timestamp with TZ | `SELECT SYSTIMESTAMP FROM DUAL` |
| `ADD_MONTHS(d, n)` | Add n months | `ADD_MONTHS(SYSDATE, 3)` |
| `MONTHS_BETWEEN(d1, d2)` | Fractional months between | `MONTHS_BETWEEN(d1, d2)` |
| `LAST_DAY(d)` | Last day of month | `LAST_DAY(SYSDATE)` |
| `NEXT_DAY(d, 'MONDAY')` | Next occurrence of weekday | No direct equivalent |
| `TRUNC(d)` | Truncate to day | `CAST(d AS DATE)` in SQL Server |
| `TRUNC(d, 'MM')` | Truncate to 1st of month | `DATEFROMPARTS(YEAR(d), MONTH(d), 1)` |
| `EXTRACT(YEAR FROM d)` | Extract year | `YEAR(d)` or `DATEPART(YEAR, d)` |

### 9. TO_CHAR, TO_DATE, TO_NUMBER

These are Oracle's explicit conversion functions:

```sql
-- TO_CHAR: format a date or number as string
SELECT TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') FROM DUAL;
SELECT TO_CHAR(1234567.89, '9,999,999.00') FROM DUAL;

-- TO_DATE: parse a string into a DATE
SELECT TO_DATE('2026-03-15', 'YYYY-MM-DD') FROM DUAL;

-- TO_NUMBER: parse a string into a number
SELECT TO_NUMBER('1,234.56', '9,999.99') FROM DUAL;
```

SQL Server equivalents:
- `TO_CHAR` → `FORMAT()`, `CONVERT()`, or `CAST()`
- `TO_DATE` → `CAST('2026-03-15' AS DATE)` or `CONVERT(DATETIME2, '2026-03-15', 23)`
- `TO_NUMBER` → `CAST('1234.56' AS DECIMAL(10,2))` (no format mask support)

---

## Code Examples

### ROWNUM — Limiting Results

```sql
-- Oracle pre-12c: get first 100 rows (no guaranteed order)
SELECT * FROM cmic.job_cost_detail WHERE ROWNUM <= 100;

-- Oracle pre-12c: get top 100 by amount (must use subquery)
SELECT * FROM (
    SELECT * FROM cmic.job_cost_detail ORDER BY amount DESC
) WHERE ROWNUM <= 100;

-- Oracle 12c+: cleaner syntax
SELECT * FROM cmic.job_cost_detail
ORDER BY amount DESC
FETCH FIRST 100 ROWS ONLY;
```

### ROWID — Accessing Physical Row Address

```sql
-- Oracle: use ROWID for efficient single-row updates
SELECT ROWID, job_id, status
FROM   cmic.jobs
WHERE  job_id = 'J-1001';

UPDATE cmic.jobs SET status = 'CLOSED'
WHERE  ROWID = 'AAAE6dAAFAAAABfAAA';

-- ROWID is critical for DBMS_PARALLEL_EXECUTE chunking (see lesson 145)
```

### NVL2 — Three-Way NULL Logic

```sql
-- Oracle: display 'Assigned' or 'Unassigned' based on NULL
SELECT job_id,
       NVL2(foreman_id, 'Assigned', 'Unassigned') AS foreman_status
FROM   cmic.jobs;

-- SQL Server equivalent
SELECT job_id,
       IIF(foreman_id IS NOT NULL, 'Assigned', 'Unassigned') AS foreman_status
FROM   cmic.jobs;
```

### DECODE — Positional Matching

```sql
-- Oracle: DECODE is compact but hard to read
SELECT job_id,
       DECODE(status, 'A', 'Active',
                       'C', 'Closed',
                       'H', 'On Hold',
                       'Unknown') AS status_desc
FROM   cmic.jobs;

-- SQL Server: use CASE (also works in Oracle)
SELECT job_id,
       CASE status
           WHEN 'A' THEN 'Active'
           WHEN 'C' THEN 'Closed'
           WHEN 'H' THEN 'On Hold'
           ELSE 'Unknown'
       END AS status_desc
FROM   cmic.jobs;
```

### CONNECT BY — Hierarchical Query

```sql
-- Oracle: find all sub-jobs under a parent job
SELECT LEVEL,
       LPAD(' ', 2 * (LEVEL - 1)) || job_id AS indented_job,
       parent_job_id,
       SYS_CONNECT_BY_PATH(job_id, ' > ') AS path
FROM   cmic.job_hierarchy
START WITH parent_job_id IS NULL
CONNECT BY PRIOR job_id = parent_job_id
ORDER SIBLINGS BY job_id;

-- SQL Server equivalent: recursive CTE
WITH job_tree AS (
    SELECT job_id, parent_job_id, 1 AS lvl,
           CAST(job_id AS VARCHAR(1000)) AS path
    FROM   cmic.job_hierarchy
    WHERE  parent_job_id IS NULL

    UNION ALL

    SELECT c.job_id, c.parent_job_id, p.lvl + 1,
           CAST(p.path + ' > ' + c.job_id AS VARCHAR(1000))
    FROM   cmic.job_hierarchy c
    JOIN   job_tree p ON c.parent_job_id = p.job_id
)
SELECT lvl,
       REPLICATE(' ', 2 * (lvl - 1)) + job_id AS indented_job,
       parent_job_id,
       path
FROM   job_tree
ORDER  BY path;
```

### LISTAGG — Aggregate Strings

```sql
-- Oracle: comma-separated list of cost codes per job
SELECT job_id,
       LISTAGG(cost_code, ', ') WITHIN GROUP (ORDER BY cost_code) AS cost_codes
FROM   cmic.job_cost_detail
GROUP  BY job_id;

-- Handle LISTAGG overflow (12c R2+)
SELECT job_id,
       LISTAGG(cost_code, ', ' ON OVERFLOW TRUNCATE '...' WITH COUNT)
           WITHIN GROUP (ORDER BY cost_code) AS cost_codes
FROM   cmic.job_cost_detail
GROUP  BY job_id;

-- SQL Server 2017+ equivalent
SELECT job_id,
       STRING_AGG(cost_code, ', ') WITHIN GROUP (ORDER BY cost_code) AS cost_codes
FROM   cmic.job_cost_detail
GROUP  BY job_id;
```

### REGEXP Functions

```sql
-- Oracle: find jobs with IDs matching a pattern (letter-digits-digits)
SELECT job_id
FROM   cmic.jobs
WHERE  REGEXP_LIKE(job_id, '^[A-Z]-\d{4}-\d{2}$');

-- Oracle: extract the numeric portion of a job code
SELECT job_id,
       REGEXP_SUBSTR(job_id, '\d+') AS first_number
FROM   cmic.jobs;

-- Oracle: replace non-alphanumeric characters
SELECT REGEXP_REPLACE(description, '[^A-Za-z0-9 ]', '') AS clean_desc
FROM   cmic.jobs;
```

### TO_CHAR Date Formatting

```sql
-- Oracle: common format masks
SELECT TO_CHAR(SYSDATE, 'YYYY-MM-DD')           FROM DUAL;  -- 2026-03-24
SELECT TO_CHAR(SYSDATE, 'DD-MON-YYYY')          FROM DUAL;  -- 24-MAR-2026
SELECT TO_CHAR(SYSDATE, 'HH24:MI:SS')           FROM DUAL;  -- 14:30:00
SELECT TO_CHAR(SYSDATE, 'Day, Month DD, YYYY')  FROM DUAL;  -- Tuesday , March    24, 2026
SELECT TO_CHAR(SYSDATE, 'Q')                     FROM DUAL;  -- 1 (quarter)
SELECT TO_CHAR(SYSDATE, 'WW')                    FROM DUAL;  -- 12 (week of year)
SELECT TO_CHAR(SYSDATE, 'DY')                    FROM DUAL;  -- TUE
```

### TO_CHAR Number Formatting

```sql
-- Oracle: format numbers for reports
SELECT TO_CHAR(1234567.89, '$9,999,999.00')  FROM DUAL;  -- $1,234,567.89
SELECT TO_CHAR(0.5, '0.00')                  FROM DUAL;  --  0.50
SELECT TO_CHAR(42, '000')                    FROM DUAL;  --  042
```

---

## Common Patterns

### Pattern 1 — DECODE to CASE Migration

Replace every `DECODE` with a `CASE` expression. `CASE` is ANSI standard and works in
both Oracle and SQL Server. Be careful with NULL handling: `DECODE(col, NULL, 'yes')`
matches NULLs, but `CASE WHEN col = NULL` does not. Use `CASE WHEN col IS NULL`.

### Pattern 2 — CONNECT BY to Recursive CTE

1. The `START WITH` clause becomes the anchor member of the CTE.
2. The `CONNECT BY PRIOR` clause becomes the JOIN in the recursive member.
3. `LEVEL` becomes a counter incremented in the recursive member.
4. `SYS_CONNECT_BY_PATH` becomes string concatenation in the CTE.
5. `ORDER SIBLINGS BY` requires sorting by the full path.

### Pattern 3 — Date String Roundtrip

When migrating Oracle queries that use `TO_DATE` and `TO_CHAR`, replace with explicit
`CAST` / `CONVERT` in SQL Server. Avoid implicit date parsing in SQL Server — it is
locale-dependent and fragile.

### Pattern 4 — Regex Replacement

For simple patterns, rewrite Oracle `REGEXP_LIKE` as `LIKE` with wildcards. For complex
patterns in SQL Server, consider:
- A CLR function wrapping .NET regex
- Handling in the application/ETL layer (C#, Python)
- SQL Server 2025 may add native regex support

---

## Gotchas and Pitfalls

1. **DECODE NULL matching.** `DECODE(col, NULL, 'Y', 'N')` returns 'Y' when col is NULL.
   The equivalent `CASE col WHEN NULL THEN 'Y' ELSE 'N' END` **always** returns 'N'
   because `col = NULL` is UNKNOWN. You must write `CASE WHEN col IS NULL THEN 'Y'`.

2. **ROWNUM before ORDER BY.** As covered in the previous lesson: `WHERE ROWNUM <= 10
   ORDER BY name` gives 10 random rows sorted, not the top 10.

3. **TO_DATE with wrong format mask.** `TO_DATE('03/24/2026', 'DD/MM/YYYY')` silently
   swaps day and month if the values are both <= 12. Oracle does not validate semantics,
   only syntax.

4. **LISTAGG result exceeding 4000 bytes.** Prior to 12c R2, LISTAGG throws
   ORA-01489 if the result exceeds 4000 bytes. Use the `ON OVERFLOW TRUNCATE` clause.

5. **MONTHS_BETWEEN fractional results.** `MONTHS_BETWEEN('31-MAR-2026', '28-FEB-2026')`
   returns 1.0 (both are end-of-month), but `MONTHS_BETWEEN('30-MAR-2026', '28-FEB-2026')`
   returns 0.935... — the fractional part uses a 31-day month denominator.

6. **NEXT_DAY depends on NLS_DATE_LANGUAGE.** `NEXT_DAY(SYSDATE, 'MONDAY')` fails if the
   session language is not English. Use `NEXT_DAY(SYSDATE, 'MON')` or use day numbers.

7. **REGEXP performance.** Oracle regex functions do not use indexes. On large tables,
   `REGEXP_LIKE` can cause full table scans. Prefer `LIKE` when possible.

8. **TRUNC vs CAST for dates.** `TRUNC(SYSDATE)` removes the time in Oracle. In SQL
   Server, `CAST(GETDATE() AS DATE)` removes time but returns a `date` type, not
   `datetime`. This can affect arithmetic and comparisons downstream.

---

## Performance Considerations

- **DECODE vs CASE**: No performance difference in Oracle. Use CASE for readability and
  portability.

- **CONNECT BY vs recursive CTE**: Oracle's CONNECT BY is optimized internally and can
  outperform recursive CTEs for deep hierarchies. When migrating to SQL Server, set
  `OPTION (MAXRECURSION N)` appropriately and test with realistic data volumes.

- **LISTAGG on large groups**: Aggregating thousands of values into a single string is
  expensive. If only used for display, do the aggregation in the presentation layer.

- **REGEXP on indexed columns**: Oracle cannot use B-tree indexes with REGEXP. If you need
  pattern-based lookups at scale, consider a function-based index or a derived column.

- **TO_CHAR in WHERE clauses**: `WHERE TO_CHAR(date_col, 'YYYY') = '2026'` prevents
  index usage on `date_col`. Rewrite as a range:
  `WHERE date_col >= DATE '2026-01-01' AND date_col < DATE '2027-01-01'`.

---

## BNBuilders Context

CMiC ERP on Oracle uses many of these features in its stored procedures and reports:

- **DECODE for status mapping**: CMiC frequently uses `DECODE` instead of `CASE` for
  mapping status codes to descriptions in views and reports. Every one of these must be
  converted to `CASE` for SQL Server.

- **CONNECT BY for cost code hierarchies**: Construction cost codes (CSI MasterFormat)
  are hierarchical. CMiC queries often use `CONNECT BY` to roll up costs from detail
  codes to summary levels. These become recursive CTEs in SQL Server.

- **LISTAGG for subcontractor lists**: Reports that show all subs on a job use LISTAGG
  to create comma-separated lists. Migrate to `STRING_AGG` in SQL Server 2017+.

- **TO_CHAR for period formatting**: CMiC accounting periods are often formatted with
  `TO_CHAR(period_date, 'YYYY-MM')`. Replace with `FORMAT(period_date, 'yyyy-MM')` or
  `CONVERT(CHAR(7), period_date, 121)`.

- **REGEXP for data cleaning**: Field data from job sites often contains non-standard
  characters. Oracle ETL scripts use `REGEXP_REPLACE` for cleanup. In the SQL Server
  migration, handle this in ADF data flows or C# preprocessing.

- **ROWID for chunked deletes**: When purging old timecard or daily report data, DBAs
  use ROWID-based chunking to avoid lock escalation. See lesson 145 for the full
  `DBMS_PARALLEL_EXECUTE` pattern.

---

## Interview / Senior Dev Questions

1. **Q: DECODE treats NULL = NULL as TRUE. How does this affect migration to CASE in SQL
   Server?**
   A: Any `DECODE(col, NULL, ...)` must become `CASE WHEN col IS NULL THEN ...`. A simple
   `CASE col WHEN NULL THEN ...` does not work because SQL uses three-valued logic where
   NULL = NULL is UNKNOWN, not TRUE.

2. **Q: How would you migrate a CONNECT BY query that uses CONNECT_BY_ISCYCLE and NOCYCLE
   to SQL Server?**
   A: Use a recursive CTE with a cycle detection column. Track visited nodes in a
   VARCHAR path or use a separate anchor. Set `MAXRECURSION` to a safe limit. SQL Server
   does not have built-in cycle detection, so you must implement it manually.

3. **Q: A developer uses `TO_CHAR(amount, '999,999.99')` in an Oracle report query. After
   migration, the SQL Server report shows different formatting. Why?**
   A: Oracle's `TO_CHAR` number formatting adds leading spaces for positive numbers (to
   align with the minus sign). `FORMAT()` in SQL Server does not. Also, locale-specific
   thousand separators and decimal points may differ. Explicitly set culture in `FORMAT()`
   or use `CONVERT` with a known style.

4. **Q: You find a 20-level deep CONNECT BY query in CMiC. After converting to a recursive
   CTE, it hits the default MAXRECURSION limit of 100. What do you do?**
   A: First verify the data does not have cycles causing infinite recursion. If the
   hierarchy legitimately exceeds 100 levels, add `OPTION (MAXRECURSION 0)` for unlimited
   or set a reasonable upper bound. Also consider materializing the hierarchy in a
   closure table for better performance.

---

## Quiz

### Question 1
What is the difference between ROWNUM and ROWID in Oracle?

<details>
<summary>Show Answer</summary>

`ROWNUM` is a pseudo-column that assigns a sequential number (1, 2, 3, ...) to each row
as it is returned by the query. It is virtual and changes with each query execution.

`ROWID` is the physical address of a row on disk. It is persistent (until the row moves)
and uniquely identifies a specific row in a specific table. ROWID is used for efficient
single-row access and is the basis for `DBMS_PARALLEL_EXECUTE` chunking.
</details>

### Question 2
Convert this Oracle query to SQL Server:
```sql
SELECT DECODE(status, NULL, 'Missing', 'A', 'Active', 'C', 'Closed', 'Other')
FROM cmic.jobs;
```

<details>
<summary>Show Answer</summary>

```sql
SELECT CASE
           WHEN status IS NULL THEN 'Missing'
           WHEN status = 'A'   THEN 'Active'
           WHEN status = 'C'   THEN 'Closed'
           ELSE 'Other'
       END
FROM cmic.jobs;
```

Note: You must use `WHEN status IS NULL` (not `WHEN status = NULL`) because DECODE treats
NULL = NULL as TRUE, but CASE follows standard SQL three-valued logic.
</details>

### Question 3
What Oracle function aggregates strings from multiple rows into a single comma-separated
value, and what is the SQL Server 2017+ equivalent?

<details>
<summary>Show Answer</summary>

Oracle: `LISTAGG(column, ', ') WITHIN GROUP (ORDER BY column)`

SQL Server 2017+: `STRING_AGG(column, ', ') WITHIN GROUP (ORDER BY column)`

Both aggregate values from multiple rows in a group into a single delimited string. Prior
to SQL Server 2017, the common workaround was `FOR XML PATH('')` with `STUFF`.
</details>

### Question 4
Why does `WHERE TO_CHAR(date_col, 'YYYY') = '2026'` perform poorly?

<details>
<summary>Show Answer</summary>

Applying `TO_CHAR` to the column prevents the optimizer from using any index on
`date_col`. The function must be evaluated for every row (full table scan). The correct
approach is a range predicate:
```sql
WHERE date_col >= DATE '2026-01-01' AND date_col < DATE '2027-01-01'
```
This allows an index range scan on `date_col`.
</details>
