# Oracle Partitioning

*Chapter 10.9 — Oracle SQL for Data Engineers*

## Overview

Partitioning divides a large table into smaller, independently managed segments called
partitions. Each partition holds a subset of the table's rows based on a partitioning
key (a column or set of columns). Oracle treats partitions as separate physical storage
units but presents them as a single logical table to queries.

For data engineers at BNBuilders, partitioning is central to working with CMiC's
large transactional tables. Job cost tables partitioned by fiscal year let you extract
a single year's data without scanning the entire table. Understanding partitioning
also matters when designing staging and warehouse tables on SQL Server, which has its
own partitioning model.

## Core Concepts

### Partitioning Strategies

| Strategy | Partitioning Key | Best For |
|---|---|---|
| **Range** | Continuous values (dates, numbers) | Time-series data, fiscal years |
| **List** | Discrete values | Status codes, regions, companies |
| **Hash** | Hash of column value | Even distribution when no natural range |
| **Composite** | Two strategies combined | Range-List, Range-Hash, etc. |
| **Interval** | Auto-extending range | Date partitions that create themselves |

### Partition Pruning

Partition pruning is the optimizer's ability to skip partitions that cannot contain
matching rows. When your WHERE clause references the partition key, Oracle reads only
the relevant partitions. This is the primary performance benefit of partitioning.

```
-- Table: cmic_job_cost, range-partitioned by posting_date (one partition per fiscal year)
-- Query: WHERE posting_date >= DATE '2024-01-01' AND posting_date < DATE '2025-01-01'
-- Result: Oracle reads ONLY the FY2024 partition, skipping all others
```

### Local vs Global Indexes

| Index Type | Definition | Pros | Cons |
|---|---|---|---|
| **Local** | One index partition per table partition | Easy maintenance, partition operations are fast | Must include partition key for unique constraints |
| **Global** | Single index spanning all partitions | Flexible, any column can be unique | Partition operations invalidate the index |
| **Global Partitioned** | Index partitioned independently of table | Best of both worlds for some patterns | More complex to manage |

## Code Examples

### Range Partitioning

```sql
-- Range partitioning by fiscal year (most common for CMiC data)
CREATE TABLE cmic_job_cost (
    job_cost_id    NUMBER(12)    NOT NULL,
    job_number     VARCHAR2(20)  NOT NULL,
    cost_code      VARCHAR2(10)  NOT NULL,
    amount         NUMBER(15,2),
    posting_date   DATE          NOT NULL,
    fiscal_year    NUMBER(4)     NOT NULL,
    status         VARCHAR2(10)  DEFAULT 'PENDING'
)
PARTITION BY RANGE (posting_date) (
    PARTITION p_fy2020 VALUES LESS THAN (DATE '2021-01-01'),
    PARTITION p_fy2021 VALUES LESS THAN (DATE '2022-01-01'),
    PARTITION p_fy2022 VALUES LESS THAN (DATE '2023-01-01'),
    PARTITION p_fy2023 VALUES LESS THAN (DATE '2024-01-01'),
    PARTITION p_fy2024 VALUES LESS THAN (DATE '2025-01-01'),
    PARTITION p_fy2025 VALUES LESS THAN (DATE '2026-01-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

-- Query that triggers partition pruning
SELECT job_number, cost_code, amount
FROM cmic_job_cost
WHERE posting_date >= DATE '2024-01-01'
  AND posting_date <  DATE '2025-01-01';
-- Only reads partition p_fy2024
```

### Interval Partitioning

```sql
-- Interval partitioning: Oracle automatically creates new partitions
CREATE TABLE cmic_ap_transactions (
    transaction_id   NUMBER(12)    NOT NULL,
    vendor_id        NUMBER(10)    NOT NULL,
    invoice_number   VARCHAR2(30),
    invoice_date     DATE          NOT NULL,
    amount           NUMBER(15,2),
    status           VARCHAR2(10)
)
PARTITION BY RANGE (invoice_date)
INTERVAL (NUMTOYMINTERVAL(1, 'MONTH')) (
    PARTITION p_initial VALUES LESS THAN (DATE '2020-01-01')
);
-- New monthly partitions are created automatically as data arrives
-- No manual partition maintenance needed for future periods
```

