# C# 13 and 14 Language Features

*Chapter 14.2 — C# 13 and 14 Language Features*

## Overview

C# continues its annual release cadence, with C# 13 shipping alongside .NET 9 (November 2024)
and C# 14 shipping with .NET 10 (November 2025). For Data Engineers, these releases bring
features that reduce boilerplate, improve collection handling, and make code more expressive
without sacrificing performance.

This lesson covers the features most relevant to data pipeline code:

- **C# 13:** `params` collections, new `Lock` type, implicit indexer access, `\e` escape
  sequence, partial properties, overload resolution priority.
- **C# 14:** Extension members (the big one), `field` keyword, `nameof` in unbound generics,
  first-class span support, more collection expressions.

You do not need to adopt every feature immediately. Focus on the ones that eliminate repetitive
patterns in your daily code — `params` collections and extension members will likely save
you the most keystrokes.

## Core Concepts

### params Collections (C# 13)

Before C# 13, `params` only worked with arrays:

```csharp
// Old — params forces an array allocation every call
void LogColumns(params string[] columns) { }
```

Now `params` works with any collection type:

```csharp
// C# 13 — params with ReadOnlySpan (zero allocation)
void LogColumns(params ReadOnlySpan<string> columns)
{
    foreach (var col in columns)
        Console.WriteLine($"  Column: {col}");
}

// params with IEnumerable (lazy evaluation)
void ProcessColumns(params IEnumerable<string> columns)
{
    foreach (var col in columns)
        TransformColumn(col);
}

// Calling code is identical either way
LogColumns("ProjectId", "CostCode", "BudgetAmount");
```

### The `field` Keyword (C# 14)

Auto-properties now have access to their backing field via `field`, eliminating the need
for a separate private field when you only want validation in the setter:

```csharp
// Before C# 14 — you needed an explicit backing field
public class BudgetLineItem
{
    private decimal _amount;
    public decimal Amount
    {
        get => _amount;
        set
        {
            if (value < 0) throw new ArgumentException("Amount cannot be negative");
            _amount = value;
        }
    }
}

// C# 14 — use 'field' keyword directly
public class BudgetLineItem
{
    public decimal Amount
    {
        get;
        set
        {
            if (value < 0) throw new ArgumentException("Amount cannot be negative");
            field = value;
        }
    }
}
```

### Extension Members (C# 14)

This is the headline feature. Extension methods have existed since C# 3, but now you can
define extension *properties*, *static methods*, and *indexers*:

```csharp
// C# 14 — extension block syntax
public static class DataReaderExtensions
{
    extension(IDataReader reader)
    {
        // Extension property
        public bool IsEmpty => !reader.Read();

        // Extension indexer by column name with type
        public T GetValueOrDefault<T>(string columnName)
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? default! : (T)reader.GetValue(ordinal);
        }
    }
}

// Usage reads naturally
using var reader = command.ExecuteReader();
while (reader.Read())
{
    var projectId = reader.GetValueOrDefault<string>("ProjectId");
    var budget = reader.GetValueOrDefault<decimal>("BudgetAmount");
}
```

### Partial Properties (C# 13)

Source generators can now declare partial properties, matching the existing partial methods
pattern:

```csharp
// In the source-generator-generated file
public partial class ProjectEntity
{
    public partial string ProjectName { get; set; }
}

// In your hand-written file — you provide the implementation
public partial class ProjectEntity
{
    private string _projectName = "";

    public partial string ProjectName
    {
        get => _projectName;
        set
        {
            if (string.IsNullOrWhiteSpace(value))
                throw new ArgumentException("Project name required");
            _projectName = value.Trim();
        }
    }
}
```

### Collection Expressions Enhancements

Collection expressions (`[1, 2, 3]`) shipped in C# 12. C# 13/14 expand where they work:

```csharp
// Spread operator with different collection types
ReadOnlySpan<string> coreColumns = ["ProjectId", "CostCode", "Phase"];
ReadOnlySpan<string> budgetColumns = ["OriginalBudget", "RevisedBudget", "Committed"];

// Spread into a new collection
ReadOnlySpan<string> allColumns = [..coreColumns, ..budgetColumns, "PercentComplete"];
// Result: ["ProjectId", "CostCode", "Phase", "OriginalBudget", "RevisedBudget",
//          "Committed", "PercentComplete"]

// Works with dictionaries via collection expression
Dictionary<string, decimal> budgets = new()
{
    ["03-310"] = 1_500_000m,
    ["03-320"] = 750_000m,
};

// Collection expression for lists — type inferred
List<int> projectIds = [101, 102, 103, 104];
```

### Primary Constructors Recap

