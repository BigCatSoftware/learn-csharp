# Oracle to SQL Server Migration Patterns

*Chapter 10.11 — Oracle SQL for Data Engineers*

## Overview

Migrating data from Oracle to SQL Server is more than copying rows. The two databases
differ in type systems, NULL semantics, date handling, string functions, sequence
mechanisms, and procedural languages. A data engineer who understands these differences
can build reliable pipelines that produce correct results on the first run.

This lesson provides a comprehensive mapping between Oracle and SQL Server constructs,
highlights the gotchas that cause subtle data corruption, and gives you testing
strategies to validate your migrations. For BNBuilders, this directly applies to
migrating CMiC ERP data from Oracle into SQL Server for reporting and analytics.

## Core Concepts

### The Migration Dimensions

| Dimension | What Changes |
|---|---|
| **Data types** | NUMBER -> DECIMAL/BIGINT, VARCHAR2 -> NVARCHAR, DATE -> DATETIME2 |
| **NULL semantics** | Oracle: '' = NULL; SQL Server: '' != NULL |
| **Date/time** | Oracle DATE has time; SQL Server DATE does not |
| **String functions** | SUBSTR -> SUBSTRING, NVL -> ISNULL, DECODE -> CASE |
| **Sequences** | Oracle SEQUENCE -> SQL Server IDENTITY or SEQUENCE |
| **PL/SQL** | PL/SQL -> T-SQL (significant syntax differences) |
| **Pagination** | ROWNUM / FETCH FIRST -> TOP / OFFSET-FETCH |
| **Joins** | Oracle (+) syntax -> ANSI JOIN (both support ANSI) |

## Code Examples

### Complete Type Mapping Table

```sql
-- Oracle Type               -> SQL Server Type             Notes
------------------------------------------------------------------------
-- NUMBER(p,0) where p<=9    -> INT                         Whole numbers up to ~2 billion
-- NUMBER(p,0) where p<=18   -> BIGINT                      Large whole numbers
-- NUMBER(p,s) where s>0     -> DECIMAL(p,s)                Exact numeric with decimals
-- NUMBER (no precision)     -> DECIMAL(38,10) or FLOAT     Depends on actual data
-- VARCHAR2(n BYTE)          -> NVARCHAR(n) or VARCHAR(n)   NVARCHAR if Unicode needed
-- VARCHAR2(n CHAR)          -> NVARCHAR(n)                 Character semantics
-- CHAR(n)                   -> CHAR(n) or NCHAR(n)         Fixed-width
-- CLOB                      -> NVARCHAR(MAX)               Large text
-- NCLOB                     -> NVARCHAR(MAX)               Unicode large text
-- BLOB                      -> VARBINARY(MAX)              Binary data
-- RAW(n)                    -> VARBINARY(n)                Short binary
-- DATE                      -> DATETIME2(0)                Oracle DATE includes time!
-- TIMESTAMP                 -> DATETIME2(7)                Fractional seconds
-- TIMESTAMP WITH TIME ZONE  -> DATETIMEOFFSET              Includes timezone
-- INTERVAL YEAR TO MONTH    -> No direct equivalent        Store as INT (months)
-- INTERVAL DAY TO SECOND    -> No direct equivalent        Store as BIGINT (seconds)
-- XMLTYPE                   -> XML                         Direct mapping
-- ROWID                     -> No equivalent               Do not migrate
-- LONG                      -> NVARCHAR(MAX)               Deprecated in Oracle too
```

### NULL Handling Differences

```sql
-- ORACLE: Empty string IS NULL
SELECT * FROM dual WHERE '' IS NULL;        -- Returns a row (TRUE)
SELECT NVL('', 'was null') FROM dual;       -- Returns 'was null'
SELECT LENGTH('') FROM dual;                -- Returns NULL

-- SQL SERVER: Empty string IS NOT NULL
SELECT CASE WHEN '' IS NULL THEN 'yes' ELSE 'no' END;  -- Returns 'no'
SELECT ISNULL('', 'was null');              -- Returns '' (empty string)
SELECT LEN('');                             -- Returns 0
```

```csharp
/// <summary>
/// Handle Oracle's empty-string-is-NULL during migration.
/// Choose a strategy: preserve NULLs, convert to empty strings, or use a sentinel.
/// </summary>
public static string? MapOracleString(OracleDataReader reader, int ordinal,
    NullStringStrategy strategy = NullStringStrategy.PreserveNull)
{
    if (reader.IsDBNull(ordinal))
    {
        return strategy switch
        {
            NullStringStrategy.PreserveNull => null,
            NullStringStrategy.ConvertToEmpty => "",
            NullStringStrategy.UseSentinel => "[NULL]",
            _ => null
        };
    }

    return reader.GetString(ordinal);
}

public enum NullStringStrategy
{
    PreserveNull,
    ConvertToEmpty,
    UseSentinel
}
```

