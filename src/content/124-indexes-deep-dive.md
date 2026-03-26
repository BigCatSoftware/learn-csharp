# Indexes Deep Dive

*Chapter 9.5 — T-SQL for Data Engineers*

## Overview

Indexes are the foundation of SQL Server query performance. For a Data Engineer dealing with multi-million-row job cost tables, vendor transaction histories, and BI reporting queries, the difference between a table scan and an index seek can be the difference between a 200ms response and a 45-second timeout. This lesson covers every index type you need to know: clustered, nonclustered, covering, filtered, columnstore, and unique. We go deep into B-tree structure, INCLUDE columns, index maintenance, fill factor, and the specific indexing strategies that matter for construction data at BNBuilders — high-volume OLTP job cost tables, soft-delete patterns, and columnstore for analytics.

## Core Concepts

### How SQL Server Stores Data

Every table is stored as either a **heap** (no clustered index) or a **clustered index** (B-tree ordered by the clustering key). Understanding this is fundamental.

- **Heap**: Data pages are unordered. New rows go wherever there is space. Lookups require a RID (Row Identifier = file:page:slot). No logical order.
- **Clustered index**: Data pages are physically ordered by the clustering key. The leaf level of the B-tree IS the data. There can be only one clustered index per table.

### B-Tree Structure

SQL Server uses a B+ tree structure for both clustered and nonclustered indexes.

```
                    [Root Page]
                   /     |     \
          [Intermediate] [Intermediate] [Intermediate]
          /    |    \
    [Leaf] [Leaf] [Leaf]  ...  [Leaf]
```

- **Root page**: Single page at the top. Contains key ranges pointing to intermediate pages.
- **Intermediate pages**: Guide the search down the tree. Each level narrows the search range.
- **Leaf pages**:
  - For a **clustered index**: leaf pages contain the actual data rows.
  - For a **nonclustered index**: leaf pages contain the index key columns + a pointer back to the data (clustered key or RID).

**Seek cost**: O(log n) — typically 3-4 page reads for a table with millions of rows. A 10-million-row table with an 8KB page might have a B-tree depth of 3 (root + 1 intermediate + leaf).

### Clustered Indexes

The clustered index defines the physical order of the table. Every table should have one (heaps have niche uses, but they are the exception).

```sql
-- Clustered index on the primary key (most common)
ALTER TABLE dbo.JobCost
ADD CONSTRAINT PK_JobCost PRIMARY KEY CLUSTERED (JobCostID);
```

**Clustering key selection criteria:**
1. **Narrow** — The clustering key is included in every nonclustered index. A wide clustering key (e.g., a GUID or composite key) bloats every NCI.
2. **Unique** — If not unique, SQL Server adds a hidden 4-byte "uniquifier." Waste of space.
3. **Ever-increasing** — Sequential values (IDENTITY, SEQUENCE) avoid page splits. GUIDs (NEWID()) cause random inserts and massive fragmentation. NEWSEQUENTIALID() is a compromise.
4. **Static** — Changing the clustering key value requires physically moving the row. Avoid clustering on columns that get updated.

**The INT IDENTITY clustered key is the gold standard for OLTP tables.** It satisfies all four criteria.

```sql
-- Bad: GUID clustered index causes page splits and fragmentation
CREATE TABLE dbo.BadExample (
    ID UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY CLUSTERED,  -- terrible
    ...
);

-- Good: INT IDENTITY clustered index
CREATE TABLE dbo.GoodExample (
    ID INT IDENTITY(1,1) PRIMARY KEY CLUSTERED,
    ...
);
```

### Nonclustered Indexes

A nonclustered index is a separate B-tree structure. Its leaf pages contain the index key columns plus a "bookmark" (the clustered key or RID) to look up the full row.

```sql
-- Nonclustered index on ProjectID and PostingDate for common query patterns
CREATE NONCLUSTERED INDEX IX_JobCost_Project_Date
ON dbo.JobCost (ProjectID, PostingDate)
INCLUDE (CostCode, Amount, CostType);
```

