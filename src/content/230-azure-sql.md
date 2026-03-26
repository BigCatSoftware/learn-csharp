# Azure SQL Database

*Chapter 15.1 — Azure SQL Database*

## Overview

Azure SQL Database is the fully managed, cloud version of SQL Server. For Data Engineers at
BNBuilders migrating from on-premises SQL Server, Azure SQL is the natural destination. It
provides the same T-SQL engine, same tooling (SSMS, Azure Data Studio), and compatibility
with Entity Framework Core and Dapper — but with built-in high availability, automatic
backups, and elastic scaling.

This lesson covers:

- **Azure SQL vs SQL Server on-prem** — What changes, what stays the same.
- **Purchasing models** — DTU vs vCore, provisioned vs serverless.
- **Connectivity** — Connection strings, firewall rules, Azure AD authentication.
- **Architecture features** — Elastic pools, geo-replication, failover groups.
- **C# integration** — Connecting from .NET applications with best practices.

If BNBuilders is moving to Azure (common in Microsoft shops), understanding Azure SQL is
essential for designing data pipelines that work in the cloud.

## Core Concepts

### Azure SQL vs SQL Server On-Premises

| Feature | SQL Server On-Prem | Azure SQL Database |
|---------|-------------------|-------------------|
| Management | You manage everything | Microsoft manages hardware, patching, backups |
| High availability | Configure AlwaysOn yourself | Built-in (99.995% SLA) |
| Scaling | Buy bigger hardware | Change tier with a slider |
| Backups | Configure backup jobs | Automatic (7-35 day retention) |
| Licensing | License cost + hardware | Pay-as-you-go |
| Cross-database queries | Supported | Limited (Elastic Query) |
| SQL Agent jobs | Built-in | Use Elastic Jobs or ADF instead |
| Linked servers | Supported | Not supported |
| CLR integration | Supported | Not supported |
| File system access | `xp_cmdshell`, `BULK INSERT` from file | Use Azure Blob + `BULK INSERT` from Blob |

### Purchasing Models

#### DTU (Database Transaction Unit)

DTUs bundle CPU, memory, and I/O into a single metric. Simple to understand, harder to
map to real workloads.

| Tier | DTUs | Storage | Use Case |
|------|------|---------|----------|
| Basic | 5 | 2 GB | Dev/test |
| Standard S0 | 10 | 250 GB | Light workloads |
| Standard S3 | 100 | 250 GB | Medium workloads |
| Premium P1 | 125 | 500 GB | Production, low latency |
| Premium P6 | 1000 | 1 TB | Heavy OLTP |

#### vCore

vCores map directly to CPU cores — easier to understand if you know your on-prem specs.

| Tier | vCores | Memory | Use Case |
|------|--------|--------|----------|
| General Purpose | 2-80 | 5.1 GB/vCore | Most workloads |
| Business Critical | 2-128 | 5.1 GB/vCore | Low latency, in-memory OLTP |
| Hyperscale | 2-128 | 5.1 GB/vCore | Large databases, fast scaling |

#### Serverless

Serverless auto-pauses when idle and auto-scales vCores based on demand:

```
Min vCores: 0.5  (auto-pause when idle for 1+ hour)
Max vCores: 4    (scales up under load)
Cost: ~$0.000145/vCore/second + storage
```

Ideal for development databases and pipelines that run nightly.

### Connectivity

#### Connection Strings

```csharp
// Basic connection string for Azure SQL
var connectionString = "Server=tcp:bnbuilders-sql.database.windows.net,1433;" +
    "Initial Catalog=ConstructionData;" +
    "User ID=pipeline-user;" +
    "Password=<your-password>;" +
    "Encrypt=True;" +
    "TrustServerCertificate=False;" +
    "Connection Timeout=30;" +
    "MultipleActiveResultSets=True;";
```

#### Azure AD Authentication (Recommended)

```csharp
// Using Azure AD with DefaultAzureCredential (no password in config!)
using Azure.Identity;
using Microsoft.Data.SqlClient;

var connectionString = "Server=tcp:bnbuilders-sql.database.windows.net,1433;" +
    "Initial Catalog=ConstructionData;" +
    "Encrypt=True;" +
    "TrustServerCertificate=False;";

var credential = new DefaultAzureCredential();
var token = await credential.GetTokenAsync(
    new Azure.Core.TokenRequestContext(["https://database.windows.net/.default"]));

using var connection = new SqlConnection(connectionString);
connection.AccessToken = token.Token;
await connection.OpenAsync();
```