### Date/Time Conversion Gotchas

```sql
-- ORACLE: DATE type includes time (hours, minutes, seconds)
CREATE TABLE oracle_example (
    created_date DATE  -- Stores '2024-06-15 14:30:00'
);

-- SQL SERVER: DATE type is date-only, DATETIME2 includes time
CREATE TABLE sqlserver_example (
    created_date DATE,         -- Stores '2024-06-15' only (time truncated!)
    created_datetime DATETIME2 -- Stores '2024-06-15 14:30:00' (correct)
);

-- CRITICAL: If you map Oracle DATE -> SQL Server DATE, you LOSE the time component!
-- Always map Oracle DATE -> SQL Server DATETIME2(0) unless you are certain the
-- column only contains dates without time.
```

```sql
-- Oracle date arithmetic uses days as units
SELECT SYSDATE + 1 FROM dual;             -- Tomorrow
SELECT SYSDATE + 1/24 FROM dual;          -- One hour from now
SELECT SYSDATE - created_date FROM emp;   -- Difference in days (decimal)

-- SQL Server date arithmetic uses DATEADD
SELECT DATEADD(DAY, 1, GETDATE());        -- Tomorrow
SELECT DATEADD(HOUR, 1, GETDATE());       -- One hour from now
SELECT DATEDIFF(DAY, created_date, GETDATE()) FROM emp; -- Difference in whole days
```

```csharp
/// <summary>
/// Validate date mapping during migration.
/// Oracle DATE -> SQL Server DATETIME2(0) preserves the time component.
/// </summary>
public async Task ValidateDateMigrationAsync(
    OracleConnection oracleConn,
    SqlConnection sqlConn,
    string tableName,
    string dateColumn,
    string keyColumn)
{
    // Count records where time component exists in Oracle
    var oracleSql = $@"
        SELECT COUNT(*)
        FROM {tableName}
        WHERE {dateColumn} != TRUNC({dateColumn})";

    await using var oraCmd = new OracleCommand(oracleSql, oracleConn);
    var rowsWithTime = Convert.ToInt64(await oraCmd.ExecuteScalarAsync());

    Console.WriteLine(
        $"{tableName}.{dateColumn}: {rowsWithTime:N0} rows have a time component");

    if (rowsWithTime > 0)
    {
        Console.WriteLine(
            "WARNING: Map to DATETIME2, not DATE, or you will lose time data!");
    }
}
```

### String Function Mapping

```sql
-- SUBSTR -> SUBSTRING
-- Oracle:     SUBSTR(string, start, length)     -- 1-based
-- SQL Server: SUBSTRING(string, start, length)  -- 1-based
SELECT SUBSTR(job_number, 1, 3) FROM cmic_jobs;          -- Oracle
SELECT SUBSTRING(job_number, 1, 3) FROM cmic_jobs;       -- SQL Server

-- INSTR -> CHARINDEX (note: parameter order is reversed!)
-- Oracle:     INSTR(string, search, start_pos, occurrence)
-- SQL Server: CHARINDEX(search, string, start_pos)
SELECT INSTR(description, '-', 1, 1) FROM cmic_jobs;     -- Oracle
SELECT CHARINDEX('-', description, 1) FROM cmic_jobs;     -- SQL Server (no occurrence param)

-- NVL -> ISNULL (or COALESCE for portability)
-- Oracle:     NVL(expr, replacement)
-- SQL Server: ISNULL(expr, replacement)
SELECT NVL(vendor_name, 'Unknown') FROM vendors;          -- Oracle
SELECT ISNULL(vendor_name, 'Unknown') FROM vendors;       -- SQL Server
SELECT COALESCE(vendor_name, 'Unknown') FROM vendors;     -- Both (ANSI standard)

-- NVL2 -> IIF or CASE
-- Oracle:     NVL2(expr, if_not_null, if_null)
-- SQL Server: IIF(expr IS NOT NULL, if_not_null, if_null)
SELECT NVL2(vendor_id, 'Has Vendor', 'No Vendor') FROM jobs;        -- Oracle
SELECT IIF(vendor_id IS NOT NULL, 'Has Vendor', 'No Vendor') FROM jobs; -- SQL Server

-- DECODE -> CASE
-- Oracle:     DECODE(expr, val1, result1, val2, result2, default)
-- SQL Server: CASE expr WHEN val1 THEN result1 WHEN val2 THEN result2 ELSE default END
SELECT DECODE(status, 'A', 'Active', 'C', 'Closed', 'Unknown')
FROM cmic_projects;                                       -- Oracle

SELECT CASE status
    WHEN 'A' THEN 'Active'
    WHEN 'C' THEN 'Closed'
    ELSE 'Unknown'
END FROM cmic_projects;                                   -- SQL Server

-- || -> + (string concatenation)
-- Oracle:     first_name || ' ' || last_name
-- SQL Server: first_name + ' ' + last_name  (or CONCAT for NULL safety)
SELECT job_number || '-' || cost_code FROM cmic_job_cost;       -- Oracle
SELECT job_number + '-' + cost_code FROM cmic_job_cost;         -- SQL Server
SELECT CONCAT(job_number, '-', cost_code) FROM cmic_job_cost;  -- Both

-- TRIM / LTRIM / RTRIM
-- Oracle:     TRIM(BOTH ' ' FROM string), LTRIM(string, chars)
-- SQL Server: TRIM(string), LTRIM(string), RTRIM(string)
-- Note: Oracle LTRIM/RTRIM can trim multiple characters; SQL Server only trims spaces
SELECT LTRIM(cost_code, '0') FROM cmic_job_cost;   -- Oracle: removes leading zeros
SELECT REPLACE(LTRIM(REPLACE(cost_code, '0', ' ')), ' ', '0')
FROM cmic_job_cost;                                 -- SQL Server workaround

-- TO_CHAR -> FORMAT or CONVERT
-- Oracle:     TO_CHAR(posting_date, 'YYYY-MM-DD')
-- SQL Server: FORMAT(posting_date, 'yyyy-MM-dd') or CONVERT(VARCHAR, posting_date, 23)
SELECT TO_CHAR(posting_date, 'YYYY-MM-DD') FROM cmic_job_cost;  -- Oracle
SELECT FORMAT(posting_date, 'yyyy-MM-dd') FROM cmic_job_cost;   -- SQL Server
```

