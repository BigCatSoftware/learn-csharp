# DBMS_PARALLEL_EXECUTE — Chunking Large Tables

*Chapter 10.6 — Oracle SQL for Data Engineers*

---

## Overview

When you need to process millions of rows in Oracle — whether migrating data to SQL
Server, purging old records, or transforming data in-place — doing it in a single
transaction is a recipe for disaster. You will exhaust undo tablespace, hold locks for
hours, and risk ORA-01555 (snapshot too old) errors.

`DBMS_PARALLEL_EXECUTE` is Oracle's built-in PL/SQL package for breaking large operations
into manageable chunks and executing them in parallel. It divides work by ROWID ranges,
numeric column ranges, or custom SQL, then processes each chunk as a separate transaction.

This lesson covers the full API, monitoring, error handling, and real-world patterns for
BNBuilders' CMiC data migration and maintenance operations.

---

## Core Concepts

### 1. Architecture Overview

The package works in three phases:

1. **CREATE_TASK** — Register a named task
2. **CREATE_CHUNKS_BY_**** — Divide the target table into chunks
3. **RUN_TASK** — Execute a DML statement against each chunk in parallel

Each chunk is an independent transaction. If a chunk fails, the others continue. You can
retry failed chunks without re-processing successful ones.

### 2. Chunking Strategies

| Method | How It Divides | Best For |
|--------|---------------|----------|
| `CREATE_CHUNKS_BY_ROWID` | ROWID ranges from data blocks | Any table; most common |
| `CREATE_CHUNKS_BY_NUMBER_COL` | Ranges on a numeric column | Tables with sequential IDs |
| `CREATE_CHUNKS_BY_SQL` | Custom SQL that returns chunk definitions | Complex partitioning logic |

### 3. ROWID Chunking

`CREATE_CHUNKS_BY_ROWID` divides the table's physical storage into ranges based on Oracle
data blocks. This is the most reliable method because:

- It works on any table regardless of column types
- It distributes work evenly across the table's physical extent
- It does not depend on data distribution in any column

### 4. Numeric Column Chunking

`CREATE_CHUNKS_BY_NUMBER_COL` divides based on a numeric column (typically the primary
key). Each chunk covers a range like `WHERE id BETWEEN 1 AND 10000`. This method:

- Requires an indexed numeric column for performance
- May produce uneven chunks if the column has gaps
- Is more intuitive for debugging ("chunk for IDs 50001–60000 failed")

### 5. Custom SQL Chunking

`CREATE_CHUNKS_BY_SQL` accepts a SQL query that returns `(start_id, end_id)` pairs. This
gives you full control:

```sql
-- Example: chunk by month ranges
SELECT TO_NUMBER(TO_CHAR(month_start, 'YYYYMMDD')),
       TO_NUMBER(TO_CHAR(month_end, 'YYYYMMDD'))
FROM   month_ranges;
```

### 6. The DML Template

The DML statement you pass to `RUN_TASK` must include bind variables `:start_id` and
`:end_id` that reference the chunk boundaries:

For ROWID chunking:
```sql
DELETE FROM cmic.job_cost_detail WHERE ROWID BETWEEN :start_id AND :end_id
AND entry_date < DATE '2020-01-01'
```

For numeric chunking:
```sql
DELETE FROM cmic.job_cost_detail WHERE entry_id BETWEEN :start_id AND :end_id
AND entry_date < DATE '2020-01-01'
```

### 7. Parallel Execution

`RUN_TASK` accepts a `parallel_level` parameter that controls how many job slaves process
chunks simultaneously. Each slave picks up an unprocessed chunk, executes the DML, commits,
and picks up the next chunk.

---

## Code Examples

### Full Workflow — ROWID Chunking

