# Testing Data Pipelines

*Chapter 13.10 — Data Engineering Patterns in C#*

## Overview

Data pipelines are notoriously hard to test. They depend on databases, network
connectivity, specific data states, and timing. The temptation is to skip tests and
"just run it and check the output." This works until a transform regression silently
corrupts your warehouse and nobody notices for two weeks.

This lesson covers how to test data pipelines at every level: unit tests for pure
transforms, integration tests with real databases using Testcontainers, test data
factories that generate realistic CMiC data, and assertions that verify row-level
correctness rather than just "it didn't throw."

## Core Concepts

### The Testing Pyramid for Pipelines

```
        /  E2E  \          Few: full pipeline against real databases
       /----------\
      / Integration \      Some: pipeline steps against test containers
     /----------------\
    /    Unit Tests     \   Many: pure transforms, mappers, validators
   /--------------------\
```

### Unit Testing Transforms
Transform functions are pure: input in, output out, no side effects. These are trivial
to test with xUnit/NUnit and should cover every mapping, edge case, and error path.

### Integration Testing with Testcontainers
Testcontainers spins up real database containers (SQL Server, Oracle) for integration
tests. Your tests run actual queries against real database engines, catching SQL syntax
errors, type mismatches, and constraint violations that mock-based tests miss.

### Test Data Factories
Builder classes that generate realistic test data with sensible defaults. Instead of
copy-pasting SQL INSERT statements, call `new JobCostBuilder().WithJobNumber("2301-00").Build()`.

### Row-Level Assertions
Asserting "pipeline completed without errors" is insufficient. Assert that specific
rows have specific values in the destination. Assert row counts. Assert aggregations.

## Code Examples

### Unit Testing a Transform

```csharp
public class JobCostTransformTests
{
    private readonly JobCostTransformStep _sut = new();

    [Fact]
    public async Task Transform_TrimsJobNumber()
    {
        var input = new List<RawJobCost>
        {
            new() { JobNumber = "  2301-00  ", CostCode = "03100",
                     Amount = 1500m, PostingDate = new DateTime(2026, 3, 15),
                     CostType = "L" }
        };

        var result = await _sut.ExecuteAsync(input, CancellationToken.None);

        Assert.Single(result);
        Assert.Equal("2301-00", result[0].JobKey);
    }

    [Fact]
    public async Task Transform_NullJobNumber_Excluded()
    {
        var input = new List<RawJobCost>
        {
            new() { JobNumber = null, CostCode = "03100",
                     Amount = 1500m, PostingDate = new DateTime(2026, 3, 15),
                     CostType = "L" }
        };

        var result = await _sut.ExecuteAsync(input, CancellationToken.None);

        Assert.Empty(result);
    }

    [Theory]
    [InlineData("L", CostType.Labor)]
    [InlineData("M", CostType.Material)]
    [InlineData("S", CostType.Subcontract)]
    [InlineData("E", CostType.Equipment)]
    [InlineData("O", CostType.Other)]
    [InlineData("X", CostType.Other)]   // Unknown maps to Other
    [InlineData(null, CostType.Other)]   // Null maps to Other
    public async Task Transform_MapsCostType(string? input, CostType expected)
    {
        var raw = new List<RawJobCost>
        {
            new() { JobNumber = "2301-00", CostCode = "03100",
                     Amount = 100m, PostingDate = new DateTime(2026, 3, 15),
                     CostType = input }
        };

        var result = await _sut.ExecuteAsync(raw, CancellationToken.None);

        Assert.Single(result);
        Assert.Equal(expected, result[0].CostType);
    }

    [Fact]
    public async Task Transform_PreservesAmount_WithFullPrecision()
    {
        var input = new List<RawJobCost>
        {
            new() { JobNumber = "2301-00", CostCode = "03100",
                     Amount = 1234567.89m, PostingDate = new DateTime(2026, 3, 15),
                     CostType = "L" }
        };

        var result = await _sut.ExecuteAsync(input, CancellationToken.None);

        Assert.Equal(1234567.89m, result[0].Amount);
    }

    [Fact]
    public async Task Transform_EmptyInput_ReturnsEmpty()
    {
        var result = await _sut.ExecuteAsync(
            new List<RawJobCost>(), CancellationToken.None);

        Assert.Empty(result);
    }
}
```