**Key columns** (in parentheses): Determine the sort order. Used for seeks and range scans.
**INCLUDE columns**: Stored at the leaf level but not part of the sort. Used to "cover" queries and avoid key lookups.

### Covering Indexes

A **covering index** contains all the columns a query needs. When a query is fully covered, SQL Server reads only the index — no bookmark lookup to the base table.

```sql
-- This query:
SELECT ProjectID, CostCode, Amount
FROM dbo.JobCost
WHERE ProjectID = 1001 AND PostingDate >= '2025-01-01';

-- Is fully covered by this index:
CREATE NONCLUSTERED INDEX IX_JobCost_Cover
ON dbo.JobCost (ProjectID, PostingDate)
INCLUDE (CostCode, Amount);
```

The execution plan will show an **Index Seek** with no **Key Lookup**. This is the performance sweet spot.

**When to use INCLUDE vs key columns:**
- Put columns in the key if they are used in WHERE, JOIN ON, or ORDER BY.
- Put columns in INCLUDE if they are only in SELECT (output) or in the INCLUDE-only-needed list.
- INCLUDE columns do not affect sort order and do not count toward the 900-byte / 16-column key limit.

### Filtered Indexes

A filtered index has a WHERE clause that limits which rows are indexed. Smaller index = faster seeks, less storage, less maintenance.

```sql
-- Only index active projects (soft-delete pattern)
CREATE NONCLUSTERED INDEX IX_Project_Active
ON dbo.Project (Region, ProjectName)
INCLUDE (ProjectID)
WHERE IsActive = 1;
```

```sql
-- Only index open purchase orders
CREATE NONCLUSTERED INDEX IX_PO_Open
ON dbo.PurchaseOrder (ProjectID, CostCode)
INCLUDE (RemainingAmount)
WHERE POStatus = 'Open';
```

**Filtered index gotchas:**
- The query's WHERE clause must be a superset of the index filter for the optimizer to use it.
- Parameterized queries may not match filtered indexes unless you use `OPTION (RECOMPILE)` or the parameter value is sniffed correctly.
- Cannot use filtered indexes with MERGE statements easily.

### Unique Indexes

Enforce uniqueness on a column or combination of columns. Can be clustered or nonclustered.

```sql
-- Ensure no duplicate invoice numbers per vendor
CREATE UNIQUE NONCLUSTERED INDEX UQ_Invoice_Vendor_Number
ON dbo.Invoice (VendorID, InvoiceNumber);
```

Unique indexes also give the optimizer better cardinality estimates because it knows each key value returns exactly one row.

### Columnstore Indexes

Columnstore indexes store data column-by-column instead of row-by-row. They use compression and batch-mode processing for massive analytical performance gains.

**Clustered columnstore index (CCI):** Replaces the row-based table storage entirely. The table IS a columnstore.

```sql
-- Convert a large fact table to columnstore for BI reporting
CREATE CLUSTERED COLUMNSTORE INDEX CCI_JobCostHistory
ON dbo.JobCostHistory;
```

**Nonclustered columnstore index (NCCI):** Adds a columnstore index alongside the existing row-based storage. Enables real-time operational analytics (HTAP).

```sql
-- Add columnstore to an OLTP table for mixed workloads
CREATE NONCLUSTERED COLUMNSTORE INDEX NCCI_JobCost_Analytics
ON dbo.JobCost (ProjectID, CostCode, CostType, Amount, PostingDate);
```

**When to use columnstore:**
- Analytical queries that scan millions of rows and aggregate (SUM, AVG, COUNT).
- BI reporting tables and fact tables.
- Data warehouse / lakehouse patterns.
- Tables where queries touch a subset of columns (columnstore only reads needed columns).

**When NOT to use columnstore:**
- OLTP point lookups (single-row seeks by primary key).
- Tables with frequent single-row updates (deltastore overhead).
- Small tables (< 100K rows) where B-tree is already fast enough.

