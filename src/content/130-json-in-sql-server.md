# JSON in SQL Server

*Chapter 9.11 — T-SQL for Data Engineers*

## Overview

SQL Server 2016+ introduced native JSON support, giving data engineers a powerful way to
handle semi-structured data without leaving T-SQL. Unlike XML (which has its own data type),
JSON is stored as plain `NVARCHAR` — meaning you can use it in any text column. The trade-off
is that SQL Server validates JSON on demand rather than on insert (unless you add a CHECK
constraint).

For a Data Engineer, JSON skills in SQL Server unlock:

- **API integration**: Parse REST API responses stored in staging tables.
- **Flexible schemas**: Store configuration, inspection data, or IoT payloads that vary by
  source without needing EAV tables.
- **Data exchange**: Generate JSON output for downstream consumers (Power BI, Azure Data
  Factory, web services).
- **Migration bridges**: Accept JSON from Oracle `JSON_OBJECT` / MongoDB exports during
  migration to SQL Server.

This lesson covers the full JSON toolkit: reading JSON (`OPENJSON`, `JSON_VALUE`,
`JSON_QUERY`), writing JSON (`FOR JSON`), modifying JSON (`JSON_MODIFY`), validating
(`ISJSON`), and performance techniques (computed columns + indexes).

---

## Core Concepts

### JSON Functions at a Glance

| Function | Purpose | Returns |
|---|---|---|
| `ISJSON(text)` | Validates JSON | 1 or 0 |
| `JSON_VALUE(text, path)` | Extracts a scalar value | `NVARCHAR(4000)` |
| `JSON_QUERY(text, path)` | Extracts an object or array | `NVARCHAR(MAX)` |
| `JSON_MODIFY(text, path, value)` | Updates a value in JSON | `NVARCHAR(MAX)` |
| `OPENJSON(text [, path])` | Shreds JSON into rows | Rowset |
| `FOR JSON AUTO` | Generates JSON from query | `NVARCHAR(MAX)` |
| `FOR JSON PATH` | Generates JSON with explicit structure | `NVARCHAR(MAX)` |

### JSON Path Syntax

SQL Server uses a `$`-rooted path with dot notation:

- `$` — root
- `$.name` — top-level property
- `$.address.city` — nested property
- `$.items[0]` — first element of an array
- `$.items[2].sku` — property of third array element

Two modes:

- **Lax (default)**: Returns NULL if path doesn't exist.
- **Strict**: Raises an error if path doesn't exist. Use `strict $.path`.

---

## Code Examples

### Validating JSON with ISJSON

```sql
-- ISJSON returns 1 for valid JSON, 0 for invalid
DECLARE @good NVARCHAR(MAX) = N'{"project": "BNB-4500", "phase": 2}';
DECLARE @bad  NVARCHAR(MAX) = N'{project: BNB-4500}';  -- missing quotes

SELECT ISJSON(@good) AS IsValid;  -- 1
SELECT ISJSON(@bad)  AS IsValid;  -- 0

-- Use as a CHECK constraint on a table
ALTER TABLE dbo.FieldInspections
    ADD CONSTRAINT CK_InspectionData_ValidJSON
    CHECK (ISJSON(InspectionData) = 1);
```

### Extracting Values with JSON_VALUE and JSON_QUERY

```sql
DECLARE @doc NVARCHAR(MAX) = N'{
    "jobNumber": "BNB-4500",
    "phase": "Foundation",
    "inspections": [
        {"type": "Concrete", "result": "Pass", "temp_f": 72},
        {"type": "Rebar",    "result": "Fail", "temp_f": 85}
    ],
    "metadata": {"inspector": "J. Martinez", "region": "PNW"}
}';

-- JSON_VALUE: returns a scalar (NVARCHAR(4000))
SELECT JSON_VALUE(@doc, '$.jobNumber')              AS JobNumber;     -- BNB-4500
SELECT JSON_VALUE(@doc, '$.inspections[0].result')  AS FirstResult;   -- Pass
SELECT JSON_VALUE(@doc, '$.metadata.inspector')     AS Inspector;     -- J. Martinez

-- JSON_VALUE returns NULL for objects/arrays (use JSON_QUERY instead)
SELECT JSON_VALUE(@doc, '$.inspections')            AS Nope;          -- NULL

-- JSON_QUERY: returns an object or array fragment
SELECT JSON_QUERY(@doc, '$.inspections')            AS InspArray;     -- [{...},{...}]
SELECT JSON_QUERY(@doc, '$.metadata')               AS MetaObj;       -- {"inspector":...}

-- Strict mode raises error if path missing
SELECT JSON_VALUE(@doc, 'strict $.budget');  -- Error!
```

