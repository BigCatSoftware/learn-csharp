# Monitoring with DMVs

*Chapter 9.15 — T-SQL for Data Engineers*

## Overview

Dynamic Management Views (DMVs) and Dynamic Management Functions (DMFs) are system views
that expose the internal state of SQL Server: what queries are running, what they are waiting
on, which indexes are used (or missing), how much memory is consumed, and where bottlenecks
lie.

For Data Engineers, DMVs are essential for:

- **ETL performance tuning**: Finding the slow step in a multi-hour pipeline.
- **Blocking diagnosis**: Identifying why the nightly load is stuck waiting for a lock.
- **Index optimization**: Discovering unused indexes that slow writes and missing indexes
  that would speed reads.
- **Wait statistics**: Understanding whether the server is CPU-bound, I/O-bound, or
  lock-bound.
- **Capacity planning**: Tracking resource consumption trends over time.

DMVs are read-only, require no special setup, and are available in all SQL Server editions.
They are the first tool you reach for when something is slow.

This lesson covers the most important DMVs for Data Engineering work, organized by category.

---

## Core Concepts

### DMV Categories

| Category | Prefix | Purpose |
|---|---|---|
| Execution | `sys.dm_exec_*` | Active queries, cached plans, session info |
| OS | `sys.dm_os_*` | Wait stats, memory, schedulers |
| Index | `sys.dm_db_index_*` | Index usage, operational stats |
| Missing Index | `sys.dm_db_missing_index_*` | Optimizer-suggested indexes |
| I/O | `sys.dm_io_*` | Virtual file stats (read/write latency) |
| Transaction | `sys.dm_tran_*` | Active transactions, locks |

### Key DMVs at a Glance

| DMV | What It Shows |
|---|---|
| `sys.dm_exec_requests` | Currently executing queries |
| `sys.dm_exec_sessions` | All active sessions (including idle) |
| `sys.dm_exec_query_stats` | Aggregate stats for cached query plans |
| `sys.dm_exec_cached_plans` | Cached execution plans (size, type, use count) |
| `sys.dm_os_wait_stats` | Cumulative wait statistics since last reset |
| `sys.dm_db_index_usage_stats` | How indexes are used (seeks, scans, updates) |
| `sys.dm_db_missing_index_details` | Indexes the optimizer wishes existed |
| `sys.dm_io_virtual_file_stats` | I/O latency per database file |

### Important: DMV Data Is Volatile

Most DMV data resets when SQL Server restarts (or when the service recycles). Some reset
when the database goes offline. To track trends, snapshot DMV data into permanent tables
on a schedule.

---

## Code Examples

### Finding Currently Running Queries

```sql
-- What is executing right now?
SELECT
    r.session_id,
    r.status,
    r.command,
    r.wait_type,
    r.wait_time,
    r.blocking_session_id,
    r.cpu_time,
    r.total_elapsed_time / 1000   AS elapsed_seconds,
    r.reads,
    r.writes,
    r.logical_reads,
    DB_NAME(r.database_id)        AS database_name,
    SUBSTRING(
        t.text,
        (r.statement_start_offset / 2) + 1,
        (CASE r.statement_end_offset
            WHEN -1 THEN DATALENGTH(t.text)
            ELSE r.statement_end_offset
        END - r.statement_start_offset) / 2 + 1
    )                             AS current_statement,
    qp.query_plan
FROM sys.dm_exec_requests AS r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) AS t
CROSS APPLY sys.dm_exec_query_plan(r.plan_handle) AS qp
WHERE r.session_id > 50          -- exclude system sessions
ORDER BY r.total_elapsed_time DESC;
```

### Finding Blocking Chains

