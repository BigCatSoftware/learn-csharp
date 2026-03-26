# Connecting to Oracle from C#

*Chapter 10.10 — Oracle SQL for Data Engineers*

## Overview

Oracle provides a fully managed .NET driver — `Oracle.ManagedDataAccess.Core` — that
lets C# applications connect to Oracle databases without installing the Oracle Client.
This is the recommended driver for .NET 6+ applications and works on Windows, Linux,
and macOS.

For a data engineer at BNBuilders, this driver is the bridge between CMiC's Oracle
database and your .NET-based ETL pipelines. This lesson covers connection management,
parameterized queries, bulk operations, Oracle-specific types, and async patterns —
everything you need to build production-grade extraction code.

## Core Concepts

### The NuGet Package

```
Oracle.ManagedDataAccess.Core
```

This is the official Oracle driver for .NET Core / .NET 6+. It implements ADO.NET
interfaces (`IDbConnection`, `IDbCommand`, `IDataReader`) so it works with the
standard patterns you already know from `Microsoft.Data.SqlClient`.

### Key Classes

| Class | Purpose | SQL Server Equivalent |
|---|---|---|
| `OracleConnection` | Database connection | `SqlConnection` |
| `OracleCommand` | Execute SQL/PL/SQL | `SqlCommand` |
| `OracleDataReader` | Forward-only result set | `SqlDataReader` |
| `OracleParameter` | Bind variable | `SqlParameter` |
| `OracleBulkCopy` | Bulk insert into Oracle | `SqlBulkCopy` |
| `OracleDataAdapter` | Fill DataSets | `SqlDataAdapter` |

### Connection String Formats

Oracle supports two main connection string formats:

**EZ Connect (simple, no TNS configuration needed):**
```
User Id=cmic_user;Password=secret;Data Source=oraclehost:1521/CMICDB;
```

**TNS Names (references tnsnames.ora entry):**
```
User Id=cmic_user;Password=secret;Data Source=CMICDB;
```

**Full descriptor (inline TNS):**
```
User Id=cmic_user;Password=secret;Data Source=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=oraclehost)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=CMICDB)));
```

## Code Examples

### Basic Connection and Query

```csharp
using Oracle.ManagedDataAccess.Client;

public class CmicDataAccess
{
    private readonly string _connectionString;

    public CmicDataAccess(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <summary>
    /// Basic query pattern: open, execute, read, dispose.
    /// </summary>
    public async Task<List<Project>> GetActiveProjectsAsync()
    {
        var projects = new List<Project>();

        await using var connection = new OracleConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
            SELECT project_id, project_name, status, start_date, budget_amount
            FROM cmic_projects
            WHERE status = :status
            ORDER BY project_name";

        await using var cmd = new OracleCommand(sql, connection);
        cmd.Parameters.Add(new OracleParameter("status", "ACTIVE"));

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            projects.Add(new Project
            {
                ProjectId = reader.GetInt64(0),
                ProjectName = reader.GetString(1),
                Status = reader.GetString(2),
                StartDate = reader.GetDateTime(3),
                BudgetAmount = reader.IsDBNull(4) ? null : reader.GetDecimal(4)
            });
        }

        return projects;
    }
}

public record Project
{
    public long ProjectId { get; init; }
    public required string ProjectName { get; init; }
    public required string Status { get; init; }
    public DateTime StartDate { get; init; }
    public decimal? BudgetAmount { get; init; }
}
```

### Bind Variables (OracleParameter)

