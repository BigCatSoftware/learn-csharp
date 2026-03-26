# Bulk Operations in T-SQL

*Chapter 9.13 — T-SQL for Data Engineers*

## Overview

Moving large volumes of data into SQL Server is a daily reality for Data Engineers. Whether
you are loading vendor invoices from CSVs, importing field reports from Excel exports, or
migrating millions of rows from Oracle, you need tools that go beyond row-by-row INSERT
statements.

SQL Server provides several bulk-loading mechanisms:

| Method | Best For |
|---|---|
| `BULK INSERT` | T-SQL-based file loading (CSV, fixed-width) |
| `OPENROWSET(BULK...)` | Ad-hoc file reading as a rowset (SELECT into or INSERT) |
| `BCP` (Bulk Copy Program) | Command-line import/export, automation scripts |
| `INSERT...SELECT` with `TABLOCK` | Moving data between tables with minimal logging |
| `SqlBulkCopy` (.NET) | Programmatic bulk load from C# applications |

This lesson covers the T-SQL and command-line approaches. The .NET `SqlBulkCopy` class is
covered in Lesson 60 (SqlBulkCopy Deep Dive).

All bulk methods share a common goal: bypass the row-by-row INSERT overhead and write pages
directly, achieving **minimal logging** where possible.

---

## Core Concepts

### Minimal Logging Requirements

Minimal logging means SQL Server logs page allocations rather than individual row inserts,
reducing log I/O by 10-100x. Requirements:

1. **Recovery model**: SIMPLE or BULK_LOGGED (not FULL — unless the target is a heap or
   empty clustered index with TABLOCK).
2. **TABLOCK hint**: Forces a bulk-update lock on the table.
3. **Empty target** (for clustered index) or **heap** (always eligible with TABLOCK).
4. **No triggers** on the target table (triggers force row-by-row processing).
5. **Trace flag 610** (SQL Server 2016+): Enables minimal logging into non-empty
   B-tree indexes.

### BULK INSERT Options

| Option | Purpose |
|---|---|
| `FIELDTERMINATOR` | Column delimiter (default: `\t`) |
| `ROWTERMINATOR` | Row delimiter (default: `\n`) |
| `FIRSTROW` | Skip header rows (e.g., `FIRSTROW = 2`) |
| `MAXERRORS` | Number of errors before abort |
| `ERRORFILE` | File path for rejected rows |
| `FORMAT` | `'CSV'` for RFC 4180 compliant CSV parsing (SQL 2017+) |
| `CODEPAGE` | Character encoding (e.g., `'65001'` for UTF-8) |
| `BATCHSIZE` | Rows per batch (controls commit frequency) |
| `TABLOCK` | Table lock for minimal logging |
| `CHECK_CONSTRAINTS` | Enforce CHECK constraints during load |
| `FIRE_TRIGGERS` | Execute INSERT triggers during load |

---

## Code Examples

### Basic BULK INSERT

```sql
-- Load a CSV of vendor invoices
BULK INSERT staging.VendorInvoices
FROM 'C:\ETL\Imports\vendor_invoices_2026Q1.csv'
WITH (
    FORMAT         = 'CSV',
    FIELDTERMINATOR = ',',
    ROWTERMINATOR  = '\n',
    FIRSTROW       = 2,          -- skip header
    CODEPAGE       = '65001',    -- UTF-8
    TABLOCK,                     -- minimal logging
    MAXERRORS      = 100,
    ERRORFILE      = 'C:\ETL\Errors\vendor_invoices_errors.txt'
);
```

### BULK INSERT with BATCHSIZE

```sql
-- Load 5 million rows in batches of 50,000
-- If one batch fails, previously committed batches are preserved
BULK INSERT staging.FieldData
FROM '\\fileserver\exports\field_data_all.csv'
WITH (
    FORMAT          = 'CSV',
    FIRSTROW        = 2,
    BATCHSIZE       = 50000,
    TABLOCK,
    MAXERRORS       = 500,
    ERRORFILE       = '\\fileserver\exports\field_data_errors.txt',
    ERRORFILE_DATA_SOURCE = 'MyBlobStorage'  -- SQL 2019+ for Azure Blob
);
```