Primary constructors (C# 12) are now widely adopted. Quick recap for classes:

```csharp
// Primary constructor on a class — parameters are available throughout
public class CostReportGenerator(
    IDbConnection connection,
    ILogger<CostReportGenerator> logger,
    CostReportOptions options)
{
    public async Task<CostReport> GenerateAsync(int projectId)
    {
        logger.LogInformation("Generating cost report for project {Id}", projectId);

        var query = options.IncludeCommitted
            ? Queries.FullCostReport
            : Queries.BudgetOnlyReport;

        var rows = await connection.QueryAsync<CostRow>(query, new { projectId });
        return CostReport.FromRows(rows);
    }
}

// DI registration — nothing special
services.AddScoped<CostReportGenerator>();
```

## Code Examples

### Building a Typed CSV Reader with New Features

Combining `params`, collection expressions, and extension members:

```csharp
using System.Globalization;

// Extension members for string parsing (C# 14)
public static class StringParsingExtensions
{
    extension(string s)
    {
        public decimal ToDecimalOrZero()
        {
            return decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture,
                out var result) ? result : 0m;
        }

        public DateOnly? ToDateOnlyOrNull(string format = "yyyy-MM-dd")
        {
            return DateOnly.TryParseExact(s, format, out var result) ? result : null;
        }
    }
}

// CSV reader using params collections
public class CsvBudgetReader
{
    // params ReadOnlySpan — no allocation for the column list
    public static IEnumerable<BudgetRow> ReadWithColumns(
        string filePath,
        params ReadOnlySpan<string> requiredColumns)
    {
        using var reader = new StreamReader(filePath);
        var header = reader.ReadLine()?.Split(',') ?? [];

        // Validate required columns exist
        foreach (var col in requiredColumns)
        {
            if (!header.Contains(col))
                throw new InvalidOperationException($"Missing column: {col}");
        }

        var codeIdx = Array.IndexOf(header, "CostCode");
        var budgetIdx = Array.IndexOf(header, "BudgetAmount");
        var dateIdx = Array.IndexOf(header, "LastUpdated");

        while (reader.ReadLine() is { } line)
        {
            var fields = line.Split(',');
            yield return new BudgetRow(
                CostCode: fields[codeIdx],
                BudgetAmount: fields[budgetIdx].ToDecimalOrZero(),
                LastUpdated: fields[dateIdx].ToDateOnlyOrNull()
            );
        }
    }
}

public record BudgetRow(string CostCode, decimal BudgetAmount, DateOnly? LastUpdated);

// Usage
var rows = CsvBudgetReader.ReadWithColumns(
    "budget_export.csv",
    "CostCode", "BudgetAmount", "LastUpdated"  // params — no array needed
);
```

### Pipeline Step with Lock Type (C# 13)

The new `System.Threading.Lock` type replaces `object` for locking, with a more efficient
implementation:

```csharp
public class ThreadSafeMetricsCollector
{
    // C# 13 — dedicated Lock type (not just 'object')
    private readonly Lock _lock = new();
    private long _rowsProcessed;
    private long _errorsEncountered;
    private readonly Dictionary<string, long> _rowsBySource = new();

    public void RecordBatch(string source, int count, int errors)
    {
        // Lock.EnterScope returns a ref struct — efficient, no allocation
        lock (_lock)
        {
            _rowsProcessed += count;
            _errorsEncountered += errors;

            if (!_rowsBySource.TryAdd(source, count))
                _rowsBySource[source] += count;
        }
    }

    public PipelineMetrics GetSnapshot()
    {
        lock (_lock)
        {
            return new PipelineMetrics(
                _rowsProcessed,
                _errorsEncountered,
                new Dictionary<string, long>(_rowsBySource)
            );
        }
    }
}

public record PipelineMetrics(long RowsProcessed, long Errors, Dictionary<string, long> BySource);
```

### Overload Resolution Priority (C# 13)

When you have multiple overloads and want the compiler to prefer the `Span`-based one:

```csharp
using System.Runtime.CompilerServices;

public static class DataTransforms
{
    // The compiler will prefer this overload when both match
    [OverloadResolutionPriority(1)]
    public static decimal Sum(ReadOnlySpan<decimal> values)
    {
        decimal total = 0;
        foreach (var v in values)
            total += v;
        return total;
    }

    // Fallback for IEnumerable (e.g., LINQ results)
    public static decimal Sum(IEnumerable<decimal> values)
    {
        return values.Aggregate(0m, (acc, v) => acc + v);
    }
}

// This calls the Span overload — zero allocation
decimal[] budgets = [100_000m, 250_000m, 500_000m];
var total = DataTransforms.Sum(budgets);
```

## Common Patterns

### Feature Adoption Priority for Data Engineers

| Priority | Feature | Why |
|----------|---------|-----|
| High | `params` collections | Eliminates array allocations in frequently called helpers |
| High | Extension members | Cleaner data-access extension APIs |
| High | `field` keyword | Less boilerplate in domain models with validation |
| Medium | Collection expressions | Cleaner collection initialization |
| Medium | Primary constructors | Simpler DI in pipeline services |
| Low | `Lock` type | Only if you have concurrent pipeline code |
| Low | Partial properties | Mainly for source generator authors |

### Migrating Extension Methods to Extension Members

```csharp
// Old style — still valid, but verbose
public static class OldExtensions
{
    public static bool IsActive(this Project project)
        => project.Status == ProjectStatus.Active;
}

// New style (C# 14)
public static class NewExtensions
{
    extension(Project project)
    {
        public bool IsActive => project.Status == ProjectStatus.Active;
        public TimeSpan Duration => project.EndDate - project.StartDate;
        public bool IsOverBudget => project.ActualCost > project.Budget;
    }
}

// Both styles can coexist during migration
```

## Gotchas and Pitfalls

1. **`field` keyword conflicts** — If you have a variable or parameter named `field` in
   a property accessor, it now has special meaning. Rename your variable or use `@field`
   to escape it.

2. **`params ReadOnlySpan<T>` lifetime** — The span is only valid for the duration of the
   method call. Do not store it in a field or return it.

3. **Extension members and ambiguity** — If two extension blocks define the same member
   name for the same type, you get a compile error. Use namespaces carefully.

4. **Primary constructor parameter capture** — Parameters are captured by the closure, not
   stored as fields. If you assign a primary constructor parameter to a field, you have
   two copies. This is a common source of bugs.

```csharp
// Bug: _logger and logger are separate copies
public class MyService(ILogger logger)
{
    private readonly ILogger _logger = logger;  // copy 1
    // Using 'logger' directly in methods uses copy 2 (the captured parameter)
    // Pick one approach and stick with it
}
```

5. **Collection expressions and type inference** — The compiler needs to know the target type.
   `var x = [1, 2, 3];` does not compile — you must specify the type:
   `List<int> x = [1, 2, 3];` or `int[] x = [1, 2, 3];`.

6. **C# version is tied to .NET version** — You cannot use C# 14 features while targeting
   `net8.0`. You must target `net10.0` (or use `<LangVersion>preview</LangVersion>`, which
   is not recommended for production).

## Performance Considerations

- **`params ReadOnlySpan<T>`** avoids heap allocation entirely. For a method called in a
  tight loop (e.g., validating columns per row), this eliminates millions of small array
  allocations per pipeline run.

- **`Lock` type** uses a more efficient locking primitive than `Monitor.Enter` on an `object`.
  If your pipeline aggregates metrics from parallel workers, switching to `Lock` reduces
  contention overhead.

- **Collection expressions** can target `Span<T>` and `ReadOnlySpan<T>`, which means the
  compiler can stack-allocate small collections:

```csharp
// Stack-allocated — no GC pressure
ReadOnlySpan<string> columns = ["Id", "Name", "Budget"];
```

- **Extension members** compile to the same IL as classic extension methods — there is no
  runtime overhead. They are purely a compile-time improvement.

- **`field` keyword** compiles identically to a manual backing field. Zero runtime difference.

## BNBuilders Context

### Daily Log Data Processing

BNBuilders generates daily logs from job sites. Using C# 13/14 features to process them:

```csharp
// Domain model with field keyword validation
public class DailyLog
{
    public required string ProjectNumber { get; init; }

    public decimal ManHours
    {
        get;
        set
        {
            if (value < 0 || value > 24)
                throw new ArgumentOutOfRangeException(nameof(ManHours));
            field = value;
        }
    }

    public required DateOnly LogDate { get; init; }
    public string Notes { get; set; } = "";
}

// Extension members for reporting
public static class DailyLogExtensions
{
    extension(IEnumerable<DailyLog> logs)
    {
        public decimal TotalManHours => logs.Sum(l => l.ManHours);

        public IEnumerable<DailyLog> ForProject(string projectNumber)
            => logs.Where(l => l.ProjectNumber == projectNumber);

        public Dictionary<DateOnly, decimal> HoursByDate()
            => logs.GroupBy(l => l.LogDate)
                   .ToDictionary(g => g.Key, g => g.Sum(l => l.ManHours));
    }
}

// Clean usage
List<DailyLog> allLogs = await LoadLogsAsync();
var project101Hours = allLogs.ForProject("2026-101").TotalManHours;
var hoursByDate = allLogs.ForProject("2026-101").HoursByDate();
```

### Configuration with Primary Constructors

```csharp
// Pipeline configuration — clean DI with primary constructors
public class BudgetSyncService(
    ISageClient sageClient,
    IAzureSqlRepository repository,
    ILogger<BudgetSyncService> logger,
    BudgetSyncOptions options)
{
    public async Task SyncAsync(CancellationToken ct)
    {
        logger.LogInformation("Starting budget sync for {ProjectCount} projects",
            options.ProjectNumbers.Length);

        foreach (var projectNumber in options.ProjectNumbers)
        {
            var budgetLines = await sageClient.GetBudgetLinesAsync(projectNumber, ct);
            await repository.UpsertBudgetLinesAsync(budgetLines, ct);
            logger.LogInformation("Synced {Count} lines for {Project}",
                budgetLines.Count, projectNumber);
        }
    }
}
```

## Interview / Senior Dev Questions

1. **Q: What problem does `params ReadOnlySpan<T>` solve that `params T[]` does not?**
   A: `params T[]` allocates a new array on the heap for every call, creating GC pressure.
   `params ReadOnlySpan<T>` can stack-allocate the arguments, resulting in zero heap
   allocation. For hot paths called millions of times, this is significant.

2. **Q: How do C# 14 extension members differ from classic extension methods?**
   A: Extension members use a new `extension(Type)` block syntax and support properties,
   static methods, and indexers — not just instance methods. At the IL level, they compile
   to the same static methods, so there is no runtime cost. The benefit is expressiveness:
   you can now write `reader.IsEmpty` instead of `reader.IsEmpty()`.

3. **Q: When would you use the `field` keyword vs. a full backing field?**
   A: Use `field` when you only need simple validation or transformation in the setter and
   the default getter is sufficient. Use a full backing field when you need complex logic,
   multiple fields interacting, or when the field is used by other members of the class.

4. **Q: A colleague writes `var items = [1, 2, 3];` and gets a compile error. Why?**
   A: Collection expressions require a target type. The compiler cannot infer whether you
   want `int[]`, `List<int>`, `Span<int>`, or `ImmutableArray<int>`. You must write
   `int[] items = [1, 2, 3];` or `List<int> items = [1, 2, 3];`.

## Quiz

**Question 1:** What is the key advantage of `params ReadOnlySpan<string>` over
`params string[]`?

a) It supports more than 255 arguments
b) It avoids heap allocation by using stack memory
c) It allows nullable strings
d) It enables async iteration