#### Managed Identity (Best for Azure-Hosted Apps)

```csharp
// appsettings.json — no secrets!
{
    "ConnectionStrings": {
        "ConstructionData": "Server=tcp:bnbuilders-sql.database.windows.net,1433;Initial Catalog=ConstructionData;Authentication=Active Directory Managed Identity;Encrypt=True;"
    }
}
```

### Firewall Rules

Azure SQL blocks all connections by default. You must allow access:

```bash
# Allow a specific IP (your office)
az sql server firewall-rule create \
    --resource-group bnbuilders-rg \
    --server bnbuilders-sql \
    --name "BNBuilders-Office" \
    --start-ip-address 203.0.113.50 \
    --end-ip-address 203.0.113.50

# Allow Azure services (for ADF, Azure Functions, etc.)
az sql server firewall-rule create \
    --resource-group bnbuilders-rg \
    --server bnbuilders-sql \
    --name "AllowAzureServices" \
    --start-ip-address 0.0.0.0 \
    --end-ip-address 0.0.0.0
```

## Code Examples

### Connecting and Querying with Dapper

```csharp
using Dapper;
using Microsoft.Data.SqlClient;

public class AzureSqlBudgetRepository
{
    private readonly string _connectionString;

    public AzureSqlBudgetRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<IReadOnlyList<BudgetLine>> GetBudgetLinesAsync(
        string projectId, CancellationToken ct = default)
    {
        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        var results = await connection.QueryAsync<BudgetLine>(
            new CommandDefinition(
                """
                SELECT ProjectId, CostCode, Phase, Description,
                       OriginalBudget, RevisedBudget, Committed, ActualToDate
                FROM dbo.BudgetLines
                WHERE ProjectId = @ProjectId
                ORDER BY CostCode
                """,
                parameters: new { ProjectId = projectId },
                cancellationToken: ct
            ));

        return results.AsList();
    }

    public async Task UpsertBudgetLinesAsync(
        IReadOnlyList<BudgetLine> lines, CancellationToken ct = default)
    {
        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        // Use a transaction for batch operations
        using var transaction = await connection.BeginTransactionAsync(ct);

        try
        {
            foreach (var batch in lines.Chunk(1000))
            {
                await connection.ExecuteAsync(
                    new CommandDefinition(
                        """
                        MERGE dbo.BudgetLines AS target
                        USING (VALUES (@ProjectId, @CostCode, @Phase, @Description,
                                       @OriginalBudget, @RevisedBudget, @Committed, @ActualToDate))
                            AS source (ProjectId, CostCode, Phase, Description,
                                       OriginalBudget, RevisedBudget, Committed, ActualToDate)
                        ON target.ProjectId = source.ProjectId AND target.CostCode = source.CostCode
                        WHEN MATCHED THEN
                            UPDATE SET Phase = source.Phase,
                                       Description = source.Description,
                                       OriginalBudget = source.OriginalBudget,
                                       RevisedBudget = source.RevisedBudget,
                                       Committed = source.Committed,
                                       ActualToDate = source.ActualToDate
                        WHEN NOT MATCHED THEN
                            INSERT (ProjectId, CostCode, Phase, Description,
                                    OriginalBudget, RevisedBudget, Committed, ActualToDate)
                            VALUES (source.ProjectId, source.CostCode, source.Phase,
                                    source.Description, source.OriginalBudget,
                                    source.RevisedBudget, source.Committed, source.ActualToDate);
                        """,
                        parameters: batch,
                        transaction: transaction,
                        cancellationToken: ct
                    ));
            }

            await transaction.CommitAsync(ct);
        }
        catch
        {
            await transaction.RollbackAsync(ct);
            throw;
        }
    }
}
```

### Bulk Copy for Large Datasets