### Complete Function Reference

```sql
-- Comprehensive Oracle -> SQL Server function mapping
------------------------------------------------------------------------
-- String Functions
-- SUBSTR(s,p,n)          -> SUBSTRING(s,p,n)
-- INSTR(s,search)        -> CHARINDEX(search,s)
-- LENGTH(s)              -> LEN(s)                 -- LEN trims trailing spaces!
-- LENGTHB(s)             -> DATALENGTH(s)          -- Byte length
-- UPPER(s)               -> UPPER(s)               -- Same
-- LOWER(s)               -> LOWER(s)               -- Same
-- INITCAP(s)             -> No direct equivalent   -- Use CLR or manual
-- LPAD(s,n,c)            -> RIGHT(REPLICATE(c,n)+s,n)
-- RPAD(s,n,c)            -> LEFT(s+REPLICATE(c,n),n)
-- REPLACE(s,old,new)     -> REPLACE(s,old,new)     -- Same
-- TRANSLATE(s,from,to)   -> No direct equivalent   -- Use nested REPLACE
-- REGEXP_LIKE(s,pat)     -> s LIKE pat (limited) or CLR regex
-- REGEXP_SUBSTR           -> No direct equivalent
-- REGEXP_REPLACE          -> No direct equivalent (until SQL Server 2025)
--
-- Numeric Functions
-- MOD(a,b)               -> a % b
-- TRUNC(n,d)             -> ROUND(n,d,1)           -- 1 = truncate
-- CEIL(n)                -> CEILING(n)
-- FLOOR(n)               -> FLOOR(n)               -- Same
-- ROUND(n,d)             -> ROUND(n,d)             -- Same (but rounding rules differ!)
-- ABS(n)                 -> ABS(n)                  -- Same
-- SIGN(n)                -> SIGN(n)                 -- Same
-- POWER(n,e)             -> POWER(n,e)              -- Same
--
-- Date Functions
-- SYSDATE                -> GETDATE() or SYSDATETIME()
-- SYSTIMESTAMP            -> SYSDATETIMEOFFSET()
-- TRUNC(date)            -> CAST(date AS DATE)
-- ADD_MONTHS(d,n)        -> DATEADD(MONTH,n,d)
-- MONTHS_BETWEEN(d1,d2)  -> DATEDIFF(MONTH,d2,d1)  -- Integer only!
-- LAST_DAY(d)            -> EOMONTH(d)
-- NEXT_DAY(d,'MON')      -> DATEADD(DAY,(9-DATEPART(DW,d))%7,d)  -- Complex
-- EXTRACT(YEAR FROM d)   -> YEAR(d) or DATEPART(YEAR,d)
-- TO_DATE(s,fmt)         -> CONVERT(DATE,s,style) or TRY_PARSE
--
-- NULL Functions
-- NVL(a,b)               -> ISNULL(a,b)
-- NVL2(a,b,c)            -> IIF(a IS NOT NULL,b,c)
-- NULLIF(a,b)            -> NULLIF(a,b)             -- Same
-- COALESCE(a,b,c)        -> COALESCE(a,b,c)         -- Same
-- DECODE(a,b,c,d)        -> CASE a WHEN b THEN c ELSE d END
--
-- Aggregate / Analytic
-- LISTAGG(col,',')       -> STRING_AGG(col,',')
-- ROWNUM                 -> ROW_NUMBER() OVER (...)
-- FETCH FIRST n ROWS     -> TOP n or OFFSET-FETCH
```