### Columnstore Compression and Row Groups

Columnstore data is organized into **row groups** of approximately 1 million rows each. Each row group stores each column as a compressed **column segment**. Compression ratios of 5-10x are common.

```sql
-- Check row group health
SELECT
    object_name(i.object_id) AS TableName,
    i.name AS IndexName,
    rg.row_group_id,
    rg.state_desc,
    rg.total_rows,
    rg.deleted_rows,
    rg.size_in_bytes / 1024 AS SizeKB
FROM sys.column_store_row_groups AS rg
INNER JOIN sys.indexes AS i
    ON i.object_id = rg.object_id AND i.index_id = rg.index_id
WHERE object_name(i.object_id) = 'JobCostHistory'
ORDER BY rg.row_group_id;
```

## Code Examples

### Finding Missing Indexes

SQL Server tracks missing index recommendations in DMVs.

```sql
-- Top 25 missing indexes by estimated impact
SELECT TOP 25
    ROUND(s.avg_total_user_cost * s.avg_user_impact * (s.user_seeks + s.user_scans), 0) AS EstimatedImpact,
    d.statement AS TableName,
    d.equality_columns,
    d.inequality_columns,
    d.included_columns,
    s.user_seeks,
    s.user_scans,
    s.avg_total_user_cost,
    s.avg_user_impact
FROM sys.dm_db_missing_index_groups AS g
INNER JOIN sys.dm_db_missing_index_group_stats AS s ON s.group_handle = g.index_group_handle
INNER JOIN sys.dm_db_missing_index_details AS d ON d.index_handle = g.index_handle
WHERE d.database_id = DB_ID()
ORDER BY EstimatedImpact DESC;
```

### Index Usage Statistics

```sql
-- Which indexes are actually being used?
SELECT
    OBJECT_NAME(i.object_id) AS TableName,
    i.name AS IndexName,
    i.type_desc,
    u.user_seeks,
    u.user_scans,
    u.user_lookups,
    u.user_updates,
    u.last_user_seek,
    u.last_user_scan
FROM sys.indexes AS i
LEFT JOIN sys.dm_db_index_usage_stats AS u
    ON u.object_id = i.object_id
   AND u.index_id = i.index_id
   AND u.database_id = DB_ID()
WHERE OBJECTPROPERTY(i.object_id, 'IsUserTable') = 1
ORDER BY COALESCE(u.user_seeks, 0) + COALESCE(u.user_scans, 0) ASC;
```

Indexes with zero seeks and zero scans but high user_updates are pure overhead — they cost writes but provide no read benefit. Consider dropping them.

### Index Fragmentation Check

```sql
-- Check fragmentation on large indexes
SELECT
    OBJECT_NAME(ips.object_id) AS TableName,
    i.name AS IndexName,
    ips.index_type_desc,
    ips.avg_fragmentation_in_percent,
    ips.page_count,
    ips.avg_page_space_used_in_percent,
    ips.record_count
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') AS ips
INNER JOIN sys.indexes AS i
    ON i.object_id = ips.object_id AND i.index_id = ips.index_id
WHERE ips.page_count > 1000              -- only large indexes
  AND ips.avg_fragmentation_in_percent > 10
ORDER BY ips.avg_fragmentation_in_percent DESC;
```

### Index Maintenance: Rebuild vs Reorganize

```sql
-- Decision logic for index maintenance
-- < 10% fragmentation: do nothing
-- 10-30% fragmentation: REORGANIZE (online, minimal locking)
-- > 30% fragmentation: REBUILD (more thorough, locks table unless ONLINE)

-- Reorganize (always online)
ALTER INDEX IX_JobCost_Project_Date ON dbo.JobCost REORGANIZE;

-- Rebuild offline (faster but locks table)
ALTER INDEX IX_JobCost_Project_Date ON dbo.JobCost REBUILD;

-- Rebuild online (Enterprise Edition only, minimal blocking)
ALTER INDEX IX_JobCost_Project_Date ON dbo.JobCost
REBUILD WITH (ONLINE = ON, MAXDOP = 4);

-- Rebuild all indexes on a table
ALTER INDEX ALL ON dbo.JobCost REBUILD WITH (ONLINE = ON);
```