```csharp
using Microsoft.Data.SqlClient;

public class BulkLoader
{
    private readonly string _connectionString;

    public BulkLoader(string connectionString) => _connectionString = connectionString;

    public async Task BulkInsertAsync(
        IReadOnlyList<BudgetLine> rows,
        CancellationToken ct = default)
    {
        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        using var bulkCopy = new SqlBulkCopy(connection)
        {
            DestinationTableName = "dbo.BudgetLines_Staging",
            BatchSize = 5000,
            BulkCopyTimeout = 300, // 5 minutes
            EnableStreaming = true
        };

        // Map columns explicitly
        bulkCopy.ColumnMappings.Add("ProjectId", "ProjectId");
        bulkCopy.ColumnMappings.Add("CostCode", "CostCode");
        bulkCopy.ColumnMappings.Add("Phase", "Phase");
        bulkCopy.ColumnMappings.Add("OriginalBudget", "OriginalBudget");
        bulkCopy.ColumnMappings.Add("RevisedBudget", "RevisedBudget");
        bulkCopy.ColumnMappings.Add("Committed", "Committed");
        bulkCopy.ColumnMappings.Add("ActualToDate", "ActualToDate");

        // Convert to DataTable (or use IDataReader for streaming)
        using var dataTable = ToDataTable(rows);
        await bulkCopy.WriteToServerAsync(dataTable, ct);
    }

    private static DataTable ToDataTable(IReadOnlyList<BudgetLine> rows)
    {
        var table = new DataTable();
        table.Columns.Add("ProjectId", typeof(string));
        table.Columns.Add("CostCode", typeof(string));
        table.Columns.Add("Phase", typeof(string));
        table.Columns.Add("OriginalBudget", typeof(decimal));
        table.Columns.Add("RevisedBudget", typeof(decimal));
        table.Columns.Add("Committed", typeof(decimal));
        table.Columns.Add("ActualToDate", typeof(decimal));

        foreach (var row in rows)
        {
            table.Rows.Add(row.ProjectId, row.CostCode, row.Phase,
                row.OriginalBudget, row.RevisedBudget, row.Committed, row.ActualToDate);
        }

        return table;
    }
}
```

### Connection Resilience

```csharp
// Azure SQL has transient errors — always use retry logic
using Microsoft.Data.SqlClient;

public static class SqlConnectionFactory
{
    public static SqlConnection CreateResilient(string connectionString)
    {
        var builder = new SqlConnectionStringBuilder(connectionString)
        {
            ConnectRetryCount = 3,
            ConnectRetryInterval = 10, // seconds
            ConnectTimeout = 30,
            MaxPoolSize = 100,
            MinPoolSize = 5
        };

        return new SqlConnection(builder.ConnectionString);
    }
}

// With Polly for query-level retry
using Polly;
using Polly.Retry;

public class ResilientRepository
{
    private readonly string _connectionString;
    private readonly AsyncRetryPolicy _retryPolicy;

    public ResilientRepository(string connectionString)
    {
        _connectionString = connectionString;
        _retryPolicy = Policy
            .Handle<SqlException>(ex => IsTransient(ex))
            .WaitAndRetryAsync(
                retryCount: 3,
                sleepDurationProvider: attempt =>
                    TimeSpan.FromSeconds(Math.Pow(2, attempt)),
                onRetry: (ex, delay, attempt, _) =>
                {
                    Console.WriteLine($"Retry {attempt} after {delay}: {ex.Message}");
                });
    }

    private static bool IsTransient(SqlException ex)
    {
        // Azure SQL transient error codes
        int[] transientErrors = [4060, 40197, 40501, 40613, 49918, 49919, 49920];
        return transientErrors.Contains(ex.Number);
    }

    public async Task<T> ExecuteWithRetryAsync<T>(Func<SqlConnection, Task<T>> operation)
    {
        return await _retryPolicy.ExecuteAsync(async () =>
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            return await operation(connection);
        });
    }
}
```

## Common Patterns

### Elastic Pools

Share resources across multiple databases — ideal when BNBuilders has a database per project:

```bash
# Create an elastic pool
az sql elastic-pool create \
    --resource-group bnbuilders-rg \
    --server bnbuilders-sql \
    --name bnbuilders-pool \
    --edition GeneralPurpose \
    --family Gen5 \
    --capacity 4 \
    --max-size 100GB

# Add a database to the pool
az sql db create \
    --resource-group bnbuilders-rg \
    --server bnbuilders-sql \
    --name Project2026-101 \
    --elastic-pool bnbuilders-pool
```

### Geo-Replication

For disaster recovery or read-heavy reporting workloads:

```bash
# Create a secondary in another region
az sql db replica create \
    --resource-group bnbuilders-rg \
    --server bnbuilders-sql \
    --name ConstructionData \
    --partner-server bnbuilders-sql-east \
    --partner-resource-group bnbuilders-rg-east
```

```csharp
// In C# — use the read-only endpoint for Power BI queries
var readConnectionString =
    "Server=tcp:bnbuilders-sql.database.windows.net,1433;" +
    "Initial Catalog=ConstructionData;" +
    "ApplicationIntent=ReadOnly;" + // Routes to secondary
    "Authentication=Active Directory Managed Identity;" +
    "Encrypt=True;";
```