```csharp
/// <summary>
/// ALWAYS use bind variables. Never concatenate user input into SQL.
/// Oracle uses :name syntax (not @name like SQL Server).
/// </summary>
public async Task<List<JobCost>> GetJobCostsAsync(
    OracleConnection connection,
    string jobNumber,
    DateTime fromDate,
    DateTime toDate)
{
    const string sql = @"
        SELECT job_cost_id, cost_code, amount, posting_date
        FROM cmic_job_cost
        WHERE job_number = :job_number
          AND posting_date BETWEEN :from_date AND :to_date
        ORDER BY posting_date";

    await using var cmd = new OracleCommand(sql, connection);

    // Oracle binds by position by default! Set BindByName = true for named binding.
    cmd.BindByName = true;

    cmd.Parameters.Add(new OracleParameter("job_number", jobNumber));
    cmd.Parameters.Add(new OracleParameter("from_date", fromDate));
    cmd.Parameters.Add(new OracleParameter("to_date", toDate));

    var results = new List<JobCost>();
    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        results.Add(new JobCost
        {
            JobCostId = reader.GetInt64(0),
            CostCode = reader.GetString(1),
            Amount = reader.GetDecimal(2),
            PostingDate = reader.GetDateTime(3)
        });
    }

    return results;
}
```

### FetchSize for Large Extractions

```csharp
/// <summary>
/// FetchSize controls how many bytes are fetched per round-trip to the server.
/// For ETL extractions, increase it significantly to reduce network round trips.
/// </summary>
public async IAsyncEnumerable<JobCost> StreamJobCostsAsync(
    OracleConnection connection,
    DateTime sinceDate)
{
    const string sql = @"
        SELECT /*+ PARALLEL(j, 4) FULL(j) */
            j.job_cost_id, j.job_number, j.cost_code,
            j.amount, j.posting_date
        FROM cmic_job_cost j
        WHERE j.posting_date >= :since_date";

    await using var cmd = new OracleCommand(sql, connection);
    cmd.BindByName = true;
    cmd.Parameters.Add(new OracleParameter("since_date", sinceDate));

    // Default FetchSize is ~128 KB. For ETL, use 4-8 MB.
    cmd.FetchSize = 4 * 1024 * 1024; // 4 MB

    await using var reader = await cmd.ExecuteReaderAsync();

    // After first fetch, you can also set FetchSize based on RowSize
    // reader.FetchSize = reader.RowSize * 10000; // fetch 10K rows at a time

    while (await reader.ReadAsync())
    {
        yield return new JobCost
        {
            JobCostId = reader.GetInt64(0),
            JobNumber = reader.GetString(1),
            CostCode = reader.GetString(2),
            Amount = reader.GetDecimal(3),
            PostingDate = reader.GetDateTime(4)
        };
    }
}
```

### Array Binding for Batch Inserts

```csharp
/// <summary>
/// Array binding sends multiple rows in a single round-trip.
/// This is Oracle's fastest non-bulk insert method.
/// Much faster than executing INSERT in a loop.
/// </summary>
public async Task BatchInsertJobCostsAsync(
    OracleConnection connection,
    List<JobCost> records)
{
    const string sql = @"
        INSERT INTO stg_job_cost
            (job_cost_id, job_number, cost_code, amount, posting_date)
        VALUES
            (:job_cost_id, :job_number, :cost_code, :amount, :posting_date)";

    await using var cmd = new OracleCommand(sql, connection);
    cmd.BindByName = true;

    // ArrayBindCount tells Oracle how many rows to insert in one call
    cmd.ArrayBindCount = records.Count;

    // Each parameter gets an array of values, one per row
    cmd.Parameters.Add(new OracleParameter("job_cost_id",
        OracleDbType.Int64, records.Select(r => (object)r.JobCostId).ToArray(),
        System.Data.ParameterDirection.Input));

    cmd.Parameters.Add(new OracleParameter("job_number",
        OracleDbType.Varchar2, records.Select(r => (object)r.JobNumber).ToArray(),
        System.Data.ParameterDirection.Input));

    cmd.Parameters.Add(new OracleParameter("cost_code",
        OracleDbType.Varchar2, records.Select(r => (object)r.CostCode).ToArray(),
        System.Data.ParameterDirection.Input));

    cmd.Parameters.Add(new OracleParameter("amount",
        OracleDbType.Decimal, records.Select(r => (object)r.Amount).ToArray(),
        System.Data.ParameterDirection.Input));

    cmd.Parameters.Add(new OracleParameter("posting_date",
        OracleDbType.Date, records.Select(r => (object)r.PostingDate).ToArray(),
        System.Data.ParameterDirection.Input));

    int rowsInserted = await cmd.ExecuteNonQueryAsync();
    Console.WriteLine($"Inserted {rowsInserted} rows via array binding");
}
```