### Shredding JSON with OPENJSON

```sql
-- Default schema: returns key, value, type columns
DECLARE @arr NVARCHAR(MAX) = N'[
    {"code": "CSI-03", "desc": "Concrete",  "budgeted": 125000},
    {"code": "CSI-05", "desc": "Metals",    "budgeted":  87000},
    {"code": "CSI-09", "desc": "Finishes",  "budgeted":  45000}
]';

-- Without explicit schema
SELECT * FROM OPENJSON(@arr);
-- key | value                                          | type
-- 0   | {"code":"CSI-03","desc":"Concrete","budgeted":125000} | 5

-- With explicit schema (strongly typed)
SELECT
    code,
    [desc],
    budgeted
FROM OPENJSON(@arr)
WITH (
    code     NVARCHAR(10)  '$.code',
    [desc]   NVARCHAR(50)  '$.desc',
    budgeted DECIMAL(12,2) '$.budgeted'
);
```

### Shredding Nested JSON

```sql
-- IoT sensor payload from equipment tracker
DECLARE @payload NVARCHAR(MAX) = N'{
    "equipmentId": "EXC-220",
    "timestamp": "2026-03-24T08:30:00Z",
    "readings": [
        {"sensor": "engine_temp",  "value": 195.4, "unit": "F"},
        {"sensor": "fuel_level",   "value": 62.1,  "unit": "pct"},
        {"sensor": "hours_meter",  "value": 4821,  "unit": "hrs"}
    ]
}';

SELECT
    JSON_VALUE(@payload, '$.equipmentId')  AS EquipmentId,
    JSON_VALUE(@payload, '$.timestamp')    AS ReadingTime,
    r.sensor,
    r.value,
    r.unit
FROM OPENJSON(@payload, '$.readings')
WITH (
    sensor NVARCHAR(50)   '$.sensor',
    value  DECIMAL(10, 2) '$.value',
    unit   NVARCHAR(10)   '$.unit'
) AS r;
```

### Generating JSON with FOR JSON

```sql
-- FOR JSON AUTO: SQL Server picks structure from table aliases
SELECT
    j.JobNumber,
    j.JobName,
    cc.CostCode,
    cc.BudgetAmount
FROM dbo.Jobs AS j
INNER JOIN dbo.CostCodes AS cc ON j.JobID = cc.JobID
WHERE j.JobNumber = 'BNB-4500'
FOR JSON AUTO;

-- Result: nested — CostCodes array inside each Job
-- [{"JobNumber":"BNB-4500","JobName":"...", "cc":[{"CostCode":"03","BudgetAmount":125000}, ...]}]

-- FOR JSON PATH: full control over nesting via column aliases
SELECT
    j.JobNumber                      AS 'job.number',
    j.JobName                        AS 'job.name',
    cc.CostCode                      AS 'cost.code',
    cc.BudgetAmount                  AS 'cost.budget',
    cc.ActualAmount                  AS 'cost.actual'
FROM dbo.Jobs AS j
INNER JOIN dbo.CostCodes AS cc ON j.JobID = cc.JobID
WHERE j.JobNumber = 'BNB-4500'
FOR JSON PATH, ROOT('jobCosts');

-- Include NULLs (normally omitted)
FOR JSON PATH, INCLUDE_NULL_VALUES;

-- Single object (not an array)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
```

### Modifying JSON with JSON_MODIFY

```sql
DECLARE @doc NVARCHAR(MAX) = N'{"status": "Open", "phase": 1, "tags": ["concrete"]}';

-- Update a value
SET @doc = JSON_MODIFY(@doc, '$.status', 'Closed');

-- Add a new property
SET @doc = JSON_MODIFY(@doc, '$.closedDate', '2026-03-24');

-- Append to an array
SET @doc = JSON_MODIFY(@doc, 'append $.tags', 'foundation');

-- Delete a property (set to NULL in strict mode isn't deletion; use lax + NULL)
SET @doc = JSON_MODIFY(@doc, '$.phase', NULL);

SELECT @doc;
-- {"status":"Closed","tags":["concrete","foundation"],"closedDate":"2026-03-24"}
```