```sql
-- Who is blocking whom?
SELECT
    blocked.session_id           AS blocked_session,
    blocked.blocking_session_id  AS blocker_session,
    blocked.wait_type,
    blocked.wait_time / 1000     AS wait_seconds,
    DB_NAME(blocked.database_id) AS database_name,
    blocked_text.text            AS blocked_query,
    blocker_text.text            AS blocker_query
FROM sys.dm_exec_requests AS blocked
INNER JOIN sys.dm_exec_sessions AS blocker_sess
    ON blocked.blocking_session_id = blocker_sess.session_id
CROSS APPLY sys.dm_exec_sql_text(blocked.sql_handle) AS blocked_text
OUTER APPLY sys.dm_exec_sql_text(blocker_sess.most_recent_sql_handle) AS blocker_text
WHERE blocked.blocking_session_id <> 0
ORDER BY blocked.wait_time DESC;
```

### Full Blocking Chain (Recursive CTE)

```sql
-- Recursive CTE to show the full blocking tree
WITH BlockingChain AS (
    -- Root blockers (sessions that are blocking but not blocked themselves)
    SELECT
        r.session_id,
        r.blocking_session_id,
        r.wait_type,
        r.wait_time,
        0 AS level,
        CAST(r.session_id AS VARCHAR(MAX)) AS chain
    FROM sys.dm_exec_requests r
    WHERE r.blocking_session_id = 0
      AND r.session_id IN (
          SELECT blocking_session_id FROM sys.dm_exec_requests WHERE blocking_session_id <> 0
      )

    UNION ALL

    -- Blocked sessions
    SELECT
        r.session_id,
        r.blocking_session_id,
        r.wait_type,
        r.wait_time,
        bc.level + 1,
        bc.chain + ' -> ' + CAST(r.session_id AS VARCHAR(MAX))
    FROM sys.dm_exec_requests r
    INNER JOIN BlockingChain bc ON r.blocking_session_id = bc.session_id
)
SELECT
    chain          AS blocking_chain,
    session_id,
    blocking_session_id,
    wait_type,
    wait_time / 1000 AS wait_seconds,
    level
FROM BlockingChain
ORDER BY chain, level;
```

### Top Queries by CPU (from Cache)

```sql
-- Find the most expensive queries by cumulative CPU
SELECT TOP 20
    qs.total_worker_time / 1000             AS total_cpu_ms,
    qs.execution_count,
    qs.total_worker_time / qs.execution_count / 1000 AS avg_cpu_ms,
    qs.total_logical_reads / qs.execution_count      AS avg_logical_reads,
    qs.total_elapsed_time / qs.execution_count / 1000 AS avg_elapsed_ms,
    qs.creation_time,
    SUBSTRING(
        st.text,
        (qs.statement_start_offset / 2) + 1,
        (CASE qs.statement_end_offset
            WHEN -1 THEN DATALENGTH(st.text)
            ELSE qs.statement_end_offset
        END - qs.statement_start_offset) / 2 + 1
    )                                       AS query_text,
    qp.query_plan
FROM sys.dm_exec_query_stats AS qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st
CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) AS qp
ORDER BY qs.total_worker_time DESC;
```

### Top Queries by Logical Reads (I/O Pressure)

```sql
SELECT TOP 20
    qs.total_logical_reads,
    qs.execution_count,
    qs.total_logical_reads / qs.execution_count AS avg_reads,
    qs.total_worker_time / 1000                 AS total_cpu_ms,
    SUBSTRING(st.text, (qs.statement_start_offset/2)+1,
        (CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text)
         ELSE qs.statement_end_offset END - qs.statement_start_offset)/2+1
    ) AS query_text
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
ORDER BY qs.total_logical_reads DESC;
```

### Wait Statistics Analysis