### BULK INSERT from a Fixed-Width File

```sql
-- Some legacy systems (including older CMiC exports) produce fixed-width files
-- Use a format file to define column positions

-- format_file.fmt (non-XML format):
-- 14.0
-- 3
-- 1  SQLCHAR  0  20  ""  1  JobNumber   SQL_Latin1_General_CP1_CI_AS
-- 2  SQLCHAR  0  10  ""  2  CostCode    SQL_Latin1_General_CP1_CI_AS
-- 3  SQLCHAR  0  14  "\r\n" 3  Amount   ""

BULK INSERT staging.LegacyCosts
FROM 'C:\ETL\Imports\cmic_costs.dat'
WITH (
    FORMATFILE = 'C:\ETL\Formats\cmic_costs.fmt',
    TABLOCK,
    MAXERRORS = 0
);
```

### OPENROWSET(BULK...) — Reading a File as a Rowset

```sql
-- Read a CSV directly in a SELECT (ad-hoc, no staging table needed)
SELECT
    InvoiceNum,
    VendorName,
    Amount,
    InvoiceDate
FROM OPENROWSET(
    BULK 'C:\ETL\Imports\invoices.csv',
    FORMATFILE = 'C:\ETL\Formats\invoices.xml',
    FIRSTROW = 2
) AS src;

-- Insert into a table with transformation
INSERT INTO dbo.VendorInvoices (InvoiceNum, VendorName, Amount, InvoiceDate)
SELECT
    src.InvoiceNum,
    LTRIM(RTRIM(src.VendorName)),
    CAST(src.Amount AS DECIMAL(12, 2)),
    CAST(src.InvoiceDate AS DATE)
FROM OPENROWSET(
    BULK 'C:\ETL\Imports\invoices.csv',
    FORMATFILE = 'C:\ETL\Formats\invoices.xml',
    FIRSTROW = 2
) AS src
WHERE src.Amount IS NOT NULL;
```

### OPENROWSET — Reading an Entire File as a Single BLOB

```sql
-- Read a JSON file as a single NVARCHAR(MAX) value
DECLARE @json NVARCHAR(MAX);

SELECT @json = BulkColumn
FROM OPENROWSET(
    BULK 'C:\ETL\Imports\equipment_readings.json',
    SINGLE_NCLOB  -- reads entire file as one NVARCHAR(MAX) value
) AS src;

-- Now shred with OPENJSON (see Lesson 130)
INSERT INTO staging.EquipmentReadings (EquipmentId, Sensor, Value)
SELECT equipmentId, sensor, value
FROM OPENJSON(@json, '$.readings')
WITH (
    equipmentId NVARCHAR(20) '$.id',
    sensor      NVARCHAR(50) '$.sensor',
    value       DECIMAL(10,2) '$.val'
);
```

### BCP Utility — Export

```bash
# Export a table to CSV
bcp "SELECT JobNumber, CostCode, BudgetAmount FROM dbo.JobCosts" queryout ^
    "C:\ETL\Exports\job_costs.csv" ^
    -S localhost -d BNBuildersDB -T ^
    -c -t "," -r "\n" ^
    -o "C:\ETL\Logs\bcp_export.log"

# Flags:
# -S server  -d database  -T trusted connection
# -c character mode  -t field terminator  -r row terminator
# -o output log file
```

### BCP Utility — Import

```bash
# Import a CSV into a staging table
bcp staging.VendorInvoices in ^
    "C:\ETL\Imports\vendor_invoices.csv" ^
    -S localhost -d BNBuildersDB -T ^
    -c -t "," -r "\n" ^
    -F 2 ^
    -e "C:\ETL\Errors\bcp_errors.txt" ^
    -b 50000 ^
    -h "TABLOCK"

# -F 2 = first row (skip header)
# -e error file  -b batch size
# -h hints (TABLOCK for minimal logging)
```

