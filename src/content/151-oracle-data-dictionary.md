# Querying the Oracle Data Dictionary

*Chapter 10.12 — Oracle SQL for Data Engineers*

## Overview

The Oracle Data Dictionary is a set of read-only system views that describe every
object in the database: tables, columns, indexes, constraints, views, procedures,
and more. For a data engineer, the data dictionary is your map of the CMiC ERP
schema. Instead of asking a DBA "what columns does this table have?" you query the
dictionary directly.

This lesson covers the essential dictionary views, the difference between DBA_, ALL_,
and USER_ prefixes, how to use V$ views for performance diagnostics, and how Oracle's
data dictionary compares to SQL Server's system views — knowledge you need when
building migration tooling that works across both databases.

## Core Concepts

### The Three Prefixes

| Prefix | Scope | Requires |
|---|---|---|
| `USER_` | Objects owned by the current user | No special privileges |
| `ALL_` | Objects the current user can access | No special privileges |
| `DBA_` | All objects in the database | SELECT_CATALOG_ROLE or DBA role |

For data engineering work, `ALL_` views are the standard choice. They show everything
you have access to, including CMiC schema objects that your user can SELECT from.

### Essential Dictionary Views

| View | Purpose | Key Columns |
|---|---|---|
| `ALL_TABLES` | Table metadata | TABLE_NAME, NUM_ROWS, LAST_ANALYZED |
| `ALL_TAB_COLUMNS` | Column definitions | COLUMN_NAME, DATA_TYPE, NULLABLE |
| `ALL_INDEXES` | Index metadata | INDEX_NAME, INDEX_TYPE, UNIQUENESS |
| `ALL_IND_COLUMNS` | Index column composition | INDEX_NAME, COLUMN_NAME, COLUMN_POSITION |
| `ALL_CONSTRAINTS` | Constraint definitions | CONSTRAINT_NAME, CONSTRAINT_TYPE |
| `ALL_CONS_COLUMNS` | Constraint column composition | CONSTRAINT_NAME, COLUMN_NAME |
| `ALL_VIEWS` | View definitions | VIEW_NAME, TEXT |
| `ALL_SOURCE` | PL/SQL source code | NAME, TYPE, TEXT, LINE |
| `ALL_OBJECTS` | All database objects | OBJECT_NAME, OBJECT_TYPE, STATUS |
| `ALL_TAB_PARTITIONS` | Partition metadata | PARTITION_NAME, HIGH_VALUE, NUM_ROWS |
| `ALL_SYNONYMS` | Synonym mappings | SYNONYM_NAME, TABLE_OWNER, TABLE_NAME |
| `ALL_TAB_STATISTICS` | Table/partition statistics | NUM_ROWS, BLOCKS, LAST_ANALYZED |

### V$ Performance Views

| View | Purpose |
|---|---|
| `V$SQL` | Currently cached SQL statements |
| `V$SQL_PLAN` | Execution plans for cached SQL |
| `V$SESSION` | Active database sessions |
| `V$LOCK` | Current locks |
| `V$PARAMETER` | Database configuration parameters |
| `V$INSTANCE` | Instance information |
| `V$DATABASE` | Database-level information |

## Code Examples

### Exploring Tables

```sql
-- List all tables in the CMiC schema
SELECT
    table_name,
    num_rows,
    blocks,
    avg_row_len,
    last_analyzed,
    partitioned,
    temporary
FROM all_tables
WHERE owner = 'CMIC_OWNER'
ORDER BY num_rows DESC NULLS LAST;

-- Find tables matching a pattern
SELECT table_name, num_rows, last_analyzed
FROM all_tables
WHERE owner = 'CMIC_OWNER'
  AND table_name LIKE '%JOB_COST%'
ORDER BY table_name;

-- Find the largest tables (by estimated row count)
SELECT
    table_name,
    num_rows,
    blocks * 8192 / 1024 / 1024 AS size_mb,
    last_analyzed
FROM all_tables
WHERE owner = 'CMIC_OWNER'
  AND num_rows IS NOT NULL
ORDER BY num_rows DESC
FETCH FIRST 20 ROWS ONLY;
```

### Exploring Columns

