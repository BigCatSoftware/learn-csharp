# Transactions and Locking

*Chapter 9.8 — T-SQL for Data Engineers*

## Overview

Data engineers move and transform large volumes of data. Transactions and locking
determine whether your ETL loads block your BI reports, whether concurrent writes
corrupt each other, and whether your data warehouse maintains consistency.

This lesson covers:

- ACID properties and why they matter for ETL
- All five isolation levels and their trade-offs
- Lock types, escalation, and how to monitor them
- Deadlocks: detection, prevention, and resolution
- Why NOLOCK is dangerous (even for "read-only" reports)
- Optimistic concurrency with SNAPSHOT and RCSI
- BNBuilders: concurrent ETL loads and report reads

---

## Core Concepts

### ACID Properties

| Property | Meaning | ETL Relevance |
|---|---|---|
| **Atomicity** | All-or-nothing; a transaction fully commits or fully rolls back | A failed ETL batch doesn't leave partial data |
| **Consistency** | Database moves from one valid state to another | FK constraints, check constraints hold after load |
| **Isolation** | Concurrent transactions don't interfere with each other | Report queries see consistent data during loads |
| **Durability** | Committed data survives crashes | After ETL commits, data persists even if server reboots |

### Transaction Basics

```sql
-- Explicit transaction
BEGIN TRANSACTION;

    INSERT INTO dbo.JobCostFact (JobKey, CostCodeKey, DateKey, Amount)
    SELECT dj.JobKey, dc.CostCodeKey, dd.DateKey, s.Amount
    FROM staging.JobCostDetail s
    JOIN dbo.DimJob dj ON dj.JobID = s.JobID
    JOIN dbo.DimCostCode dc ON dc.CostCodeID = s.CostCodeID
    JOIN dbo.DimDate dd ON dd.FullDate = s.PostDate;

    IF @@ERROR <> 0
    BEGIN
        ROLLBACK TRANSACTION;
        RETURN;
    END;

    DELETE FROM staging.JobCostDetail;

COMMIT TRANSACTION;

-- Better: TRY/CATCH pattern
BEGIN TRY
    BEGIN TRANSACTION;

    -- ETL operations here...

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    -- Log the error
    INSERT INTO dbo.ETLErrorLog (ErrorMessage, ErrorNumber, ErrorLine, OccurredAt)
    VALUES (ERROR_MESSAGE(), ERROR_NUMBER(), ERROR_LINE(), GETDATE());

    THROW;  -- re-raise
END CATCH;
```

---

### Isolation Levels

#### READ UNCOMMITTED

```sql
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
-- Reads do NOT acquire shared locks.
-- Can read uncommitted (dirty) data.
-- Equivalent to adding NOLOCK to every table.
```

**Risks:** Dirty reads, non-repeatable reads, phantom reads, and worse — can read pages
that are being split, returning rows that don't exist or skipping rows entirely.

#### READ COMMITTED (Default)

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- Acquires shared (S) locks for reads; releases them immediately after reading each row.
-- Cannot read uncommitted data.
-- Another transaction can modify data between two reads in the same transaction.
```

#### REPEATABLE READ

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- Holds shared locks until end of transaction.
-- Re-reading the same row returns the same data.
-- Does NOT prevent phantom rows (new rows inserted by others).
```

#### SERIALIZABLE

```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- Acquires range locks on index keys.
-- Prevents phantoms: no new rows can appear in the read range.
-- Most restrictive — highest risk of blocking and deadlocks.
```

#### SNAPSHOT Isolation

```sql
-- Step 1: Enable on the database (one-time, requires exclusive access)
ALTER DATABASE BNBuilders SET ALLOW_SNAPSHOT_ISOLATION ON;

-- Step 2: Use in session
SET TRANSACTION ISOLATION LEVEL SNAPSHOT;
BEGIN TRANSACTION;
    -- Reads see a consistent point-in-time view (transaction start)
    -- Writes detect conflicts: if another transaction modified the same row
    -- since our snapshot started, we get an update conflict error
    SELECT * FROM dbo.JobCostFact WHERE JobKey = 100;
COMMIT TRANSACTION;
```

#### Read Committed Snapshot Isolation (RCSI)

```sql
-- Enable RCSI (one-time, all sessions automatically use it)
ALTER DATABASE BNBuilders SET READ_COMMITTED_SNAPSHOT ON;
-- Now READ COMMITTED uses row versioning instead of shared locks.
-- Reads never block writes, writes never block reads.
-- No code changes needed — it changes the behavior of the default isolation level.
```

### Comparison Matrix