### BCP — Generating a Format File

```bash
# Generate XML format file (recommended over legacy format)
bcp dbo.JobCosts format nul ^
    -S localhost -d BNBuildersDB -T ^
    -c -t "," ^
    -x -f "C:\ETL\Formats\job_costs.xml"

# -x produces XML format file
# -f specifies output path
# The format file can then be used with BULK INSERT or OPENROWSET
```

### BCP — Native Mode for SQL-to-SQL Transfers

```bash
# Export in native binary format (fastest for SQL-to-SQL)
bcp dbo.JobCosts out "C:\ETL\Exports\job_costs.bcp" ^
    -S source_server -d SourceDB -T -n

# Import on destination
bcp dbo.JobCosts in "C:\ETL\Exports\job_costs.bcp" ^
    -S dest_server -d DestDB -T -n -h "TABLOCK"

# -n = native mode (binary, preserves types exactly)
# Much faster than character mode for large tables
```

### INSERT...SELECT with TABLOCK (Minimal Logging)

```sql
-- Moving data from staging to production with minimal logging
-- Target must be a heap or empty clustered index, with TABLOCK
INSERT INTO dbo.JobCosts WITH (TABLOCK)
    (JobNumber, CostCode, BudgetAmount, ActualAmount, LastUpdatedBy)
SELECT
    s.JobNumber,
    s.CostCode,
    s.BudgetAmount,
    s.ActualAmount,
    s.LoadedBy
FROM staging.JobCostImport AS s
WHERE s.IsValid = 1;
```

### SELECT INTO (Creates Table + Minimal Logging)

```sql
-- SELECT INTO always minimally logged (creates a new heap)
SELECT
    JobNumber,
    CostCode,
    BudgetAmount,
    ActualAmount
INTO staging.JobCosts_Snapshot_20260324
FROM dbo.JobCosts
WHERE JobNumber LIKE 'BNB-4%';
```

---

## Common Patterns

### Pattern 1: Staging-Transform-Load Pipeline

```sql
-- Step 1: Truncate staging
TRUNCATE TABLE staging.VendorInvoiceRaw;

-- Step 2: Bulk load raw data
BULK INSERT staging.VendorInvoiceRaw
FROM '\\fileserver\ap\invoices_20260324.csv'
WITH (FORMAT = 'CSV', FIRSTROW = 2, TABLOCK, MAXERRORS = 50,
      ERRORFILE = '\\fileserver\ap\errors\inv_errors.txt');

-- Step 3: Validate and transform
INSERT INTO staging.VendorInvoiceClean
SELECT
    LTRIM(RTRIM(InvoiceNumber))      AS InvoiceNumber,
    LTRIM(RTRIM(VendorCode))         AS VendorCode,
    TRY_CAST(AmountText AS DECIMAL(12,2)) AS Amount,
    TRY_CAST(DateText AS DATE)       AS InvoiceDate,
    JobNumber
FROM staging.VendorInvoiceRaw
WHERE TRY_CAST(AmountText AS DECIMAL(12,2)) IS NOT NULL
  AND TRY_CAST(DateText AS DATE) IS NOT NULL;

-- Step 4: Merge into production
MERGE dbo.VendorInvoices AS tgt
USING staging.VendorInvoiceClean AS src
    ON tgt.InvoiceNumber = src.InvoiceNumber
       AND tgt.VendorCode = src.VendorCode
WHEN NOT MATCHED THEN
    INSERT (InvoiceNumber, VendorCode, Amount, InvoiceDate, JobNumber)
    VALUES (src.InvoiceNumber, src.VendorCode, src.Amount, src.InvoiceDate, src.JobNumber)
WHEN MATCHED AND tgt.Amount <> src.Amount THEN
    UPDATE SET tgt.Amount = src.Amount;
```

