# Temporal Tables

*Chapter 9.12 — T-SQL for Data Engineers*

## Overview

System-versioned temporal tables (introduced in SQL Server 2016) automatically track the full
history of data changes. Every UPDATE and DELETE is captured in a paired history table with
precise validity periods. You never lose data — you gain a built-in audit trail and the ability
to query the state of the data at any point in time.

For Data Engineers, temporal tables solve several pain points:

- **Auditing**: Regulatory and contractual requirements to show who changed what and when.
- **Slowly Changing Dimensions (SCD)**: Type 2 SCD behavior is essentially built-in.
- **Point-in-time reporting**: "What did the budget look like on January 15?"
- **Debugging**: "When did this cost code change from $50K to $500K?"
- **Data recovery**: Accidentally updated rows can be recovered from the history table.

This lesson covers creating temporal tables, querying with time-travel syntax, altering
temporal schemas, and managing history retention.

---

## Core Concepts

### How It Works

1. The **current table** holds live data (same as any normal table).
2. The **history table** holds previous versions of rows.
3. Two `DATETIME2` columns mark the validity period:
   - `SysStartTime` — when this version became current.
   - `SysEndTime` — when this version was superseded (set to `9999-12-31` for current rows).
4. SQL Server automatically populates these columns on INSERT, UPDATE, and DELETE.
5. `SYSTEM_TIME` queries let you ask for data AS OF a specific moment.

### Temporal Query Clauses

| Clause | Returns |
|---|---|
| `AS OF <datetime>` | Single snapshot — row valid at that moment |
| `FROM <start> TO <end>` | Rows overlapping the open interval (start, end) |
| `BETWEEN <start> AND <end>` | Rows overlapping the closed-open interval [start, end) |
| `CONTAINED IN (<start>, <end>)` | Rows whose entire validity falls within the range |
| `ALL` | All current + historical rows |

### Key Rules

- The period columns must be `DATETIME2` (any precision), NOT NULL, with `GENERATED ALWAYS
  AS ROW START / END`.
- The history table is created automatically (or you can name your own).
- You cannot directly INSERT, UPDATE, or DELETE in the history table while system-versioning
  is active.
- The history table has no primary key or constraints (by design — it stores multiple
  versions of the same PK).

---

## Code Examples

### Creating a Temporal Table

```sql
CREATE TABLE dbo.JobCosts (
    JobCostID     INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    JobNumber     NVARCHAR(20)      NOT NULL,
    CostCode      NVARCHAR(10)      NOT NULL,
    BudgetAmount  DECIMAL(14, 2)    NOT NULL,
    ActualAmount  DECIMAL(14, 2)    NOT NULL DEFAULT 0,
    LastUpdatedBy NVARCHAR(100)     NOT NULL,

    -- Temporal period columns
    SysStartTime  DATETIME2 GENERATED ALWAYS AS ROW START NOT NULL,
    SysEndTime    DATETIME2 GENERATED ALWAYS AS ROW END   NOT NULL,
    PERIOD FOR SYSTEM_TIME (SysStartTime, SysEndTime)
)
WITH (
    SYSTEM_VERSIONING = ON (
        HISTORY_TABLE = dbo.JobCostsHistory,
        HISTORY_RETENTION_PERIOD = 2 YEARS
    )
);
```

### Creating a Temporal Table with an Existing History Table

```sql
-- If you want to control the history table schema/name upfront:
CREATE TABLE dbo.BudgetRevisionsHistory (
    RevisionID    INT               NOT NULL,
    JobNumber     NVARCHAR(20)      NOT NULL,
    RevisionNum   INT               NOT NULL,
    Amount        DECIMAL(14, 2)    NOT NULL,
    SysStartTime  DATETIME2         NOT NULL,
    SysEndTime    DATETIME2         NOT NULL
);

-- Add a clustered columnstore index for efficient history scans
CREATE CLUSTERED COLUMNSTORE INDEX CCI_BudgetRevisionsHistory
    ON dbo.BudgetRevisionsHistory;

CREATE TABLE dbo.BudgetRevisions (
    RevisionID    INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    JobNumber     NVARCHAR(20)      NOT NULL,
    RevisionNum   INT               NOT NULL,
    Amount        DECIMAL(14, 2)    NOT NULL,
    SysStartTime  DATETIME2 GENERATED ALWAYS AS ROW START NOT NULL,
    SysEndTime    DATETIME2 GENERATED ALWAYS AS ROW END   NOT NULL,
    PERIOD FOR SYSTEM_TIME (SysStartTime, SysEndTime)
)
WITH (
    SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.BudgetRevisionsHistory)
);
```