```sql
-- Oracle: chunk-delete old cost entries in parallel
DECLARE
    l_task_name VARCHAR2(30) := 'PURGE_OLD_COSTS';
    l_sql_stmt  VARCHAR2(4000);
    l_status    NUMBER;
BEGIN
    -- Step 1: Create the task
    DBMS_PARALLEL_EXECUTE.CREATE_TASK(task_name => l_task_name);

    -- Step 2: Create chunks by ROWID (each chunk ~10,000 rows)
    DBMS_PARALLEL_EXECUTE.CREATE_CHUNKS_BY_ROWID(
        task_name   => l_task_name,
        table_owner => 'CMIC',
        table_name  => 'JOB_COST_DETAIL',
        by_row      => TRUE,
        chunk_size  => 10000
    );

    -- Step 3: Define the DML
    l_sql_stmt := 'DELETE FROM cmic.job_cost_detail
                    WHERE ROWID BETWEEN :start_id AND :end_id
                    AND   entry_date < DATE ''2020-01-01''';

    -- Step 4: Run the task with 4 parallel workers
    DBMS_PARALLEL_EXECUTE.RUN_TASK(
        task_name      => l_task_name,
        sql_stmt       => l_sql_stmt,
        language_flag  => DBMS_SQL.NATIVE,
        parallel_level => 4
    );

    -- Step 5: Check status
    l_status := DBMS_PARALLEL_EXECUTE.TASK_STATUS(l_task_name);

    IF l_status = DBMS_PARALLEL_EXECUTE.FINISHED THEN
        DBMS_OUTPUT.PUT_LINE('Task completed successfully.');
    ELSIF l_status = DBMS_PARALLEL_EXECUTE.FINISHED_WITH_ERROR THEN
        DBMS_OUTPUT.PUT_LINE('Task completed with errors. Check chunks.');
    END IF;

    -- Step 6: Drop the task when done
    DBMS_PARALLEL_EXECUTE.DROP_TASK(l_task_name);
END;
/
```

### Numeric Column Chunking

```sql
-- Oracle: update records in chunks by entry_id
DECLARE
    l_task_name VARCHAR2(30) := 'UPDATE_COST_CODES';
    l_sql_stmt  VARCHAR2(4000);
BEGIN
    DBMS_PARALLEL_EXECUTE.CREATE_TASK(task_name => l_task_name);

    -- Chunk by the entry_id column in ranges of 5000
    DBMS_PARALLEL_EXECUTE.CREATE_CHUNKS_BY_NUMBER_COL(
        task_name    => l_task_name,
        table_owner  => 'CMIC',
        table_name   => 'JOB_COST_DETAIL',
        table_column => 'ENTRY_ID',
        chunk_size   => 5000
    );

    l_sql_stmt := 'UPDATE cmic.job_cost_detail
                    SET    cost_code_new = TRANSLATE_COST_CODE(cost_code)
                    WHERE  entry_id BETWEEN :start_id AND :end_id
                    AND    cost_code_new IS NULL';

    DBMS_PARALLEL_EXECUTE.RUN_TASK(
        task_name      => l_task_name,
        sql_stmt       => l_sql_stmt,
        language_flag  => DBMS_SQL.NATIVE,
        parallel_level => 8
    );

    DBMS_PARALLEL_EXECUTE.DROP_TASK(l_task_name);
END;
/
```

### Custom SQL Chunking

```sql
-- Oracle: chunk by job_id ranges for a migration export
DECLARE
    l_task_name VARCHAR2(30) := 'EXPORT_BY_JOB';
    l_chunk_sql VARCHAR2(4000);
    l_sql_stmt  VARCHAR2(4000);
BEGIN
    DBMS_PARALLEL_EXECUTE.CREATE_TASK(task_name => l_task_name);

    -- Custom chunk SQL: return (start_id, end_id) pairs
    l_chunk_sql := 'SELECT MIN(entry_id), MAX(entry_id)
                     FROM   cmic.job_cost_detail
                     GROUP  BY job_id
                     ORDER  BY MIN(entry_id)';

    DBMS_PARALLEL_EXECUTE.CREATE_CHUNKS_BY_SQL(
        task_name => l_task_name,
        sql_stmt  => l_chunk_sql,
        by_rowid  => FALSE
    );

    l_sql_stmt := 'INSERT INTO cmic.job_cost_staging (entry_id, job_id, amount)
                    SELECT entry_id, job_id, amount
                    FROM   cmic.job_cost_detail
                    WHERE  entry_id BETWEEN :start_id AND :end_id';

    DBMS_PARALLEL_EXECUTE.RUN_TASK(
        task_name      => l_task_name,
        sql_stmt       => l_sql_stmt,
        language_flag  => DBMS_SQL.NATIVE,
        parallel_level => 4
    );

    DBMS_PARALLEL_EXECUTE.DROP_TASK(l_task_name);
END;
/
```

### Monitoring Task Progress