### Automated Maintenance Script Pattern

```sql
-- Maintenance loop based on fragmentation levels
DECLARE @sql NVARCHAR(MAX);
DECLARE @IndexName NVARCHAR(256);
DECLARE @TableName NVARCHAR(256);
DECLARE @Frag FLOAT;

DECLARE index_cursor CURSOR FOR
SELECT
    OBJECT_NAME(ips.object_id),
    i.name,
    ips.avg_fragmentation_in_percent
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') AS ips
INNER JOIN sys.indexes AS i
    ON i.object_id = ips.object_id AND i.index_id = ips.index_id
WHERE ips.page_count > 1000
  AND ips.avg_fragmentation_in_percent > 10
  AND i.name IS NOT NULL;

OPEN index_cursor;
FETCH NEXT FROM index_cursor INTO @TableName, @IndexName, @Frag;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF @Frag > 30
        SET @sql = N'ALTER INDEX ' + QUOTENAME(@IndexName)
                 + N' ON ' + QUOTENAME(@TableName)
                 + N' REBUILD WITH (ONLINE = ON);';
    ELSE
        SET @sql = N'ALTER INDEX ' + QUOTENAME(@IndexName)
                 + N' ON ' + QUOTENAME(@TableName)
                 + N' REORGANIZE;';

    EXEC sp_executesql @sql;

    FETCH NEXT FROM index_cursor INTO @TableName, @IndexName, @Frag;
END;

CLOSE index_cursor;
DEALLOCATE index_cursor;
```

In practice, use Ola Hallengren's maintenance solution (`IndexOptimize`) rather than writing your own. But understanding the underlying logic matters.

### Fill Factor

Fill factor controls how full each leaf page is after a rebuild. Lower fill factor = more free space = fewer page splits but more storage.

```sql
-- Set fill factor to 80% on a frequently updated index
ALTER INDEX IX_JobCost_Project_Date ON dbo.JobCost
REBUILD WITH (FILLFACTOR = 80);
```

**Guidance:**
- **100% (default)**: Read-heavy tables with sequential inserts (IDENTITY key). No wasted space.
- **80-90%**: Tables with random inserts or frequent updates to indexed columns. Reduces page splits.
- **70%**: Heavily updated columns in the index key. Rare in practice.

Do not set fill factor below 70% — the storage overhead is rarely justified.

## Common Patterns

### Composite index column order matters

The leftmost column is the most important. SQL Server can seek on a prefix of the index key but not skip columns.

```sql
-- Index: (ProjectID, CostCode, PostingDate)
-- Can SEEK on: ProjectID alone, ProjectID + CostCode, or all three
-- CANNOT seek on: CostCode alone, PostingDate alone

-- This uses the index (seek on ProjectID):
SELECT * FROM dbo.JobCost WHERE ProjectID = 1001;

-- This uses the index (seek on ProjectID + CostCode):
SELECT * FROM dbo.JobCost WHERE ProjectID = 1001 AND CostCode = '01.100';

-- This CANNOT seek the index (CostCode is not the leading column):
SELECT * FROM dbo.JobCost WHERE CostCode = '01.100';
```

**Rule**: Put the most selective equality column first, followed by range columns.

### Key Lookup elimination

```sql
-- Before: query causes a key lookup
-- Index: IX_JobCost_ProjectID (ProjectID) -- no INCLUDE
SELECT ProjectID, CostCode, Amount
FROM dbo.JobCost
WHERE ProjectID = 1001;
-- Plan: Index Seek on IX_JobCost_ProjectID -> Key Lookup (for CostCode, Amount)

-- After: add INCLUDE to eliminate the lookup
CREATE NONCLUSTERED INDEX IX_JobCost_ProjectID_v2
ON dbo.JobCost (ProjectID)
INCLUDE (CostCode, Amount);
-- Plan: Index Seek only (covering index, no lookup)
```

