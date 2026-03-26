# Oracle Data Types vs SQL Server

*Chapter 10.2 — Oracle SQL for Data Engineers*

---

## Overview

Data type mapping is the foundation of every Oracle-to-SQL-Server migration. Get it wrong
and you will face silent truncation, precision loss, timezone bugs, and performance
degradation. This lesson provides a complete type mapping guide, explains the subtle
behavioral differences between seemingly equivalent types, and highlights the implicit
conversion traps that catch even experienced engineers.

As a Data Engineer at a construction company running CMiC on Oracle, you deal with
financial amounts (NUMBER), long text fields (CLOB), timestamps on field data (DATE with
time!), and binary attachments (BLOB). Each of these has migration pitfalls.

---

## Core Concepts

### 1. NUMBER vs Numeric Types in SQL Server

Oracle's `NUMBER` type is extraordinarily flexible:

| Oracle | Precision | SQL Server Equivalent |
|--------|-----------|----------------------|
| `NUMBER` (no args) | Up to 38 digits | `FLOAT` or `DECIMAL(38,10)` — depends on usage |
| `NUMBER(10)` | 10-digit integer | `BIGINT` (if <= 18 digits) or `INT` (if <= 9) |
| `NUMBER(10,2)` | 10 total, 2 decimal | `DECIMAL(10,2)` |
| `NUMBER(38,10)` | Max precision | `DECIMAL(38,10)` |
| `NUMBER(1)` | Boolean flag | `BIT` or `TINYINT` |
| `NUMBER(5,0)` | Small integer | `SMALLINT` or `INT` |
| `BINARY_FLOAT` | 32-bit IEEE | `REAL` |
| `BINARY_DOUBLE` | 64-bit IEEE | `FLOAT` (which is 64-bit in SQL Server) |

**Key rule**: Oracle `NUMBER` without precision is the wildcard. Inspect actual data ranges
before choosing a SQL Server type. Do not blindly map to `FLOAT` — you will lose precision
on financial data.

### 2. VARCHAR2 vs varchar

| Oracle | SQL Server | Max Size |
|--------|-----------|----------|
| `VARCHAR2(4000)` | `VARCHAR(4000)` | Oracle max is 4000 bytes (or 32767 with MAX_STRING_SIZE=EXTENDED) |
| `VARCHAR2(4000 CHAR)` | `NVARCHAR(4000)` | CHAR semantics = character count, not bytes |
| `NVARCHAR2(2000)` | `NVARCHAR(2000)` | Unicode in both |

**Byte vs Character semantics**: Oracle's `VARCHAR2(100)` defaults to 100 *bytes* (unless
NLS_LENGTH_SEMANTICS=CHAR). Multi-byte characters (UTF-8) could mean fewer than 100
characters. SQL Server's `VARCHAR(100)` is always 100 characters for single-byte
collations.

### 3. CLOB / BLOB vs MAX Types

| Oracle | SQL Server | Notes |
|--------|-----------|-------|
| `CLOB` | `VARCHAR(MAX)` | Up to 2 GB |
| `NCLOB` | `NVARCHAR(MAX)` | Unicode large text |
| `BLOB` | `VARBINARY(MAX)` | Binary large objects |
| `BFILE` | No equivalent | External file pointer; migrate the files separately |
| `LONG` | `VARCHAR(MAX)` | Deprecated in Oracle; avoid |
| `LONG RAW` | `VARBINARY(MAX)` | Deprecated in Oracle; avoid |

### 4. DATE — The Big Trap

**Oracle DATE includes time down to the second.** This is the single most misunderstood
type mapping.

| Oracle | Contains | SQL Server Equivalent |
|--------|---------|----------------------|
| `DATE` | Date + Time (no fractional seconds) | `DATETIME2(0)` or `SMALLDATETIME` |
| `TIMESTAMP` | Date + Time + fractional seconds | `DATETIME2(7)` |
| `TIMESTAMP WITH TIME ZONE` | Date + Time + TZ offset | `DATETIMEOFFSET` |
| `TIMESTAMP WITH LOCAL TIME ZONE` | Converts to session TZ | `DATETIME2` + application logic |

**Never map Oracle DATE to SQL Server `DATE`** unless you have confirmed the time portion
is always midnight.

### 5. Other Type Mappings

| Oracle | SQL Server | Notes |
|--------|-----------|-------|
| `RAW(n)` | `VARBINARY(n)` | Fixed-length binary |
| `CHAR(n)` | `CHAR(n)` | Both right-pad with spaces |
| `NCHAR(n)` | `NCHAR(n)` | Unicode fixed-length |
| `INTERVAL YEAR TO MONTH` | No native equivalent | Store as INT (months) |
| `INTERVAL DAY TO SECOND` | No native equivalent | Store as BIGINT (microseconds) or VARCHAR |
| `XMLTYPE` | `XML` | Similar but XQuery support differs |
| `SDO_GEOMETRY` | `GEOMETRY` / `GEOGRAPHY` | Spatial types; requires conversion |
| `ROWID` | No equivalent | Internal row address; do not migrate |