```sql
-- Oracle: check overall task status
SELECT task_name, status,
       (SELECT COUNT(*) FROM dba_parallel_execute_chunks
        WHERE task_name = t.task_name) AS total_chunks,
       (SELECT COUNT(*) FROM dba_parallel_execute_chunks
        WHERE task_name = t.task_name AND status = 'PROCESSED') AS done,
       (SELECT COUNT(*) FROM dba_parallel_execute_chunks
        WHERE task_name = t.task_name AND status = 'UNASSIGNED') AS pending,
       (SELECT COUNT(*) FROM dba_parallel_execute_chunks
        WHERE task_name = t.task_name AND status = 'ASSIGNED') AS running,
       (SELECT COUNT(*) FROM dba_parallel_execute_chunks
        WHERE task_name = t.task_name AND status = 'PROCESSED_WITH_ERROR') AS errors
FROM   dba_parallel_execute_tasks t
WHERE  task_name = 'PURGE_OLD_COSTS';
```

### Checking Chunk Details

```sql
-- Oracle: view individual chunk status and timing
SELECT chunk_id,
       status,
       start_rowid,
       end_rowid,
       start_ts,
       end_ts,
       EXTRACT(SECOND FROM (end_ts - start_ts)) AS elapsed_sec,
       error_code,
       error_message
FROM   dba_parallel_execute_chunks
WHERE  task_name = 'PURGE_OLD_COSTS'
ORDER  BY chunk_id;
```

### Retrying Failed Chunks

```sql
-- Oracle: retry only the chunks that failed
BEGIN
    DBMS_PARALLEL_EXECUTE.RESUME_TASK(
        task_name      => 'PURGE_OLD_COSTS',
        sql_stmt       => 'DELETE FROM cmic.job_cost_detail
                           WHERE ROWID BETWEEN :start_id AND :end_id
                           AND   entry_date < DATE ''2020-01-01''',
        language_flag  => DBMS_SQL.NATIVE,
        parallel_level => 2  -- fewer workers for retry
    );
END;
/
```

### Migration Extract Pattern

```sql
-- Oracle: extract data to staging table for SQL Server migration
-- Uses ROWID chunking for even distribution
DECLARE
    l_task VARCHAR2(30) := 'MIGRATE_EQUIP_LOG';
    l_dml  VARCHAR2(4000);
BEGIN
    DBMS_PARALLEL_EXECUTE.CREATE_TASK(l_task);

    DBMS_PARALLEL_EXECUTE.CREATE_CHUNKS_BY_ROWID(
        task_name   => l_task,
        table_owner => 'CMIC',
        table_name  => 'EQUIPMENT_LOG',
        by_row      => TRUE,
        chunk_size  => 25000
    );

    -- Insert into a staging table that ADF will read
    l_dml := 'INSERT /*+ APPEND */ INTO cmic.equip_log_staging
              (log_id, equip_id, checkout_date, return_date, job_id, operator_id)
              SELECT log_id, equip_id, checkout_date, return_date, job_id, operator_id
              FROM   cmic.equipment_log
              WHERE  ROWID BETWEEN :start_id AND :end_id';

    DBMS_PARALLEL_EXECUTE.RUN_TASK(
        task_name      => l_task,
        sql_stmt       => l_dml,
        language_flag  => DBMS_SQL.NATIVE,
        parallel_level => 6
    );

    DBMS_PARALLEL_EXECUTE.DROP_TASK(l_task);
END;
/
```

---

## Common Patterns

### Pattern 1 — Chunked Delete for Data Retention

Construction data grows fast. Purging timecards, daily reports, and cost detail older than
7 years requires chunked deletes to avoid locking the entire table:

```sql
-- DML template for chunked delete
'DELETE FROM cmic.timecard_entries
 WHERE ROWID BETWEEN :start_id AND :end_id
 AND   entry_date < ADD_MONTHS(SYSDATE, -84)'
```

### Pattern 2 — Chunked Migration Extract

Before migrating to SQL Server via ADF:
1. Create a staging table (same structure, no constraints)
2. Use `DBMS_PARALLEL_EXECUTE` to populate it in parallel with `INSERT /*+ APPEND */`
3. Point ADF Oracle source at the staging table
4. Drop staging table after successful load

### Pattern 3 — Chunked Data Transformation