```sql
-- Get column details for a specific table
SELECT
    column_id,
    column_name,
    data_type,
    CASE
        WHEN data_type = 'NUMBER' THEN
            data_type || '(' || NVL(TO_CHAR(data_precision), '*') ||
            ',' || NVL(TO_CHAR(data_scale), '*') || ')'
        WHEN data_type IN ('VARCHAR2', 'CHAR', 'NVARCHAR2') THEN
            data_type || '(' || char_length ||
            CASE char_used WHEN 'B' THEN ' BYTE' WHEN 'C' THEN ' CHAR' END || ')'
        ELSE data_type
    END AS full_type,
    nullable,
    data_default,
    num_distinct,
    num_nulls
FROM all_tab_columns
WHERE owner = 'CMIC_OWNER'
  AND table_name = 'CMIC_JOB_COST'
ORDER BY column_id;

-- Find all DATE columns that might need DATETIME2 mapping
SELECT
    table_name,
    column_name,
    data_type
FROM all_tab_columns
WHERE owner = 'CMIC_OWNER'
  AND data_type = 'DATE'
ORDER BY table_name, column_name;

-- Find columns with no statistics (potential problem for optimizer)
SELECT
    table_name,
    column_name,
    num_distinct,
    num_nulls,
    last_analyzed
FROM all_tab_columns
WHERE owner = 'CMIC_OWNER'
  AND last_analyzed IS NULL
ORDER BY table_name, column_name;
```

### Exploring Indexes

```sql
-- List all indexes on a table
SELECT
    i.index_name,
    i.index_type,
    i.uniqueness,
    i.status,
    i.partitioned,
    i.visibility,
    LISTAGG(ic.column_name, ', ')
        WITHIN GROUP (ORDER BY ic.column_position) AS columns
FROM all_indexes i
JOIN all_ind_columns ic
    ON ic.index_owner = i.owner
   AND ic.index_name = i.index_name
WHERE i.table_owner = 'CMIC_OWNER'
  AND i.table_name = 'CMIC_JOB_COST'
GROUP BY i.index_name, i.index_type, i.uniqueness,
         i.status, i.partitioned, i.visibility
ORDER BY i.index_name;

-- Find unused indexes (indexes with no recent usage)
-- Requires DBA access to V$OBJECT_USAGE or after ALTER INDEX ... MONITORING USAGE
SELECT
    i.index_name,
    i.table_name,
    i.uniqueness,
    i.num_rows,
    i.last_analyzed
FROM all_indexes i
WHERE i.owner = 'CMIC_OWNER'
  AND i.index_type = 'NORMAL'
ORDER BY i.num_rows DESC;
```

### Exploring Constraints

```sql
-- Primary keys and unique constraints
SELECT
    c.constraint_name,
    c.constraint_type,
    LISTAGG(cc.column_name, ', ')
        WITHIN GROUP (ORDER BY cc.position) AS columns
FROM all_constraints c
JOIN all_cons_columns cc
    ON cc.owner = c.owner
   AND cc.constraint_name = c.constraint_name
WHERE c.owner = 'CMIC_OWNER'
  AND c.table_name = 'CMIC_JOB_COST'
  AND c.constraint_type IN ('P', 'U')  -- P=Primary Key, U=Unique
GROUP BY c.constraint_name, c.constraint_type
ORDER BY c.constraint_type, c.constraint_name;

-- Foreign keys (relationships between tables)
SELECT
    c.constraint_name,
    c.table_name AS child_table,
    LISTAGG(cc.column_name, ', ')
        WITHIN GROUP (ORDER BY cc.position) AS child_columns,
    r.table_name AS parent_table,
    LISTAGG(rc.column_name, ', ')
        WITHIN GROUP (ORDER BY rc.position) AS parent_columns,
    c.delete_rule
FROM all_constraints c
JOIN all_cons_columns cc
    ON cc.owner = c.owner AND cc.constraint_name = c.constraint_name
JOIN all_constraints r
    ON r.owner = c.r_owner AND r.constraint_name = c.r_constraint_name
JOIN all_cons_columns rc
    ON rc.owner = r.owner AND rc.constraint_name = r.constraint_name
WHERE c.owner = 'CMIC_OWNER'
  AND c.constraint_type = 'R'  -- R = Foreign Key (Reference)
  AND (c.table_name = 'CMIC_JOB_COST' OR r.table_name = 'CMIC_JOB_COST')
GROUP BY c.constraint_name, c.table_name, r.table_name, c.delete_rule
ORDER BY c.table_name;

-- Constraint type reference:
-- P = Primary Key
-- U = Unique
-- R = Foreign Key (Reference)
-- C = Check constraint (includes NOT NULL)
-- V = With Check Option (on views)
```