### Unit Testing the Column Mapper

```csharp
public class ConfigurableMapperTests
{
    [Fact]
    public void MapRow_AppliesTrimTransform()
    {
        var mappings = new List<ColumnMapping>
        {
            new("JOB_NUMBER", "ProjectId", "Trim"),
            new("AMOUNT", "Amount", null)
        };
        var mapper = new ConfigurableMapper(mappings);

        var source = new Dictionary<string, object?>
        {
            ["JOB_NUMBER"] = "  2301-00  ",
            ["AMOUNT"] = 1500m
        };

        var result = mapper.MapRow(source);

        Assert.Equal("2301-00", result["ProjectId"]);
        Assert.Equal(1500m, result["Amount"]);
    }

    [Fact]
    public void MapRow_MissingSourceColumn_SkipsColumn()
    {
        var mappings = new List<ColumnMapping>
        {
            new("JOB_NUMBER", "ProjectId", "Trim"),
            new("NOTES", "Notes", null)   // Not in source
        };
        var mapper = new ConfigurableMapper(mappings);

        var source = new Dictionary<string, object?>
        {
            ["JOB_NUMBER"] = "2301-00"
        };

        var result = mapper.MapRow(source);

        Assert.True(result.ContainsKey("ProjectId"));
        Assert.False(result.ContainsKey("Notes"));
    }
}
```

### Integration Tests with Testcontainers (SQL Server)