### Soft-delete with filtered index

```sql
-- Most queries filter on IsDeleted = 0. Index only the active rows.
CREATE NONCLUSTERED INDEX IX_Vendor_Active
ON dbo.Vendor (VendorName)
INCLUDE (VendorID, VendorType)
WHERE IsDeleted = 0;

-- This query uses the filtered index:
SELECT VendorID, VendorName, VendorType
FROM dbo.Vendor
WHERE IsDeleted = 0 AND VendorName LIKE 'ABC%';
```

### Columnstore for BI aggregation

```sql
-- Power BI hits this query pattern millions of times:
SELECT
    p.Region,
    YEAR(jc.PostingDate) AS FiscalYear,
    MONTH(jc.PostingDate) AS FiscalMonth,
    jc.CostType,
    SUM(jc.Amount) AS TotalAmount,
    COUNT(*) AS TransactionCount
FROM dbo.JobCostHistory AS jc
INNER JOIN dbo.Project AS p ON p.ProjectID = jc.ProjectID
GROUP BY p.Region, YEAR(jc.PostingDate), MONTH(jc.PostingDate), jc.CostType;

-- With a clustered columnstore index on JobCostHistory, this query:
-- 1. Only reads the columns it needs (ProjectID, PostingDate, CostType, Amount)
-- 2. Uses batch mode processing for the GROUP BY
-- 3. Benefits from 5-10x compression on repeated values (CostType, dates)
-- 4. Scans 50M rows in seconds instead of minutes
```

## Gotchas and Pitfalls

1. **Over-indexing** — Every index adds overhead to INSERT, UPDATE, and DELETE. A table with 15 nonclustered indexes pays 15x the write cost. Audit unused indexes regularly with `sys.dm_db_index_usage_stats`.

2. **GUID clustering keys** — `NEWID()` as a clustered index causes random page inserts, maximum fragmentation, and page splits. Use `NEWSEQUENTIALID()` if you must use GUIDs, or better yet, use IDENTITY.

3. **Wide clustering keys** — The clustering key is silently appended to every nonclustered index. A 36-byte UNIQUEIDENTIFIER clustering key adds 36 bytes to every NCI row. On a table with 5 NCIs and 10 million rows, that is 1.8GB of wasted space.

4. **Implicit column inclusion** — Every nonclustered index implicitly includes the clustering key columns. You do not need to add them to INCLUDE.

```sql
-- Clustered index on (JobCostID)
-- NCI: (ProjectID) INCLUDE (CostCode)
-- The NCI leaf actually contains: ProjectID, CostCode, JobCostID
-- No need to INCLUDE JobCostID — it's already there
```

5. **Filtered index and parameterized queries** — If a stored procedure uses a parameter `@IsActive BIT` in `WHERE IsActive = @IsActive`, the optimizer may not use a filtered index `WHERE IsActive = 1` because the parameter could be 0. Use `OPTION (RECOMPILE)` or hard-code the value for reliable filtered index usage.

6. **Columnstore and single-row operations** — Columnstore indexes are designed for bulk analytical reads. Single-row lookups by primary key are slower on columnstore than on B-tree. For OLTP tables that also serve analytics, use a nonclustered columnstore alongside the B-tree clustered index.

7. **Rebuild vs Reorganize on Standard Edition** — ONLINE index rebuilds require Enterprise Edition (or Developer Edition). On Standard Edition, `ALTER INDEX ... REBUILD` takes an exclusive lock on the table. Plan maintenance during off-hours.

8. **Statistics staleness after index rebuild** — Rebuilding an index automatically updates its statistics. Reorganizing does NOT. After reorganizing a heavily changed index, manually update statistics.

## Performance Considerations