### Indexing JSON with Computed Columns

```sql
-- JSON lives in NVARCHAR — you cannot directly index a JSON path.
-- Solution: computed column + index.

ALTER TABLE dbo.FieldInspections
    ADD JobNumber AS JSON_VALUE(InspectionData, '$.jobNumber');

CREATE NONCLUSTERED INDEX IX_FieldInspections_JobNumber
    ON dbo.FieldInspections (JobNumber);

-- Now this query uses the index:
SELECT InspectionID, InspectionData
FROM dbo.FieldInspections
WHERE JSON_VALUE(InspectionData, '$.jobNumber') = 'BNB-4500';
```

### Combining OPENJSON with CROSS APPLY

```sql
-- Table where each row has a JSON array of line items
SELECT
    inv.InvoiceID,
    inv.VendorName,
    li.description,
    li.amount
FROM dbo.VendorInvoices AS inv
CROSS APPLY OPENJSON(inv.LineItemsJson)
WITH (
    description NVARCHAR(200) '$.description',
    amount      DECIMAL(12,2) '$.amount'
) AS li
WHERE inv.JobNumber = 'BNB-4500';
```

---

## Common Patterns

### Pattern 1: Staging API Responses

```sql
-- 1. Land raw JSON from REST API into staging
CREATE TABLE staging.ApiResponses (
    ResponseID   INT IDENTITY PRIMARY KEY,
    SourceSystem NVARCHAR(50),
    RawJson      NVARCHAR(MAX),
    LoadedAt     DATETIME2 DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_RawJson_Valid CHECK (ISJSON(RawJson) = 1)
);

-- 2. Shred into relational target
INSERT INTO dbo.EquipmentReadings (EquipmentId, Sensor, Value, ReadingTime)
SELECT
    JSON_VALUE(RawJson, '$.equipmentId'),
    r.sensor,
    r.value,
    CAST(JSON_VALUE(RawJson, '$.timestamp') AS DATETIME2)
FROM staging.ApiResponses
CROSS APPLY OPENJSON(RawJson, '$.readings')
WITH (
    sensor NVARCHAR(50)   '$.sensor',
    value  DECIMAL(10,2)  '$.value'
) AS r
WHERE SourceSystem = 'IoTHub'
  AND LoadedAt > @LastProcessed;
```

### Pattern 2: Flexible Schema with JSON + Relational Hybrid

```sql
-- Core relational columns + flexible JSON for variable fields
CREATE TABLE dbo.FieldInspections (
    InspectionID   INT IDENTITY PRIMARY KEY,
    JobNumber      NVARCHAR(20)  NOT NULL,
    InspectionDate DATE          NOT NULL,
    InspectorName  NVARCHAR(100) NOT NULL,
    InspectionType NVARCHAR(50)  NOT NULL,
    -- Variable data per inspection type
    InspectionData NVARCHAR(MAX) NULL,
    CONSTRAINT CK_InspData CHECK (InspectionData IS NULL OR ISJSON(InspectionData) = 1)
);

-- Concrete inspection might store: {"slump": 4, "airContent": 5.5, "cylinders": 6}
-- Electrical inspection might store: {"circuitId": "C-12", "megger": true, "ohms": 0.5}
```

### Pattern 3: Building JSON for Power BI / APIs

```sql
-- Wrap a complex query result as a single JSON document
DECLARE @result NVARCHAR(MAX);

SET @result = (
    SELECT
        j.JobNumber   AS jobNumber,
        j.JobName     AS jobName,
        (
            SELECT cc.CostCode, cc.BudgetAmount, cc.ActualAmount
            FROM dbo.CostCodes cc
            WHERE cc.JobID = j.JobID
            FOR JSON PATH
        ) AS costCodes
    FROM dbo.Jobs j
    WHERE j.JobNumber = 'BNB-4500'
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
);

SELECT @result;
```

---

## Gotchas and Pitfalls

1. **JSON_VALUE returns NVARCHAR(4000)**. If your scalar exceeds 4000 characters, it
   silently returns NULL in lax mode. Use `JSON_QUERY` for large text or switch to strict
   mode to surface the error.