### List Partitioning

```sql
-- List partitioning by company code (BNBuilders has multiple entities)
CREATE TABLE cmic_payroll (
    payroll_id     NUMBER(12)    NOT NULL,
    employee_id    NUMBER(10)    NOT NULL,
    company_code   VARCHAR2(5)   NOT NULL,
    pay_period     DATE          NOT NULL,
    gross_pay      NUMBER(12,2),
    net_pay        NUMBER(12,2)
)
PARTITION BY LIST (company_code) (
    PARTITION p_bnb   VALUES ('BNB'),
    PARTITION p_bnb_s VALUES ('BNBS'),
    PARTITION p_bnb_n VALUES ('BNBN'),
    PARTITION p_other VALUES (DEFAULT)
);

-- Query pruning to single company
SELECT employee_id, pay_period, gross_pay
FROM cmic_payroll
WHERE company_code = 'BNB';
-- Only reads partition p_bnb
```

### Hash Partitioning

```sql
-- Hash partitioning for even distribution (useful for parallel processing)
CREATE TABLE cmic_gl_detail (
    gl_detail_id   NUMBER(12)    NOT NULL,
    account_code   VARCHAR2(20)  NOT NULL,
    journal_id     NUMBER(12),
    amount         NUMBER(15,2),
    posting_date   DATE
)
PARTITION BY HASH (gl_detail_id)
PARTITIONS 16;
-- Creates 16 evenly-sized partitions named SYS_P1, SYS_P2, etc.
-- Great for parallel full scans: each parallel server reads one partition
```

### Composite Partitioning

```sql
-- Range-List: partition by date, sub-partition by company
CREATE TABLE cmic_job_cost_composite (
    job_cost_id    NUMBER(12)    NOT NULL,
    job_number     VARCHAR2(20)  NOT NULL,
    company_code   VARCHAR2(5)   NOT NULL,
    amount         NUMBER(15,2),
    posting_date   DATE          NOT NULL
)
PARTITION BY RANGE (posting_date)
SUBPARTITION BY LIST (company_code)
SUBPARTITION TEMPLATE (
    SUBPARTITION sp_bnb   VALUES ('BNB'),
    SUBPARTITION sp_bnbs  VALUES ('BNBS'),
    SUBPARTITION sp_other VALUES (DEFAULT)
) (
    PARTITION p_fy2023 VALUES LESS THAN (DATE '2024-01-01'),
    PARTITION p_fy2024 VALUES LESS THAN (DATE '2025-01-01'),
    PARTITION p_fy2025 VALUES LESS THAN (DATE '2026-01-01')
);

-- This query prunes to one sub-partition
SELECT * FROM cmic_job_cost_composite
WHERE posting_date >= DATE '2024-01-01'
  AND posting_date <  DATE '2025-01-01'
  AND company_code = 'BNB';
```

### Local and Global Indexes

```sql
-- Local index: one index partition per table partition
CREATE INDEX idx_jc_job_number_local
ON cmic_job_cost (job_number)
LOCAL;

-- Global index: spans all partitions
CREATE INDEX idx_jc_cost_code_global
ON cmic_job_cost (cost_code)
GLOBAL;

-- Global partitioned index (partitioned differently from the table)
CREATE INDEX idx_jc_status_global_part
ON cmic_job_cost (status)
GLOBAL PARTITION BY HASH (status) PARTITIONS 4;
```

### Partition Maintenance Operations