```sql
-- Top waits — tells you WHERE the server spends time waiting
SELECT TOP 15
    wait_type,
    wait_time_ms / 1000                       AS wait_seconds,
    signal_wait_time_ms / 1000                AS signal_wait_seconds,
    (wait_time_ms - signal_wait_time_ms) / 1000 AS resource_wait_seconds,
    waiting_tasks_count,
    CASE
        WHEN waiting_tasks_count = 0 THEN 0
        ELSE wait_time_ms / waiting_tasks_count
    END                                        AS avg_wait_ms
FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN (
    -- Filter out benign/idle waits
    'SLEEP_TASK', 'BROKER_TASK_STOP', 'BROKER_EVENTHANDLER',
    'CLR_SEMAPHORE', 'CLR_AUTO_EVENT', 'DISPATCHER_QUEUE_SEMAPHORE',
    'FT_IFTS_SCHEDULER_IDLE_WAIT', 'XE_DISPATCHER_WAIT',
    'SQLTRACE_BUFFER_FLUSH', 'WAITFOR', 'LAZYWRITER_SLEEP',
    'CHECKPOINT_QUEUE', 'REQUEST_FOR_DEADLOCK_SEARCH',
    'LOGMGR_QUEUE', 'ONDEMAND_TASK_QUEUE', 'HADR_FILESTREAM_IOMGR_IOCOMPLETION',
    'DIRTY_PAGE_POLL', 'SP_SERVER_DIAGNOSTICS_SLEEP',
    'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP', 'QDS_ASYNC_QUEUE',
    'BROKER_TO_FLUSH', 'BROKER_TRANSMITTER', 'SQLTRACE_INCREMENTAL_FLUSH_SLEEP'
)
ORDER BY wait_time_ms DESC;

-- Reset wait stats (do this before a specific test/load to get clean data)
-- DBCC SQLPERF('sys.dm_os_wait_stats', CLEAR);
```

### Common Wait Types Explained

```sql
-- Reference table of waits a DE will encounter:
-- CXPACKET / CXCONSUMER  = Parallelism wait (often benign, but excessive = bad plan)
-- LCK_M_*                = Lock waits (blocking! LCK_M_X = exclusive, LCK_M_S = shared)
-- PAGEIOLATCH_SH/EX      = Reading pages from disk (I/O bottleneck)
-- WRITELOG               = Transaction log write wait (log disk slow)
-- SOS_SCHEDULER_YIELD    = CPU pressure (tasks yielding for other tasks)
-- ASYNC_NETWORK_IO       = Server waiting for client to consume results
-- RESOURCE_SEMAPHORE     = Waiting for memory grant (large sorts/hashes)
-- OLEDB                  = Linked server calls (Oracle!)
```

### Index Usage Stats

```sql
-- Find unused indexes (wasting space and slowing writes)
SELECT
    OBJECT_SCHEMA_NAME(i.object_id) + '.' + OBJECT_NAME(i.object_id) AS table_name,
    i.name                          AS index_name,
    i.type_desc,
    us.user_seeks,
    us.user_scans,
    us.user_lookups,
    us.user_updates,                -- writes to maintain the index
    us.last_user_seek,
    us.last_user_scan
FROM sys.indexes i
LEFT JOIN sys.dm_db_index_usage_stats us
    ON i.object_id = us.object_id
   AND i.index_id = us.index_id
   AND us.database_id = DB_ID()
WHERE OBJECTPROPERTY(i.object_id, 'IsUserTable') = 1
  AND i.type_desc = 'NONCLUSTERED'
  AND (us.user_seeks + us.user_scans + us.user_lookups) = 0  -- never read
  AND us.user_updates > 0                                     -- but maintained
ORDER BY us.user_updates DESC;
```

### Missing Index Recommendations

```sql
-- Indexes the optimizer wishes it had
SELECT TOP 20
    CONVERT(DECIMAL(18,2), migs.avg_total_user_cost * migs.avg_user_impact
        * (migs.user_seeks + migs.user_scans)) AS improvement_measure,
    DB_NAME(mid.database_id)                    AS database_name,
    mid.statement                               AS table_name,
    mid.equality_columns,
    mid.inequality_columns,
    mid.included_columns,
    migs.user_seeks,
    migs.user_scans,
    migs.avg_total_user_cost,
    migs.avg_user_impact
FROM sys.dm_db_missing_index_groups mig
INNER JOIN sys.dm_db_missing_index_group_stats migs
    ON mig.index_group_handle = migs.group_handle
INNER JOIN sys.dm_db_missing_index_details mid
    ON mig.index_handle = mid.index_handle
WHERE mid.database_id = DB_ID()
ORDER BY improvement_measure DESC;
```