2. **JSON_VALUE vs JSON_QUERY confusion**. `JSON_VALUE` is for scalars (strings, numbers).
   `JSON_QUERY` is for objects and arrays. Using the wrong one returns NULL (lax) or errors
   (strict).

3. **No native JSON data type**. JSON is stored as `NVARCHAR(MAX)`. This means no
   automatic validation on INSERT unless you add a CHECK constraint with `ISJSON()`.

4. **OPENJSON requires compatibility level 130+** (SQL Server 2016). If your database is
   in an older compat level, OPENJSON calls fail even on a newer engine.

5. **FOR JSON escapes special characters**. Forward slashes, quotes, and control characters
   get escaped. If you feed already-escaped JSON to `JSON_MODIFY`, you can get double-escaping.

6. **NULL handling**. `FOR JSON` omits NULL properties by default. Use
   `INCLUDE_NULL_VALUES` if downstream consumers expect every key. Conversely, `JSON_MODIFY`
   with NULL deletes the key in lax mode.

7. **Computed column determinism**. `JSON_VALUE` on a column is deterministic only when using
   lax mode. Using `strict` can make the computed column non-deterministic and unpersistable,
   which blocks indexing.

8. **Large JSON documents**. Parsing a 10 MB JSON blob with `OPENJSON` in a CROSS APPLY
   against millions of rows is a CPU furnace. Shred once into staging, then join relationally.

---

## Performance Considerations

- **Computed columns + indexes** are the primary way to make JSON queries fast. Without them,
  every `JSON_VALUE` call in a WHERE clause causes a full table scan.

- **Persist computed columns** (`PERSISTED`) to avoid recalculating JSON_VALUE on every read.
  This costs storage but is worth it for frequently queried paths.

- **Shred early, query relationally**. For ETL workloads, parse JSON once during staging and
  store results in proper relational columns. Querying JSON at scale is always slower than
  querying indexed relational columns.

- **Avoid OPENJSON in hot-path queries**. OPENJSON is a table-valued function — it prevents
  parallelism in some plans. Use it in batch ETL, not in user-facing OLTP queries.

- **Batch JSON_MODIFY updates**. Each call returns a new NVARCHAR(MAX) string, so chaining
  five modifications on a 1 MB document copies 5 MB. Build the JSON fresh with FOR JSON PATH
  instead if you need many changes.

- **Memory grants**. Large NVARCHAR(MAX) columns cause SQL Server to request big memory grants.
  Use `OPTION (MIN_GRANT_PERCENT = 0)` or limit result set size.

---

## BNBuilders Context

### Field Inspection Data

Different inspection types (concrete pours, rebar placement, waterproofing, electrical) have
different data points. Rather than creating dozens of nullable columns or an EAV table, store
the variable part as JSON:

```sql
-- Concrete pour inspection
INSERT INTO dbo.FieldInspections (JobNumber, InspectionDate, InspectorName, InspectionType, InspectionData)
VALUES (
    'BNB-4500', '2026-03-24', 'M. Chen', 'ConcretePour',
    N'{"slump_inches": 4, "air_content_pct": 5.5, "temp_f": 68,
       "mix_design": "5000PSI-FA", "truck_number": "T-1142",
       "cylinders_cast": 6, "placement_location": "L3-Grid-A4"}'
);
```

### IoT Equipment Sensors

Heavy equipment (excavators, cranes, loaders) transmit sensor data via telematics APIs.
The payload schema varies by manufacturer (CAT, Deere, Komatsu). JSON staging normalizes
the intake:

```sql
-- Parse mixed-vendor IoT data into a unified readings table
INSERT INTO dbo.EquipmentReadings (EquipmentTag, SensorName, SensorValue, ReadingTimeUtc)
SELECT
    JSON_VALUE(s.RawJson, '$.asset.tag')         AS EquipmentTag,
    r.sensorName,
    r.sensorValue,
    CAST(JSON_VALUE(s.RawJson, '$.ts') AS DATETIME2) AS ReadingTimeUtc
FROM staging.IoTMessages AS s
CROSS APPLY OPENJSON(s.RawJson, '$.telemetry')
WITH (
    sensorName  NVARCHAR(50)   '$.name',
    sensorValue DECIMAL(12, 4) '$.val'
) AS r
WHERE s.Processed = 0;
```

### CMiC Integration