---

## Code Examples

### Inspecting Oracle Column Types

```sql
-- Oracle: find all columns and their types for a table
SELECT column_name,
       data_type,
       data_length,
       data_precision,
       data_scale,
       nullable
FROM   all_tab_columns
WHERE  owner = 'CMIC'
AND    table_name = 'JOB_COST_DETAIL'
ORDER  BY column_id;
```

### Generating a Type Mapping Script

```sql
-- Oracle: generate SQL Server CREATE TABLE from Oracle metadata
SELECT column_name,
       CASE
           WHEN data_type = 'NUMBER' AND data_scale = 0 AND data_precision <= 9
               THEN 'INT'
           WHEN data_type = 'NUMBER' AND data_scale = 0 AND data_precision <= 18
               THEN 'BIGINT'
           WHEN data_type = 'NUMBER' AND data_scale > 0
               THEN 'DECIMAL(' || data_precision || ',' || data_scale || ')'
           WHEN data_type = 'NUMBER' AND data_precision IS NULL
               THEN 'DECIMAL(38,10)'  -- safe default for unspecified NUMBER
           WHEN data_type = 'VARCHAR2'
               THEN 'VARCHAR(' || data_length || ')'
           WHEN data_type = 'NVARCHAR2'
               THEN 'NVARCHAR(' || data_length / 2 || ')'
           WHEN data_type = 'DATE'
               THEN 'DATETIME2(0)'  -- preserves time portion!
           WHEN data_type = 'CLOB'
               THEN 'VARCHAR(MAX)'
           WHEN data_type = 'BLOB'
               THEN 'VARBINARY(MAX)'
           WHEN data_type LIKE 'TIMESTAMP%'
               THEN 'DATETIME2(7)'
           ELSE 'VARCHAR(255) /* UNMAPPED: ' || data_type || ' */'
       END AS sql_server_type
FROM   all_tab_columns
WHERE  owner = 'CMIC'
AND    table_name = 'JOB_COST_DETAIL'
ORDER  BY column_id;
```

### DATE vs DATETIME2 Validation

```sql
-- Oracle: check if any DATE columns actually store time
SELECT column_name,
       COUNT(*) AS total_rows,
       SUM(CASE WHEN TRUNC(date_col) = date_col THEN 1 ELSE 0 END) AS midnight_rows
FROM   (
    SELECT 'CREATED_DATE' AS column_name, created_date AS date_col
    FROM   cmic.job_cost_detail
)
GROUP BY column_name;
-- If midnight_rows < total_rows, the column carries time data
```

### CHAR Padding Behavior

```sql
-- Oracle: CHAR(10) pads with spaces
SELECT LENGTH(status_code) FROM cmic.jobs WHERE job_id = 'J-1001';
-- Returns 10 even if the value is 'OPEN' (6 trailing spaces)

-- Comparison works despite padding in Oracle:
SELECT * FROM cmic.jobs WHERE status_code = 'OPEN';      -- matches 'OPEN      '
-- Oracle trims for comparison with VARCHAR2, but not CHAR-to-CHAR
```

### Implicit Conversion Gotcha

```sql
-- Oracle: implicit conversion from string to number works
SELECT * FROM cmic.job_cost_detail WHERE cost_code = '1001';
-- If cost_code is NUMBER, Oracle silently converts '1001' to 1001

-- SQL Server: also converts, but behavior with leading zeros differs
-- '001001' converts to 1001 in Oracle, but may cause issues in SQL Server
-- depending on the column type and collation
```

### NUMBER Without Precision — Data Profiling

```sql
-- Oracle: profile a NUMBER column with no precision/scale defined
SELECT column_name,
       MIN(your_col) AS min_val,
       MAX(your_col) AS max_val,
       MAX(LENGTH(TO_CHAR(your_col))) AS max_display_len,
       MAX(LENGTH(TO_CHAR(your_col)) - LENGTH(REPLACE(TO_CHAR(your_col), '.', '')) )
           AS has_decimal,
       MAX(
           CASE WHEN INSTR(TO_CHAR(your_col), '.') > 0
                THEN LENGTH(TO_CHAR(your_col)) - INSTR(TO_CHAR(your_col), '.')
                ELSE 0
           END
       ) AS max_decimal_places
FROM   cmic.job_cost_detail;
```

---

## Common Patterns

### Pattern 1 — Safe NUMBER Mapping