Updating cost codes, recalculating derived columns, or applying business rule corrections
across millions of rows:

```sql
'UPDATE cmic.job_cost_detail
 SET    gl_account = MAP_GL_ACCOUNT(cost_code, job_type)
 WHERE  entry_id BETWEEN :start_id AND :end_id
 AND    gl_account IS NULL'
```

### Pattern 4 — Progress Reporting

Schedule a monitoring query to run every 30 seconds during long operations:

```sql
SELECT ROUND(
    (SELECT COUNT(*) FROM dba_parallel_execute_chunks
     WHERE task_name = 'MIGRATE_EQUIP_LOG' AND status = 'PROCESSED') * 100.0 /
    (SELECT COUNT(*) FROM dba_parallel_execute_chunks
     WHERE task_name = 'MIGRATE_EQUIP_LOG'), 1
) AS pct_complete
FROM DUAL;
```

---

## Gotchas and Pitfalls

1. **Each chunk is a separate transaction.** If you need atomicity across the entire
   operation (all or nothing), `DBMS_PARALLEL_EXECUTE` is the wrong tool. Use a single
   DML statement instead (and accept the undo/lock overhead).

2. **ROWID chunking and table reorganization.** ROWIDs change when a table is reorganized
   (`ALTER TABLE MOVE`, online redefinition). Do not run ROWID-based tasks during or after
   a reorg without re-chunking.

3. **Parallel level vs CPU cores.** Setting `parallel_level` to 32 on a 4-core server will
   cause massive contention. Rule of thumb: start with 2x CPU cores and tune down.

4. **Undo tablespace per chunk.** Each chunk generates undo. If chunk_size is too large,
   individual chunks can still exhaust undo. If too small, the overhead of many small
   transactions accumulates. Start with 10,000–50,000 rows.

5. **INSERT APPEND and direct-path.** The `/*+ APPEND */` hint uses direct-path insert,
   which bypasses the buffer cache and writes above the high-water mark. This is fast but
   requires exclusive table lock and does not allow reading from the same table in the
   same transaction.

6. **Error propagation.** A failed chunk does not stop other chunks. You must check
   `TASK_STATUS` or `dba_parallel_execute_chunks` for errors after completion. Automate
   this check in your migration scripts.

7. **Task name uniqueness.** Task names must be unique. If a task with the same name
   already exists (from a previous failed run), `CREATE_TASK` raises an error. Always
   drop tasks in a cleanup block or check for existence first.

8. **Privilege requirements.** You need `CREATE JOB` privilege (for the DBMS_SCHEDULER jobs
   it creates internally) and appropriate DML privileges on the target table.

9. **Chunk overlap with numeric columns.** `CREATE_CHUNKS_BY_NUMBER_COL` creates ranges
   like `[1, 10000], [10001, 20000]`. If the column has gaps (e.g., IDs jump from 5000 to
   50000), some chunks process zero rows while others process many. ROWID chunking avoids
   this problem.

10. **No implicit commit within chunks.** Each chunk gets its own `COMMIT` at the end. If
    your DML statement calls a function that performs DDL (which auto-commits), you will
    get unpredictable behavior.

---

## Performance Considerations

- **Chunk size tuning**: Smaller chunks = more frequent commits = less undo usage but more
  overhead. Larger chunks = fewer commits but more undo. For deletes on wide tables, start
  with 10,000. For inserts into staging, 50,000 is often optimal. Benchmark with your
  specific table width and redo generation rate.

- **Parallel level**: Start conservative (4–8) and increase while monitoring system load.
  Watch for:
  - Redo log switch frequency (too fast = too much DML)
  - Undo tablespace usage
  - I/O wait events
  - CPU utilization

- **Index overhead**: Indexes slow down chunked deletes and updates because each row change
  requires index maintenance. Consider disabling non-essential indexes during large
  operations, then rebuilding them after.

- **Direct-path insert**: For migration staging tables, use `INSERT /*+ APPEND */` with
  `NOLOGGING` on the staging table to minimize redo generation. This is significantly
  faster but the data is not recoverable from backups until the next full backup.

- **Statistics**: After large chunked operations, gather fresh statistics:
  ```sql
  EXEC DBMS_STATS.GATHER_TABLE_STATS('CMIC', 'JOB_COST_DETAIL');
  ```