<details>
<summary>Answer</summary>

**b) It avoids heap allocation by using stack memory.** `ReadOnlySpan<T>` can be backed by
stack-allocated memory, meaning no array is allocated on the heap and no GC pressure is
created. This matters in hot paths.

</details>

**Question 2:** What does the `field` keyword in C# 14 refer to?

a) A database field in Entity Framework
b) The compiler-generated backing field of an auto-property
c) A reflection `FieldInfo` object
d) A field in a JSON document

<details>
<summary>Answer</summary>

**b) The compiler-generated backing field of an auto-property.** The `field` keyword gives
you direct access to the backing field within a property accessor, eliminating the need
to declare a separate private field for simple validation scenarios.

</details>

**Question 3:** Which of these is a valid C# 14 extension member?

a) `extension string ToUpper(this string s) => s.ToUpperInvariant();`
b) `extension(string s) { public int WordCount => s.Split(' ').Length; }`
c) `public static extension string.WordCount => ...;`
d) `string.extension WordCount { get; }`

<details>
<summary>Answer</summary>

**b) `extension(string s) { public int WordCount => s.Split(' ').Length; }`** — C# 14 uses
the `extension(Type name)` block syntax inside a static class. This allows defining
properties, methods, and indexers as extension members.

</details>

**Question 4:** Why does `var x = [1, 2, 3];` fail to compile?

a) Collection expressions are not supported for integers
b) The `var` keyword is deprecated in C# 14
c) The compiler cannot infer the target collection type
d) Square brackets are reserved for array access

<details>
<summary>Answer</summary>

**c) The compiler cannot infer the target collection type.** Collection expressions need a
target type (e.g., `int[]`, `List<int>`, `Span<int>`) because there are multiple valid
collection types. Use an explicit type declaration instead of `var`.

</details>

**Question 5:** A primary constructor parameter in a class is:

a) Automatically stored as a public field
b) Available throughout the class body as a captured parameter
c) Only available inside the constructor
d) Stored as a readonly property

<details>
<summary>Answer</summary>

**b) Available throughout the class body as a captured parameter.** Primary constructor
parameters are captured by the compiler and accessible in all instance members. They are
not automatically exposed as properties or fields — you must do that explicitly if needed.

</details>