### OracleBulkCopy

```csharp
using Oracle.ManagedDataAccess.Client;
using System.Data;

/// <summary>
/// OracleBulkCopy is Oracle's equivalent to SqlBulkCopy.
/// Best for loading large volumes into Oracle staging tables.
/// </summary>
public async Task BulkLoadToOracleAsync(
    OracleConnection connection,
    DataTable data,
    string targetTable)
{
    using var bulkCopy = new OracleBulkCopy(connection)
    {
        DestinationTableName = targetTable,
        BatchSize = 10000,
        BulkCopyTimeout = 600, // 10 minutes
        NotifyAfter = 50000    // progress notification every 50K rows
    };

    bulkCopy.OracleRowsCopied += (sender, e) =>
    {
        Console.WriteLine($"  {e.RowsCopied:N0} rows copied...");
    };

    // Map columns explicitly (source column name -> destination column name)
    bulkCopy.ColumnMappings.Add("JobCostId", "JOB_COST_ID");
    bulkCopy.ColumnMappings.Add("JobNumber", "JOB_NUMBER");
    bulkCopy.ColumnMappings.Add("CostCode", "COST_CODE");
    bulkCopy.ColumnMappings.Add("Amount", "AMOUNT");
    bulkCopy.ColumnMappings.Add("PostingDate", "POSTING_DATE");

    bulkCopy.WriteToServer(data);
    Console.WriteLine($"Bulk load complete: {data.Rows.Count:N0} rows");
}
```

### Handling Oracle-Specific Types

```csharp
using Oracle.ManagedDataAccess.Types;

/// <summary>
/// Oracle has specific .NET types for high-precision numbers and dates.
/// Use these when .NET's built-in types lose precision.
/// </summary>
public void HandleOracleTypes(OracleDataReader reader)
{
    // OracleDecimal: 38-digit precision (vs .NET decimal's 28-29 digits)
    OracleDecimal oracleAmount = reader.GetOracleDecimal(0);
    decimal netDecimal = oracleAmount.Value; // Convert to .NET decimal (may lose precision)

    // OracleDate: Oracle DATE includes time (unlike SQL Server DATE which is date-only)
    OracleDate oracleDate = reader.GetOracleDate(1);
    DateTime netDateTime = oracleDate.Value;

    // OracleString: handles Oracle VARCHAR2 with NLS settings
    OracleString oracleStr = reader.GetOracleString(2);
    string netString = oracleStr.Value;

    // OracleTimeStamp: higher precision than DateTime
    OracleTimeStamp oracleTstz = reader.GetOracleTimeStamp(3);
    DateTime netTs = oracleTstz.Value;

    // CLOB: large text (stream it for large values)
    OracleClob clob = reader.GetOracleClob(4);
    string clobText = clob.Value;
    clob.Dispose(); // Always dispose LOB objects

    // BLOB: binary data
    OracleBlob blob = reader.GetOracleBlob(5);
    byte[] blobData = blob.Value;
    blob.Dispose();

    // NULL handling: use IsDBNull or Oracle type's IsNull
    if (!reader.IsDBNull(6))
    {
        var value = reader.GetDecimal(6);
    }
}
```

### Executing PL/SQL