### Index Seek vs Index Scan vs Table Scan

| Access Method | When Used | Relative Cost |
|---|---|---|
| Index Seek | WHERE matches index prefix with equality/range | Lowest (O(log n) + matching rows) |
| Index Scan | Full scan of a nonclustered index (smaller than table) | Medium |
| Table Scan (or CI Scan) | Full scan of the base table / clustered index | Highest |
| Key Lookup | NCI seek + clustered index lookup per row | Seek + random I/O per row |

**Key Lookups are the hidden performance killer.** An NCI seek that returns 10 rows with a key lookup is fine. An NCI seek returning 50,000 rows, each requiring a random I/O key lookup, is often slower than a full table scan. The optimizer has a **tipping point** — when it estimates too many key lookups, it switches to a scan. This threshold is typically around 25-33% of table rows.

### Index Design for Common Query Patterns

```sql
-- Pattern 1: Point lookup by primary key
-- Index: clustered on (JobCostID) — already done by PK
SELECT * FROM dbo.JobCost WHERE JobCostID = 12345;

-- Pattern 2: Range scan with aggregation
-- Index: (ProjectID, PostingDate) INCLUDE (Amount, CostType)
SELECT SUM(Amount) FROM dbo.JobCost
WHERE ProjectID = 1001 AND PostingDate BETWEEN '2025-01-01' AND '2025-12-31';

-- Pattern 3: Lookup + ORDER BY
-- Index: (VendorID, InvoiceDate DESC) INCLUDE (InvoiceAmount, InvoiceNumber)
SELECT TOP 10 InvoiceNumber, InvoiceAmount, InvoiceDate
FROM dbo.Invoice
WHERE VendorID = 500
ORDER BY InvoiceDate DESC;

-- Pattern 4: Existence check
-- Index: (ProjectID) on PurchaseOrder — skinny, just for the seek
SELECT 1 FROM dbo.PurchaseOrder WHERE ProjectID = 1001 AND POStatus = 'Open';
```

### Index Maintenance Schedule

For BNBuilders workloads:
- **Nightly**: Check fragmentation on large tables (JobCost, Invoice, PurchaseOrder). Reorganize 10-30%, rebuild 30%+.
- **Weekly**: Update statistics on all tables with `sp_updatestats` or targeted `UPDATE STATISTICS`.
- **Monthly**: Audit unused indexes with `sys.dm_db_index_usage_stats`. Review missing index DMVs.
- **After bulk loads**: Update statistics on loaded tables. Consider disabling NCIs before bulk load and rebuilding after for large initial loads.

```sql
-- Disable indexes before bulk load (dramatically faster inserts)
ALTER INDEX IX_JobCost_Project_Date ON dbo.JobCost DISABLE;
ALTER INDEX IX_JobCost_Vendor ON dbo.JobCost DISABLE;

-- Bulk load data...
BULK INSERT dbo.JobCost FROM '\\server\share\jobcost.csv' WITH (...);

-- Rebuild indexes after load
ALTER INDEX IX_JobCost_Project_Date ON dbo.JobCost REBUILD;
ALTER INDEX IX_JobCost_Vendor ON dbo.JobCost REBUILD;
```

## BNBuilders Context

Indexing at BNBuilders revolves around these realities:

- **JobCost is the largest table** — Tens of millions of rows, growing daily. The clustered index is on `JobCostID` (INT IDENTITY). The most critical nonclustered indexes are on `(ProjectID, PostingDate)` and `(VendorID, PostingDate)` with appropriate INCLUDE columns.

- **CMiC Oracle migration** — Oracle does not have the same index types (no INCLUDE columns, different columnstore). During migration, you need to redesign the index strategy for SQL Server. Oracle's bitmap indexes translate to filtered or columnstore indexes in SQL Server.

- **Soft-delete is everywhere** — BNBuilders uses `IsActive` and `IsDeleted` flags rather than hard deletes. Filtered indexes on `WHERE IsActive = 1` reduce index size by 20-40% on tables with significant historical data.