### Exploring Views and Source Code

```sql
-- List views in the schema
SELECT
    view_name,
    text_length,
    SUBSTR(text, 1, 200) AS definition_preview
FROM all_views
WHERE owner = 'CMIC_OWNER'
ORDER BY view_name;

-- Get the full text of a view
SELECT text
FROM all_views
WHERE owner = 'CMIC_OWNER'
  AND view_name = 'CMIC_JOB_COST_V';

-- List PL/SQL objects (packages, procedures, functions)
SELECT
    object_name,
    object_type,
    status,
    created,
    last_ddl_time
FROM all_objects
WHERE owner = 'CMIC_OWNER'
  AND object_type IN ('PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION')
ORDER BY object_type, object_name;

-- Get PL/SQL source code
SELECT line, text
FROM all_source
WHERE owner = 'CMIC_OWNER'
  AND name = 'CMIC_PKG'
  AND type = 'PACKAGE'
ORDER BY line;
```

### Querying Partition Metadata

```sql
-- Partitioned tables with their strategies
SELECT
    t.table_name,
    p.partitioning_type,
    p.subpartitioning_type,
    p.partition_count,
    t.num_rows AS total_rows
FROM all_tables t
JOIN all_part_tables p
    ON p.owner = t.owner AND p.table_name = t.table_name
WHERE t.owner = 'CMIC_OWNER'
ORDER BY t.num_rows DESC NULLS LAST;

-- Partition details with row counts
SELECT
    table_name,
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

-- Partition keys
SELECT
    name AS table_name,
    column_name,
    column_position
FROM all_part_key_columns
WHERE owner = 'CMIC_OWNER'
ORDER BY name, column_position;
```

### Generating DDL

```sql
-- Use DBMS_METADATA to generate CREATE TABLE statements
SELECT DBMS_METADATA.GET_DDL('TABLE', 'CMIC_JOB_COST', 'CMIC_OWNER')
FROM dual;

-- Generate index DDL
SELECT DBMS_METADATA.GET_DDL('INDEX', index_name, owner)
FROM all_indexes
WHERE table_owner = 'CMIC_OWNER'
  AND table_name = 'CMIC_JOB_COST';

-- Configure DBMS_METADATA output format
BEGIN
    DBMS_METADATA.SET_TRANSFORM_PARAM(
        DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR', TRUE);
    DBMS_METADATA.SET_TRANSFORM_PARAM(
        DBMS_METADATA.SESSION_TRANSFORM, 'PRETTY', TRUE);
    DBMS_METADATA.SET_TRANSFORM_PARAM(
        DBMS_METADATA.SESSION_TRANSFORM, 'STORAGE', FALSE);
    DBMS_METADATA.SET_TRANSFORM_PARAM(
        DBMS_METADATA.SESSION_TRANSFORM, 'TABLESPACE', FALSE);
END;
/
```

### V$ Views for Performance

```sql
-- Find the most resource-intensive SQL statements
SELECT
    sql_id,
    executions,
    ROUND(elapsed_time / 1e6, 2) AS elapsed_secs,
    ROUND(cpu_time / 1e6, 2) AS cpu_secs,
    buffer_gets,
    disk_reads,
    rows_processed,
    SUBSTR(sql_text, 1, 120) AS sql_preview
FROM v$sql
WHERE parsing_schema_name = 'CMIC_OWNER'
ORDER BY elapsed_time DESC
FETCH FIRST 20 ROWS ONLY;

-- Check active sessions and what they are running
SELECT
    s.sid,
    s.serial#,
    s.username,
    s.status,
    s.program,
    s.sql_id,
    s.event,
    s.seconds_in_wait,
    SUBSTR(q.sql_text, 1, 100) AS current_sql
FROM v$session s
LEFT JOIN v$sql q ON q.sql_id = s.sql_id
WHERE s.username IS NOT NULL
  AND s.status = 'ACTIVE'
ORDER BY s.seconds_in_wait DESC;

-- Check database parameters relevant to ETL
SELECT name, value, description
FROM v$parameter
WHERE name IN (
    'parallel_max_servers',
    'parallel_min_servers',
    'pga_aggregate_target',
    'sga_target',
    'optimizer_mode',
    'db_block_size',
    'open_cursors',
    'sessions'
)
ORDER BY name;

-- Database and instance info
SELECT
    d.name AS db_name,
    d.platform_name,
    i.version,
    i.host_name,
    i.instance_name,
    i.status
FROM v$database d, v$instance i;
```