### Serverless Tier for Dev/Test

```bash
az sql db create \
    --resource-group bnbuilders-rg \
    --server bnbuilders-sql \
    --name ConstructionData-Dev \
    --edition GeneralPurpose \
    --family Gen5 \
    --compute-model Serverless \
    --auto-pause-delay 60 \
    --min-capacity 0.5 \
    --max-capacity 4
```

## Gotchas and Pitfalls

1. **First connection after auto-pause** — Serverless databases take 30-60 seconds to
   resume. Your first query after idle will timeout if `ConnectTimeout` is too short.
   Set it to at least 60 seconds for serverless.

2. **No cross-database queries** — Unlike on-prem SQL Server, `USE OtherDatabase` and
   three-part names (`OtherDB.dbo.Table`) do not work. Use Elastic Query or consolidate
   into one database.

3. **Tempdb is shared** — In Azure SQL, tempdb is shared across all databases on the
   same logical server. Heavy temp table usage in one database can affect others.

4. **Firewall blocks everything by default** — New team members will get "cannot connect"
   errors until their IP is allowed or they use a VPN.

5. **Connection string differences** — Azure SQL requires `Encrypt=True` and the server
   name format is `tcp:server-name.database.windows.net,1433`. Missing `tcp:` or the port
   causes subtle connection failures.

6. **DTU throttling** — When you hit the DTU limit, queries slow down instead of failing.
   This manifests as "the database is slow" without obvious errors. Monitor DTU percentage
   in the Azure portal.

7. **`BULK INSERT` from files** — You cannot reference local files. Use Azure Blob Storage
   as the source with an external data source:

```sql
-- Azure SQL BULK INSERT from Blob Storage
BULK INSERT dbo.BudgetLines_Staging
FROM 'budget_2026.csv'
WITH (
    DATA_SOURCE = 'BNBuildersBlob',
    FORMAT = 'CSV',
    FIRSTROW = 2,
    FIELDTERMINATOR = ',',
    ROWTERMINATOR = '\n'
);
```

## Performance Considerations

- **Connection pooling** — Always use connection pooling (default in `SqlConnection`).
  Set `Min Pool Size=5` to keep warm connections.

- **Batch operations** — Individual INSERT statements are slow over the network. Use
  `SqlBulkCopy` for > 100 rows, or batch MERGE statements.

- **Read replicas** — Route read-heavy queries (Power BI, reporting) to a read replica
  using `ApplicationIntent=ReadOnly` in the connection string.

- **Indexing** — Azure SQL provides `sys.dm_db_missing_index_details` to suggest indexes.
  Review monthly for new query patterns.

- **Query Store** — Enabled by default in Azure SQL. Use it to identify regressed queries
  and force good plans.

```sql
-- Find top resource-consuming queries
SELECT TOP 10
    qs.query_id,
    qt.query_sql_text,
    rs.avg_duration,
    rs.avg_cpu_time,
    rs.count_executions
FROM sys.query_store_query_text qt
JOIN sys.query_store_query qs ON qt.query_text_id = qs.query_text_id
JOIN sys.query_store_plan qp ON qs.query_id = qp.query_id
JOIN sys.query_store_runtime_stats rs ON qp.plan_id = rs.plan_id
ORDER BY rs.avg_cpu_time * rs.count_executions DESC;
```

## BNBuilders Context

### Typical Architecture

```
Sage 300 (On-Prem)
    │
    ▼ (Nightly CSV export or API)
Azure Data Factory
    │
    ▼ (Copy activity + Data Flow)
Azure SQL Database
    ├── dbo.BudgetLines
    ├── dbo.Projects
    ├── dbo.DailyLogs
    └── dbo.CostCodes
    │
    ▼ (DirectQuery or Import)
Power BI Reports
    ├── Project Cost Dashboard
    ├── Budget vs Actual
    └── Subcontractor Spend
```

### Database Design for Construction Data