```csharp
/// <summary>
/// Call PL/SQL procedures from C# to execute server-side logic,
/// such as running CMiC's built-in data processing procedures.
/// </summary>
public async Task ExecutePlSqlProcedureAsync(
    OracleConnection connection,
    string jobNumber)
{
    // Call a stored procedure
    await using var cmd = new OracleCommand("cmic_pkg.process_job_cost", connection);
    cmd.CommandType = System.Data.CommandType.StoredProcedure;

    cmd.Parameters.Add(new OracleParameter("p_job_number",
        OracleDbType.Varchar2, jobNumber, System.Data.ParameterDirection.Input));

    cmd.Parameters.Add(new OracleParameter("p_result",
        OracleDbType.Int32, System.Data.ParameterDirection.Output));

    await cmd.ExecuteNonQueryAsync();

    int result = ((OracleDecimal)cmd.Parameters["p_result"].Value).ToInt32();
    Console.WriteLine($"Procedure returned: {result}");
}

/// <summary>
/// Execute an anonymous PL/SQL block for complex multi-step operations.
/// </summary>
public async Task ExecutePlSqlBlockAsync(
    OracleConnection connection,
    int fiscalYear)
{
    const string plsql = @"
        BEGIN
            -- Gather stats on the partition we are about to extract
            DBMS_STATS.GATHER_TABLE_STATS(
                ownname  => 'CMIC_OWNER',
                tabname  => 'CMIC_JOB_COST',
                partname => :partition_name,
                degree   => 4
            );
        END;";

    await using var cmd = new OracleCommand(plsql, connection);
    cmd.BindByName = true;
    cmd.Parameters.Add(new OracleParameter("partition_name", $"P_FY{fiscalYear}"));

    await cmd.ExecuteNonQueryAsync();
}
```

### Full ETL Pipeline: Oracle to SQL Server

```csharp
using Oracle.ManagedDataAccess.Client;
using Microsoft.Data.SqlClient;

/// <summary>
/// Complete extraction pipeline: read from Oracle CMiC, write to SQL Server.
/// Uses streaming to handle millions of rows without loading all into memory.
/// </summary>
public class OracleToSqlServerPipeline
{
    private readonly string _oracleConnStr;
    private readonly string _sqlServerConnStr;

    public OracleToSqlServerPipeline(string oracleConnStr, string sqlServerConnStr)
    {
        _oracleConnStr = oracleConnStr;
        _sqlServerConnStr = sqlServerConnStr;
    }

    public async Task<long> MigrateJobCostsAsync(DateTime sinceDate)
    {
        long totalRows = 0;

        await using var oracleConn = new OracleConnection(_oracleConnStr);
        await using var sqlConn = new SqlConnection(_sqlServerConnStr);

        await oracleConn.OpenAsync();
        await sqlConn.OpenAsync();

        // Truncate target staging table
        await using (var truncCmd = new SqlCommand(
            "TRUNCATE TABLE stg.JobCost", sqlConn))
        {
            await truncCmd.ExecuteNonQueryAsync();
        }

        // Extract from Oracle with large fetch size
        const string extractSql = @"
            SELECT /*+ PARALLEL(j, 4) FULL(j) */
                j.job_cost_id, j.job_number, j.cost_code,
                j.amount, j.posting_date, j.vendor_id,
                j.description, j.status
            FROM cmic_job_cost j
            WHERE j.posting_date >= :since_date";

        await using var oraCmd = new OracleCommand(extractSql, oracleConn);
        oraCmd.BindByName = true;
        oraCmd.Parameters.Add(new OracleParameter("since_date", sinceDate));
        oraCmd.FetchSize = 4 * 1024 * 1024;

        await using var reader = await oraCmd.ExecuteReaderAsync();

        // Stream into SQL Server via SqlBulkCopy
        using var bulkCopy = new SqlBulkCopy(sqlConn)
        {
            DestinationTableName = "stg.JobCost",
            BatchSize = 50000,
            BulkCopyTimeout = 3600,
            EnableStreaming = true
        };

        bulkCopy.ColumnMappings.Add("JOB_COST_ID", "JobCostId");
        bulkCopy.ColumnMappings.Add("JOB_NUMBER", "JobNumber");
        bulkCopy.ColumnMappings.Add("COST_CODE", "CostCode");
        bulkCopy.ColumnMappings.Add("AMOUNT", "Amount");
        bulkCopy.ColumnMappings.Add("POSTING_DATE", "PostingDate");
        bulkCopy.ColumnMappings.Add("VENDOR_ID", "VendorId");
        bulkCopy.ColumnMappings.Add("DESCRIPTION", "Description");
        bulkCopy.ColumnMappings.Add("STATUS", "Status");

        bulkCopy.SqlRowsCopied += (_, e) =>
        {
            totalRows = e.RowsCopied;
            Console.WriteLine($"  {e.RowsCopied:N0} rows transferred...");
        };
        bulkCopy.NotifyAfter = 100000;

        // This streams directly from OracleDataReader to SqlBulkCopy
        // No intermediate DataTable needed — memory efficient
        await bulkCopy.WriteToServerAsync(reader);

        Console.WriteLine($"Migration complete: {totalRows:N0} rows");
        return totalRows;
    }
}
```