```csharp
public class SqlServerIntegrationTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder()
        .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
        .Build();

    private SqlConnection _connection = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _connection = new SqlConnection(_container.GetConnectionString());
        await _connection.OpenAsync();

        // Create schema
        await ExecuteAsync(@"
            CREATE SCHEMA staging;
            CREATE SCHEMA dw;

            CREATE TABLE staging.JobCost (
                TransactionId BIGINT NOT NULL,
                ProjectId NVARCHAR(20) NOT NULL,
                CostCode NVARCHAR(10) NOT NULL,
                Amount DECIMAL(15,2) NOT NULL,
                PostingDate DATE NOT NULL,
                CostTypeCode NVARCHAR(5) NOT NULL
            );

            CREATE TABLE dw.FactJobCost (
                TransactionId BIGINT NOT NULL PRIMARY KEY,
                ProjectId NVARCHAR(20) NOT NULL,
                CostCode NVARCHAR(10) NOT NULL,
                Amount DECIMAL(15,2) NOT NULL,
                PostingDate DATE NOT NULL,
                CostTypeCode NVARCHAR(5) NOT NULL,
                LoadedAtUtc DATETIME2 NOT NULL,
                ModifiedAtUtc DATETIME2 NULL,
                RowHash CHAR(64) NULL
            );");
    }

    public async Task DisposeAsync()
    {
        await _connection.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task MergeLoader_InsertsNewRows()
    {
        // Arrange: load staging data
        await InsertStagingRow(1, "2301-00", "03100", 1500m, "2026-03-15", "L");
        await InsertStagingRow(2, "2301-00", "03200", 2500m, "2026-03-15", "M");

        var loader = new MergeLoader(_connection,
            NullLogger<MergeLoader>.Instance);

        // Act
        var result = await loader.MergeAsync(
            "dw.FactJobCost",
            "staging.JobCost",
            new[] { "TransactionId" },
            new[] { "ProjectId", "CostCode", "Amount", "PostingDate", "CostTypeCode" },
            CancellationToken.None);

        // Assert
        Assert.Equal(2, result.Inserted);
        Assert.Equal(0, result.Updated);

        var rows = await QueryAsync("SELECT COUNT(*) FROM dw.FactJobCost");
        Assert.Equal(2, rows);
    }

    [Fact]
    public async Task MergeLoader_UpdatesExistingRows()
    {
        // Arrange: insert existing row, then stage an update
        await ExecuteAsync(@"
            INSERT INTO dw.FactJobCost
                (TransactionId, ProjectId, CostCode, Amount,
                 PostingDate, CostTypeCode, LoadedAtUtc)
            VALUES
                (1, '2301-00', '03100', 1500, '2026-03-15', 'L', SYSUTCDATETIME())");

        await InsertStagingRow(1, "2301-00", "03100", 2000m, "2026-03-15", "L");

        var loader = new MergeLoader(_connection,
            NullLogger<MergeLoader>.Instance);

        // Act
        var result = await loader.MergeAsync(
            "dw.FactJobCost", "staging.JobCost",
            new[] { "TransactionId" },
            new[] { "ProjectId", "CostCode", "Amount", "PostingDate", "CostTypeCode" },
            CancellationToken.None);

        // Assert
        Assert.Equal(0, result.Inserted);
        Assert.Equal(1, result.Updated);

        var amount = await QueryScalarAsync<decimal>(
            "SELECT Amount FROM dw.FactJobCost WHERE TransactionId = 1");
        Assert.Equal(2000m, amount);
    }

    [Fact]
    public async Task MergeLoader_IsIdempotent()
    {
        // Arrange
        await InsertStagingRow(1, "2301-00", "03100", 1500m, "2026-03-15", "L");

        var loader = new MergeLoader(_connection,
            NullLogger<MergeLoader>.Instance);

        var mergeArgs = new object[]
        {
            "dw.FactJobCost", "staging.JobCost",
            new[] { "TransactionId" },
            new[] { "ProjectId", "CostCode", "Amount", "PostingDate", "CostTypeCode" }
        };

        // Act: run MERGE twice
        await loader.MergeAsync(
            "dw.FactJobCost", "staging.JobCost",
            new[] { "TransactionId" },
            new[] { "ProjectId", "CostCode", "Amount", "PostingDate", "CostTypeCode" },
            CancellationToken.None);

        await loader.MergeAsync(
            "dw.FactJobCost", "staging.JobCost",
            new[] { "TransactionId" },
            new[] { "ProjectId", "CostCode", "Amount", "PostingDate", "CostTypeCode" },
            CancellationToken.None);

        // Assert: still only 1 row
        var count = await QueryAsync("SELECT COUNT(*) FROM dw.FactJobCost");
        Assert.Equal(1, count);
    }

    private async Task InsertStagingRow(long txnId, string projectId,
        string costCode, decimal amount, string postingDate, string costType)
    {
        await ExecuteAsync($@"
            INSERT INTO staging.JobCost
                (TransactionId, ProjectId, CostCode, Amount, PostingDate, CostTypeCode)
            VALUES
                ({txnId}, '{projectId}', '{costCode}', {amount},
                 '{postingDate}', '{costType}')");
    }

    private async Task ExecuteAsync(string sql)
    {
        await using var cmd = new SqlCommand(sql, _connection);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<int> QueryAsync(string sql)
    {
        await using var cmd = new SqlCommand(sql, _connection);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<T> QueryScalarAsync<T>(string sql)
    {
        await using var cmd = new SqlCommand(sql, _connection);
        return (T)(await cmd.ExecuteScalarAsync())!;
    }
}
```

### Test Data Factory