### Sequence to IDENTITY Migration

```sql
-- ORACLE: Sequence + trigger pattern
CREATE SEQUENCE seq_job_cost START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE TRIGGER trg_job_cost_bi
BEFORE INSERT ON cmic_job_cost
FOR EACH ROW
BEGIN
    :NEW.job_cost_id := seq_job_cost.NEXTVAL;
END;
/

-- SQL SERVER Option 1: IDENTITY column (simplest)
CREATE TABLE dbo.JobCost (
    JobCostId BIGINT IDENTITY(1,1) NOT NULL,
    JobNumber NVARCHAR(20) NOT NULL,
    -- ...
);

-- SQL SERVER Option 2: SEQUENCE (closer to Oracle pattern)
CREATE SEQUENCE dbo.seq_JobCost START WITH 1 INCREMENT BY 1;

CREATE TABLE dbo.JobCost (
    JobCostId BIGINT NOT NULL DEFAULT NEXT VALUE FOR dbo.seq_JobCost,
    JobNumber NVARCHAR(20) NOT NULL,
    -- ...
);
```

```csharp
/// <summary>
/// When migrating data, you usually want to preserve the original Oracle IDs.
/// Use IDENTITY_INSERT to allow explicit ID values.
/// </summary>
public async Task MigrateWithOriginalIdsAsync(
    SqlConnection sqlConn,
    IDataReader sourceReader,
    string targetTable)
{
    // Enable explicit ID insertion
    await using (var cmd = new SqlCommand(
        $"SET IDENTITY_INSERT {targetTable} ON", sqlConn))
    {
        await cmd.ExecuteNonQueryAsync();
    }

    try
    {
        using var bulkCopy = new SqlBulkCopy(sqlConn)
        {
            DestinationTableName = targetTable,
            BatchSize = 50000
        };

        // Map the Oracle ID column explicitly
        bulkCopy.ColumnMappings.Add("JOB_COST_ID", "JobCostId");
        bulkCopy.ColumnMappings.Add("JOB_NUMBER", "JobNumber");
        // ... other columns

        await bulkCopy.WriteToServerAsync(sourceReader);
    }
    finally
    {
        await using var cmd = new SqlCommand(
            $"SET IDENTITY_INSERT {targetTable} OFF", sqlConn);
        await cmd.ExecuteNonQueryAsync();
    }

    // Reseed the identity to max value + 1
    await using (var cmd = new SqlCommand($@"
        DECLARE @maxId BIGINT = (SELECT MAX(JobCostId) FROM {targetTable});
        DBCC CHECKIDENT('{targetTable}', RESEED, @maxId);", sqlConn))
    {
        await cmd.ExecuteNonQueryAsync();
    }
}
```

### PL/SQL to T-SQL Conversion

```sql
-- ORACLE PL/SQL
CREATE OR REPLACE PROCEDURE calc_job_total(
    p_job_number IN VARCHAR2,
    p_total      OUT NUMBER,
    p_count      OUT NUMBER
) AS
BEGIN
    SELECT SUM(amount), COUNT(*)
    INTO p_total, p_count
    FROM cmic_job_cost
    WHERE job_number = p_job_number
      AND status = 'POSTED';

    IF p_total IS NULL THEN
        p_total := 0;
        p_count := 0;
    END IF;

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        p_total := 0;
        p_count := 0;
    WHEN OTHERS THEN
        RAISE;
END;
/

-- SQL SERVER T-SQL equivalent
CREATE PROCEDURE dbo.CalcJobTotal
    @JobNumber NVARCHAR(20),
    @Total DECIMAL(15,2) OUTPUT,
    @Count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT @Total = SUM(Amount), @Count = COUNT(*)
    FROM dbo.JobCost
    WHERE JobNumber = @JobNumber
      AND Status = 'POSTED';

    -- T-SQL doesn't have NO_DATA_FOUND; check for NULL instead
    IF @Total IS NULL
    BEGIN
        SET @Total = 0;
        SET @Count = 0;
    END
END;
GO
```

### Data Validation Queries