### I/O Latency per Database File

```sql
-- Which database files have the highest I/O latency?
SELECT
    DB_NAME(vfs.database_id)       AS database_name,
    mf.physical_name,
    mf.type_desc,
    vfs.num_of_reads,
    vfs.num_of_writes,
    CASE WHEN vfs.num_of_reads = 0 THEN 0
         ELSE vfs.io_stall_read_ms / vfs.num_of_reads
    END                            AS avg_read_latency_ms,
    CASE WHEN vfs.num_of_writes = 0 THEN 0
         ELSE vfs.io_stall_write_ms / vfs.num_of_writes
    END                            AS avg_write_latency_ms
FROM sys.dm_io_virtual_file_stats(NULL, NULL) AS vfs
INNER JOIN sys.master_files AS mf
    ON vfs.database_id = mf.database_id
   AND vfs.file_id = mf.file_id
ORDER BY vfs.io_stall DESC;

-- Guidelines:
-- Data files: < 20ms read latency is good, > 50ms is concerning
-- Log files:  < 5ms write latency is good, > 15ms is concerning
```

### Cached Plan Analysis

```sql
-- Find single-use plans polluting the cache
SELECT
    objtype,
    COUNT(*) AS plan_count,
    SUM(size_in_bytes) / 1024 / 1024 AS total_mb,
    AVG(usecounts) AS avg_use_count
FROM sys.dm_exec_cached_plans
GROUP BY objtype
ORDER BY total_mb DESC;

-- Single-use ad hoc plans wasting cache
SELECT TOP 20
    cp.usecounts,
    cp.size_in_bytes / 1024 AS size_kb,
    st.text
FROM sys.dm_exec_cached_plans cp
CROSS APPLY sys.dm_exec_sql_text(cp.plan_handle) st
WHERE cp.usecounts = 1
  AND cp.objtype = 'Adhoc'
ORDER BY cp.size_in_bytes DESC;
```

---

## Common Patterns

### Pattern 1: Snapshot DMV Data for Trend Analysis

```sql
-- Create a table to store periodic snapshots
CREATE TABLE dbo.WaitStatsSnapshots (
    SnapshotID    INT IDENTITY PRIMARY KEY,
    CapturedAt    DATETIME2 DEFAULT SYSUTCDATETIME(),
    WaitType      NVARCHAR(120),
    WaitTimeMs    BIGINT,
    WaitingTasks  BIGINT
);

-- Scheduled job step: capture every 15 minutes
INSERT INTO dbo.WaitStatsSnapshots (WaitType, WaitTimeMs, WaitingTasks)
SELECT wait_type, wait_time_ms, waiting_tasks_count
FROM sys.dm_os_wait_stats
WHERE wait_time_ms > 0;
```

### Pattern 2: Delta Calculation Between Snapshots

```sql
-- Compare two snapshots to see what happened in a time window
WITH Current AS (
    SELECT * FROM dbo.WaitStatsSnapshots WHERE SnapshotID = @CurrentSnapshotId
),
Previous AS (
    SELECT * FROM dbo.WaitStatsSnapshots WHERE SnapshotID = @PreviousSnapshotId
)
SELECT
    c.WaitType,
    c.WaitTimeMs - ISNULL(p.WaitTimeMs, 0) AS DeltaWaitMs,
    c.WaitingTasks - ISNULL(p.WaitingTasks, 0) AS DeltaTasks
FROM Current c
LEFT JOIN Previous p ON c.WaitType = p.WaitType
WHERE c.WaitTimeMs - ISNULL(p.WaitTimeMs, 0) > 0
ORDER BY DeltaWaitMs DESC;
```

### Pattern 3: Real-Time ETL Monitoring Dashboard Query