```csharp
public class JobCostBuilder
{
    private string _jobNumber = "2301-00";
    private string _costCode = "03100";
    private decimal _amount = 1500m;
    private DateTime _postingDate = new(2026, 3, 15);
    private string _costType = "L";
    private long _transactionId = 1;

    public JobCostBuilder WithJobNumber(string value)
    {
        _jobNumber = value;
        return this;
    }

    public JobCostBuilder WithCostCode(string value)
    {
        _costCode = value;
        return this;
    }

    public JobCostBuilder WithAmount(decimal value)
    {
        _amount = value;
        return this;
    }

    public JobCostBuilder WithPostingDate(DateTime value)
    {
        _postingDate = value;
        return this;
    }

    public JobCostBuilder WithCostType(string value)
    {
        _costType = value;
        return this;
    }

    public JobCostBuilder WithTransactionId(long value)
    {
        _transactionId = value;
        return this;
    }

    public RawJobCost Build() => new()
    {
        TransactionId = _transactionId,
        JobNumber = _jobNumber,
        CostCode = _costCode,
        Amount = _amount,
        PostingDate = _postingDate,
        CostType = _costType
    };

    public IReadOnlyList<RawJobCost> BuildMany(int count)
    {
        return Enumerable.Range(0, count)
            .Select(i => new RawJobCost
            {
                TransactionId = _transactionId + i,
                JobNumber = _jobNumber,
                CostCode = _costCode,
                Amount = _amount + (i * 10m),
                PostingDate = _postingDate.AddDays(i % 30),
                CostType = _costType
            })
            .ToList();
    }
}

// Usage:
var rows = new JobCostBuilder()
    .WithJobNumber("2301-00")
    .WithCostType("L")
    .BuildMany(1000);

var edgeCases = new[]
{
    new JobCostBuilder().WithJobNumber("  2301-00  ").Build(),   // Padded
    new JobCostBuilder().WithJobNumber("").Build(),               // Empty
    new JobCostBuilder().WithAmount(0m).Build(),                  // Zero amount
    new JobCostBuilder().WithAmount(-500m).Build(),               // Negative
    new JobCostBuilder().WithAmount(99999999.99m).Build(),        // Max precision
};
```

### Testing Hash-Based Change Detection

```csharp
public class HashChangeDetectorTests
{
    [Fact]
    public void DetectChanges_NewRow_Detected()
    {
        var detector = new HashChangeDetector();
        var rows = new List<CleanJobCost>
        {
            new() { JobKey = "2301-00", CostCode = "03100",
                     Amount = 1500m,
                     PostingDate = new DateOnly(2026, 3, 15),
                     CostType = CostType.Labor }
        };

        var existingHashes = new Dictionary<string, string>();

        var changes = detector.DetectChanges(rows, existingHashes);

        Assert.Single(changes);
    }

    [Fact]
    public void DetectChanges_UnchangedRow_NotDetected()
    {
        var detector = new HashChangeDetector();
        var row = new CleanJobCost
        {
            JobKey = "2301-00", CostCode = "03100",
            Amount = 1500m,
            PostingDate = new DateOnly(2026, 3, 15),
            CostType = CostType.Labor
        };

        var hash = HashChangeDetector.ComputeRowHash(row);
        var existingHashes = new Dictionary<string, string>
        {
            ["2301-00|03100|2026-03-15"] = hash
        };

        var changes = detector.DetectChanges(
            new List<CleanJobCost> { row }, existingHashes);

        Assert.Empty(changes);
    }

    [Fact]
    public void DetectChanges_AmountChanged_Detected()
    {
        var detector = new HashChangeDetector();
        var row = new CleanJobCost
        {
            JobKey = "2301-00", CostCode = "03100",
            Amount = 2000m,   // Changed from 1500
            PostingDate = new DateOnly(2026, 3, 15),
            CostType = CostType.Labor
        };

        var oldRow = row with { Amount = 1500m };
        var oldHash = HashChangeDetector.ComputeRowHash(oldRow);
        var existingHashes = new Dictionary<string, string>
        {
            ["2301-00|03100|2026-03-15"] = oldHash
        };

        var changes = detector.DetectChanges(
            new List<CleanJobCost> { row }, existingHashes);

        Assert.Single(changes);
    }
}
```

### Testing the Dependency Resolver