### Basic DML — Temporal Tracking Is Automatic

```sql
-- INSERT: SysStartTime = now, SysEndTime = 9999-12-31
INSERT INTO dbo.JobCosts (JobNumber, CostCode, BudgetAmount, LastUpdatedBy)
VALUES ('BNB-4500', '03-310', 125000.00, 'jsmith');

-- UPDATE: old row moves to history, current row gets new SysStartTime
UPDATE dbo.JobCosts
SET BudgetAmount = 140000.00,
    LastUpdatedBy = 'mchen'
WHERE JobNumber = 'BNB-4500' AND CostCode = '03-310';

-- DELETE: row moves to history with SysEndTime = now
DELETE FROM dbo.JobCosts
WHERE JobNumber = 'BNB-4500' AND CostCode = '03-310';
```

### Querying AS OF (Point-in-Time Snapshot)

```sql
-- "What did job costs look like on March 1, 2026?"
SELECT
    JobNumber,
    CostCode,
    BudgetAmount,
    ActualAmount,
    LastUpdatedBy
FROM dbo.JobCosts
    FOR SYSTEM_TIME AS OF '2026-03-01T00:00:00'
WHERE JobNumber = 'BNB-4500';
```

### Querying FROM...TO (Open Interval)

```sql
-- All versions of a cost code during Q1 2026 (exclusive of end)
SELECT
    JobNumber,
    CostCode,
    BudgetAmount,
    LastUpdatedBy,
    SysStartTime,
    SysEndTime
FROM dbo.JobCosts
    FOR SYSTEM_TIME FROM '2026-01-01' TO '2026-04-01'
WHERE JobNumber = 'BNB-4500' AND CostCode = '03-310'
ORDER BY SysStartTime;
```

### Querying BETWEEN (Closed-Open Interval)

```sql
-- Includes rows that START exactly at the boundary
SELECT *
FROM dbo.JobCosts
    FOR SYSTEM_TIME BETWEEN '2026-01-01' AND '2026-03-31'
WHERE JobNumber = 'BNB-4500'
ORDER BY CostCode, SysStartTime;
```

### Querying CONTAINED IN

```sql
-- Only rows whose ENTIRE validity period falls within the range
-- Useful for finding short-lived changes (potential errors)
SELECT *
FROM dbo.JobCosts
    FOR SYSTEM_TIME CONTAINED IN ('2026-03-01', '2026-03-31')
WHERE JobNumber = 'BNB-4500'
ORDER BY SysStartTime;
```

### Querying ALL History

```sql
-- Every version of every row, current + historical
SELECT
    JobCostID,
    JobNumber,
    CostCode,
    BudgetAmount,
    LastUpdatedBy,
    SysStartTime,
    SysEndTime
FROM dbo.JobCosts
    FOR SYSTEM_TIME ALL
WHERE JobNumber = 'BNB-4500'
ORDER BY CostCode, SysStartTime;
```

### Seeing What Changed (Diff Pattern)

```sql
-- Compare current values to what they were 30 days ago
SELECT
    curr.JobNumber,
    curr.CostCode,
    prev.BudgetAmount  AS BudgetAmount_30DaysAgo,
    curr.BudgetAmount  AS BudgetAmount_Current,
    curr.BudgetAmount - prev.BudgetAmount AS Delta
FROM dbo.JobCosts AS curr
INNER JOIN dbo.JobCosts FOR SYSTEM_TIME AS OF DATEADD(DAY, -30, SYSUTCDATETIME()) AS prev
    ON curr.JobCostID = prev.JobCostID
WHERE curr.JobNumber = 'BNB-4500'
  AND curr.BudgetAmount <> prev.BudgetAmount;
```