## Common Patterns

### Pattern 1: Connection String from Configuration

```csharp
// appsettings.json
// {
//   "ConnectionStrings": {
//     "OracleCmic": "User Id=cmic_user;Password=secret;Data Source=oraclehost:1521/CMICDB;",
//     "SqlServerDW": "Server=sqlhost;Database=BNB_DW;Trusted_Connection=true;"
//   }
// }

// Program.cs
var oracleConnStr = builder.Configuration.GetConnectionString("OracleCmic");
var sqlConnStr = builder.Configuration.GetConnectionString("SqlServerDW");

builder.Services.AddSingleton(new OracleToSqlServerPipeline(oracleConnStr!, sqlConnStr!));
```

### Pattern 2: Retry Wrapper for Oracle Connections

```csharp
/// <summary>
/// Oracle connections can drop due to network issues or idle timeouts.
/// Wrap operations in a retry pattern.
/// </summary>
public async Task<T> WithOracleRetryAsync<T>(
    Func<OracleConnection, Task<T>> operation,
    int maxRetries = 3)
{
    for (int attempt = 1; attempt <= maxRetries; attempt++)
    {
        try
        {
            await using var conn = new OracleConnection(_connectionString);
            await conn.OpenAsync();
            return await operation(conn);
        }
        catch (OracleException ex) when (
            ex.Number == 3113 ||  // end-of-file on communication channel
            ex.Number == 3114 ||  // not connected to Oracle
            ex.Number == 12170 || // TNS connect timeout
            ex.Number == 12571)   // TNS packet writer failure
        {
            if (attempt == maxRetries) throw;
            Console.WriteLine(
                $"Oracle connection error (attempt {attempt}/{maxRetries}): {ex.Message}");
            await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt)));
        }
    }

    throw new InvalidOperationException("Unreachable");
}
```

### Pattern 3: Parameterized Batch with BindByName

```csharp
// CRITICAL: Oracle defaults to binding by position, not by name!
// If you have two parameters and swap them in the SQL, it silently uses wrong values.
// Always set BindByName = true.

var cmd = new OracleCommand(sql, connection);
cmd.BindByName = true; // <-- Always set this

cmd.Parameters.Add(new OracleParameter("start_date", startDate));
cmd.Parameters.Add(new OracleParameter("end_date", endDate));
// With BindByName = true, parameter order doesn't matter
// Without it, first parameter binds to first :placeholder regardless of name
```

## Gotchas and Pitfalls

### 1. BindByName Defaults to False

Oracle's driver binds parameters by **position**, not name. If your SQL has
`:end_date` before `:start_date` but you add `start_date` first, the values swap
silently. Always set `cmd.BindByName = true`.

### 2. Oracle DATE Includes Time

Unlike SQL Server's `DATE` type (date only), Oracle's `DATE` includes hours, minutes,
and seconds. When reading Oracle DATEs into .NET `DateTime`, the time component is
preserved. This can cause subtle bugs in date comparisons.

```csharp
// Oracle DATE '2024-01-15 14:30:00' -> DateTime with time
// If you compare with DateTime.Today (midnight), you may miss records
var oracleDate = reader.GetDateTime(0); // includes 14:30:00
```

### 3. Empty String vs NULL

Oracle treats empty strings (`''`) as `NULL`. If you insert an empty string, Oracle
stores `NULL`. This is different from SQL Server, where `''` and `NULL` are distinct.