```sql
-- ADD a new partition
ALTER TABLE cmic_job_cost
ADD PARTITION p_fy2026 VALUES LESS THAN (DATE '2027-01-01');

-- DROP old data (much faster than DELETE)
ALTER TABLE cmic_job_cost
DROP PARTITION p_fy2020
UPDATE GLOBAL INDEXES;

-- SPLIT a partition (e.g., split future into specific year + future)
ALTER TABLE cmic_job_cost
SPLIT PARTITION p_future AT (DATE '2027-01-01')
INTO (PARTITION p_fy2026, PARTITION p_future)
UPDATE GLOBAL INDEXES;

-- MERGE two adjacent partitions
ALTER TABLE cmic_job_cost
MERGE PARTITIONS p_fy2020, p_fy2021
INTO PARTITION p_fy2020_2021
UPDATE GLOBAL INDEXES;

-- EXCHANGE partition with a staging table (instant data swap)
-- This is the fastest way to load a partition
CREATE TABLE stg_fy2024_job_cost AS
SELECT * FROM cmic_job_cost WHERE 1 = 0;

-- Load data into staging table...
INSERT INTO stg_fy2024_job_cost SELECT ...;

-- Swap staging table into the partition (instant, no data movement)
ALTER TABLE cmic_job_cost
EXCHANGE PARTITION p_fy2024
WITH TABLE stg_fy2024_job_cost
INCLUDING INDEXES
WITHOUT VALIDATION;

-- TRUNCATE a specific partition
ALTER TABLE cmic_job_cost
TRUNCATE PARTITION p_fy2020
UPDATE GLOBAL INDEXES;
```

### Querying Partition Metadata

```sql
-- List all partitions of a table
SELECT
    partition_name,
    partition_position,
    high_value,
    num_rows,
    blocks,
    last_analyzed
FROM all_tab_partitions
WHERE table_owner = 'CMIC_OWNER'
  AND table_name = 'CMIC_JOB_COST'
ORDER BY partition_position;

-- List sub-partitions
SELECT
    partition_name,
    subpartition_name,
    subpartition_position,
    high_value,
    num_rows
FROM all_tab_subpartitions
WHERE table_owner = 'CMIC_OWNER'
  AND table_name = 'CMIC_JOB_COST_COMPOSITE'
ORDER BY partition_name, subpartition_position;

-- Check partition pruning in the execution plan
EXPLAIN PLAN FOR
SELECT * FROM cmic_job_cost
WHERE posting_date >= DATE '2024-01-01'
  AND posting_date <  DATE '2025-01-01';

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);
-- Look for: PARTITION RANGE SINGLE or PARTITION RANGE ITERATOR
-- Pstart and Pstop columns show which partitions are accessed

-- Find partitioned tables and their strategies
SELECT
    table_name,
    partitioning_type,
    subpartitioning_type,
    partition_count
FROM all_part_tables
WHERE owner = 'CMIC_OWNER'
ORDER BY table_name;

-- Check which indexes are local vs global
SELECT
    index_name,
    locality,
    alignment,
    partition_count
FROM all_part_indexes
WHERE owner = 'CMIC_OWNER'
  AND table_name = 'CMIC_JOB_COST';
```

### Partition-Aware Extraction in C#

```csharp
using Oracle.ManagedDataAccess.Client;

public class PartitionAwareExtractor
{
    /// <summary>
    /// Extracts data one partition at a time, enabling progress tracking
    /// and restart capability for large CMiC table migrations.
    /// </summary>
    public async Task ExtractByPartitionAsync(
        OracleConnection oracleConn,
        string tableName,
        string owner,
        Func<OracleDataReader, Task> processRowAsync)
    {
        // Get partition list
        var partitions = await GetPartitionsAsync(oracleConn, owner, tableName);

        foreach (var partition in partitions)
        {
            Console.WriteLine(
                $"Extracting partition {partition.Name} " +
                $"({partition.NumRows:N0} estimated rows)...");

            // Query specific partition using PARTITION clause
            var sql = $@"
                SELECT /*+ PARALLEL(t, 4) FULL(t) */ t.*
                FROM {owner}.{tableName} PARTITION ({partition.Name}) t";

            using var cmd = new OracleCommand(sql, oracleConn);
            cmd.FetchSize = 1024 * 1024; // 1 MB fetch buffer

            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                await processRowAsync(reader);
            }

            Console.WriteLine($"  Completed partition {partition.Name}");
        }
    }

    private async Task<List<PartitionInfo>> GetPartitionsAsync(
        OracleConnection conn, string owner, string tableName)
    {
        const string sql = @"
            SELECT partition_name, partition_position, num_rows
            FROM all_tab_partitions
            WHERE table_owner = :owner AND table_name = :table_name
            ORDER BY partition_position";

        using var cmd = new OracleCommand(sql, conn);
        cmd.Parameters.Add(new OracleParameter("owner", owner));
        cmd.Parameters.Add(new OracleParameter("table_name", tableName));

        var partitions = new List<PartitionInfo>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            partitions.Add(new PartitionInfo
            {
                Name = reader.GetString(0),
                Position = reader.GetInt32(1),
                NumRows = reader.IsDBNull(2) ? 0 : reader.GetInt64(2)
            });
        }

        return partitions;
    }
}

public record PartitionInfo
{
    public required string Name { get; init; }
    public int Position { get; init; }
    public long NumRows { get; init; }
}
```