---

## Common Patterns

### Pattern 1: Audit Report — Who Changed What

```sql
-- Show all changes to a specific job, most recent first
SELECT
    h.JobCostID,
    h.CostCode,
    h.BudgetAmount,
    h.LastUpdatedBy,
    h.SysStartTime AS ChangedAt,
    h.SysEndTime   AS SupersededAt,
    CASE
        WHEN h.SysEndTime = '9999-12-31' THEN 'Current'
        ELSE 'Historical'
    END AS RowStatus
FROM dbo.JobCosts FOR SYSTEM_TIME ALL AS h
WHERE h.JobNumber = 'BNB-4500'
ORDER BY h.CostCode, h.SysStartTime DESC;
```

### Pattern 2: SCD Type 2 Replacement

```sql
-- Traditional SCD2 requires triggers or ETL merge logic.
-- Temporal tables give you SCD2 automatically.
-- Your dimension view just reads from the temporal table:

CREATE VIEW dbo.vw_DimCostCode AS
SELECT
    JobCostID       AS CostCodeKey,
    JobNumber,
    CostCode,
    BudgetAmount,
    SysStartTime    AS EffectiveFrom,
    SysEndTime      AS EffectiveTo,
    CASE WHEN SysEndTime = '9999-12-31' THEN 1 ELSE 0 END AS IsCurrent
FROM dbo.JobCosts FOR SYSTEM_TIME ALL;
```

### Pattern 3: Rolling Back a Bad Update

```sql
-- Someone set BudgetAmount to 5000000 instead of 500000.
-- Find the previous correct value:
SELECT TOP 1 BudgetAmount, SysStartTime
FROM dbo.JobCostsHistory
WHERE JobCostID = 42
ORDER BY SysEndTime DESC;

-- Restore it:
UPDATE dbo.JobCosts
SET BudgetAmount = 500000.00,
    LastUpdatedBy = 'admin-fix'
WHERE JobCostID = 42;
-- The bad version is now captured in history too — full trail preserved.
```

---

## Gotchas and Pitfalls

1. **Period columns use UTC**. `SysStartTime` and `SysEndTime` are always UTC. If you query
   `AS OF '2026-03-24 08:00:00'` thinking it is Pacific time, you are off by 7-8 hours.
   Always convert: `AS OF '2026-03-24T15:00:00'` for 8 AM PT.

2. **Cannot modify history directly**. While system-versioning is ON, you cannot INSERT,
   UPDATE, or DELETE in the history table. To clean up history, you must temporarily disable
   versioning.

3. **Schema changes require extra steps**. Adding a column to the current table does NOT
   automatically add it to the history table. You must add the column to both tables (or
   disable versioning, alter, re-enable).

4. **History table has no constraints**. No PK, no FK, no unique indexes by default. This is
   intentional (multiple versions of the same PK exist) but means the history table can grow
   without bound.

5. **TRUNCATE is not supported** on temporal tables. Use DELETE (which populates history) or
   disable versioning first if you need to wipe data.

6. **Merge statements work** but every UPDATE/DELETE within the MERGE feeds the history
   table, which can produce large history volumes during big ETL merges.

7. **Retention policy is not retroactive**. Setting `HISTORY_RETENTION_PERIOD = 1 YEAR`
   does not immediately delete old history. SQL Server's background cleanup task eventually
   removes expired rows.

8. **Temporal and partitioning**. The current table can be partitioned. The history table
   can also be partitioned (recommended for large histories). Use partition switching for
   efficient history archival.

---

## Performance Considerations

- **Clustered columnstore on history table**. History tables are append-only and read with
  range scans — perfect for columnstore. This dramatically reduces history storage and
  speeds up temporal queries.