### Data Dictionary Queries in C#

```csharp
using Oracle.ManagedDataAccess.Client;

/// <summary>
/// Discovers Oracle schema metadata for automated migration tooling.
/// Queries the data dictionary to generate SQL Server DDL.
/// </summary>
public class OracleSchemaDiscovery
{
    private readonly string _connectionString;

    public OracleSchemaDiscovery(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <summary>
    /// Get all tables in a schema with row counts and sizes.
    /// </summary>
    public async Task<List<TableInfo>> GetTablesAsync(string owner)
    {
        const string sql = @"
            SELECT
                table_name,
                NVL(num_rows, 0) AS num_rows,
                NVL(blocks, 0) * 8192 AS size_bytes,
                last_analyzed,
                partitioned
            FROM all_tables
            WHERE owner = :owner
            ORDER BY num_rows DESC NULLS LAST";

        await using var conn = new OracleConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new OracleCommand(sql, conn);
        cmd.BindByName = true;
        cmd.Parameters.Add(new OracleParameter("owner", owner));

        var tables = new List<TableInfo>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            tables.Add(new TableInfo
            {
                TableName = reader.GetString(0),
                RowCount = reader.GetInt64(1),
                SizeBytes = reader.GetInt64(2),
                LastAnalyzed = reader.IsDBNull(3) ? null : reader.GetDateTime(3),
                IsPartitioned = reader.GetString(4) == "YES"
            });
        }

        return tables;
    }

    /// <summary>
    /// Get column definitions for a table, ready for SQL Server DDL generation.
    /// </summary>
    public async Task<List<ColumnInfo>> GetColumnsAsync(string owner, string tableName)
    {
        const string sql = @"
            SELECT
                column_id,
                column_name,
                data_type,
                data_precision,
                data_scale,
                char_length,
                char_used,
                nullable,
                data_default
            FROM all_tab_columns
            WHERE owner = :owner AND table_name = :table_name
            ORDER BY column_id";

        await using var conn = new OracleConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new OracleCommand(sql, conn);
        cmd.BindByName = true;
        cmd.Parameters.Add(new OracleParameter("owner", owner));
        cmd.Parameters.Add(new OracleParameter("table_name", tableName));

        var columns = new List<ColumnInfo>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            columns.Add(new ColumnInfo
            {
                ColumnId = reader.GetInt32(0),
                ColumnName = reader.GetString(1),
                DataType = reader.GetString(2),
                Precision = reader.IsDBNull(3) ? null : reader.GetInt32(3),
                Scale = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                CharLength = reader.IsDBNull(5) ? null : reader.GetInt32(5),
                CharUsed = reader.IsDBNull(6) ? null : reader.GetString(6),
                IsNullable = reader.GetString(7) == "Y",
                DefaultValue = reader.IsDBNull(8) ? null : reader.GetString(8)
            });
        }

        return columns;
    }

    /// <summary>
    /// Generate SQL Server CREATE TABLE DDL from Oracle metadata.
    /// </summary>
    public async Task<string> GenerateSqlServerDdlAsync(
        string oracleOwner, string oracleTable, string sqlServerSchema = "dbo")
    {
        var columns = await GetColumnsAsync(oracleOwner, oracleTable);
        var sqlServerTableName = ToPascalCase(oracleTable);

        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"CREATE TABLE [{sqlServerSchema}].[{sqlServerTableName}] (");

        for (int i = 0; i < columns.Count; i++)
        {
            var col = columns[i];
            var sqlType = MapToSqlServerType(col);
            var nullable = col.IsNullable ? "NULL" : "NOT NULL";
            var comma = i < columns.Count - 1 ? "," : "";
            var sqlColName = ToPascalCase(col.ColumnName);

            sb.AppendLine($"    [{sqlColName}] {sqlType} {nullable}{comma}");
        }

        sb.AppendLine(");");
        return sb.ToString();
    }

    private static string MapToSqlServerType(ColumnInfo col)
    {
        return col.DataType.ToUpperInvariant() switch
        {
            "NUMBER" when col.Scale == 0 && col.Precision <= 9 => "INT",
            "NUMBER" when col.Scale == 0 && col.Precision <= 18 => "BIGINT",
            "NUMBER" when col.Scale > 0 =>
                $"DECIMAL({col.Precision},{col.Scale})",
            "NUMBER" => "DECIMAL(38,10)",
            "VARCHAR2" => $"NVARCHAR({col.CharLength})",
            "NVARCHAR2" => $"NVARCHAR({col.CharLength})",
            "CHAR" => $"NCHAR({col.CharLength})",
            "CLOB" or "NCLOB" => "NVARCHAR(MAX)",
            "BLOB" or "RAW" => "VARBINARY(MAX)",
            "DATE" => "DATETIME2(0)",
            "FLOAT" => "FLOAT",
            var t when t.StartsWith("TIMESTAMP") => "DATETIME2(7)",
            _ => $"NVARCHAR(MAX) /* unmapped: {col.DataType} */"
        };
    }

    private static string ToPascalCase(string snakeCase)
    {
        return string.Join("", snakeCase.Split('_')
            .Select(w => char.ToUpper(w[0]) + w[1..].ToLower()));
    }
}

public record TableInfo
{
    public required string TableName { get; init; }
    public long RowCount { get; init; }
    public long SizeBytes { get; init; }
    public DateTime? LastAnalyzed { get; init; }
    public bool IsPartitioned { get; init; }
}

public record ColumnInfo
{
    public int ColumnId { get; init; }
    public required string ColumnName { get; init; }
    public required string DataType { get; init; }
    public int? Precision { get; init; }
    public int? Scale { get; init; }
    public int? CharLength { get; init; }
    public string? CharUsed { get; init; }
    public bool IsNullable { get; init; }
    public string? DefaultValue { get; init; }
}
```