## Common Patterns

### Pattern 1: Rolling Window Partition Management

For tables that grow monthly, automate partition management:

```sql
-- Create a procedure to manage monthly partitions
CREATE OR REPLACE PROCEDURE manage_monthly_partitions(
    p_table_name VARCHAR2,
    p_months_ahead NUMBER DEFAULT 3,
    p_months_retain NUMBER DEFAULT 60
) AS
    -- Add future partitions and drop old ones
    -- Called by a monthly DBMS_SCHEDULER job
BEGIN
    -- Implementation: check ALL_TAB_PARTITIONS for existing partitions,
    -- ADD new ones if needed, DROP partitions older than retention period
    NULL; -- placeholder
END;
/
```

### Pattern 2: Partition Exchange for Instant Loads

The fastest way to load a full partition of data:

```sql
-- 1. Create staging table matching partition structure
-- 2. Load data into staging table (with APPEND + PARALLEL)
-- 3. Build indexes on staging table matching local indexes
-- 4. Gather statistics on staging table
-- 5. EXCHANGE PARTITION (instant swap, no data movement)
-- 6. Drop staging table
```

### Pattern 3: Parallel DML on Partitioned Tables

```sql
-- Enable parallel DML for partition-level operations
ALTER SESSION ENABLE PARALLEL DML;

-- Delete old data using partition pruning + parallelism
DELETE /*+ PARALLEL(j, 4) */
FROM cmic_job_cost j
WHERE j.posting_date < DATE '2019-01-01';
-- If partition-prunable, this only touches old partitions

-- But DROP PARTITION is much faster for removing entire partitions
ALTER TABLE cmic_job_cost DROP PARTITION p_fy2018;
```

## Gotchas and Pitfalls

### 1. Partition Pruning Requires the Partition Key in WHERE

```sql
-- PRUNING WORKS: partition key (posting_date) in WHERE clause
SELECT * FROM cmic_job_cost WHERE posting_date = DATE '2024-06-15';

-- NO PRUNING: filtering on non-partition column
SELECT * FROM cmic_job_cost WHERE fiscal_year = 2024;
-- Even though fiscal_year correlates with posting_date, Oracle scans ALL partitions

-- NO PRUNING: function applied to partition key
SELECT * FROM cmic_job_cost WHERE TRUNC(posting_date, 'YYYY') = DATE '2024-01-01';
-- Wrap in a range instead:
SELECT * FROM cmic_job_cost
WHERE posting_date >= DATE '2024-01-01' AND posting_date < DATE '2025-01-01';
```

### 2. Global Indexes Become UNUSABLE After Partition DDL

```sql
-- This makes ALL global indexes UNUSABLE
ALTER TABLE cmic_job_cost DROP PARTITION p_fy2020;

-- Queries using those indexes will fail with ORA-01502
-- Fix: always use UPDATE GLOBAL INDEXES
ALTER TABLE cmic_job_cost DROP PARTITION p_fy2020 UPDATE GLOBAL INDEXES;

-- Or rebuild afterward
ALTER INDEX idx_jc_cost_code_global REBUILD;
```

### 3. HIGH_VALUE Is Stored as a LONG

The `HIGH_VALUE` column in `ALL_TAB_PARTITIONS` is a LONG datatype, which is
difficult to work with programmatically. You cannot use it in WHERE clauses or
compare it directly.

### 4. Partition-Wise Joins Require Matching Partitioning

Oracle can perform partition-wise joins (extremely efficient) only when both tables
are partitioned on the join key with the same strategy. This is rare in CMiC's
schema but valuable when designing staging tables.

### 5. Too Many Partitions Hurts Performance