- **Page compression at minimum**. If not using columnstore, enable PAGE compression on the
  history table. History rows are highly compressible (many repeated values).

- **Index the period columns** on the history table if you do frequent AS OF or range queries.
  A nonclustered index on `(SysStartTime, SysEndTime)` is a common choice.

- **Beware of large UPDATE batches**. An UPDATE of 1 million rows creates 1 million new
  history rows in a single transaction. This can cause log growth and tempdb pressure. Batch
  updates into chunks of 10K-50K rows.

- **Retention cleanup is background**. Don't rely on it for space reclamation timing. If you
  need immediate cleanup, disable versioning, delete old history, re-enable.

- **Statistics on history**. SQL Server does not auto-create statistics on the history table.
  Create them manually if temporal queries are slow:

```sql
CREATE STATISTICS ST_JobCosts_History_Period
    ON dbo.JobCostsHistory (SysStartTime, SysEndTime);
```

---

## BNBuilders Context

### Job Cost Auditing

Construction contracts require auditable cost tracking. When a project manager revises a
budget line, the old value must be preserved. Temporal tables provide this automatically:

```sql
-- Monthly audit report for owner: all budget changes on BNB-4500
SELECT
    CostCode,
    BudgetAmount,
    LastUpdatedBy,
    SysStartTime AS EffectiveDate
FROM dbo.JobCosts FOR SYSTEM_TIME ALL
WHERE JobNumber = 'BNB-4500'
  AND SysStartTime >= '2026-03-01'
  AND SysStartTime <  '2026-04-01'
ORDER BY CostCode, SysStartTime;
```

### Budget Revision History

During a project, budgets get revised multiple times as scope changes, change orders, and
buy-outs occur. With temporal tables, you can show a complete revision timeline:

```sql
-- Budget trajectory for concrete work on BNB-4500
SELECT
    BudgetAmount,
    SysStartTime AS RevisedAt,
    LastUpdatedBy AS RevisedBy,
    LEAD(BudgetAmount) OVER (ORDER BY SysStartTime) AS NextBudget
FROM dbo.JobCosts FOR SYSTEM_TIME ALL
WHERE JobNumber = 'BNB-4500'
  AND CostCode = '03-310'
ORDER BY SysStartTime;
```

### Oracle-to-SQL Server Migration

When migrating from Oracle (which has Flashback) to SQL Server, temporal tables serve as the
equivalent mechanism. Map Oracle Flashback queries to `FOR SYSTEM_TIME AS OF`:

```sql
-- Oracle Flashback equivalent:
--   SELECT * FROM job_costs AS OF TIMESTAMP (SYSTIMESTAMP - INTERVAL '7' DAY);

-- SQL Server temporal equivalent:
SELECT *
FROM dbo.JobCosts
    FOR SYSTEM_TIME AS OF DATEADD(DAY, -7, SYSUTCDATETIME());
```

### Data Warehouse Dimension Loading

Instead of building custom SCD2 merge logic in SSIS or ADF, let the source system use
temporal tables. The warehouse load just reads the temporal view:

```sql
-- Load dimension from temporal source
INSERT INTO dw.DimCostCode (CostCodeKey, JobNumber, CostCode, Budget, EffFrom, EffTo, IsCurrent)
SELECT
    JobCostID, JobNumber, CostCode, BudgetAmount,
    SysStartTime, SysEndTime,
    CASE WHEN SysEndTime = '9999-12-31' THEN 1 ELSE 0 END
FROM bnb_oltp.dbo.JobCosts FOR SYSTEM_TIME ALL;
```

---

## Interview / Senior Dev Questions

1. **What problem do temporal tables solve that triggers and audit tables also solve?**
   They solve the same auditing/history problem but with zero application code. The engine
   handles row versioning atomically, you get built-in time-travel query syntax, and you
   cannot accidentally bypass the audit (unlike triggers, which can be disabled).