- **Network considerations for migration**: If using DBMS_PARALLEL_EXECUTE to insert into
  a staging table that ADF then reads, ensure the staging table is on fast storage and the
  network between Oracle and Azure can handle the transfer rate.

---

## BNBuilders Context

At BNBuilders, `DBMS_PARALLEL_EXECUTE` is a critical tool for three major operations:

### 1. Million-Row CMiC Table Migration

CMiC tables like `JOB_COST_DETAIL`, `TIMECARD_ENTRIES`, and `EQUIPMENT_LOG` can have tens
of millions of rows. Direct migration via linked server or single-threaded ADF is too
slow for the cutover window.

**Strategy**:
1. Use `DBMS_PARALLEL_EXECUTE` to populate Oracle staging tables in parallel
2. Apply data type transformations (DATE to DATETIME2 format, NVL to explicit values)
3. Export staging tables via Oracle Data Pump or ADF with parallel reads
4. Load into SQL Server staging tables
5. Final validation and swap

### 2. Parallel Deletes of Historical Data

Construction projects span years. Data retention policies require purging records older
than 7 years while the system remains online. Chunked deletes prevent table-level locks
that would block field data entry.

**Critical tables for purging**:
- `TIMECARD_ENTRIES` — daily timecard data from all field workers
- `DAILY_REPORTS` — site inspection and progress reports
- `EQUIPMENT_LOG` — equipment checkout/return history
- `JOB_COST_DETAIL` — cost transactions (requires approval before purge)

### 3. Data Transformation for Migration

CMiC stores some data in Oracle-specific formats that need transformation before loading
into SQL Server:
- Cost code formats may need zero-padding or delimiter changes
- Status codes may need mapping from CHAR(1) to descriptive strings
- Date columns need validation (some may contain sentinel dates like 01-JAN-0001)

Running these transformations in parallel with `DBMS_PARALLEL_EXECUTE` on the Oracle side
is faster than doing it row-by-row in ADF data flows.

### 4. Cutover Weekend Script

During the BNBuilders cutover weekend, the migration script might look like:

```sql
-- Friday night: create staging tables and populate in parallel
-- Saturday morning: export staging tables, load into SQL Server
-- Saturday afternoon: validate row counts and checksums
-- Sunday: switch application connection strings
-- Monday: verify production operation
```

Each staging population step uses `DBMS_PARALLEL_EXECUTE` to maximize throughput within
the cutover window.

---

## Interview / Senior Dev Questions

1. **Q: Why use DBMS_PARALLEL_EXECUTE instead of a simple `DELETE FROM table WHERE ...`?**
   A: A single large DELETE holds row locks for the entire duration, generates massive
   undo/redo, and risks ORA-01555 if it runs long enough. `DBMS_PARALLEL_EXECUTE` breaks
   the work into chunks, each with its own COMMIT, limiting undo usage and lock duration.
   It also parallelizes the work across multiple sessions.

2. **Q: You chunked a 50-million-row table by ROWID with chunk_size 10000 and
   parallel_level 8. The operation is slower than expected. What do you check?**
   A: Check for: (a) index overhead on the target table — consider disabling non-critical
   indexes during the operation; (b) undo tablespace pressure — increase undo or reduce
   chunk size; (c) redo log switch frequency — add more redo log groups or increase log
   size; (d) I/O bottleneck — check wait events for `db file sequential read` or
   `log file sync`; (e) contention — reduce parallel_level if CPU is saturated.

3. **Q: A chunked delete completed with FINISHED_WITH_ERROR. How do you handle it?**
   A: Query `dba_parallel_execute_chunks` to find chunks with status
   `PROCESSED_WITH_ERROR`. Check the `error_code` and `error_message` columns. Fix the
   underlying issue (e.g., FK violation, space issue). Then call `RESUME_TASK` to retry
   only the failed chunks without re-processing successful ones.

4. **Q: When would you choose numeric column chunking over ROWID chunking?**
   A: When you need chunks aligned to logical boundaries (e.g., ID ranges for debugging),
   when the table has been heavily deleted and ROWIDs are sparse (many empty blocks), or
   when you want to chunk a subset of the table filtered by the numeric column. ROWID
   chunking is generally preferred because it distributes work evenly regardless of data
   distribution.