### Pattern 2: Error Handling with TRY_CAST

```sql
-- Find rows that failed type conversion (before loading to production)
SELECT
    LineNumber,
    AmountText,
    DateText,
    'Bad Amount' AS ErrorReason
FROM staging.VendorInvoiceRaw
WHERE TRY_CAST(AmountText AS DECIMAL(12,2)) IS NULL
  AND AmountText IS NOT NULL

UNION ALL

SELECT
    LineNumber,
    AmountText,
    DateText,
    'Bad Date' AS ErrorReason
FROM staging.VendorInvoiceRaw
WHERE TRY_CAST(DateText AS DATE) IS NULL
  AND DateText IS NOT NULL;
```

### Pattern 3: Parallel Bulk Load with Partitioned Staging

```sql
-- Split large files by region, load in parallel from multiple Agent job steps
-- Step 1 (parallel):
BULK INSERT staging.FieldData_PNW FROM '\\fs\data\field_pnw.csv'
    WITH (FORMAT = 'CSV', FIRSTROW = 2, TABLOCK);

-- Step 2 (parallel):
BULK INSERT staging.FieldData_CAL FROM '\\fs\data\field_cal.csv'
    WITH (FORMAT = 'CSV', FIRSTROW = 2, TABLOCK);

-- Step 3 (after both complete): combine
INSERT INTO staging.FieldData_All WITH (TABLOCK)
SELECT * FROM staging.FieldData_PNW
UNION ALL
SELECT * FROM staging.FieldData_CAL;
```

---

## Gotchas and Pitfalls

1. **File path visibility**. BULK INSERT runs on the **SQL Server instance**, not on your
   workstation. The path must be accessible from the server's filesystem or a UNC share that
   the SQL Server service account can read.

2. **BCP runs on the client**. Unlike BULK INSERT, BCP executes on the machine where you
   invoke it. The file path is local to that machine. The data travels over the network.

3. **CSV quoting**. Before SQL Server 2017's `FORMAT = 'CSV'`, BULK INSERT did not handle
   quoted fields correctly. If you have commas inside quoted values on older versions, use
   a format file or pre-process the file.

4. **MAXERRORS is per batch**. If `BATCHSIZE = 10000` and `MAXERRORS = 100`, the 101st error
   in any single batch aborts only that batch (previously committed batches are preserved).

5. **IDENTITY columns**. BULK INSERT by default expects data for all columns, including
   IDENTITY. Use `KEEPIDENTITY` to preserve source values, or define a format file / view
   that excludes the identity column.

6. **CODEPAGE matters**. If your CSV contains accented characters (vendor names like
   "Hernandez y Asociados"), specify `CODEPAGE = '65001'` for UTF-8 or the correct code
   page. Wrong encoding produces garbled data silently.

7. **OPENROWSET requires Ad Hoc Distributed Queries**. The server-level config
   `show advanced options` and `Ad Hoc Distributed Queries` must be enabled:
   ```sql
   EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
   EXEC sp_configure 'Ad Hoc Distributed Queries', 1; RECONFIGURE;
   ```

8. **Lock escalation**. TABLOCK acquires a table-level lock. Other sessions cannot read or
   write the table during the bulk load. Schedule bulk loads during maintenance windows or
   use a staging table to avoid blocking production queries.

9. **Transaction log growth**. Even with minimal logging, the transaction log still grows —
   just much less. For very large loads (100M+ rows), monitor log size and consider
   `BATCHSIZE` to commit periodically.

---

## Performance Considerations

- **Disable nonclustered indexes before load, rebuild after**. Maintaining indexes during
  bulk insert adds overhead. For large initial loads, drop or disable NCIs, bulk load, then
  rebuild.

- **Drop and recreate constraints**. CHECK constraints and foreign keys are validated per
  row during BULK INSERT (unless `CHECK_CONSTRAINTS` is omitted — which skips validation).
  For trusted loads, omit `CHECK_CONSTRAINTS` and validate manually.