- **Power BI Direct Query** — Some dashboards use DirectQuery mode, which sends live T-SQL to SQL Server. Without proper indexes and columnstore on analytical tables, these dashboards time out. A nonclustered columnstore on the JobCost table (or a separate JobCostHistory analytics table with a CCI) is essential.

- **Equipment tracking** — Equipment GPS and usage data generates high-volume inserts. Sequential IDENTITY clustering keys prevent fragmentation. A columnstore index on the analytics view of equipment hours enables fleet utilization dashboards.

```sql
-- BNBuilders recommended index set for JobCost
-- 1. Clustered PK
ALTER TABLE dbo.JobCost ADD CONSTRAINT PK_JobCost
    PRIMARY KEY CLUSTERED (JobCostID);

-- 2. Most common query pattern: by project and date
CREATE NONCLUSTERED INDEX IX_JobCost_Project_Date
ON dbo.JobCost (ProjectID, PostingDate)
INCLUDE (CostCode, CostType, Amount, VendorID);

-- 3. Vendor spend queries
CREATE NONCLUSTERED INDEX IX_JobCost_Vendor
ON dbo.JobCost (VendorID, PostingDate)
INCLUDE (ProjectID, Amount);

-- 4. Cost code analysis
CREATE NONCLUSTERED INDEX IX_JobCost_CostCode
ON dbo.JobCost (CostCode, CostType)
INCLUDE (ProjectID, Amount, PostingDate);

-- 5. Columnstore for analytics (nonclustered to coexist with OLTP)
CREATE NONCLUSTERED COLUMNSTORE INDEX NCCI_JobCost_Analytics
ON dbo.JobCost (ProjectID, CostCode, CostType, Amount, PostingDate, VendorID);
```

## Interview / Senior Dev Questions

**Q1: You have a 50-million-row JobCost table with a clustered index on JobCostID (IDENTITY). A query filters on ProjectID and PostingDate. Walk through the index design.**

Create a nonclustered index on `(ProjectID, PostingDate)` — ProjectID first because it is the equality predicate, PostingDate second because it is the range predicate. INCLUDE any columns referenced in SELECT to create a covering index: `INCLUDE (CostCode, CostType, Amount)`. This eliminates key lookups. Check the execution plan — you should see an Index Seek with no Key Lookup. If the query also has ORDER BY PostingDate, the index already provides that order within each ProjectID partition, so no sort is needed.

**Q2: When would you use a columnstore index instead of a traditional B-tree index?**

Columnstore is the right choice for analytical/BI workloads: queries that scan millions of rows, aggregate with SUM/AVG/COUNT, and touch a subset of columns. Columnstore stores data column-by-column with heavy compression, and uses batch-mode processing for aggregations. It excels at full-scan analytics and is 10-100x faster than B-tree for these patterns. It is NOT the right choice for single-row OLTP lookups (point queries by PK), high-frequency single-row updates, or small tables. For mixed OLTP+analytics workloads, use a nonclustered columnstore alongside a B-tree clustered index.

**Q3: A developer adds 12 nonclustered indexes to a table that receives 50,000 inserts per day. What is the concern?**

Every INSERT must update all 12 nonclustered indexes, meaning each insert does 13 writes (1 to the clustered index + 12 to NCIs). At 50,000 inserts/day, that is 650,000 index modifications daily. Concerns: (1) Write amplification slows insert throughput. (2) More indexes mean more pages to split, more fragmentation, more maintenance. (3) Higher TempDB and log usage during maintenance windows. The fix: audit index usage with `sys.dm_db_index_usage_stats`. Drop indexes with zero or near-zero seeks/scans and high user_updates. Most tables need 3-5 well-designed NCIs, not 12.

**Q4: Explain what a "tipping point" is in the context of index selection by the query optimizer.**