```sql
-- Core tables for BNBuilders
CREATE TABLE dbo.Projects (
    ProjectId NVARCHAR(20) PRIMARY KEY,
    ProjectName NVARCHAR(200) NOT NULL,
    ClientName NVARCHAR(200),
    ProjectManager NVARCHAR(100),
    StartDate DATE,
    EstimatedCompletion DATE,
    Status NVARCHAR(20) DEFAULT 'Active',
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.BudgetLines (
    Id INT IDENTITY PRIMARY KEY,
    ProjectId NVARCHAR(20) NOT NULL REFERENCES dbo.Projects(ProjectId),
    CostCode NVARCHAR(20) NOT NULL,
    Phase NVARCHAR(10),
    Description NVARCHAR(500),
    OriginalBudget DECIMAL(18,2) DEFAULT 0,
    RevisedBudget DECIMAL(18,2) DEFAULT 0,
    Committed DECIMAL(18,2) DEFAULT 0,
    ActualToDate DECIMAL(18,2) DEFAULT 0,
    LastSyncedAt DATETIME2,
    INDEX IX_BudgetLines_Project (ProjectId, CostCode)
);
```

## Interview / Senior Dev Questions

1. **Q: What is the difference between DTU and vCore purchasing models?**
   A: DTU bundles CPU, memory, and I/O into a single abstract unit — simple to buy but
   hard to map to real workloads. vCore lets you choose CPU cores and memory independently,
   matching on-prem sizing. vCore also offers serverless (auto-scale, auto-pause) and
   Hyperscale (100 TB+) tiers that DTU does not.

2. **Q: How would you handle connection security for an Azure SQL database used by both
   developers and automated pipelines?**
   A: Developers: Azure AD authentication with their personal accounts, IP-restricted by
   office/VPN firewall rules. Pipelines: Managed Identity (no passwords) when running in
   Azure, or Azure AD service principal with client secret stored in Key Vault for on-prem
   agents. Never use SQL authentication with passwords in config files.

3. **Q: Your nightly pipeline inserts 500K rows into Azure SQL and takes 45 minutes.
   How would you speed it up?**
   A: (a) Use `SqlBulkCopy` instead of individual INSERTs — 10-50x faster. (b) Load into
   a staging table first, then MERGE into the final table. (c) Disable non-clustered indexes
   on the staging table during load. (d) Ensure the database tier has enough DTU/vCores.
   (e) Use connection close to the Azure region (same region for the pipeline host).

4. **Q: Explain the difference between geo-replication and failover groups.**
   A: Geo-replication creates a readable secondary in another region — you manage failover
   manually. Failover groups provide automatic failover with a single connection endpoint
   that redirects to whichever server is primary. For production, failover groups are
   preferred because client connection strings do not change during failover.

## Quiz

**Question 1:** What authentication method is recommended for Azure-hosted pipelines
connecting to Azure SQL?

a) SQL authentication with username/password
b) Windows authentication
c) Managed Identity with Azure AD
d) Certificate-based authentication

<details>
<summary>Answer</summary>

**c) Managed Identity with Azure AD.** Managed Identity eliminates the need for passwords
entirely. The Azure resource (App Service, Function, Container) has an identity that Azure
AD authenticates automatically. No secrets to rotate or leak.

</details>

**Question 2:** What happens when an Azure SQL Serverless database has been idle for over
an hour?

a) It is deleted automatically
b) It auto-pauses and stops billing for compute (storage still billed)
c) It switches to a lower tier
d) Nothing — it keeps running

<details>
<summary>Answer</summary>

**b) It auto-pauses and stops billing for compute.** The database remains available but
paused. The first connection after pausing triggers a resume, which takes 30-60 seconds.
Storage costs continue. Set `ConnectTimeout` to at least 60 seconds.

</details>

**Question 3:** You need to load 500K rows into Azure SQL from a C# application. Which
approach is fastest?

a) Individual `INSERT` statements in a loop
b) Entity Framework `AddRange` + `SaveChanges`
c) `SqlBulkCopy` with `BatchSize = 5000`
d) Stored procedure called per row

<details>
<summary>Answer</summary>

**c) `SqlBulkCopy` with `BatchSize = 5000`.** `SqlBulkCopy` uses the TDS bulk insert
protocol, which is orders of magnitude faster than individual inserts. With a batch size
of 5000, it balances throughput with transaction log pressure. Individual inserts (a, d)
are slowest due to per-statement network round trips.

</details>

**Question 4:** How do you route read-only queries (like Power BI) to a geo-replica?

a) Use a separate connection string pointing to the replica server
b) Add `ApplicationIntent=ReadOnly` to the connection string
c) Use a different database name
d) Read replicas are not supported in Azure SQL

<details>
<summary>Answer</summary>

**b) Add `ApplicationIntent=ReadOnly` to the connection string.** When using failover groups,
this routes the connection to the secondary replica automatically. This offloads reporting
workloads from the primary, improving performance for both transactional and analytical use.

</details>