```sql
-- Run on BOTH databases after migration to compare results

-- 1. Row count comparison
-- Oracle:
SELECT COUNT(*) AS row_count FROM cmic_job_cost WHERE fiscal_year = 2024;
-- SQL Server:
SELECT COUNT(*) AS row_count FROM dbo.JobCost WHERE FiscalYear = 2024;

-- 2. Aggregate comparison
-- Oracle:
SELECT
    job_number,
    COUNT(*) AS row_count,
    SUM(amount) AS total_amount,
    MIN(posting_date) AS min_date,
    MAX(posting_date) AS max_date
FROM cmic_job_cost
WHERE fiscal_year = 2024
GROUP BY job_number
ORDER BY job_number;

-- SQL Server:
SELECT
    JobNumber,
    COUNT(*) AS RowCount,
    SUM(Amount) AS TotalAmount,
    MIN(PostingDate) AS MinDate,
    MAX(PostingDate) AS MaxDate
FROM dbo.JobCost
WHERE FiscalYear = 2024
GROUP BY JobNumber
ORDER BY JobNumber;

-- 3. NULL count comparison (critical due to '' = NULL difference)
-- Oracle:
SELECT
    SUM(CASE WHEN vendor_name IS NULL THEN 1 ELSE 0 END) AS null_vendor,
    SUM(CASE WHEN description IS NULL THEN 1 ELSE 0 END) AS null_desc
FROM cmic_job_cost;

-- SQL Server:
SELECT
    SUM(CASE WHEN VendorName IS NULL THEN 1 ELSE 0 END) AS NullVendor,
    SUM(CASE WHEN Description IS NULL THEN 1 ELSE 0 END) AS NullDesc
FROM dbo.JobCost;

-- 4. Data type range validation
-- Check for Oracle NUMBERs that exceed SQL Server's DECIMAL range
-- Oracle:
SELECT COUNT(*)
FROM cmic_job_cost
WHERE amount > 99999999999999999999999999.9999999999
   OR amount < -99999999999999999999999999.9999999999;
```

```csharp
/// <summary>
/// Automated validation framework for Oracle-to-SQL-Server migration.
/// Compares row counts, aggregates, and sample data between both databases.
/// </summary>
public class MigrationValidator
{
    public async Task<ValidationResult> ValidateTableAsync(
        OracleConnection oracleConn,
        SqlConnection sqlConn,
        string oracleTable,
        string sqlServerTable,
        string? whereClause = null)
    {
        var result = new ValidationResult { TableName = sqlServerTable };
        var where = whereClause != null ? $" WHERE {whereClause}" : "";

        // Compare row counts
        var oracleCount = await GetScalarAsync<long>(
            oracleConn, $"SELECT COUNT(*) FROM {oracleTable}{where}");
        var sqlCount = await GetScalarAsync<long>(
            sqlConn, $"SELECT COUNT(*) FROM {sqlServerTable}{where}");

        result.OracleRowCount = oracleCount;
        result.SqlServerRowCount = sqlCount;
        result.RowCountMatch = oracleCount == sqlCount;

        if (!result.RowCountMatch)
        {
            Console.WriteLine(
                $"ROW COUNT MISMATCH: {oracleTable}={oracleCount:N0}, " +
                $"{sqlServerTable}={sqlCount:N0}, " +
                $"diff={Math.Abs(oracleCount - sqlCount):N0}");
        }

        return result;
    }

    private async Task<T> GetScalarAsync<T>(IDbConnection conn, string sql)
    {
        if (conn is OracleConnection oraConn)
        {
            await using var cmd = new OracleCommand(sql, oraConn);
            var result = await cmd.ExecuteScalarAsync();
            return (T)Convert.ChangeType(result!, typeof(T));
        }
        else if (conn is SqlConnection sqlConn)
        {
            await using var cmd = new SqlCommand(sql, sqlConn);
            var result = await cmd.ExecuteScalarAsync();
            return (T)Convert.ChangeType(result!, typeof(T));
        }
        throw new ArgumentException("Unsupported connection type");
    }
}

public record ValidationResult
{
    public required string TableName { get; init; }
    public long OracleRowCount { get; set; }
    public long SqlServerRowCount { get; set; }
    public bool RowCountMatch { get; set; }
}
```

## Common Patterns

### Pattern 1: Type-Safe Column Mapper