```sql
-- Single query for a monitoring dashboard during ETL runs
SELECT
    r.session_id,
    s.login_name,
    DB_NAME(r.database_id)          AS db_name,
    r.status,
    r.command,
    r.wait_type,
    r.wait_time / 1000              AS wait_sec,
    r.blocking_session_id           AS blocker,
    r.percent_complete,
    r.estimated_completion_time / 60000 AS est_minutes_remaining,
    r.cpu_time / 1000               AS cpu_sec,
    r.total_elapsed_time / 1000     AS elapsed_sec,
    r.reads,
    r.writes,
    SUBSTRING(t.text, (r.statement_start_offset/2)+1,
        (CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text)
         ELSE r.statement_end_offset END - r.statement_start_offset)/2+1
    )                               AS current_sql
FROM sys.dm_exec_requests r
INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.session_id > 50
  AND s.is_user_process = 1
ORDER BY r.total_elapsed_time DESC;
```

---

## Gotchas and Pitfalls

1. **DMV data resets on restart**. `dm_exec_query_stats`, `dm_os_wait_stats`, and index
   usage stats all reset when the instance restarts. If the server restarted last night,
   your "top queries by CPU" only reflect activity since then.

2. **dm_exec_query_stats only shows cached plans**. If a plan is evicted from cache (memory
   pressure, recompile), its stats vanish. High-impact queries can disappear between checks.

3. **statement_start_offset is in bytes, not characters**. Divide by 2 for NVARCHAR. The
   SUBSTRING formula in the examples handles this correctly — do not simplify it.

4. **dm_db_index_usage_stats resets on service restart AND when the database detaches**.
   A "never used" index might actually be heavily used — but the server just restarted.
   Check `sqlserver_start_time` in `sys.dm_os_sys_info` before trusting zero-usage data.

5. **Missing index DMVs are suggestions, not mandates**. The optimizer reports what would
   help a single query. It does not consider the cost of maintaining the index across all
   workloads. Always validate before creating.

6. **CROSS APPLY sys.dm_exec_query_plan can fail**. For very large or encrypted plans, it
   returns NULL. Use `TRY_CAST` or wrap in TRY...CATCH if you are scripting automated
   analysis.

7. **Filtering out benign waits**. Raw `dm_os_wait_stats` includes dozens of idle/background
   wait types that are meaningless for performance analysis. Always filter them out (see the
   exclusion list in the code examples).

8. **Permission requirements**. Most DMVs require `VIEW SERVER STATE` permission. In
   production, your DE account may not have it. Request it from the DBA or use a stored
   procedure that runs under elevated permissions.

---

## Performance Considerations

- **Don't query DMVs in tight loops**. DMVs themselves consume CPU. Polling
  `dm_exec_requests` every second from multiple monitoring sessions creates overhead. Use
  15-60 second intervals.

- **Use sys.dm_exec_query_plan sparingly**. Retrieving XML query plans is expensive. Do it
  for specific problem queries, not for bulk analysis of all cached plans.

- **Snapshot and analyze offline**. For heavy analysis (correlating waits with query stats
  with index usage), snapshot the data into user tables and analyze there. This avoids
  holding shared locks on system structures.

- **Prefer dm_exec_query_stats over Profiler/XEvents for historical analysis**. Query stats
  DMV gives cumulative data without the overhead of a real-time trace. Use Extended Events
  only when you need per-execution detail.

- **Index usage stats and missing index DMVs are database-scoped**. Always filter by
  `database_id = DB_ID()` to avoid cross-database noise.

---

## BNBuilders Context

### Monitoring ETL Pipeline Performance

During the nightly Oracle extract, you can watch progress in real time:

```sql
-- Monitor the Oracle linked server extract
SELECT
    r.session_id,
    r.command,
    r.status,
    r.wait_type,
    r.wait_time / 1000              AS wait_sec,
    r.total_elapsed_time / 1000     AS elapsed_sec,
    r.reads,
    r.writes,
    r.percent_complete,
    SUBSTRING(t.text, (r.statement_start_offset/2)+1, 200) AS current_sql
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.session_id > 50
  AND (r.wait_type LIKE 'OLEDB%' OR DB_NAME(r.database_id) = 'BNBuildersDB')
ORDER BY r.total_elapsed_time DESC;

-- If you see OLEDB wait type with high wait_time, the Oracle side is slow.
-- If you see LCK_M_X, another session is blocking the insert target.
```