```csharp
public class DependencyResolverTests
{
    private readonly DependencyResolver _sut = new();

    [Fact]
    public void Resolve_NoDependencies_SingleGroup()
    {
        var tables = new[]
        {
            CreateTable("DimProject", dependsOn: Array.Empty<string>()),
            CreateTable("DimCostCode", dependsOn: Array.Empty<string>()),
        };

        var groups = _sut.Resolve(tables);

        Assert.Single(groups);
        Assert.Equal(2, groups[0].Count);
    }

    [Fact]
    public void Resolve_FactDependsOnDim_TwoGroups()
    {
        var tables = new[]
        {
            CreateTable("DimProject", dependsOn: Array.Empty<string>()),
            CreateTable("FactJobCost", dependsOn: new[] { "DimProject" }),
        };

        var groups = _sut.Resolve(tables);

        Assert.Equal(2, groups.Count);
        Assert.Equal("DimProject", groups[0][0].TargetTable);
        Assert.Equal("FactJobCost", groups[1][0].TargetTable);
    }

    [Fact]
    public void Resolve_CircularDependency_Throws()
    {
        var tables = new[]
        {
            CreateTable("A", dependsOn: new[] { "B" }),
            CreateTable("B", dependsOn: new[] { "A" }),
        };

        Assert.Throws<InvalidOperationException>(
            () => _sut.Resolve(tables));
    }

    private TableJob CreateTable(string name, string[] dependsOn)
        => new(
            SourceSchema: "cmic",
            SourceTable: name,
            TargetSchema: "dw",
            TargetTable: name,
            StagingTable: $"staging.{name}",
            LoadType: LoadType.Full,
            LoadStrategy: LoadStrategy.Merge,
            WatermarkColumn: null,
            WatermarkType: null,
            ChunkColumn: null,
            ChunkSize: null,
            MaxParallelism: null,
            RetryCount: null,
            MergeKeyColumns: new[] { "Id" },
            ColumnMappings: null,
            DependsOn: dependsOn,
            PostLoadSql: null,
            Enabled: true);
}
```

## Common Patterns

### Pattern 1: Arrange-Act-Assert with Test Containers

```
Arrange: start container, create schema, insert test data
Act:     run the pipeline step
Assert:  query the database and verify results
Cleanup: container is disposed automatically (IAsyncLifetime)
```

### Pattern 2: Snapshot Testing for Transforms

```csharp
[Fact]
public void Transform_ProducesExpectedSnapshot()
{
    var input = LoadFixture("raw_job_costs.json");
    var result = _transformer.Transform(input);
    var actual = JsonSerializer.Serialize(result, _jsonOptions);

    // Compare against a saved snapshot file
    var expected = File.ReadAllText("snapshots/transformed_job_costs.json");
    Assert.Equal(expected, actual);
}
```

### Pattern 3: Property-Based Testing

```csharp
[Property]
public Property Transform_NeverLosesRows_UnlessNullJobNumber(
    NonEmptyArray<NonNull<string>> jobNumbers)
{
    var input = jobNumbers.Get
        .Select((jn, i) => new RawJobCost
        {
            JobNumber = jn.Get,
            CostCode = "03100",
            Amount = 100m * (i + 1),
            PostingDate = DateTime.Today,
            CostType = "L"
        })
        .ToList();

    var result = _sut.ExecuteAsync(input, CancellationToken.None).Result;

    var expectedCount = input.Count(r =>
        !string.IsNullOrWhiteSpace(r.JobNumber));

    return (result.Count == expectedCount).ToProperty();
}
```

## Gotchas and Pitfalls

### 1. Test Container Startup Time
SQL Server container takes 10-30 seconds to start. Use `[Collection]` to share a single
container across test classes, or use `IClassFixture` for per-class sharing.

### 2. Test Data Coupling
If multiple tests share the same staging data, one test's assertions depend on another
test's cleanup. Use unique test data per test (unique transaction IDs) or truncate
between tests.

### 3. Testing Only the Happy Path
Test edge cases: null columns, empty strings, maximum decimal precision, dates at
boundary (Jan 1, Dec 31), Unicode characters in job names.

### 4. Mocking the Database Instead of Using Testcontainers
Mocking `SqlConnection` hides SQL syntax errors, type mismatches, and constraint
violations. Use Testcontainers for integration tests; use mocks only for unit tests
of non-database code.

### 5. Not Testing Idempotency
Run the load step twice with the same data and assert the row count does not double.
This catches the most common pipeline bug.

### 6. Ignoring Performance in Tests
If a transform that should process 100K rows/sec only processes 1K rows/sec, the test
passes but production fails. Add a simple timing assertion for critical transforms.

## Performance Considerations

- **Testcontainers reuse:** Use `Reuse = true` to keep containers running across test
  runs during development. This saves 10-30 seconds per run.