The tipping point is the row count threshold at which the optimizer switches from a nonclustered index seek + key lookup to a full table/clustered index scan. When the estimated number of key lookups exceeds roughly 25-33% of the table's pages, the random I/O cost of lookups exceeds the sequential I/O cost of a scan. For example, on a 100,000-page table, if the optimizer estimates more than ~25,000-33,000 lookups, it abandons the NCI and scans the table. The solution is to create a covering index (add INCLUDE columns) to eliminate key lookups entirely, or to accept the scan if the data is not selective enough.

## Quiz

**1. What is the difference between a key column and an INCLUDE column in a nonclustered index?**

<details>
<summary>Show Answer</summary>

Key columns are part of the B-tree sort order. They determine seek and scan capabilities and appear at both intermediate and leaf levels of the index. INCLUDE columns are stored only at the leaf level — they are not sorted and cannot be used for seeks. INCLUDE columns exist to "cover" queries (provide all needed columns from the index) without expanding the index key. Key columns count toward the 900-byte / 16-column key limit; INCLUDE columns do not.
</details>

**2. You have a table with a UNIQUEIDENTIFIER (NEWID()) clustered index and insert performance is poor. What is happening and how do you fix it?**

<details>
<summary>Show Answer</summary>

NEWID() generates random GUIDs, causing random inserts across the entire clustered index B-tree. This leads to massive page splits, high fragmentation (often 99%+), and poor buffer pool utilization because "hot" pages are scattered. Fixes: (1) Switch to INT IDENTITY for the clustered key and make the GUID a nonclustered unique index. (2) If a GUID must be the clustered key, use NEWSEQUENTIALID() which generates roughly sequential GUIDs within a server restart cycle. (3) Lower fill factor (80%) to leave room for out-of-order inserts, though this is a band-aid.
</details>

**3. A filtered index `WHERE IsActive = 1` exists, but the query `WHERE IsActive = @IsActive` does not use it. Why?**

<details>
<summary>Show Answer</summary>

The optimizer does not know the value of `@IsActive` at compile time (or uses the sniffed value which might be 0). For the filtered index to be used, the optimizer must be certain the query's predicate is a subset of the index filter. A parameter could be 0, which would not match `WHERE IsActive = 1`. Fixes: (1) Use `OPTION (RECOMPILE)` so the optimizer sees the actual parameter value. (2) Hard-code the literal: `WHERE IsActive = 1`. (3) Use dynamic SQL that embeds the value.
</details>

**4. When should you REORGANIZE vs REBUILD an index?**

<details>
<summary>Show Answer</summary>

REORGANIZE at 10-30% fragmentation: it is an online operation that defragments leaf pages by physically reordering them. It is always online and does minimal locking. REBUILD at 30%+ fragmentation: it drops and recreates the index, fully defragmenting it and updating statistics. On Enterprise Edition, REBUILD can be done ONLINE. On Standard Edition, REBUILD takes an exclusive lock. Below 10% fragmentation, do nothing — the overhead of maintenance exceeds the benefit. Also note: REORGANIZE does NOT update statistics; REBUILD does.
</details>

**5. Your BI team reports that a Power BI dashboard over a 40-million-row job cost table takes 90 seconds to load. The queries aggregate by project, cost type, and month. What index strategy do you recommend?**

<details>
<summary>Show Answer</summary>

Add a nonclustered columnstore index covering the columns used by the BI queries: `CREATE NONCLUSTERED COLUMNSTORE INDEX NCCI_JobCost_BI ON dbo.JobCost (ProjectID, CostCode, CostType, Amount, PostingDate)`. Columnstore provides: (1) Column-wise storage that reads only needed columns. (2) Heavy compression on repeated values like CostType and date components. (3) Batch-mode processing for GROUP BY aggregations. (4) Expected 10-50x speedup for scan-and-aggregate patterns. If the table is read-heavy (historical data), consider a clustered columnstore index on a separate analytics table that is loaded nightly from the OLTP source. Keep the OLTP table's B-tree clustered index for transactional workloads.
</details>