| Isolation Level | Dirty Read | Non-Repeatable Read | Phantom | Blocks Readers? | Uses tempdb Versions? |
|---|---|---|---|---|---|
| READ UNCOMMITTED | Yes | Yes | Yes | No | No |
| READ COMMITTED | No | Yes | Yes | Yes (briefly) | No |
| REPEATABLE READ | No | No | Yes | Yes (long) | No |
| SERIALIZABLE | No | No | No | Yes (long) | No |
| SNAPSHOT | No | No | No | No | Yes |
| RCSI | No | Yes | Yes | No | Yes |

---

### Lock Types

| Lock | Code | Purpose | Compatible With |
|---|---|---|---|
| **Shared (S)** | S | Read operations | S, IS, U |
| **Exclusive (X)** | X | Write operations | Nothing |
| **Update (U)** | U | Intent to modify; prevents conversion deadlocks | S, IS |
| **Intent Shared (IS)** | IS | Signals a shared lock at a lower level | IS, IX, S, U |
| **Intent Exclusive (IX)** | IX | Signals an exclusive lock at a lower level | IS, IX |
| **Schema Modification (Sch-M)** | Sch-M | DDL operations (ALTER TABLE) | Nothing |
| **Schema Stability (Sch-S)** | Sch-S | Prevents DDL during queries | All except Sch-M |

### Lock Escalation

SQL Server escalates from row locks to page locks to table locks when a single
transaction holds more than ~5,000 locks on one table. This reduces memory overhead
but increases blocking.

```sql
-- Disable lock escalation on a table (keeps row locks)
ALTER TABLE dbo.JobCostDetail SET (LOCK_ESCALATION = DISABLE);

-- Escalate to partition level instead of table (partitioned tables)
ALTER TABLE dbo.JobCostDetail SET (LOCK_ESCALATION = AUTO);
```

---

### Deadlocks

A deadlock occurs when two transactions each hold a lock the other needs.

```sql
-- Classic deadlock scenario:
-- Session 1:
BEGIN TRAN;
UPDATE dbo.Job SET Status = 'Active' WHERE JobID = 100;  -- X lock on Job row
-- waits...
UPDATE dbo.Budget SET Amount = 50000 WHERE JobID = 100;   -- needs X lock on Budget

-- Session 2 (concurrent):
BEGIN TRAN;
UPDATE dbo.Budget SET Amount = 60000 WHERE JobID = 100;   -- X lock on Budget row
-- waits...
UPDATE dbo.Job SET Status = 'Complete' WHERE JobID = 100;  -- needs X lock on Job

-- SQL Server detects the cycle, kills one session (the "deadlock victim")
```

#### Deadlock Prevention

```sql
-- Strategy 1: Consistent access order (always Job before Budget)
-- This eliminates the cycle

-- Strategy 2: Keep transactions short
-- Fewer locks held for less time = fewer conflicts

-- Strategy 3: Use RCSI or SNAPSHOT
-- Readers don't block writers, drastically reducing deadlock surface

-- Strategy 4: Retry on deadlock in application code
```

```csharp
// C# deadlock retry pattern
public static async Task ExecuteWithDeadlockRetryAsync(
    Func<Task> operation, int maxRetries = 3)
{
    for (int attempt = 1; attempt <= maxRetries; attempt++)
    {
        try
        {
            await operation();
            return;
        }
        catch (SqlException ex) when (ex.Number == 1205) // deadlock victim
        {
            if (attempt == maxRetries)
                throw;

            // Exponential backoff with jitter
            var delay = TimeSpan.FromMilliseconds(
                100 * Math.Pow(2, attempt) + Random.Shared.Next(50));
            await Task.Delay(delay);
        }
    }
}

// Usage in ETL
await ExecuteWithDeadlockRetryAsync(async () =>
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();
    await using var cmd = new SqlCommand("EXEC dbo.ETL_LoadJobCosts @StartDate, @EndDate", conn);
    cmd.Parameters.AddWithValue("@StartDate", startDate);
    cmd.Parameters.AddWithValue("@EndDate", endDate);
    await cmd.ExecuteNonQueryAsync();
});
```

---

## Code Examples

### Monitoring Locks

```sql
-- Find blocking chains
SELECT
    blocking.session_id AS blocker_session_id,
    blocked.session_id AS blocked_session_id,
    blocked.wait_type,
    blocked.wait_time / 1000.0 AS wait_seconds,
    blocker_text.text AS blocker_sql,
    blocked_text.text AS blocked_sql
FROM sys.dm_exec_sessions blocked
JOIN sys.dm_exec_sessions blocking ON blocking.session_id = blocked.blocking_session_id
CROSS APPLY sys.dm_exec_sql_text(blocked.most_recent_sql_handle) blocked_text
CROSS APPLY sys.dm_exec_sql_text(blocking.most_recent_sql_handle) blocker_text
WHERE blocked.blocking_session_id <> 0;
```

### Transaction Scope in C#