Having thousands of partitions increases the cost of hard parsing and metadata
operations. For monthly partitions, 60-120 partitions (5-10 years) is reasonable.
Archive older data to separate tables.

## Performance Considerations

### Partition Pruning Impact

| Scenario | Without Partitioning | With Partitioning (Pruned) |
|---|---|---|
| Full table: 100M rows, query 1 year | Scan 100M rows | Scan ~10M rows (1 of 10 partitions) |
| DROP old fiscal year | DELETE + COMMIT (hours) | DROP PARTITION (seconds) |
| Statistics gathering | Entire table (hours) | One partition (minutes) |
| Index rebuild | Entire index | One local index partition |

### Choosing the Right Strategy

| Data Pattern | Strategy | Example |
|---|---|---|
| Time-series with known ranges | Range | Job cost by fiscal year |
| Time-series with unknown future | Interval | AP invoices by month |
| Discrete categories | List | Payroll by company code |
| Need even distribution | Hash | GL detail by transaction ID |
| Two access patterns | Composite (Range-List) | Job cost by year + company |

### SQL Server Partitioning Comparison

| Feature | Oracle | SQL Server |
|---|---|---|
| Syntax | `PARTITION BY` in CREATE TABLE | Partition function + scheme |
| Interval partitioning | Built-in | Not available (use sliding window) |
| List partitioning | Built-in | Not available natively |
| Partition exchange | `ALTER TABLE ... EXCHANGE` | `ALTER TABLE ... SWITCH` |
| Local indexes | `LOCAL` keyword | Partition-aligned indexes |
| Composite | Range-List, Range-Hash, etc. | Not available |
| Max partitions | 1,048,575 | 15,000 |

## BNBuilders Context

### CMiC ERP on Oracle

CMiC commonly partitions these table types:

- **Job Cost / Cost Detail**: Range-partitioned by posting date or fiscal year.
  This is the table you query most for migration. Always include the partition key
  in your WHERE clause to trigger pruning.
- **GL Journal Detail**: Often range-partitioned by accounting period.
- **AP/AR Transactions**: May use interval partitioning by invoice date.
- **Payroll**: May be list-partitioned by company code if BNBuilders has multiple
  entities.

### Oracle-to-SQL Server Migration

When migrating partitioned Oracle tables to SQL Server:

1. **Map the strategy**: Oracle range partitioning maps to SQL Server partition
   functions. List and hash do not have direct equivalents.
2. **Extract by partition**: Use `SELECT ... FROM table PARTITION (p_name)` to
   extract one partition at a time, enabling progress tracking and restart.
3. **Create matching SQL Server partitions**: Define a partition function and scheme
   in SQL Server for the target table.
4. **Use SWITCH for fast loads**: SQL Server's `ALTER TABLE ... SWITCH` is equivalent
   to Oracle's `EXCHANGE PARTITION`.

### Construction Data Patterns

- **Fiscal year is king**: Most construction reporting is by fiscal year. Partition
  on the date column that drives fiscal year, not on a fiscal_year integer column.
- **Multi-entity**: BNBuilders may have multiple legal entities in CMiC. Composite
  partitioning (Range by date, List by company) supports both time-based and
  entity-based queries efficiently.
- **Archival**: Construction projects close but their data must be retained.
  Partitioning makes archival fast — just exchange the partition to an archive table
  and compress it.

## Interview / Senior Dev Questions

1. **Q: What is partition pruning and how do you verify it is happening?**
   A: Partition pruning is the optimizer's ability to skip irrelevant partitions
   based on the WHERE clause. Verify by running `EXPLAIN PLAN` and checking
   the `Pstart` and `Pstop` columns, or looking for `PARTITION RANGE SINGLE` /
   `PARTITION RANGE ITERATOR` operations. If you see `PARTITION RANGE ALL`,
   no pruning is occurring.

2. **Q: Why would you choose local indexes over global indexes?**
   A: Local indexes are partition-aligned, so partition maintenance operations
   (DROP, SPLIT, EXCHANGE) do not invalidate them. Global indexes span all
   partitions and must be rebuilt or updated after partition DDL. For ETL-heavy
   tables where you frequently drop/exchange partitions, local indexes are
   strongly preferred.