```csharp
/// <summary>
/// Maps Oracle column types to SQL Server types based on the Oracle data dictionary.
/// Query ALL_TAB_COLUMNS on Oracle, then generate CREATE TABLE DDL for SQL Server.
/// </summary>
public static string MapOracleTypeToSqlServer(
    string oracleType, int? precision, int? scale, int? charLength)
{
    return oracleType.ToUpperInvariant() switch
    {
        "NUMBER" when scale == 0 && precision <= 9  => "INT",
        "NUMBER" when scale == 0 && precision <= 18 => "BIGINT",
        "NUMBER" when scale > 0  => $"DECIMAL({precision},{scale})",
        "NUMBER"                 => "DECIMAL(38,10)",
        "VARCHAR2"               => $"NVARCHAR({charLength})",
        "NVARCHAR2"              => $"NVARCHAR({charLength})",
        "CHAR"                   => $"NCHAR({charLength})",
        "CLOB"                   => "NVARCHAR(MAX)",
        "NCLOB"                  => "NVARCHAR(MAX)",
        "BLOB"                   => "VARBINARY(MAX)",
        "RAW"                    => $"VARBINARY({charLength})",
        "DATE"                   => "DATETIME2(0)",
        "TIMESTAMP"              => "DATETIME2(7)",
        var t when t.StartsWith("TIMESTAMP") && t.Contains("TIME ZONE")
                                 => "DATETIMEOFFSET",
        "XMLTYPE"                => "XML",
        "FLOAT"                  => "FLOAT",
        "BINARY_FLOAT"           => "REAL",
        "BINARY_DOUBLE"          => "FLOAT",
        _                        => $"/* UNMAPPED: {oracleType} */ NVARCHAR(MAX)"
    };
}
```

### Pattern 2: DDL Generation from Oracle Metadata

```sql
-- Oracle query to generate SQL Server CREATE TABLE statements
SELECT
    'CREATE TABLE dbo.' || INITCAP(table_name) || ' (' || CHR(10) ||
    LISTAGG(
        '    ' || INITCAP(column_name) || ' ' ||
        CASE
            WHEN data_type = 'NUMBER' AND data_scale = 0 AND data_precision <= 9
                THEN 'INT'
            WHEN data_type = 'NUMBER' AND data_scale = 0
                THEN 'BIGINT'
            WHEN data_type = 'NUMBER' AND data_scale > 0
                THEN 'DECIMAL(' || data_precision || ',' || data_scale || ')'
            WHEN data_type = 'NUMBER'
                THEN 'DECIMAL(38,10)'
            WHEN data_type = 'VARCHAR2'
                THEN 'NVARCHAR(' || char_length || ')'
            WHEN data_type = 'DATE'
                THEN 'DATETIME2(0)'
            WHEN data_type = 'CLOB'
                THEN 'NVARCHAR(MAX)'
            ELSE '/* ' || data_type || ' */ NVARCHAR(MAX)'
        END ||
        CASE WHEN nullable = 'N' THEN ' NOT NULL' ELSE '' END,
        ',' || CHR(10)
    ) WITHIN GROUP (ORDER BY column_id) ||
    CHR(10) || ');'
    AS ddl
FROM all_tab_columns
WHERE owner = 'CMIC_OWNER'
  AND table_name = 'CMIC_JOB_COST'
GROUP BY table_name;
```

### Pattern 3: Incremental Migration with Change Tracking

```csharp
/// <summary>
/// Track migration state to enable incremental (delta) loads.
/// Uses a watermark table on SQL Server to remember the last extracted timestamp.
/// </summary>
public async Task<DateTime> IncrementalMigrateAsync(
    OracleConnection oracleConn,
    SqlConnection sqlConn,
    string oracleTable,
    string sqlServerTable,
    string timestampColumn)
{
    // Get last watermark from SQL Server
    var lastWatermark = await GetLastWatermarkAsync(sqlConn, sqlServerTable);

    Console.WriteLine($"Extracting {oracleTable} since {lastWatermark:yyyy-MM-dd HH:mm:ss}");

    // Extract changed rows from Oracle
    var sql = $@"
        SELECT /*+ PARALLEL(t, 4) */
            t.*
        FROM {oracleTable} t
        WHERE t.{timestampColumn} > :last_watermark
        ORDER BY t.{timestampColumn}";

    await using var cmd = new OracleCommand(sql, oracleConn);
    cmd.BindByName = true;
    cmd.Parameters.Add(new OracleParameter("last_watermark", lastWatermark));
    cmd.FetchSize = 4 * 1024 * 1024;

    await using var reader = await cmd.ExecuteReaderAsync();

    // Load into SQL Server staging table, then MERGE
    // ... (use SqlBulkCopy + MERGE pattern from lesson 63)

    var newWatermark = DateTime.UtcNow;
    await UpdateWatermarkAsync(sqlConn, sqlServerTable, newWatermark);

    return newWatermark;
}
```

## Gotchas and Pitfalls

### 1. Oracle DATE vs SQL Server DATE

This is the number-one migration bug. Oracle DATE includes hours/minutes/seconds.
SQL Server DATE is date-only. If you map Oracle DATE to SQL Server DATE, you lose
all time information silently. Always use DATETIME2(0) unless you have confirmed the
column never contains time values.

### 2. Empty String / NULL Confusion