```csharp
using Microsoft.Data.SqlClient;

public static async Task RunETLInTransactionAsync(string connectionString)
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();
    await using var transaction = conn.BeginTransaction(
        System.Data.IsolationLevel.ReadCommitted);

    try
    {
        // Step 1: Load staging data into fact table
        await using (var cmd = new SqlCommand(
            "INSERT INTO dbo.JobCostFact SELECT ... FROM staging.JobCosts", conn, transaction))
        {
            var rows = await cmd.ExecuteNonQueryAsync();
            Console.WriteLine($"Loaded {rows} fact rows");
        }

        // Step 2: Clear staging
        await using (var cmd = new SqlCommand(
            "TRUNCATE TABLE staging.JobCosts", conn, transaction))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        // Step 3: Update watermark
        await using (var cmd = new SqlCommand(
            "UPDATE dbo.ETLWatermark SET LastLoadDate = GETDATE() WHERE TableName = 'JobCosts'",
            conn, transaction))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        await transaction.CommitAsync();
    }
    catch
    {
        await transaction.RollbackAsync();
        throw;
    }
}
```

---

## Common Patterns

### Pattern 1: RCSI for Report/ETL Coexistence

```sql
-- Enable RCSI once on the database
ALTER DATABASE BNBuilders SET READ_COMMITTED_SNAPSHOT ON;

-- Now ETL writes do not block report reads, and vice versa
-- Reports see a consistent view of committed data as of statement start
-- No NOLOCK needed anywhere
```

### Pattern 2: Batched Deletes to Avoid Lock Escalation

```sql
-- Bad: deletes 2M rows, escalates to table lock, blocks everything
DELETE FROM dbo.JobCostDetail WHERE PostDate < '2020-01-01';

-- Good: delete in batches of 5,000
DECLARE @Deleted INT = 1;
WHILE @Deleted > 0
BEGIN
    DELETE TOP (5000) FROM dbo.JobCostDetail
    WHERE PostDate < '2020-01-01';
    SET @Deleted = @@ROWCOUNT;
END;
```

---

## Gotchas and Pitfalls

1. **NOLOCK does not just mean "dirty reads."** It can read partially written pages during
   page splits, returning rows that were never committed or skipping rows entirely. It can
   even return the same row twice. Never use it for data that must be accurate.

2. **RCSI increases tempdb usage.** Every modified row stores a version in tempdb. If your
   transactions are long-running or your write volume is high, tempdb can grow significantly.
   Monitor `sys.dm_db_file_space_usage`.

3. **SNAPSHOT isolation can cause update conflicts.** If two transactions read the same row
   and both try to update it, the second one gets error 3960. You must handle this in code.

4. **Lock escalation is silent.** Your 50,000-row update suddenly escalates to a table lock
   and blocks every other session. Monitor with the `lock_escalation` Extended Event.

5. **Implicit transactions.** If `IMPLICIT_TRANSACTIONS` is ON (common in Oracle
   migrations), every SELECT starts a transaction that stays open until you COMMIT/ROLLBACK.
   This holds locks indefinitely. Check with `SELECT @@TRANCOUNT`.

6. **Long-running transactions bloat the transaction log.** SQL Server cannot truncate the
   log past the oldest open transaction. An ETL that runs for hours in one transaction can
   fill the log drive. Use batched commits.

---

## Performance Considerations

- **RCSI is the single best improvement** for mixed OLTP/reporting workloads. Enable it on
  all new databases. The tempdb overhead is almost always worth the concurrency gain.
- **Batch large modifications** into chunks of 5,000-10,000 rows to avoid lock escalation
  and keep the transaction log manageable.
- **Partition switching** is the gold standard for loading fact tables without blocking
  queries. It requires upfront partitioning design but pays off enormously.
- **Keep transactions as short as possible.** Do not include application logic, API calls,
  or user interaction inside a transaction.
- **Monitor blocking proactively** with `sys.dm_exec_requests` filtered on
  `blocking_session_id <> 0` and alert when wait time exceeds a threshold.

---

## BNBuilders Context

### Scenario: ETL Blocking BI Reports

BNBuilders runs a nightly ETL at 2 AM that loads 500K rows into `JobCostFact`. The
West Coast PM team starts pulling Power BI reports at 5 AM Pacific. On mornings when
ETL runs late, reports time out because the ETL's INSERT holds X locks on the fact table.

**Solution: Enable RCSI**

```sql
-- One-time change (requires brief exclusive access; schedule during maintenance)
ALTER DATABASE BNBuilders_DW SET READ_COMMITTED_SNAPSHOT ON;

-- Verify it's enabled
SELECT name, is_read_committed_snapshot_on
FROM sys.databases WHERE name = 'BNBuilders_DW';
```