```csharp
// This inserts NULL in Oracle, not an empty string
cmd.Parameters.Add(new OracleParameter("description", ""));

// After reading back:
reader.IsDBNull(0); // true — Oracle converted '' to NULL
```

### 4. VARCHAR2 Length Semantics

Oracle VARCHAR2 can use byte or char semantics. `VARCHAR2(100 BYTE)` holds 100 bytes,
which may be fewer than 100 characters for multi-byte encodings. The C# driver returns
the value as a .NET string regardless, but you may get truncation errors on inserts.

### 5. Connection Pooling Is Implicit

`OracleConnection` uses connection pooling by default. Calling `Dispose()` returns the
connection to the pool rather than closing it. This is the same behavior as
`SqlConnection`. Ensure you always dispose connections (use `await using`).

### 6. LOB Types Require Special Handling

Oracle CLOB and BLOB types are streamed, not loaded entirely into memory. You must
dispose `OracleClob` and `OracleBlob` objects, or you leak server-side resources.

## Performance Considerations

### FetchSize Tuning

| FetchSize | Round Trips (1M rows) | Memory | Best For |
|---|---|---|---|
| 64 KB (default) | ~15,000 | Low | OLTP queries returning few rows |
| 1 MB | ~1,000 | Moderate | Medium extractions |
| 4 MB | ~250 | Higher | Large ETL extractions |
| 8 MB | ~125 | High | Maximum throughput extractions |

### Array Binding vs OracleBulkCopy vs Loop INSERT

| Method | 100K Rows | 1M Rows | Memory |
|---|---|---|---|
| Loop INSERT | 120 sec | 20+ min | Low |
| Array Binding (batch 5000) | 3 sec | 30 sec | Moderate |
| OracleBulkCopy (batch 10000) | 2 sec | 15 sec | Higher |

### Connection Pooling Settings

```
// Connection string pool settings
Min Pool Size=5;Max Pool Size=20;Connection Timeout=30;
Incr Pool Size=5;Decr Pool Size=2;Connection Lifetime=300;
```

### Streaming vs DataTable

For migrations, always stream from `OracleDataReader` directly into `SqlBulkCopy`.
Loading into a `DataTable` first doubles your memory usage and adds no value.

## BNBuilders Context

### CMiC ERP on Oracle

- CMiC's Oracle database likely uses Oracle 12c or 19c. The managed driver supports
  both versions without installing Oracle Client software.
- CMiC may have custom PL/SQL packages for data extraction. Call them via
  `OracleCommand` with `CommandType.StoredProcedure`.
- CMiC schemas often use Oracle-specific types: `NUMBER(p,s)` for all numerics,
  `DATE` for all timestamps, `VARCHAR2` for strings.

### Oracle-to-SQL Server Migration

- Use the streaming pipeline pattern (OracleDataReader -> SqlBulkCopy) for the
  highest throughput with lowest memory.
- Map Oracle `NUMBER` to SQL Server `DECIMAL` or `BIGINT` depending on scale.
- Handle the empty-string-is-NULL difference explicitly in your C# mapping code.
- Use `cmd.FetchSize = 4 * 1024 * 1024` on the Oracle side and
  `bulkCopy.BatchSize = 50000` on the SQL Server side for optimal throughput.

### Construction Data Considerations

- **Job cost extractions** often involve millions of rows. Always use streaming.
- **Vendor master data** is smaller but has CLOB fields for notes. Handle LOBs
  carefully with proper disposal.
- **Document management** tables may have BLOB columns for attachments. Stream these
  rather than loading entire files into memory.
- **Payroll data** requires careful decimal precision. Use `OracleDecimal` when
  .NET's `decimal` type is insufficient.

## Interview / Senior Dev Questions

1. **Q: Why is `BindByName = true` critical for Oracle parameters in C#?**
   A: Oracle's driver defaults to binding by position, not by name. Without
   `BindByName = true`, parameters are matched to placeholders by the order they
   are added, not by their names. This can cause silent data corruption if the
   parameter order does not match the placeholder order in the SQL.