- **BATCHSIZE tuning**. Smaller batches = more frequent commits = less log space used at any
  moment, but more total overhead. Larger batches = fewer commits = faster, but more log
  space. Start with 50,000-100,000 rows per batch.

- **ROWS_PER_BATCH hint** (different from BATCHSIZE). This is a hint to the optimizer about
  total rows, helping it choose a better plan. It does not affect commit frequency.

- **Sorted input**. If the CSV is sorted by the clustered index key, bulk insert avoids
  random I/O. BCP export with `ORDER(column)` hint can help.

- **Recovery model during load**. Switch to BULK_LOGGED for the load window, then back to
  FULL. Take a log backup immediately after switching back to maintain the log chain.

```sql
-- Switch to BULK_LOGGED for the load
ALTER DATABASE BNBuildersDB SET RECOVERY BULK_LOGGED;

-- ... perform bulk operations ...

-- Switch back
ALTER DATABASE BNBuildersDB SET RECOVERY FULL;

-- Immediately take a log backup
BACKUP LOG BNBuildersDB TO DISK = 'D:\Backups\BNBuildersDB_log_postbulk.trn';
```

---

## BNBuilders Context

### Vendor Invoice CSVs

The AP department receives weekly CSV exports from subcontractors and suppliers. These files
vary in format quality — some have headers, some don't, some use pipe delimiters:

```sql
-- Vendor A: standard CSV
BULK INSERT staging.InvoicesVendorA
FROM '\\ap-share\incoming\vendorA_20260324.csv'
WITH (FORMAT = 'CSV', FIRSTROW = 2, TABLOCK, CODEPAGE = '65001');

-- Vendor B: pipe-delimited, no header
BULK INSERT staging.InvoicesVendorB
FROM '\\ap-share\incoming\vendorB_20260324.txt'
WITH (FIELDTERMINATOR = '|', ROWTERMINATOR = '\r\n', TABLOCK);
```

### Field Data from Excel Exports

Superintendents export daily logs from Excel. IT saves them as CSVs to a shared drive:

```sql
-- Excel-generated CSVs often have \r\n line endings and BOM
BULK INSERT staging.DailyFieldLogs
FROM '\\field-share\dailylogs\site_log_20260324.csv'
WITH (
    FORMAT = 'CSV',
    FIRSTROW = 2,
    ROWTERMINATOR = '0x0A',    -- handle mixed line endings
    CODEPAGE = '65001',
    TABLOCK,
    MAXERRORS = 20,
    ERRORFILE = '\\field-share\dailylogs\errors\site_log_errors.txt'
);
```

### Oracle-to-SQL Server Migration

During the Oracle-to-SQL Server migration, BCP native mode enables fast table transfers:

```bash
# Step 1: Extract from Oracle via linked server into SQL staging
# (done in T-SQL with INSERT...SELECT from OPENQUERY)

# Step 2: BCP out from staging server in native mode
bcp staging.OracleJobCosts out "D:\Migration\oracle_costs.bcp" ^
    -S staging-server -d MigrationDB -T -n

# Step 3: BCP into production SQL Server
bcp dbo.JobCosts in "D:\Migration\oracle_costs.bcp" ^
    -S prod-sql -d BNBuildersDB -T -n -h "TABLOCK" -b 100000
```

### Weekend Data Warehouse Refresh

Full warehouse reloads happen on weekends. The pattern: truncate fact tables, disable
indexes, bulk load, rebuild indexes:

```sql
-- Weekend full refresh of FactJobCost
ALTER INDEX ALL ON dw.FactJobCost DISABLE;

TRUNCATE TABLE dw.FactJobCost;

INSERT INTO dw.FactJobCost WITH (TABLOCK)
SELECT /* ... transform ... */
FROM staging.JobCostExtract;

ALTER INDEX ALL ON dw.FactJobCost REBUILD
    WITH (DATA_COMPRESSION = PAGE, ONLINE = OFF);

UPDATE STATISTICS dw.FactJobCost;
```