### Finding Blocking During Report Generation

Power BI refreshes and SSRS reports can block ETL (or vice versa). Identify conflicts:

```sql
-- Are any BI queries blocking ETL sessions (or the reverse)?
SELECT
    blocker.session_id       AS blocker_session,
    blocker.login_name       AS blocker_login,
    blocker.program_name     AS blocker_app,  -- "Power BI Desktop" or "SSIS"
    blocked.session_id       AS blocked_session,
    blocked_sess.login_name  AS blocked_login,
    blocked_sess.program_name AS blocked_app,
    r.wait_type,
    r.wait_time / 1000       AS wait_seconds,
    t.text                   AS blocked_query
FROM sys.dm_exec_requests r
INNER JOIN sys.dm_exec_sessions blocker ON r.blocking_session_id = blocker.session_id
INNER JOIN sys.dm_exec_sessions blocked_sess ON r.session_id = blocked_sess.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.blocking_session_id <> 0
ORDER BY r.wait_time DESC;
```

### Identifying Slow Queries in the Data Warehouse

After the warehouse refresh, check which BI queries are performing poorly:

```sql
-- Top 10 slowest queries hitting the DW
SELECT TOP 10
    qs.total_elapsed_time / qs.execution_count / 1000 AS avg_elapsed_ms,
    qs.total_logical_reads / qs.execution_count        AS avg_reads,
    qs.execution_count,
    SUBSTRING(st.text, (qs.statement_start_offset/2)+1,
        (CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text)
         ELSE qs.statement_end_offset END - qs.statement_start_offset)/2+1
    ) AS query_text
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
WHERE st.text LIKE '%dw.Fact%'  -- queries hitting warehouse fact tables
ORDER BY avg_elapsed_ms DESC;
```

### Missing Indexes for Job Cost Queries

```sql
-- What indexes would help the most for job cost reporting?
SELECT
    mid.statement AS table_name,
    mid.equality_columns,
    mid.inequality_columns,
    mid.included_columns,
    migs.user_seeks,
    CONVERT(DECIMAL(10,2), migs.avg_user_impact) AS avg_impact_pct
FROM sys.dm_db_missing_index_details mid
INNER JOIN sys.dm_db_missing_index_groups mig ON mid.index_handle = mig.index_handle
INNER JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle = migs.group_handle
WHERE mid.database_id = DB_ID()
  AND mid.statement LIKE '%JobCost%'
ORDER BY migs.avg_total_user_cost * migs.avg_user_impact * migs.user_seeks DESC;
```

---

## Interview / Senior Dev Questions

1. **The nightly ETL is running 3x slower than usual. Walk through your DMV-based
   investigation.**
   (a) Check `dm_exec_requests` for the ETL session — what wait type? If `LCK_M_*`,
   find the blocker. If `PAGEIOLATCH`, check I/O latency via `dm_io_virtual_file_stats`.
   If `SOS_SCHEDULER_YIELD`, CPU pressure — check for parallel query plans. (b) Compare
   `dm_os_wait_stats` deltas during the ETL window to a normal night. (c) Check
   `dm_exec_query_stats` for plan regressions (sudden increase in avg_logical_reads).

2. **How do you find unused indexes without accidentally dropping critical ones?**
   Query `dm_db_index_usage_stats` for indexes with zero seeks/scans but high updates.
   Verify the server has been up long enough to be representative (check
   `dm_os_sys_info.sqlserver_start_time`). Cross-reference with known workloads (monthly
   reports that only run once). Disable the index first (rather than drop) and monitor for
   a full business cycle.

3. **What is the difference between `wait_time_ms` and `signal_wait_time_ms` in
   dm_os_wait_stats?**
   `wait_time_ms` is the total time spent waiting (resource wait + signal wait).
   `signal_wait_time_ms` is the time spent in the runnable queue after the resource became
   available. High signal waits indicate CPU pressure (tasks are ready to run but no CPU
   is available).