2. **Q: How would you transfer 50 million rows from Oracle to SQL Server efficiently?**
   A: Stream directly from `OracleDataReader` to `SqlBulkCopy`. Set Oracle
   `FetchSize` to 4-8 MB to reduce network round trips. Set `SqlBulkCopy.BatchSize`
   to 50,000 and `EnableStreaming = true`. Process by partition if the Oracle table
   is partitioned. Use parallel hints in the Oracle query. Never load into an
   intermediate `DataTable`.

3. **Q: How does Oracle handle empty strings differently from SQL Server?**
   A: Oracle treats empty strings as `NULL`. Inserting `''` stores `NULL`. SQL Server
   treats `''` and `NULL` as distinct values. This matters during migration: a SQL
   Server column with `NOT NULL` constraint will reject Oracle rows where the
   source had empty strings (which became `NULL`). Handle this in C# by converting
   `NULL` to `''` for SQL Server target columns that don't allow NULLs.

4. **Q: What is the difference between FetchSize and BatchSize?**
   A: `FetchSize` (on `OracleCommand` or `OracleDataReader`) controls how many bytes
   Oracle sends per network round trip during a SELECT. `BatchSize` (on
   `SqlBulkCopy` or `OracleBulkCopy`) controls how many rows are inserted per
   batch during a bulk write. Both affect performance but at different stages of
   the pipeline.

## Quiz

**Question 1:** What happens when you run this code?

```csharp
var cmd = new OracleCommand(
    "SELECT * FROM emp WHERE dept_id = :dept AND hire_date > :hdate", conn);
cmd.Parameters.Add(new OracleParameter("hdate", DateTime.Today));
cmd.Parameters.Add(new OracleParameter("dept", 10));
```

<details>
<summary>Show Answer</summary>

The parameters are bound **by position**, not by name (because `BindByName` defaults
to `false`). The first parameter added (`hdate`, a DateTime) is bound to `:dept`
(the first placeholder), and the second (`dept`, an int) is bound to `:hdate`.
This will likely cause an `OracleException` due to type mismatch, or worse, silently
return wrong results if the types happen to be compatible.

Fix: Add `cmd.BindByName = true;` before adding parameters.
</details>

**Question 2:** You are extracting 20 million rows from Oracle. The query takes
45 minutes. Network monitoring shows thousands of small packets. What should you change?

<details>
<summary>Show Answer</summary>

Increase the `FetchSize` on the `OracleCommand`. The default FetchSize (~64-128 KB)
causes thousands of round trips for large result sets. Setting it to 4-8 MB
dramatically reduces round trips:

```csharp
cmd.FetchSize = 4 * 1024 * 1024; // 4 MB per fetch
```

This alone can reduce extraction time from 45 minutes to under 10 minutes for
network-bound queries.
</details>

**Question 3:** An Oracle CMiC column contains empty strings that you need to migrate
to a SQL Server `NVARCHAR(100) NOT NULL` column. What problem will you encounter and
how do you fix it?

<details>
<summary>Show Answer</summary>

Oracle converts empty strings to `NULL`. When you read these values in C#, they
come back as `DBNull.Value`. Inserting `NULL` into a SQL Server `NOT NULL` column
causes an error.

Fix it in your C# mapping code:

```csharp
string value = reader.IsDBNull(colIndex) ? "" : reader.GetString(colIndex);
```

This converts Oracle NULLs (which were originally empty strings) back to empty
strings for SQL Server.
</details>

**Question 4:** Why should you stream from OracleDataReader directly to SqlBulkCopy
instead of loading into a DataTable first?

<details>
<summary>Show Answer</summary>

Loading into a `DataTable` requires holding all rows in memory at once. For 20 million
rows, this could consume 10+ GB of RAM and cause `OutOfMemoryException`.

Streaming directly passes rows one at a time (or in small batches) from the Oracle
reader to the SQL Server bulk writer. Memory usage stays constant regardless of row
count. `SqlBulkCopy` accepts an `IDataReader` directly via `WriteToServerAsync(reader)`,
making this pattern simple to implement.
</details>