## Common Patterns

### Pattern 1: Schema Comparison Report

```sql
-- Compare table structures between Oracle and SQL Server
-- Run on Oracle: get source schema
SELECT
    table_name,
    column_name,
    data_type,
    data_precision,
    data_scale,
    char_length,
    nullable
FROM all_tab_columns
WHERE owner = 'CMIC_OWNER'
ORDER BY table_name, column_id;

-- Run on SQL Server: get target schema
-- SELECT
--     TABLE_NAME, COLUMN_NAME, DATA_TYPE,
--     NUMERIC_PRECISION, NUMERIC_SCALE,
--     CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = 'dbo'
-- ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

### Pattern 2: Find All Relationships for a Table

```sql
-- Comprehensive relationship map: who references this table, and who does it reference
SELECT 'PARENT' AS direction,
    c.table_name AS this_table,
    r.table_name AS related_table,
    c.constraint_name,
    LISTAGG(cc.column_name, ', ') WITHIN GROUP (ORDER BY cc.position) AS columns
FROM all_constraints c
JOIN all_constraints r ON r.owner = c.r_owner AND r.constraint_name = c.r_constraint_name
JOIN all_cons_columns cc ON cc.owner = c.owner AND cc.constraint_name = c.constraint_name
WHERE c.owner = 'CMIC_OWNER'
  AND c.table_name = 'CMIC_JOB_COST'
  AND c.constraint_type = 'R'
GROUP BY c.table_name, r.table_name, c.constraint_name

UNION ALL

SELECT 'CHILD' AS direction,
    r.table_name AS this_table,
    c.table_name AS related_table,
    c.constraint_name,
    LISTAGG(cc.column_name, ', ') WITHIN GROUP (ORDER BY cc.position) AS columns
FROM all_constraints c
JOIN all_constraints r ON r.owner = c.r_owner AND r.constraint_name = c.r_constraint_name
JOIN all_cons_columns cc ON cc.owner = c.owner AND cc.constraint_name = c.constraint_name
WHERE r.owner = 'CMIC_OWNER'
  AND r.table_name = 'CMIC_JOB_COST'
  AND c.constraint_type = 'R'
GROUP BY r.table_name, c.table_name, c.constraint_name

ORDER BY direction, related_table;
```

### Pattern 3: Stale Statistics Finder

```sql
-- Find tables where statistics are stale or missing
-- Critical for optimizer performance during ETL
SELECT
    t.table_name,
    t.num_rows,
    t.last_analyzed,
    ROUND(SYSDATE - t.last_analyzed) AS days_since_analyzed,
    CASE
        WHEN t.last_analyzed IS NULL THEN 'NEVER ANALYZED'
        WHEN SYSDATE - t.last_analyzed > 30 THEN 'STALE (>30 days)'
        WHEN SYSDATE - t.last_analyzed > 7 THEN 'AGING (>7 days)'
        ELSE 'FRESH'
    END AS stats_status
FROM all_tables t
WHERE t.owner = 'CMIC_OWNER'
  AND t.num_rows > 0
