# SSMS for T-SQL Development

SQL Server Management Studio (SSMS) is the primary tool for working with SQL Server on Windows. For Data Engineers writing T-SQL, managing databases, and building ETL pipelines that target SQL Server, SSMS mastery is non-negotiable. This lesson covers installation, essential configuration, query authoring, and the workflows you will use daily.

---

## Installing SSMS

### Via direct download

Download from [learn.microsoft.com/sql/ssms](https://learn.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms).

### Via winget

```powershell
winget install Microsoft.SQLServerManagementStudio
```

SSMS is free and separate from SQL Server itself. You can use it to connect to:

- SQL Server (local or remote)
- Azure SQL Database
- Azure SQL Managed Instance
- SQL Server on Linux or Docker

---

## Connecting to SQL Server

### Local development instance

1. Launch SSMS
2. **Server name:** `localhost` or `.\SQLEXPRESS` (for Express edition)
3. **Authentication:** Windows Authentication (uses your Windows login)
4. Click **Connect**

### Remote / work server

1. **Server name:** `server-name.domain.com` or IP address
2. **Authentication:** SQL Server Authentication (enter username/password) or Windows Authentication
3. **Encrypt connection:** Check this for production servers

### Connection string reference

| Scenario | Server Name |
|---|---|
| Default local instance | `localhost` or `.` |
| Named instance | `.\SQLEXPRESS` or `localhost\SQLEXPRESS` |
| Remote server | `server.domain.com` |
| Azure SQL | `yourserver.database.windows.net` |
| Custom port | `server.domain.com,1433` |

---

## Object Explorer

Object Explorer is the tree view on the left side of SSMS. It shows every object in your SQL Server instance.

### Key nodes

| Node | Contains |
|---|---|
| Databases | All databases, system and user |
| Tables | Base tables and system tables |
| Views | Views and system views |
| Stored Procedures | User and system stored procedures |
| Functions | Scalar, table-valued, and aggregate functions |
| Security | Logins, server roles |
| SQL Server Agent | Jobs, schedules, operators |

### Useful right-click actions

| Action | What It Does |
|---|---|
| Script Table as > CREATE | Generate the CREATE TABLE DDL |
| Script Table as > SELECT | Generate a SELECT * query |
| Select Top 1000 Rows | Quick data preview |
| Edit Top 200 Rows | Edit data directly in a grid |
| Design | Visual table designer (add/modify columns) |
| View Dependencies | See what depends on this object |

---

## Writing and Running Queries

### New query window

Click **New Query** (Ctrl+N) or right-click a database > **New Query** to open a query editor scoped to that database.

### Essential shortcuts

| Shortcut | Action |
|---|---|
| F5 | Execute query (entire script or selection) |
| Ctrl+Shift+E | Execute and show execution plan |
| Ctrl+L | Display estimated execution plan |
| Ctrl+R | Toggle results pane |
| Ctrl+K, Ctrl+C | Comment selection |
| Ctrl+K, Ctrl+U | Uncomment selection |
| Ctrl+Shift+U | Uppercase selection |
| Ctrl+Shift+L | Lowercase selection |
| Ctrl+Space | IntelliSense completion |
| Ctrl+G | Go to line |
| Ctrl+F | Find |
| Ctrl+H | Find and Replace |

### Executing partial queries

Select just the T-SQL you want to run and press **F5** — only the selected text executes. This is invaluable for testing parts of a larger script.

---

## Results and Output

### Results modes

| Mode | Shortcut | Best For |
|---|---|---|
| Results to Grid | Ctrl+D | Interactive data review |
| Results to Text | Ctrl+T | Quick row counts, copy-paste |
| Results to File | Ctrl+Shift+F | Exporting large result sets |

### Messages tab

Always check the **Messages** tab after executing queries. It shows:

- Row counts (`(1000 rows affected)`)
- `PRINT` statement output
- Warnings and errors
- Execution time

---

## Query Templates and Snippets

### Using templates

SSMS ships with templates for common operations:

1. **View > Template Explorer** (Ctrl+Alt+T)
2. Browse categories: Database, Table, Stored Procedure, Index, etc.
3. Double-click a template to open it
4. **Query > Specify Values for Template Parameters** (Ctrl+Shift+M) to fill in placeholders

### Example: Create a stored procedure

```sql
-- Template fills in: <ProcedureName>, <SchemaName>, etc.
CREATE PROCEDURE <SchemaName>.<ProcedureName>
    @Param1 <DataType> = <DefaultValue>
AS
BEGIN
    SET NOCOUNT ON;
    -- Insert statements here
END
GO
```

---

## Execution Plans

Execution plans show how SQL Server processes your query. They are essential for performance tuning.

### Viewing execution plans

| Plan Type | How | When |
|---|---|---|
| Estimated | Ctrl+L | Before running — shows what the optimizer plans to do |
| Actual | Ctrl+Shift+E | After running — shows what actually happened |

### Reading execution plans

- Plans read **right to left** — data flows from right to left
- **Thick arrows** indicate large data flows
- **Warning icons** (yellow triangles) indicate problems
- **Key lookups** and **table scans** on large tables are red flags

### Common plan operators

| Operator | Meaning | Good or Bad |
|---|---|---|
| Clustered Index Seek | Direct lookup by key | Good |
| Clustered Index Scan | Full table scan | Bad on large tables |
| Index Seek | Lookup via nonclustered index | Good |
| Index Scan | Full index scan | Often bad |
| Key Lookup | Goes back to clustered index for extra columns | Bad if frequent |
| Hash Match | Hash join between two sets | OK for large joins |
| Nested Loops | Loop join | Good for small result sets |
| Sort | Sorting data | Can be expensive |

---

## Data Import and Export

### Import flat files

1. Right-click database > **Tasks > Import Flat File**
2. Select CSV/TXT file
3. Preview and configure column mappings
4. Choose data types
5. Click **Import**

### Import/Export Wizard

1. Right-click database > **Tasks > Import Data** or **Export Data**
2. Choose source (flat file, Excel, another SQL Server, etc.)
3. Choose destination
4. Map columns
5. Run immediately or save as an SSIS package

### BCP (Bulk Copy Program)

For large data loads from the command line:

```powershell
# Export
bcp MyDatabase.dbo.MyTable out data.csv -S localhost -T -c -t ","

# Import
bcp MyDatabase.dbo.MyTable in data.csv -S localhost -T -c -t ","
```

---

## SQL Server Agent (Jobs)

SQL Server Agent runs scheduled tasks. Data Engineers use it for ETL scheduling.

### Creating a job

1. Expand **SQL Server Agent** in Object Explorer
2. Right-click **Jobs > New Job**
3. **General:** Name and description
4. **Steps:** Add one or more steps (T-SQL, PowerShell, SSIS, etc.)
5. **Schedules:** Set when the job runs (daily, hourly, etc.)
6. **Notifications:** Email on success/failure

### Monitoring jobs

- Right-click a job > **View History** to see execution logs
- **SQL Server Agent > Job Activity Monitor** for an overview of all jobs

---

## Database Diagrams

Visualize table relationships:

1. Expand your database in Object Explorer
2. Right-click **Database Diagrams > New Database Diagram**
3. Add tables to the diagram
4. VS draws foreign key relationships automatically

---

## Useful SSMS Settings

### Tools > Options

| Setting | Where | Recommendation |
|---|---|---|
| Line numbers | Text Editor > All Languages > General | Enable |
| Auto-save | Environment > AutoRecover | Enable (every 2 min) |
| Tab behavior | Text Editor > All Languages > Tabs | Insert spaces, size 4 |
| Results font | Environment > Fonts and Colors > Grid Results | Cascadia Mono, size 10 |
| Row count limit | Query Results > SQL Server > Results to Grid | Set max rows if needed |

### Query options

**Tools > Options > Query Execution > SQL Server > Advanced:**

- **SET NOCOUNT ON** — Suppress row count messages for cleaner output
- **SET STATISTICS TIME ON** — Show execution time
- **SET STATISTICS IO ON** — Show logical reads (key for tuning)

---

## SSMS and Visual Studio Side by Side

A common Data Engineer workflow:

| Task | Tool |
|---|---|
| Write application code (C#) | Visual Studio 2026 |
| Write and test T-SQL queries | SSMS |
| Database schema design | SSMS or SSDT in VS |
| EF Core migrations | VS terminal (`dotnet ef`) |
| ADO.NET / Dapper development | VS (with SSMS for query testing) |
| Production query tuning | SSMS (execution plans) |
| Job scheduling | SSMS (SQL Server Agent) |
| Bulk data loading | SSMS or C# (`SqlBulkCopy`) |

Use both tools together. Write and tune your queries in SSMS, then embed them in your C# application using ADO.NET or Dapper.