CMiC exports sometimes arrive as JSON from their API layer. Staging these as raw JSON and
then shredding into the SQL Server warehouse lets you decouple ingest from transform:

```sql
-- Job cost adjustments from CMiC API
SELECT
    adj.jobNumber,
    adj.costCode,
    adj.adjustmentAmount,
    adj.reason
FROM staging.CMiCResponses AS c
CROSS APPLY OPENJSON(c.ResponseBody, '$.adjustments')
WITH (
    jobNumber        NVARCHAR(20)   '$.job',
    costCode         NVARCHAR(10)   '$.cc',
    adjustmentAmount DECIMAL(14, 2) '$.amount',
    reason           NVARCHAR(200)  '$.memo'
) AS adj;
```

---

## Interview / Senior Dev Questions

1. **When would you choose JSON columns over a traditional relational design?**
   When the schema varies per record (inspections, configs, API payloads), changes frequently,
   or you need to store a document for auditing while also extracting a few searchable fields
   via computed columns.

2. **How do you index a JSON property?**
   Create a computed column using `JSON_VALUE(col, '$.path')`, then add a nonclustered index
   on that computed column. Mark it `PERSISTED` for best read performance.

3. **What is the difference between JSON_VALUE and JSON_QUERY?**
   `JSON_VALUE` extracts scalar values and returns `NVARCHAR(4000)`. `JSON_QUERY` extracts
   objects or arrays and returns `NVARCHAR(MAX)`. Using the wrong one returns NULL in lax mode.

4. **How would you handle a 50 MB JSON file that needs to land in SQL Server?**
   Load it into a staging table as a single NVARCHAR(MAX) value (or use OPENROWSET). Then
   use OPENJSON to shred it into a relational staging table in a single set-based INSERT.
   Avoid row-by-row cursor processing.

5. **What are the risks of storing business-critical data as JSON rather than relational?**
   No referential integrity, no column-level statistics for the optimizer, harder to enforce
   NOT NULL / data types, computed-column indexes only cover specific paths, and tooling
   (SSRS, SSIS) has weaker JSON support than relational columns.

---

## Quiz

**Q1: What does `JSON_VALUE(@doc, '$.items')` return if `$.items` is an array?**

<details>
<summary>Answer</summary>

NULL (in lax mode). `JSON_VALUE` only returns scalar values. To extract an array or object,
use `JSON_QUERY(@doc, '$.items')` instead.
</details>

**Q2: You need to search a table by a JSON property `$.jobNumber` efficiently. What two
steps are required?**

<details>
<summary>Answer</summary>

1. Add a computed column: `ALTER TABLE t ADD JobNum AS JSON_VALUE(JsonCol, '$.jobNumber');`
2. Create an index on that column: `CREATE INDEX IX_JobNum ON t (JobNum);`

Without both steps, the query performs a full table scan and calls JSON_VALUE for every row.
</details>

**Q3: What is the difference between `FOR JSON AUTO` and `FOR JSON PATH`?**

<details>
<summary>Answer</summary>

`FOR JSON AUTO` automatically nests the output based on the table structure in the FROM/JOIN
clauses. `FOR JSON PATH` gives you full control — you define the JSON structure through
column aliases using dot notation (e.g., `'job.number'`). PATH is preferred when you need
a specific JSON shape.
</details>

**Q4: An OPENJSON query returns zero rows even though the JSON looks correct. The database
was recently restored from a SQL Server 2012 backup. What is the likely cause?**

<details>
<summary>Answer</summary>

The database compatibility level is below 130. OPENJSON requires compatibility level 130
(SQL Server 2016) or higher. Fix with:
`ALTER DATABASE [YourDB] SET COMPATIBILITY_LEVEL = 130;`
</details>

**Q5: You call `JSON_MODIFY(@doc, '$.budget', 150000)` but the result stores `"150000"`
as a string instead of a number. How do you fix it?**

<details>
<summary>Answer</summary>

Wrap the value in `CAST` as a JSON-compatible numeric type is not enough — you need to pass
the value as a raw JSON fragment. Use:

```sql
SET @doc = JSON_MODIFY(@doc, '$.budget', CAST(150000 AS INT));
```

Or for explicit control, use `JSON_MODIFY` with `JSON_QUERY` to insert a raw fragment:

```sql
SET @doc = JSON_MODIFY(@doc, '$.budget', JSON_QUERY('150000'));
```
</details>