Oracle: `'' IS NULL` evaluates to TRUE. SQL Server: `'' IS NOT NULL` evaluates to TRUE.
After migration, queries that check `IS NULL` will return different results if the
source data contained empty strings. Decide on a convention and apply it consistently
in your C# mapping code.

### 3. String Concatenation with NULL

Oracle: `'Hello' || NULL` returns `'Hello'` (NULL is ignored).
SQL Server: `'Hello' + NULL` returns `NULL` (NULL propagates).
Use `CONCAT()` on SQL Server for NULL-safe concatenation.

### 4. ROUND() Behavior Difference

Oracle uses "round half away from zero" (banker's rounding is not default).
SQL Server uses "round half up" for positive, "round half down" for negative.
For financial data (job costs, payroll), this can cause penny differences across
millions of rows.

### 5. Case Sensitivity

Oracle identifiers default to uppercase. SQL Server identifiers preserve case but
comparisons depend on collation. Your C# column mappings must account for this:
Oracle returns `JOB_NUMBER`, SQL Server expects `JobNumber`.

### 6. Implicit Type Conversion

Oracle is more permissive with implicit conversions (e.g., comparing VARCHAR2 to
NUMBER silently converts). SQL Server may throw conversion errors for the same
comparisons. Test all WHERE clauses with actual data before production migration.

### 7. ROWNUM vs TOP

```sql
-- Oracle: ROWNUM is assigned before ORDER BY
SELECT * FROM (
    SELECT * FROM cmic_job_cost ORDER BY amount DESC
) WHERE ROWNUM <= 10;

-- SQL Server: TOP applies after ORDER BY
SELECT TOP 10 * FROM dbo.JobCost ORDER BY Amount DESC;

-- Both: ANSI standard (works on both)
SELECT * FROM cmic_job_cost
ORDER BY amount DESC
FETCH FIRST 10 ROWS ONLY;  -- Oracle 12c+ and SQL Server 2012+
```

## Performance Considerations

### Migration Throughput Benchmarks

| Table Size | Method | Approximate Time |
|---|---|---|
| 1M rows | OracleReader -> SqlBulkCopy | 30-60 seconds |
| 10M rows | OracleReader -> SqlBulkCopy | 5-10 minutes |
| 100M rows | Partition-by-partition | 45-90 minutes |
| 100M rows | Parallel partitions (4 threads) | 15-30 minutes |

### Optimization Checklist

1. Set Oracle `FetchSize` to 4+ MB.
2. Use `SqlBulkCopy` with `BatchSize = 50000` and `EnableStreaming = true`.
3. Disable SQL Server indexes before bulk load, rebuild after.
4. Set SQL Server recovery model to BULK_LOGGED during migration.
5. Extract partitioned tables one partition at a time.
6. Run validation queries after each table migration.

### Index Strategy

```sql
-- On SQL Server target: drop indexes before load, recreate after
-- This is significantly faster than loading into an indexed table

-- Before migration:
DROP INDEX ix_JobCost_PostingDate ON dbo.JobCost;
DROP INDEX ix_JobCost_JobNumber ON dbo.JobCost;

-- After migration:
CREATE INDEX ix_JobCost_PostingDate ON dbo.JobCost (PostingDate)
    WITH (SORT_IN_TEMPDB = ON, ONLINE = ON);
CREATE INDEX ix_JobCost_JobNumber ON dbo.JobCost (JobNumber)
    WITH (SORT_IN_TEMPDB = ON, ONLINE = ON);
```

## BNBuilders Context

### CMiC ERP on Oracle

CMiC's Oracle schema uses conventions that require attention during migration:

- **Column naming**: Oracle uses UPPER_SNAKE_CASE (e.g., `JOB_COST_ID`). SQL Server
  convention at BNBuilders likely uses PascalCase (e.g., `JobCostId`). Map names
  explicitly in your column mappings.
- **Number precision**: CMiC stores amounts as `NUMBER(15,2)`. Map to `DECIMAL(15,2)`
  on SQL Server to preserve precision exactly.
- **Status codes**: CMiC uses single-character or short string status codes. These
  may contain trailing spaces due to `CHAR` type. Use `RTRIM` during extraction or
  map to `NVARCHAR` (not `NCHAR`).

### Construction Data Migration Priorities

| Table Category | Examples | Priority | Notes |
|---|---|---|---|
| Job Cost | job_cost, cost_detail | Highest | Core financial data |
| Project Master | projects, phases | High | Dimension data |
| Vendor/Subcontractor | vendors, contracts | High | AP integration |
| Payroll | payroll_detail, timecard | Medium | Sensitive, audit trail |
| Document Management | documents, attachments | Lower | Large BLOBs |

### Testing Strategy for BNBuilders

1. **Row counts**: Exact match required for every table.
2. **Financial totals**: SUM(amount) by job number must match to the penny.
3. **Date integrity**: Verify no time components were lost in date columns.
4. **NULL counts**: Compare NULL counts per column between Oracle and SQL Server.
5. **Key relationships**: Verify foreign key relationships survive migration.
6. **Report comparison**: Run the same business report from both sources and compare.

## Interview / Senior Dev Questions

1. **Q: Oracle DATE includes time but SQL Server DATE does not. How do you handle this
   in a migration?**
   A: Map Oracle DATE to SQL Server DATETIME2(0), which preserves the time component.
   Before migration, query the Oracle source to identify which DATE columns actually
   contain time values (`WHERE col != TRUNC(col)`). Only use SQL Server DATE for
   columns confirmed to have no time component.

2. **Q: How do you handle Oracle's empty-string-is-NULL behavior when migrating to
   SQL Server?**
   A: Choose a strategy and document it. Option 1: Preserve Oracle NULLs (some SQL
   Server NOT NULL constraints may need to change). Option 2: Convert NULLs to empty
   strings in C# during extraction. Option 3: Use COALESCE in the Oracle extraction
   query. Test the chosen strategy with validation queries comparing NULL counts.

3. **Q: What validation do you run after migrating a financial table like job costs?**
   A: At minimum: exact row count match, SUM(amount) match by grouping key (job
   number, fiscal year), MIN/MAX date match, NULL count per column comparison,
   and a spot check of individual records by primary key. For financial data, the
   aggregate amounts must match to the penny.

4. **Q: How would you migrate an Oracle SEQUENCE-based ID to SQL Server?**
   A: Use IDENTITY_INSERT ON to preserve original Oracle IDs. After the bulk load,
   use DBCC CHECKIDENT to reseed the identity to MAX(id) + 1. Alternatively, use
   a SQL Server SEQUENCE object with START WITH set to MAX(id) + 1 for closer
   behavioral parity with Oracle.

## Quiz

**Question 1:** You migrate an Oracle table where a DATE column stores
`'2024-06-15 14:30:00'`. The SQL Server target column is defined as `DATE`. What
value ends up in SQL Server?

<details>
<summary>Show Answer</summary>

`2024-06-15` (date only). The time component `14:30:00` is silently truncated because
SQL Server's `DATE` type does not store time. To preserve the full value, the SQL Server
column should be `DATETIME2(0)`, which stores date and time without fractional seconds.
</details>

**Question 2:** An Oracle column contains both NULL values and empty strings. After
migration, a SQL Server query `WHERE column IS NULL` returns fewer rows than the same
query on Oracle. Why?

<details>
<summary>Show Answer</summary>

Oracle treats empty strings as NULL, so `WHERE column IS NULL` matches both real NULLs
and empty strings. During migration, if the C# code converts Oracle NULLs to empty
strings (since it cannot distinguish them), then in SQL Server the empty strings are
`NOT NULL`, reducing the count of `IS NULL` matches.

Alternatively, if the C# code preserves NULLs, the counts should match. The mismatch
suggests inconsistent NULL/empty-string handling in the migration code.
</details>

**Question 3:** Convert this Oracle query to SQL Server:

```sql
SELECT SUBSTR(job_number, 1, 3) || '-' || NVL(cost_code, 'N/A')
FROM cmic_job_cost
WHERE INSTR(description, 'change order') > 0
  AND ROWNUM <= 100;
```

<details>
<summary>Show Answer</summary>

```sql
SELECT TOP 100
    SUBSTRING(JobNumber, 1, 3) + '-' + ISNULL(CostCode, 'N/A')
FROM dbo.JobCost
WHERE CHARINDEX('change order', Description) > 0;
```

Key changes:
- `SUBSTR` -> `SUBSTRING`
- `||` -> `+` (or use `CONCAT` for NULL safety)
- `NVL` -> `ISNULL`
- `INSTR(string, search)` -> `CHARINDEX(search, string)` (reversed parameter order)
- `ROWNUM <= 100` -> `TOP 100`
</details>

**Question 4:** Why should you drop indexes on the SQL Server target table before
a bulk migration and recreate them afterward?

<details>
<summary>Show Answer</summary>

Inserting rows one batch at a time into an indexed table requires maintaining the
indexes after each batch. For millions of rows, this means millions of individual
index insertions with page splits, random I/O, and transaction log overhead.

Dropping indexes first allows `SqlBulkCopy` to write rows sequentially without index
maintenance. Rebuilding indexes afterward is a single sequential operation that can
use parallel execution and `SORT_IN_TEMPDB`. The total time (bulk load + index rebuild)
is typically 3-5x faster than loading into an indexed table.
</details>