2. **Can you use temporal tables with Entity Framework Core?**
   Yes, EF Core 6+ supports temporal table configuration via `ToTemporalTable()` in
   `OnModelCreating`. You can query with `TemporalAsOf()`, `TemporalAll()`, etc. However,
   the C# developer must still handle UTC conversion.

3. **How do you manage history table growth on a table with millions of daily updates?**
   Use a clustered columnstore index on the history table for compression. Set a retention
   policy. Partition the history table by SysEndTime for easy archival. Consider archiving
   old partitions to cheaper storage.

4. **What happens to temporal tracking during a bulk ETL MERGE operation?**
   Every UPDATE and DELETE within the MERGE generates history rows. For a MERGE that touches
   500K rows, you get up to 500K new history rows. To minimize impact, batch the merge or
   temporarily disable versioning (with appropriate safeguards) during massive initial loads.

5. **Why are the period columns stored in UTC? What is the implication for reporting?**
   UTC prevents ambiguity with time zones and daylight saving. For user-facing reports, you
   must convert to local time. This is especially important for construction where multiple
   job sites span time zones.

---

## Quiz

**Q1: You create a temporal table and update a row 5 times. How many rows total exist for
that primary key across both tables?**

<details>
<summary>Answer</summary>

6 rows total: 1 current row in the main table + 5 historical rows in the history table
(the original INSERT plus 4 superseded UPDATE versions). Each UPDATE moves the old version
to history and creates a new current version.

Wait — let's recount. INSERT creates 1 row. Then 5 UPDATEs: each moves the current row to
history. So: history has 5 rows (original + 4 intermediate), current table has 1 row.
Total = 6.
</details>

**Q2: Your PM reports that a temporal AS OF query returns wrong data. They queried
`AS OF '2026-03-24 09:00:00'` expecting Pacific time results. What went wrong?**

<details>
<summary>Answer</summary>

Temporal period columns store UTC, not local time. 9:00 AM Pacific is 4:00 PM or 5:00 PM UTC
depending on daylight saving. The PM should query:
`AS OF '2026-03-24T16:00:00'` (during PDT) to get the 9 AM Pacific snapshot.
</details>

**Q3: You need to add a `Notes NVARCHAR(500)` column to a temporal table. What steps
are required?**

<details>
<summary>Answer</summary>

You must add the column to both the current table and the history table:

```sql
ALTER TABLE dbo.JobCosts ADD Notes NVARCHAR(500) NULL;
ALTER TABLE dbo.JobCostsHistory ADD Notes NVARCHAR(500) NULL;
```

If you only alter the current table, SQL Server will raise an error because the schemas
must be compatible. (In some versions, SQL Server auto-adds the column to both — but it
is safer and more explicit to do both.)
</details>

**Q4: Why is a clustered columnstore index recommended on the history table?**

<details>
<summary>Answer</summary>

History tables are append-only (rows are only inserted, never updated or deleted while
versioning is active). This is the ideal workload for columnstore indexes. Benefits:

1. High compression ratios (often 10x) because history rows have many repeated values.
2. Efficient range scans for temporal queries that filter on SysStartTime/SysEndTime.
3. Batch-mode execution for aggregations over large history volumes.
</details>

**Q5: You want to delete all history older than 2 years immediately. The retention policy
is set but cleanup has not run yet. What do you do?**

<details>
<summary>Answer</summary>

The background cleanup task runs on its own schedule and cannot be forced. To delete
immediately:

```sql
-- 1. Turn off versioning
ALTER TABLE dbo.JobCosts SET (SYSTEM_VERSIONING = OFF);

-- 2. Delete old history
DELETE FROM dbo.JobCostsHistory
WHERE SysEndTime < DATEADD(YEAR, -2, SYSUTCDATETIME());

-- 3. Re-enable versioning
ALTER TABLE dbo.JobCosts SET (
    SYSTEM_VERSIONING = ON (
        HISTORY_TABLE = dbo.JobCostsHistory,
        HISTORY_RETENTION_PERIOD = 2 YEARS
    )
);
```

Caution: while versioning is OFF, changes to the current table are NOT tracked.
</details>