- **Parallel test execution:** Tests using different containers can run in parallel.
  Tests sharing a container must be serialized or use isolated schemas.
- **Test data volume:** Unit tests use small datasets (10-100 rows). Integration tests
  use medium datasets (1K-10K rows). Performance tests use production-scale datasets
  (100K+ rows) and run separately from CI.

## BNBuilders Context

### What to Test for CMiC Pipelines

| Test Type | What to Test | Example |
|-----------|-------------|---------|
| Unit | Cost type mapping | "L" -> Labor, "X" -> Other |
| Unit | Job number normalization | "  2301-00  " -> "2301-00" |
| Unit | Null handling | Null job number excluded |
| Integration | MERGE idempotency | Run twice, count stays same |
| Integration | Staging dedup | Duplicate rows reduced to one |
| Integration | Watermark update | Only advances after success |
| E2E | Full pipeline | Oracle extract -> SQL Server load |

### CMiC-Specific Edge Cases

- Job numbers with leading/trailing spaces (Oracle CHAR type)
- Cost codes with mixed case ("03100" vs "03100.00")
- Zero-amount transactions (valid in CMiC for cost transfers)
- Negative amounts (credit adjustments)
- Dates before 2000 (legacy project data)
- Unicode characters in vendor names

### CI/CD Integration

Run unit tests on every PR. Run integration tests (Testcontainers) on every merge to
main. Run E2E tests against a dev Oracle instance weekly. This balances speed with
coverage.

## Interview / Senior Dev Questions

1. **"How do you test a pipeline without access to production data?"**
   Use test data factories that generate realistic data matching production schemas and
   value distributions. For integration tests, use Testcontainers with the same database
   engine as production. For edge cases, create specific fixtures.

2. **"What is the most important pipeline test?"**
   Idempotency. Run the pipeline twice with the same input and verify the destination
   state is identical. This catches duplicates, the most common pipeline bug.

3. **"How do you test that a MERGE statement is correct?"**
   Integration test with Testcontainers: insert known rows into target, load staging,
   run MERGE, verify inserted rows exist, updated rows changed, and unchanged rows
   are untouched. Verify with specific value assertions, not just row counts.

4. **"Should you mock the database in pipeline tests?"**
   For unit tests of non-database code (transforms, mappers, validators): yes, mock.
   For integration tests of database interactions (MERGE, SqlBulkCopy, watermark
   updates): no, use Testcontainers with a real database engine.

## Quiz

### Question 1
Your transform unit test verifies that `"L"` maps to `CostType.Labor`. What other
cost type values should you test?

<details>
<summary>Show Answer</summary>

All known values: `"M"` (Material), `"S"` (Subcontract), `"E"` (Equipment),
`"O"` (Other). Plus edge cases: unknown value like `"X"`, null, empty string,
whitespace-padded values like `" L "`. Use `[Theory]` with `[InlineData]` to cover
all cases concisely.
</details>

### Question 2
You run a MERGE integration test and it passes. You run it again and get 2 rows
instead of 1. What went wrong?

<details>
<summary>Show Answer</summary>

The test did not clean up between runs. The staging table still has the row from the
first run plus the row from the second. Fix: truncate staging and target tables in the
test setup (Arrange phase), or use a fresh Testcontainer per test class.
</details>

### Question 3
Your test factory generates 100 rows with `BuildMany(100)`. The transform produces
100 rows. Is this sufficient to verify correctness?

<details>
<summary>Show Answer</summary>

**No.** Row count alone does not verify correctness. Assert specific values: the first
row has the expected job number, amount, cost type. Assert edge cases separately. Use
specific test data for each scenario rather than relying on bulk-generated data for
correctness assertions.
</details>

### Question 4
A Testcontainers integration test takes 45 seconds: 30 seconds for container startup,
15 seconds for the actual test. How do you speed this up?

<details>
<summary>Show Answer</summary>

Share the container across tests. Use `IClassFixture<T>` (xUnit) to start the container
once per test class. Use `[Collection]` to share across classes. Enable
`WithReuse(true)` to keep the container running across test runs during local
development. The 30-second startup cost is paid once instead of per-test.
</details>