Profile every `NUMBER` column before migration:
1. If `data_precision` and `data_scale` are defined, map directly to `DECIMAL(p,s)`.
2. If `NUMBER` has no precision, query actual data to find min/max and decimal places.
3. For boolean flags (`NUMBER(1)`), consider `BIT` in SQL Server.
4. For integer-only columns, prefer `INT` or `BIGINT` over `DECIMAL` for performance.

### Pattern 2 — VARCHAR2 Byte-to-Character Conversion

Check `NLS_LENGTH_SEMANTICS` on the Oracle database. If it is `BYTE` (the default), and
the database character set is `AL32UTF8`, then `VARCHAR2(300)` could hold as few as 75
four-byte characters. Map to `NVARCHAR(300)` in SQL Server to be safe.

### Pattern 3 — CLOB Extraction

Oracle CLOBs cannot be directly read through linked servers. Use:
1. `DBMS_LOB.SUBSTR(clob_col, 4000, 1)` to extract the first 4000 characters in Oracle.
2. Export to CSV/Parquet with a tool like Oracle Data Pump or custom Python (cx_Oracle).
3. Load into SQL Server `VARCHAR(MAX)`.

### Pattern 4 — Preserving Oracle DATE Time Portions

Always validate before choosing `date` vs `datetime2`:

```sql
-- Oracle: quick check for time in DATE columns
SELECT COUNT(*) AS has_time
FROM   cmic.equipment_log
WHERE  checkout_date <> TRUNC(checkout_date);
```

---

## Gotchas and Pitfalls

1. **Oracle DATE has time; SQL Server DATE does not.** Mapping Oracle `DATE` to SQL Server
   `date` silently drops the time component. Equipment checkout times, shift start times,
   and transaction timestamps are all stored in Oracle `DATE` columns.

2. **NUMBER without precision is a trap.** It can store up to 38 digits of precision with
   any scale. Without profiling, you cannot know what SQL Server type to use.

3. **VARCHAR2 byte semantics.** A `VARCHAR2(100)` column in a UTF-8 database may hold far
   fewer than 100 characters. If you map to `VARCHAR(100)` in SQL Server, data may be
   truncated for multi-byte content.

4. **CHAR padding and comparisons.** Oracle uses blank-padded comparison semantics for
   CHAR-to-VARCHAR2 comparisons, but SQL Server's behavior depends on the `ANSI_PADDING`
   setting. Trailing spaces can cause join mismatches after migration.

5. **CLOB through linked servers.** SQL Server linked servers to Oracle often silently
   truncate CLOBs to 4000 characters. Always validate large text fields.

6. **TIMESTAMP fractional precision.** Oracle `TIMESTAMP(9)` has nanosecond precision.
   SQL Server `DATETIME2(7)` only goes to 100-nanosecond precision (7 decimal places).
   You lose the last 2 digits.

7. **Boolean mapping.** Oracle has no BOOLEAN type for table columns (only PL/SQL). Flags
   are usually `NUMBER(1)` or `CHAR(1)` with 'Y'/'N'. Decide on a SQL Server convention:
   `BIT`, `TINYINT`, or `CHAR(1)`.

8. **RAW(16) for GUIDs.** Oracle stores GUIDs as `RAW(16)`. SQL Server uses
   `UNIQUEIDENTIFIER`. The byte order differs — you must convert, not just cast.

---

## Performance Considerations

- **DECIMAL vs INT**: In SQL Server, `INT` (4 bytes) is significantly faster for joins and
  indexes than `DECIMAL(10,0)` (5–9 bytes). If an Oracle `NUMBER(10)` is truly an integer,
  map it to `INT` or `BIGINT`.

- **NVARCHAR overhead**: `NVARCHAR` uses 2 bytes per character vs 1 byte for `VARCHAR`. If
  the source Oracle data is pure ASCII, prefer `VARCHAR` in SQL Server to halve storage.

- **VARCHAR(MAX) performance**: Columns typed as `VARCHAR(MAX)` in SQL Server are stored
  off-row when values exceed 8000 bytes. This adds I/O overhead. If data fits in 8000
  bytes, use `VARCHAR(8000)`.

- **Implicit conversion in joins**: If Oracle `NUMBER` is mapped to `DECIMAL` but a SQL
  Server stored procedure passes `INT` parameters, implicit conversion on every row will
  prevent index seeks. Match types exactly.

- **Date comparison performance**: Using `DATETIME2(0)` instead of `DATETIME` avoids the
  rounding behavior of `DATETIME` (which rounds to 3.33ms) and is more precise. It also
  uses the same storage (6–8 bytes depending on precision).

---

## BNBuilders Context

At BNBuilders, the CMiC ERP system on Oracle has specific type patterns:

- **Job cost amounts**: Stored as `NUMBER(15,2)` — map to `DECIMAL(15,2)`. These are
  financial values for cost entries, budget amounts, and contract values. Precision matters.