5. **Q: How would you use DBMS_PARALLEL_EXECUTE for a migration to SQL Server?**
   A: Create a staging table in Oracle with the same structure but no constraints/indexes.
   Use `DBMS_PARALLEL_EXECUTE` with `INSERT /*+ APPEND */` to populate the staging table
   in parallel, applying any data type transformations in the INSERT SELECT. Then use ADF
   or Data Pump to transfer the staging table to SQL Server. This keeps the source table
   untouched and maximizes parallel throughput on the Oracle side.

---

## Quiz

### Question 1
What are the three chunking strategies available in `DBMS_PARALLEL_EXECUTE`, and when
would you use each?

<details>
<summary>Show Answer</summary>

1. **CREATE_CHUNKS_BY_ROWID** — Divides by physical ROWID ranges. Use for any table; most
   common and produces the most evenly distributed chunks.

2. **CREATE_CHUNKS_BY_NUMBER_COL** — Divides by ranges on a numeric column. Use when you
   want logically meaningful chunk boundaries (e.g., ID ranges) or when debugging requires
   knowing which IDs were in which chunk.

3. **CREATE_CHUNKS_BY_SQL** — Uses a custom SQL query to define chunks. Use for complex
   partitioning logic like date ranges, job-based grouping, or when the other two methods
   do not fit your needs.
</details>

### Question 2
A chunked operation finishes with status `FINISHED_WITH_ERROR`. Three out of 500 chunks
failed. What do you do?

<details>
<summary>Show Answer</summary>

1. Query `dba_parallel_execute_chunks WHERE task_name = '...' AND status = 'PROCESSED_WITH_ERROR'`
   to identify the failed chunks and their error messages.
2. Diagnose the root cause (e.g., space issue, constraint violation, data-specific error).
3. Fix the underlying problem.
4. Call `DBMS_PARALLEL_EXECUTE.RESUME_TASK(...)` to retry only the failed chunks. The 497
   successful chunks are not reprocessed.
</details>

### Question 3
Why might `CREATE_CHUNKS_BY_NUMBER_COL` produce uneven chunk processing times, and how
can you avoid this?

<details>
<summary>Show Answer</summary>

If the numeric column has large gaps (e.g., IDs jump from 5,000 to 50,000), some chunks
will cover ranges with many rows while others cover ranges with zero rows. The chunks
with zero rows finish instantly; the dense chunks take much longer.

To avoid this, use `CREATE_CHUNKS_BY_ROWID` instead, which distributes chunks based on
physical storage and is unaffected by logical gaps in column values. Alternatively, use
`CREATE_CHUNKS_BY_SQL` with a custom query that accounts for data distribution.
</details>

### Question 4
What is the purpose of `/*+ APPEND */` in a chunked INSERT, and what are its trade-offs?

<details>
<summary>Show Answer</summary>

`/*+ APPEND */` enables direct-path insert, which writes data above the high-water mark
and bypasses the buffer cache. This is significantly faster for bulk inserts because it
avoids buffer cache overhead and can generate less redo (especially with NOLOGGING tables).

Trade-offs:
- Requires an exclusive lock on the table segment
- Cannot query the table in the same transaction after the insert
- If the table is NOLOGGING, the inserted data is not recoverable from archive logs (only
  from a subsequent full backup)
- Space is not reused below the high-water mark (the table grows even if space exists from
  prior deletes)
</details>

### Question 5
You need to delete 20 million rows from a CMiC table during a weekend maintenance window.
What chunk_size and parallel_level would you start with, and how would you tune them?

<details>
<summary>Show Answer</summary>

Start with `chunk_size = 10000` and `parallel_level = 4` (or 2x available CPU cores,
whichever is less). Monitor:

- **Undo tablespace usage**: If undo is filling up, reduce chunk_size
- **Redo log switches**: If switching every few seconds, the operation is generating too
  much redo; consider larger chunks (fewer commits) or adding redo log groups
- **CPU utilization**: If below 50%, increase parallel_level; if near 100%, decrease it
- **Elapsed time per chunk**: Check `dba_parallel_execute_chunks` timing; each chunk
  should complete in a few seconds

Tune iteratively: increase parallel_level to fill available CPU, and adjust chunk_size to
balance undo usage vs commit overhead. For 20 million rows with 10,000 per chunk, you
get 2,000 chunks — at 4 parallel with ~2 seconds per chunk, that is about 17 minutes.
</details>