3. **Q: How does Oracle's EXCHANGE PARTITION compare to SQL Server's SWITCH?**
   A: Both perform an instant metadata swap between a table and a partition.
   Oracle uses `ALTER TABLE t EXCHANGE PARTITION p WITH TABLE staging`. SQL Server
   uses `ALTER TABLE staging SWITCH TO t PARTITION n`. Both require matching
   schemas and constraints. Neither moves any data physically.

4. **Q: You need to extract 5 years of job cost data (500M rows) from a
   range-partitioned CMiC table. How would you approach this?**
   A: Extract one partition (fiscal year) at a time using
   `SELECT ... FROM table PARTITION (p_fyXXXX)` with `PARALLEL` and `FULL` hints.
   Load each partition into a corresponding SQL Server partition using SqlBulkCopy.
   This gives you progress tracking, restart capability, and avoids scanning the
   entire table. If a partition fails, you only re-extract that year.

## Quiz

**Question 1:** A CMiC job cost table is range-partitioned by `posting_date`. Which
of these queries will benefit from partition pruning?

A) `WHERE fiscal_year = 2024`
B) `WHERE posting_date BETWEEN DATE '2024-01-01' AND DATE '2024-12-31'`
C) `WHERE EXTRACT(YEAR FROM posting_date) = 2024`

<details>
<summary>Show Answer</summary>

Only **B** benefits from partition pruning. The partition key `posting_date` must
appear directly in the WHERE clause without functions applied to it.

- A does not prune because `fiscal_year` is not the partition key.
- C does not prune because `EXTRACT()` is a function applied to the partition key,
  preventing the optimizer from matching it to partition boundaries.
</details>

**Question 2:** You drop a partition from a CMiC table without using
`UPDATE GLOBAL INDEXES`. What happens to queries that use a global index on that table?

<details>
<summary>Show Answer</summary>

The global indexes become `UNUSABLE`. Any query that tries to use those indexes will
fail with `ORA-01502: index or partition of such index is in unusable state`.

To fix this, either:
- Always use `ALTER TABLE ... DROP PARTITION ... UPDATE GLOBAL INDEXES`
- Rebuild the indexes afterward: `ALTER INDEX idx_name REBUILD`

Local indexes are not affected by partition DDL on other partitions.
</details>

**Question 3:** What is the advantage of EXCHANGE PARTITION over INSERT/SELECT
for loading a partition?

<details>
<summary>Show Answer</summary>

EXCHANGE PARTITION is an instant metadata-only operation. It swaps the data
dictionary pointers between a staging table and a partition. No rows are physically
moved, regardless of table size. An INSERT/SELECT of 50 million rows might take
30 minutes; an EXCHANGE PARTITION takes less than a second.

Additional benefits:
- The staging table can be loaded and indexed independently.
- If something goes wrong, you can exchange back.
- It generates minimal redo log.
</details>

**Question 4:** How would you design SQL Server partitioning to match an Oracle table
that is range-partitioned by `posting_date` with yearly boundaries?

<details>
<summary>Show Answer</summary>

```sql
-- Step 1: Create partition function
CREATE PARTITION FUNCTION pf_posting_date (DATE)
AS RANGE RIGHT FOR VALUES (
    '2021-01-01', '2022-01-01', '2023-01-01',
    '2024-01-01', '2025-01-01', '2026-01-01'
);

-- Step 2: Create partition scheme (map to filegroups)
CREATE PARTITION SCHEME ps_posting_date
AS PARTITION pf_posting_date
ALL TO ([PRIMARY]);

-- Step 3: Create table on the scheme
CREATE TABLE dbo.cmic_job_cost (
    job_cost_id   BIGINT NOT NULL,
    job_number    NVARCHAR(20) NOT NULL,
    cost_code     NVARCHAR(10) NOT NULL,
    amount        DECIMAL(15,2),
    posting_date  DATE NOT NULL
) ON ps_posting_date(posting_date);
```

Note that SQL Server does not support interval partitioning, so you must manually
add new boundary values with `ALTER PARTITION FUNCTION ... SPLIT RANGE` before
each new fiscal year.
</details>