- **Job codes and cost codes**: Often `VARCHAR2(20)` with leading alphanumeric patterns
  like `J-1001-00`. Map to `VARCHAR(20)`. Watch for trailing spaces if stored in `CHAR`.

- **Equipment dates**: `DATE` columns on `EQUIPMENT_LOG` and `EQUIP_ASSIGNMENT` tables
  carry checkout/return timestamps. Always map to `DATETIME2(0)`.

- **Document attachments**: CMiC stores construction documents (plans, RFIs, submittals)
  as `BLOB`s or references. Map `BLOB` to `VARBINARY(MAX)`, but consider storing in Azure
  Blob Storage instead and keeping only a URL in SQL Server.

- **Field data from mobile**: Daily reports and inspection data from field apps flow into
  Oracle staging tables. These often have `CLOB` columns for notes and `BLOB` columns for
  photos. Validate that CLOBs do not exceed SQL Server limits and consider file storage
  for images.

- **Status flags**: CMiC uses `CHAR(1)` with values like 'A' (Active), 'I' (Inactive),
  'C' (Closed). Keep as `CHAR(1)` in SQL Server or convert to a lookup table.

- **Oracle sequences for IDs**: CMiC primary keys are populated via Oracle sequences into
  `NUMBER(10)` columns. Map to `INT` + `IDENTITY` or `BIGINT` + `SEQUENCE` in SQL Server.

---

## Interview / Senior Dev Questions

1. **Q: You discover an Oracle table where `NUMBER` columns have no precision or scale
   defined. How do you decide on the SQL Server target type?**
   A: Profile the data — find min, max, and max decimal places for each column. Also check
   application code and stored procedures for implicit assumptions. For financial data,
   default to `DECIMAL(38,10)` as a safe starting point, then narrow after profiling.

2. **Q: What happens if you migrate an Oracle DATE column to SQL Server DATE?**
   A: You silently lose the time component. Oracle DATE stores date + time (to the
   second). SQL Server DATE stores only the date. The correct target is `DATETIME2(0)`.

3. **Q: How do you handle Oracle CHAR(10) columns where comparisons with VARCHAR work in
   Oracle but fail in SQL Server?**
   A: Oracle uses blank-padded comparison for CHAR vs VARCHAR2. SQL Server behavior
   depends on ANSI_PADDING. Best practice: migrate CHAR to VARCHAR in SQL Server and RTRIM
   the data during ETL to remove padding. This avoids join mismatches.

4. **Q: A CMiC table has a RAW(16) column used as a GUID. How do you migrate it?**
   A: Convert the byte order from Oracle's big-endian `RAW(16)` to SQL Server's
   mixed-endian `UNIQUEIDENTIFIER` format. The first three groups of bytes are reversed
   in SQL Server. Use a conversion function in your ETL, not a raw binary copy.

---

## Quiz

### Question 1
An Oracle table has a column defined as `DATE`. What SQL Server type should you use and why?

<details>
<summary>Show Answer</summary>

Use `DATETIME2(0)`, not `DATE`. Oracle's `DATE` type includes both date and time components
(to the second). SQL Server's `DATE` type stores only the date, so mapping to it would
silently discard time information. `DATETIME2(0)` preserves the time while matching
Oracle's per-second precision.
</details>

### Question 2
An Oracle column is `NUMBER` with no precision or scale. A developer maps it to `FLOAT`
in SQL Server. What is the risk?

<details>
<summary>Show Answer</summary>

`FLOAT` is an approximate numeric type that uses IEEE 754 floating-point representation.
If the column stores exact decimal values (like financial amounts), `FLOAT` will introduce
rounding errors. For example, `0.1` cannot be represented exactly in binary floating point.
The correct approach is to profile the data first and use `DECIMAL(p,s)` for exact numeric
storage.
</details>

### Question 3
Why can't you simply pull Oracle CLOB data through a SQL Server linked server?

<details>
<summary>Show Answer</summary>

SQL Server linked servers to Oracle (via OLE DB provider) typically truncate LOB data to
4000 characters or bytes. The linked server driver has limitations on large object transfer.
To reliably migrate CLOBs, use Oracle Data Pump for export, a dedicated ETL tool like ADF,
or extract via `DBMS_LOB.SUBSTR` in chunked reads from the Oracle side.
</details>

### Question 4
Oracle `VARCHAR2(100)` uses byte semantics by default. If the Oracle database uses
AL32UTF8 encoding and a column contains Japanese characters (3 bytes each in UTF-8), how
many characters can actually fit?

<details>
<summary>Show Answer</summary>

Only 33 characters (100 bytes / 3 bytes per character = 33.3, rounded down). This is why
it is important to check `NLS_LENGTH_SEMANTICS` and the database character set. When
migrating to SQL Server, you may need `NVARCHAR(100)` (which stores 100 *characters* in
UCS-2/UTF-16) to ensure no data is truncated.
</details>