ORDER BY
    CASE
        WHEN t.last_analyzed IS NULL THEN 0
        ELSE 1
    END,
    t.last_analyzed NULLS FIRST;
```

### Pattern 4: Search for a Column Across All Tables

```sql
-- Find every table that has a column named 'JOB_NUMBER'
-- Essential when tracing data lineage in CMiC
SELECT
    table_name,
    column_name,
    data_type,
    char_length,
    data_precision,
    data_scale
FROM all_tab_columns
WHERE owner = 'CMIC_OWNER'
  AND column_name = 'JOB_NUMBER'
ORDER BY table_name;

-- Find columns by pattern (useful for discovering CMiC's naming conventions)
SELECT DISTINCT column_name, COUNT(*) AS table_count
FROM all_tab_columns
WHERE owner = 'CMIC_OWNER'
  AND column_name LIKE '%COST%'
GROUP BY column_name
ORDER BY table_count DESC;
```

## Gotchas and Pitfalls

### 1. NUM_ROWS Can Be Stale or NULL

The `NUM_ROWS` column in `ALL_TABLES` reflects the last time statistics were gathered,
not the current row count. If statistics were never gathered, it is NULL. Always check
`LAST_ANALYZED` to know how fresh the numbers are.

```sql
-- For an accurate row count, you must query the table directly
SELECT COUNT(*) FROM cmic_owner.cmic_job_cost;

-- Or use a faster estimate from segments (approximate but instant)
SELECT bytes / NVL(NULLIF(avg_row_len, 0), 100) AS est_rows
FROM all_tables
WHERE owner = 'CMIC_OWNER' AND table_name = 'CMIC_JOB_COST';
```

### 2. DBA_ Views Require Privileges

If you query `DBA_TABLES` without the `SELECT_CATALOG_ROLE` privilege, you get
`ORA-00942: table or view does not exist`. Use `ALL_` views instead, which show
everything your user can access.

### 3. HIGH_VALUE is a LONG Column

The `HIGH_VALUE` column in `ALL_TAB_PARTITIONS` is stored as a `LONG` datatype,
which cannot be used in WHERE clauses, compared, or easily converted. To work with
it programmatically, use `DBMS_METADATA` or parse it in C#.

### 4. ALL_SOURCE Returns One Line Per Row

PL/SQL source code in `ALL_SOURCE` is stored one line per row. You must aggregate
or iterate to reconstruct the full source. Order by `LINE` to get the correct sequence.

### 5. Synonyms Can Hide the Real Owner

CMiC may use public or private synonyms. A table you query as `CMIC_JOB_COST` might
actually be owned by a different schema. Check `ALL_SYNONYMS` to resolve the real
owner:

```sql
SELECT synonym_name, table_owner, table_name, db_link
FROM all_synonyms
WHERE synonym_name = 'CMIC_JOB_COST';
```

### 6. Views vs Tables in ALL_OBJECTS

`ALL_TABLES` only lists tables. `ALL_VIEWS` only lists views. If you are unsure
whether something is a table or view, query `ALL_OBJECTS`:

```sql
SELECT object_name, object_type
FROM all_objects
WHERE owner = 'CMIC_OWNER'
  AND object_name = 'CMIC_JOB_COST_V';
-- Returns: CMIC_JOB_COST_V | VIEW
```

## Performance Considerations

### Dictionary View Query Speed

Data dictionary views are themselves Oracle views on underlying `SYS` tables. They
are generally fast, but:

- `ALL_SOURCE` can be slow for schemas with thousands of PL/SQL objects.
- `ALL_CONSTRAINTS` joined with `ALL_CONS_COLUMNS` can be slow for schemas with
  many foreign keys.
- `V$SQL` can be slow if the shared pool contains millions of statements.

Add `WHERE owner = 'CMIC_OWNER'` predicates to narrow the scope.

### Oracle vs SQL Server System Views

| Oracle View | SQL Server Equivalent | Notes |
|---|---|---|
| `ALL_TABLES` | `sys.tables` / `INFORMATION_SCHEMA.TABLES` | |
| `ALL_TAB_COLUMNS` | `sys.columns` / `INFORMATION_SCHEMA.COLUMNS` | |
| `ALL_INDEXES` | `sys.indexes` | |
| `ALL_IND_COLUMNS` | `sys.index_columns` | |
| `ALL_CONSTRAINTS` | `sys.key_constraints` + `sys.check_constraints` + `sys.foreign_keys` | Split in SQL Server |
| `ALL_VIEWS` | `sys.views` / `INFORMATION_SCHEMA.VIEWS` | |
| `ALL_SOURCE` | `sys.sql_modules` | SQL Server stores full text in one row |
| `ALL_OBJECTS` | `sys.objects` | |
| `ALL_TAB_PARTITIONS` | `sys.partitions` | |
| `ALL_SYNONYMS` | `sys.synonyms` | |
| `V$SQL` | `sys.dm_exec_query_stats` + `sys.dm_exec_sql_text` | |
| `V$SESSION` | `sys.dm_exec_sessions` | |
| `DBMS_METADATA.GET_DDL` | Script Object in SSMS / `sp_help` / SMO | |
| `DBA_` prefix | No equivalent (all sys views see everything with permission) | |
| `USER_` prefix | Filter by `SCHEMA_NAME(schema_id)` | |

### INFORMATION_SCHEMA vs sys Views on SQL Server

SQL Server has two systems for metadata:

- **INFORMATION_SCHEMA**: ANSI standard views. Portable but limited.
- **sys.**: SQL Server-specific views. More detailed, includes partitions, indexes,
  computed columns, and other features not in the ANSI standard.

For migration tooling, use `sys.` views on SQL Server for completeness.

## BNBuilders Context

### CMiC ERP on Oracle

The data dictionary is your primary tool for understanding CMiC's schema:

- **Schema discovery**: CMiC has hundreds of tables. Use `ALL_TABLES` to find the
  ones relevant to job cost, AP, AR, payroll, and project management.
- **Column mapping**: Query `ALL_TAB_COLUMNS` to get exact type definitions for
  building SQL Server target tables.
- **Relationship mapping**: Use `ALL_CONSTRAINTS` to understand foreign key
  relationships between CMiC tables, essential for migration ordering (parent
  tables must be loaded before child tables).
- **Index replication**: Query `ALL_INDEXES` and `ALL_IND_COLUMNS` to recreate
  equivalent indexes on SQL Server.

### Oracle-to-SQL Server Migration

Build automated DDL generation tooling using the C# `OracleSchemaDiscovery` class
shown above:

1. Query `ALL_TAB_COLUMNS` for each source table.
2. Map Oracle types to SQL Server types.
3. Generate `CREATE TABLE` DDL for SQL Server.
4. Query `ALL_CONSTRAINTS` to generate primary key and foreign key DDL.
5. Query `ALL_INDEXES` to generate index DDL.
6. Store the generated DDL in version control for review.

### Construction Data Patterns

- **CMiC naming conventions**: Tables often start with a module prefix (e.g., `JC_` for
  Job Cost, `AP_` for Accounts Payable, `GL_` for General Ledger). Use
  `ALL_TABLES WHERE table_name LIKE 'JC_%'` to find all Job Cost tables.
- **Custom columns**: CMiC allows custom fields. These often appear as columns named
  `UDF_CHAR_01`, `UDF_NUM_01`, etc. Query `ALL_TAB_COLUMNS` to identify these.
- **Views for reporting**: CMiC provides pre-built reporting views. Check `ALL_VIEWS`
  for views that might already join the tables you need.

## Interview / Senior Dev Questions

1. **Q: What is the difference between ALL_TABLES, DBA_TABLES, and USER_TABLES?**
   A: `USER_TABLES` shows tables owned by the current user. `ALL_TABLES` shows tables
   the current user has access to (including other schemas). `DBA_TABLES` shows all
   tables in the database regardless of privileges but requires the DBA role or
   `SELECT_CATALOG_ROLE`. For data engineering, `ALL_` views are standard.

2. **Q: How would you automate SQL Server DDL generation from an Oracle source schema?**
   A: Query `ALL_TAB_COLUMNS` for column definitions, `ALL_CONSTRAINTS` for primary
   keys and foreign keys, and `ALL_INDEXES` / `ALL_IND_COLUMNS` for indexes. Map
   Oracle types to SQL Server types programmatically in C#. Generate DDL strings and
   store them in version control. Run the generated DDL on SQL Server before the
   data migration.

3. **Q: NUM_ROWS in ALL_TABLES says 10 million, but SELECT COUNT(*) returns 15 million.
   Why?**
   A: `NUM_ROWS` reflects the last time `DBMS_STATS.GATHER_TABLE_STATS` was run.
   If 5 million rows were inserted since then, the dictionary is stale. Check
   `LAST_ANALYZED` to see when statistics were last gathered. For accurate counts,
   query the table directly or use sample-based estimation.

4. **Q: How do you determine the load order for migrating tables with foreign key
   relationships?**
   A: Query `ALL_CONSTRAINTS` for foreign keys (`constraint_type = 'R'`) and build
   a dependency graph. Parent tables (those referenced by foreign keys) must be loaded
   before child tables. Use a topological sort of the dependency graph to determine
   the correct order. Tables with circular references require special handling
   (disable constraints, load, re-enable).

## Quiz

**Question 1:** You need to find all tables in the CMiC schema that have a column
called `VENDOR_ID`. Which dictionary view would you query and what would the SQL
look like?

<details>
<summary>Show Answer</summary>

Query `ALL_TAB_COLUMNS`:

```sql
SELECT table_name, column_name, data_type, nullable
FROM all_tab_columns
WHERE owner = 'CMIC_OWNER'
  AND column_name = 'VENDOR_ID'
ORDER BY table_name;
```

This returns every table that has a `VENDOR_ID` column, which helps you map
vendor relationships across the CMiC schema for migration.
</details>

**Question 2:** You query `ALL_TABLES` and see `NUM_ROWS = NULL` and
`LAST_ANALYZED = NULL` for a table. What does this mean, and what should you do?

<details>
<summary>Show Answer</summary>

Statistics have never been gathered on this table. The optimizer has no row count,
column distribution, or index statistics to work with. It will use default estimates,
which often lead to bad execution plans.

Fix it by gathering statistics:

```sql
BEGIN
    DBMS_STATS.GATHER_TABLE_STATS(
        ownname => 'CMIC_OWNER',
        tabname => 'THE_TABLE_NAME',
        method_opt => 'FOR ALL COLUMNS SIZE AUTO',
        cascade => TRUE,
        degree => 4
    );
END;
/
```

After this, `NUM_ROWS`, `BLOCKS`, and `LAST_ANALYZED` will be populated.
</details>

**Question 3:** What is the SQL Server equivalent of Oracle's `ALL_TAB_COLUMNS`?

<details>
<summary>Show Answer</summary>

SQL Server has two equivalents:

1. **ANSI standard**: `INFORMATION_SCHEMA.COLUMNS` — portable but limited.
2. **SQL Server specific**: `sys.columns` joined with `sys.tables` — more detailed.

```sql
-- INFORMATION_SCHEMA approach
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE,
       CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- sys views approach (more complete)
SELECT t.name AS table_name, c.name AS column_name,
       ty.name AS data_type, c.max_length, c.precision, c.scale,
       c.is_nullable
FROM sys.columns c
JOIN sys.tables t ON t.object_id = c.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
ORDER BY t.name, c.column_id;
```
</details>

**Question 4:** You are building automated migration tooling. How would you determine
the correct order to load tables, given that some tables have foreign keys pointing
to other tables?

<details>
<summary>Show Answer</summary>

1. Query `ALL_CONSTRAINTS` for all foreign keys (`constraint_type = 'R'`) in the schema.
2. Build a directed graph where an edge from table A to table B means "A references B"
   (A is the child, B is the parent).
3. Perform a topological sort on this graph. Tables with no dependencies are loaded
   first, followed by tables that depend only on already-loaded tables.
4. Handle circular references by either disabling foreign keys during load or breaking
   the cycle by loading one table without the FK constraint and adding it afterward.

```sql
-- Get the dependency graph
SELECT
    c.table_name AS child_table,
    r.table_name AS parent_table
FROM all_constraints c
JOIN all_constraints r
    ON r.owner = c.r_owner AND r.constraint_name = c.r_constraint_name
WHERE c.owner = 'CMIC_OWNER'
  AND c.constraint_type = 'R';
```
</details>

**Question 5:** How do you find the real table behind an Oracle synonym?

<details>
<summary>Show Answer</summary>

Query `ALL_SYNONYMS`:

```sql
SELECT
    synonym_name,
    table_owner,
    table_name,
    db_link
FROM all_synonyms
WHERE synonym_name = 'CMIC_JOB_COST';
```

This returns the actual owner and table name. If `DB_LINK` is not null, the synonym
points to a table in a remote database. Always resolve synonyms before querying
the data dictionary for column or constraint information, because `ALL_TAB_COLUMNS`
uses the real owner and table name, not the synonym name.
</details>