---

## Interview / Senior Dev Questions

1. **What is minimal logging and what conditions must be met?**
   Minimal logging records page allocations instead of individual rows, dramatically
   reducing log I/O. Requires SIMPLE or BULK_LOGGED recovery model, TABLOCK hint, and
   (for clustered indexes) an empty table or trace flag 610.

2. **When would you use BCP over BULK INSERT?**
   BCP runs on the client (your workstation or a job server), so the file does not need to
   be on the SQL Server's filesystem. BCP also supports export (queryout/out), which BULK
   INSERT does not. BCP is scriptable in batch files and can generate format files.

3. **How do you handle a CSV where some rows have bad data?**
   Use `MAXERRORS` and `ERRORFILE` to capture rejected rows. Load into a staging table with
   all NVARCHAR columns, then use `TRY_CAST` / `TRY_CONVERT` to identify and route bad
   rows before inserting into the typed production table.

4. **What is the difference between BATCHSIZE and ROWS_PER_BATCH?**
   `BATCHSIZE` controls how many rows are committed per transaction (affects log usage and
   recoverability). `ROWS_PER_BATCH` is a hint that tells the optimizer the total row count
   to help it choose a better execution plan — it does not affect commits.

5. **You need to load 500 million rows. Walk through your approach.**
   Switch to BULK_LOGGED. Disable nonclustered indexes. Use BULK INSERT or BCP with
   TABLOCK and BATCHSIZE of 100K. Sorted input matching the clustered key. Monitor log
   growth. After load: rebuild indexes with DATA_COMPRESSION = PAGE. Update statistics.
   Switch back to FULL recovery. Take a log backup.

---

## Quiz

**Q1: You run BULK INSERT but get a "file not found" error, even though the file exists
on your desktop. Why?**

<details>
<summary>Answer</summary>

BULK INSERT executes on the SQL Server instance, not on your client machine. The file path
must be accessible from the server's filesystem (local drive or UNC share readable by the
SQL Server service account). Use a network share or copy the file to the server first.
</details>

**Q2: What SQL Server 2017+ option simplifies loading CSVs with quoted fields containing
commas?**

<details>
<summary>Answer</summary>

`FORMAT = 'CSV'` — this tells BULK INSERT to parse the file according to RFC 4180 CSV rules,
which correctly handles quoted fields, embedded commas, and embedded newlines within quotes.
Before this option, you needed format files or pre-processing.
</details>

**Q3: You bulk load 1 million rows with BATCHSIZE = 100000. Row 350,000 has a data type
error. What happens to the first 300,000 rows?**

<details>
<summary>Answer</summary>

The first three batches (300,000 rows) are already committed and are preserved. Only batch 4
(rows 300,001-400,000) is rolled back. Batches 5-10 may or may not continue depending on the
`MAXERRORS` setting. BATCHSIZE creates independent transactions, so committed batches survive
subsequent failures.
</details>

**Q4: Why should you disable nonclustered indexes before a large bulk load and rebuild
them afterward?**

<details>
<summary>Answer</summary>

During a bulk insert, SQL Server must maintain every nonclustered index by inserting
corresponding index rows — this adds random I/O and prevents some minimal-logging
optimizations. Disabling NCIs before the load and rebuilding them afterward is faster
because the rebuild can sort the index keys efficiently in a single pass. The trade-off is
that the table is not fully queryable during the load (disabled indexes are not usable).
</details>

**Q5: What is the key difference between BCP's `-c` (character) and `-n` (native) modes?**

<details>
<summary>Answer</summary>

`-c` (character mode) exports data as human-readable text with delimiters. It is portable
but slower and may lose precision on certain types (datetime, float). `-n` (native mode)
exports data in SQL Server's internal binary format. It is faster and preserves types exactly,
but the output is only readable by another SQL Server instance. Use native for SQL-to-SQL
transfers; use character for interoperability with other systems.
</details>