After enabling RCSI:
- Report queries read the last committed version of rows via tempdb row versioning
- ETL writes proceed without blocking reports
- No code changes required in either the ETL procs or the Power BI queries

### Equipment Tracking Concurrent Updates

Multiple field supervisors update equipment locations and hours simultaneously from
tablets. Without proper isolation, two updates to the same excavator's hours can
overwrite each other.

```sql
-- Use optimistic concurrency with a rowversion column
ALTER TABLE dbo.Equipment ADD RowVer ROWVERSION;

-- Update only succeeds if the row hasn't changed since we read it
UPDATE dbo.Equipment
SET HoursUsed = @NewHours, LocationCode = @NewLocation
WHERE EquipmentID = @EquipmentID AND RowVer = @OriginalRowVer;

-- If @@ROWCOUNT = 0, someone else modified it — re-read and retry
```

---

## Interview / Senior Dev Questions

1. **Q: What's the difference between SNAPSHOT isolation and RCSI?**
   A: SNAPSHOT gives you a consistent view as of the transaction start (point-in-time
   consistency across multiple statements). RCSI gives each statement a consistent view
   as of the statement start (statement-level consistency). SNAPSHOT detects update
   conflicts; RCSI does not — it uses "last writer wins" like READ COMMITTED.

2. **Q: Why is NOLOCK dangerous even for "just a report"?**
   A: Beyond dirty reads, NOLOCK can read pages being split, which causes it to skip
   rows or return them twice. For aggregation queries, this means wrong totals — not
   just stale data, but mathematically incorrect data.

3. **Q: How do you prevent deadlocks in a system with heavy concurrent writes?**
   A: (1) Access tables in consistent order across all procedures. (2) Keep transactions
   short. (3) Use RCSI to eliminate read/write conflicts. (4) Add appropriate indexes so
   locks are taken on fewer rows. (5) Implement retry logic for unavoidable deadlocks.

4. **Q: What happens to tempdb when RCSI is enabled under heavy write load?**
   A: Every modified row creates a version store entry in tempdb. Under heavy writes
   with long-running read transactions, the version store can grow substantially. Monitor
   with `sys.dm_db_file_space_usage` and ensure tempdb is on fast storage with adequate
   space. The version store is cleaned up by a background task that runs every minute.

---

## Quiz

### Question 1
Your ETL inserts 200,000 rows in a single transaction. Halfway through, other sessions
report that the entire table is locked. What happened and how do you fix it?

<details>
<summary>Answer</summary>

**Lock escalation** occurred. SQL Server escalated from row-level X locks to a table-level
X lock after exceeding the ~5,000 lock threshold. Fixes: (1) Batch the inserts into chunks
of 5,000 rows with separate transactions. (2) Disable lock escalation on the table with
`ALTER TABLE ... SET (LOCK_ESCALATION = DISABLE)`. (3) Use partition switching to load the
data without row-level locks at all.
</details>

### Question 2
A developer writes `SELECT * FROM dbo.JobCostDetail WITH (NOLOCK)` for a financial
report that sums amounts by job. The total for Job 4520 shows $1,247,832 but the actual
committed total is $1,185,000. What went wrong?

<details>
<summary>Answer</summary>

NOLOCK (READ UNCOMMITTED) can read **uncommitted data** (dirty reads), but more critically,
it can read pages during a page split, causing rows to be counted **twice**. This is likely
what happened — a concurrent INSERT or UPDATE caused a page split, and the report's scan
read some rows from both the old page and the new page. The fix is to remove NOLOCK and
use RCSI instead, which provides non-blocking reads of committed data only.
</details>

### Question 3
Two stored procedures deadlock every night during ETL. Procedure A updates `Job` then
`Budget`. Procedure B updates `Budget` then `Job`. Both procedures are necessary. What is
the simplest fix?

<details>
<summary>Answer</summary>

**Enforce consistent table access order.** Modify Procedure B to update `Job` first, then
`Budget` — the same order as Procedure A. When all transactions access tables in the same
order, the circular dependency that causes deadlocks is impossible. This is the simplest
and most reliable deadlock prevention strategy.
</details>

### Question 4
After enabling RCSI, you notice tempdb grew from 2 GB to 15 GB. The version store
cleanup isn't reclaiming space. What should you check?

<details>
<summary>Answer</summary>

Check for **long-running open transactions** that prevent version cleanup. The version store
cannot clean up any row version that might still be needed by an active transaction. Run:
`SELECT * FROM sys.dm_tran_active_snapshot_database_transactions ORDER BY elapsed_time_seconds DESC;`
Also check `DBCC OPENTRAN` for the oldest active transaction. Common culprits: forgotten
open transactions in SSMS, long-running SSIS packages, or application connection leaks.
</details>