4. **A colleague says "just create all the missing indexes the DMV recommends." Why is
   this dangerous?**
   Missing index DMVs optimize for individual queries without considering write overhead.
   Each new NCI slows INSERT/UPDATE/DELETE. Recommendations often overlap (multiple similar
   indexes). The DMV does not consider existing indexes that could be widened with INCLUDE
   columns instead of creating new ones. Always consolidate and test.

5. **How do you persist DMV data for historical trend analysis?**
   Create staging tables that mirror key DMV columns. Schedule an Agent job to INSERT
   snapshots every 15-60 minutes. Calculate deltas between consecutive snapshots. Store
   in a lightweight monitoring database separate from production.

---

## Quiz

**Q1: You query `dm_db_index_usage_stats` and see an index with 0 seeks, 0 scans, and
50,000 user_updates. The server has been running for 90 days. Should you drop the index?**

<details>
<summary>Answer</summary>

Probably, but investigate first. The index is being maintained on every write (50K updates)
but never used for reads. However, check: (a) Is there a monthly or quarterly report that
hasn't run yet in this 90-day window? (b) Is the index referenced by a FOREIGN KEY or
unique constraint? (c) Disable the index first (rather than drop) and monitor for a full
cycle before permanently removing it.
</details>

**Q2: The top wait type on your server is `CXPACKET`. Is this a problem?**

<details>
<summary>Answer</summary>

Not necessarily. `CXPACKET` (and `CXCONSUMER` in newer versions) indicates parallelism
waits — threads in a parallel query waiting for each other. This is normal for data warehouse
workloads. It becomes a problem if: (a) OLTP queries are going parallel unnecessarily
(lower MAXDOP or add missing indexes). (b) Skewed parallelism causes one thread to do all
the work while others wait. Check the actual query plans for thread imbalance.
</details>

**Q3: You see high `PAGEIOLATCH_SH` waits. What does this indicate and what are your
next steps?**

<details>
<summary>Answer</summary>

`PAGEIOLATCH_SH` means queries are waiting to read data pages from disk (the pages are not
in the buffer pool). This indicates I/O pressure. Next steps:

1. Check `dm_io_virtual_file_stats` for read latency per file.
2. Identify which queries are causing the most physical reads via `dm_exec_query_stats`
   (total_physical_reads).
3. Solutions: add more RAM (bigger buffer pool), add missing indexes (reduce data scanned),
   move data files to faster storage (SSD), or optimize queries to read fewer pages.
</details>

**Q4: Why should you filter `dm_exec_requests` with `session_id > 50`?**

<details>
<summary>Answer</summary>

Session IDs 1-50 are reserved for SQL Server internal system sessions (lazy writer,
checkpoint, log writer, etc.). These are always running and not relevant to user workload
analysis. Filtering them out reduces noise and focuses on application/ETL sessions.
</details>

**Q5: You want to find which query is consuming the most CPU during the ETL window
(2 AM - 5 AM). How do you approach this if `dm_exec_query_stats` shows cumulative totals?**

<details>
<summary>Answer</summary>

Take two snapshots of `dm_exec_query_stats` — one at 2 AM and one at 5 AM. Store them in
staging tables keyed by `sql_handle` + `statement_start_offset`. Calculate the delta
(difference in `total_worker_time`, `execution_count`, etc.) between the two snapshots.
The query with the largest delta in `total_worker_time` is the biggest CPU consumer during
that window.

```sql
-- Delta = snapshot at 5 AM minus snapshot at 2 AM
SELECT
    s2.sql_handle,
    s2.total_worker_time - ISNULL(s1.total_worker_time, 0) AS cpu_delta
FROM staging.QueryStats_5AM s2
LEFT JOIN staging.QueryStats_2AM s1
    ON s2.sql_handle = s1.sql_handle
   AND s2.statement_start_offset = s1.statement_start_offset
ORDER BY cpu_delta DESC;
```
</details>
