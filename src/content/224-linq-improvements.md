# LINQ Improvements

*Chapter 14.5 — LINQ Improvements*

## Overview

LINQ is the Swiss Army knife for Data Engineers in C#. Whether you are transforming rows
from a database, filtering API responses, or aggregating cost data, LINQ provides a
declarative syntax that reads like a query.

Across .NET 8 through .NET 10, LINQ received new methods, performance optimizations, and
better interop with modern collection types. This lesson covers:

- **New methods:** `CountBy`, `AggregateBy`, `Index`, `LeftJoin` (proposed).
- **Performance improvements:** Vectorized operations, reduced allocations, smarter
  iterator chains.
- **LINQ vs. manual loops:** When LINQ wins, when manual code wins, and how to decide
  for data-heavy workloads.

The goal is not to memorize every method — it is to know what tools exist so you reach
for the right one when building pipelines.

## Core Concepts

### New LINQ Methods in .NET 9/10

#### CountBy

Groups elements and counts per key — a one-liner replacement for `GroupBy` + `Count`:

```csharp
// Before: GroupBy + Select
var countsByCode = budgetLines
    .GroupBy(b => b.CostCode)
    .Select(g => new { Code = g.Key, Count = g.Count() })
    .ToDictionary(x => x.Code, x => x.Count);

// .NET 9+: CountBy
var countsByCode = budgetLines
    .CountBy(b => b.CostCode)
    .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);
```

`CountBy` is more efficient because it does not materialize intermediate groups — it
uses a dictionary internally and increments counts directly.

#### AggregateBy

Groups and aggregates in a single pass:

```csharp
// Before: GroupBy + Aggregate (allocates group collections)
var totalsByProject = budgetLines
    .GroupBy(b => b.ProjectId)
    .ToDictionary(
        g => g.Key,
        g => g.Sum(b => b.Amount)
    );

// .NET 9+: AggregateBy (single pass, no intermediate groups)
var totalsByProject = budgetLines
    .AggregateBy(
        keySelector: b => b.ProjectId,
        seed: 0m,
        func: (total, b) => total + b.Amount
    )
    .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);
```

#### Index

Pairs each element with its zero-based index — replaces the `Select((item, index) => ...)`
pattern:

```csharp
// Before
foreach (var (item, index) in items.Select((x, i) => (x, i)))
{
    Console.WriteLine($"Row {index}: {item}");
}

// .NET 9+: Index
foreach (var (index, item) in items.Index())
{
    Console.WriteLine($"Row {index}: {item}");
}
```

#### Chunk (Reminder — .NET 6+)

Splits a sequence into batches — essential for batch database inserts:

```csharp
var batches = budgetLines.Chunk(1000);
foreach (var batch in batches)
{
    await BulkInsertAsync(batch); // Insert 1000 rows at a time
}
```

### LINQ Performance Internals

LINQ methods are lazy (deferred execution) — they build an iterator chain that only
executes when you enumerate:

```csharp
// Nothing executes here — just builds a plan
var query = budgetLines
    .Where(b => b.Amount > 0)
    .Select(b => new { b.CostCode, b.Amount })
    .OrderBy(b => b.Amount);

// Execution happens here
var results = query.ToList(); // NOW it iterates, filters, projects, sorts
```

In .NET 9/10, the LINQ engine optimizes common patterns:

- **`Where` + `Count`** is fused into a single pass.
- **`Select` + `ToArray`** pre-sizes the output array when the source has a known count.
- **`OrderBy`** uses vectorized comparison for primitive types.
- **`Distinct`** uses `HashSet<T>` internally with better hash distribution.

## Code Examples

### Real-World: Budget Analysis Pipeline

```csharp
public record BudgetLine(
    string ProjectId,
    string CostCode,
    string Phase,
    decimal OriginalBudget,
    decimal RevisedBudget,
    decimal Committed,
    decimal ActualToDate
);

public class BudgetAnalyzer
{
    /// <summary>
    /// Produces a project-level summary using modern LINQ methods.
    /// </summary>
    public IEnumerable<ProjectSummary> Analyze(IEnumerable<BudgetLine> lines)
    {
        // AggregateBy — single pass, multiple accumulators via a tuple seed
        return lines.AggregateBy(
            keySelector: b => b.ProjectId,
            seed: (OrigBudget: 0m, Revised: 0m, Committed: 0m, Actual: 0m, LineCount: 0),
            func: (acc, b) => (
                acc.OrigBudget + b.OriginalBudget,
                acc.Revised + b.RevisedBudget,
                acc.Committed + b.Committed,
                acc.Actual + b.ActualToDate,
                acc.LineCount + 1
            ))
            .Select(kvp => new ProjectSummary(
                ProjectId: kvp.Key,
                TotalOriginalBudget: kvp.Value.OrigBudget,
                TotalRevisedBudget: kvp.Value.Revised,
                TotalCommitted: kvp.Value.Committed,
                TotalActual: kvp.Value.Actual,
                LineCount: kvp.Value.LineCount,
                VariancePercent: kvp.Value.Revised == 0
                    ? 0
                    : (kvp.Value.Actual - kvp.Value.Revised) / kvp.Value.Revised * 100
            ))
            .OrderByDescending(s => Math.Abs(s.VariancePercent));
    }
}

public record ProjectSummary(
    string ProjectId,
    decimal TotalOriginalBudget,
    decimal TotalRevisedBudget,
    decimal TotalCommitted,
    decimal TotalActual,
    int LineCount,
    decimal VariancePercent
);
```

### CountBy for Data Quality Checks

```csharp
public class DataQualityChecker
{
    public DataQualityReport Check(IEnumerable<BudgetLine> lines)
    {
        var linesList = lines.ToList(); // materialize once for multiple passes

        // CountBy — how many lines per phase?
        var phaseDistribution = linesList
            .CountBy(b => b.Phase)
            .OrderByDescending(kvp => kvp.Value)
            .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);

        // CountBy — identify duplicate cost codes within a project
        var duplicates = linesList
            .CountBy(b => (b.ProjectId, b.CostCode))
            .Where(kvp => kvp.Value > 1)
            .Select(kvp => $"{kvp.Key.ProjectId}/{kvp.Key.CostCode}: {kvp.Value} entries")
            .ToList();

        // Index — find row numbers of negative budgets
        var negativeBudgetRows = linesList
            .Index()
            .Where(x => x.Item < 0 || x.Item.OriginalBudget < 0)
            .Select(x => x.Index)
            .ToList();

        return new DataQualityReport(
            TotalRows: linesList.Count,
            PhaseDistribution: phaseDistribution,
            DuplicateCostCodes: duplicates,
            NegativeBudgetRows: negativeBudgetRows
        );
    }
}

public record DataQualityReport(
    int TotalRows,
    Dictionary<string, int> PhaseDistribution,
    List<string> DuplicateCostCodes,
    List<int> NegativeBudgetRows
);
```

### LINQ vs Manual Loop: Side-by-Side

```csharp
// Scenario: Sum amounts by cost code for a large dataset

// === LINQ approach (readable, slightly slower for very large sets) ===
public Dictionary<string, decimal> SumByCodeLinq(List<BudgetLine> lines)
{
    return lines
        .AggregateBy(
            b => b.CostCode,
            seed: 0m,
            func: (sum, b) => sum + b.ActualToDate)
        .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);
}

// === Manual loop (faster for 10M+ rows, less readable) ===
public Dictionary<string, decimal> SumByCodeManual(List<BudgetLine> lines)
{
    var result = new Dictionary<string, decimal>(capacity: lines.Count / 10);

    foreach (var line in lines)
    {
        ref var value = ref System.Runtime.InteropServices.CollectionsMarshal
            .GetValueRefOrAddDefault(result, line.CostCode, out _);
        value += line.ActualToDate;
    }

    return result;
}

// === When to use which? ===
// < 100K rows:  LINQ (readability wins, perf difference negligible)
// 100K - 1M:    LINQ with AggregateBy (good balance)
// > 1M rows:    Manual loop if profiling shows LINQ is the bottleneck
// > 10M rows:   Manual loop + Span + struct keys
```

### Chaining LINQ with IAsyncEnumerable

```csharp
// Process a streaming data source with LINQ-like operations
public static class AsyncLinqExtensions
{
    public static async IAsyncEnumerable<TResult> SelectAsync<T, TResult>(
        this IAsyncEnumerable<T> source,
        Func<T, TResult> selector,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await foreach (var item in source.WithCancellation(ct))
        {
            yield return selector(item);
        }
    }

    public static async IAsyncEnumerable<T> WhereAsync<T>(
        this IAsyncEnumerable<T> source,
        Func<T, bool> predicate,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await foreach (var item in source.WithCancellation(ct))
        {
            if (predicate(item))
                yield return item;
        }
    }
}

// Usage — chain async operations
var highValueRecords = CsvStreamReader
    .ReadBudgetFileAsync("budget.csv", ct)
    .WhereAsync(r => r.Amount > 100_000m, ct)
    .SelectAsync(r => new { r.CostCode, r.Amount }, ct);

await foreach (var record in highValueRecords)
{
    Console.WriteLine($"{record.CostCode}: {record.Amount:C}");
}
```

### SQL-like Join Operations

```csharp
public record Project(string Id, string Name, string Manager);
public record BudgetTotal(string ProjectId, decimal TotalBudget);

// Inner join — projects with budgets
var projectBudgets = projects
    .Join(
        budgetTotals,
        p => p.Id,
        b => b.ProjectId,
        (project, budget) => new
        {
            project.Name,
            project.Manager,
            budget.TotalBudget
        });

// Left join — all projects, even those without budgets
// Using GroupJoin + SelectMany pattern (standard approach)
var allProjectBudgets = projects
    .GroupJoin(
        budgetTotals,
        p => p.Id,
        b => b.ProjectId,
        (project, budgets) => new { project, budgets })
    .SelectMany(
        x => x.budgets.DefaultIfEmpty(),
        (x, budget) => new
        {
            x.project.Name,
            x.project.Manager,
            TotalBudget = budget?.TotalBudget ?? 0m
        });
```

## Common Patterns

### LINQ Method Decision Guide

| Need | Method | Notes |
|------|--------|-------|
| Count per group | `CountBy` (.NET 9+) | Single pass, no GroupBy overhead |
| Sum/aggregate per group | `AggregateBy` (.NET 9+) | Single pass with custom accumulator |
| Element + index | `Index` (.NET 9+) | Cleaner than `Select((x, i) => ...)` |
| Split into batches | `Chunk` (.NET 6+) | Great for batch DB inserts |
| First match or default | `FirstOrDefault` | Use with a predicate |
| Check if any match | `Any` | Short-circuits on first match |
| Distinct by property | `DistinctBy` (.NET 6+) | Avoids custom `IEqualityComparer` |
| Min/Max by property | `MinBy`/`MaxBy` (.NET 6+) | Returns the element, not the value |
| Flatten nested lists | `SelectMany` | Essential for one-to-many data |

### Materialization Strategy

```csharp
// Rule: Materialize once, query many times
var allLines = await LoadBudgetLinesAsync(); // Returns List<BudgetLine>

// Multiple queries on the same materialized data
var totalByProject = allLines.AggregateBy(b => b.ProjectId, 0m, (s, b) => s + b.Amount);
var overBudget = allLines.Where(b => b.ActualToDate > b.RevisedBudget);
var topCostCodes = allLines.CountBy(b => b.CostCode).OrderByDescending(x => x.Value).Take(10);

// Anti-pattern: DO NOT enumerate an IQueryable or IAsyncEnumerable multiple times
// Each enumeration re-executes the query / re-reads the file
```

## Gotchas and Pitfalls

1. **Deferred execution surprises** — LINQ queries do not execute until enumerated.
   If the underlying data changes between query definition and enumeration, you get
   unexpected results. Call `.ToList()` to materialize when the data is known.

2. **Multiple enumeration** — Enumerating an `IEnumerable` twice re-executes the pipeline.
   If it reads from a database or file, you get two round trips. Use `.ToList()` first.

```csharp
// Bug: lines is enumerated twice — reads the file twice!
IEnumerable<BudgetLine> lines = ReadLines("budget.csv");
var count = lines.Count();        // First enumeration
var total = lines.Sum(b => b.Amount); // Second enumeration

// Fix: materialize first
var lines = ReadLines("budget.csv").ToList();
```

3. **`OrderBy` stability** — LINQ's `OrderBy` is stable (preserves relative order of equal
   elements), but `Array.Sort` is not. If you depend on stability, stick with LINQ.

4. **`FirstOrDefault` on value types** — For `int`, `decimal`, etc., `default` is `0`,
   not `null`. Use `FirstOrDefault` with a predicate or switch to nullable types.

5. **`GroupBy` memory usage** — `GroupBy` materializes all groups in memory. For 10 million
   rows with 100K groups, each group holds a list of its elements. Prefer `CountBy` or
   `AggregateBy` when you only need the aggregate.

6. **LINQ-to-Objects vs LINQ-to-SQL** — LINQ on `IQueryable` translates to SQL; LINQ on
   `IEnumerable` runs in memory. Mixing them up means pulling entire tables into memory:

```csharp
// Bad — .ToList() pulls all rows, then filters in memory
var result = dbContext.BudgetLines.ToList().Where(b => b.Amount > 100_000);

// Good — filter in SQL
var result = dbContext.BudgetLines.Where(b => b.Amount > 100_000).ToList();
```

## Performance Considerations

### LINQ vs Manual Loop Benchmarks (Approximate, 1M rows)

| Operation | LINQ | Manual Loop | Difference |
|-----------|------|-------------|------------|
| Sum | 8ms | 6ms | LINQ is fine |
| Where + Count | 12ms | 9ms | LINQ is fine |
| GroupBy + Sum | 85ms | 35ms | Manual wins 2x |
| AggregateBy + Sum | 40ms | 35ms | Very close |
| OrderBy | 250ms | 220ms | Comparable |
| Select + ToArray | 15ms | 12ms | LINQ is fine |

Key takeaway: `AggregateBy` closes the gap between LINQ and manual loops for grouping
operations. For non-grouping operations, LINQ overhead is negligible.

### Avoiding LINQ in Hot Paths

```csharp
// In a method called per-row (millions of times), avoid LINQ
// Bad — allocates an iterator, closure, and delegate per call
bool HasHighValue(List<decimal> values) => values.Any(v => v > 1_000_000m);

// Good — simple loop, no allocations
bool HasHighValue(List<decimal> values)
{
    foreach (var v in values)
    {
        if (v > 1_000_000m) return true;
    }
    return false;
}
```

### Memory Allocation Comparison

```csharp
// GroupBy allocates: Lookup + Grouping objects + element lists
// For 1M rows with 1000 groups: ~50 MB overhead

// AggregateBy allocates: one Dictionary<TKey, TSeed>
// For 1M rows with 1000 groups: ~50 KB overhead

// That is a 1000x difference in allocation overhead
```

## BNBuilders Context

### Construction Data Analysis with LINQ

```csharp
// Real scenario: Analyzing cost distribution across project phases
public class ConstructionBudgetAnalytics
{
    public AnalyticsReport Generate(List<BudgetLine> allLines)
    {
        // Phase distribution using CountBy
        var phaseBreakdown = allLines
            .CountBy(b => b.Phase)
            .OrderByDescending(kvp => kvp.Value)
            .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);

        // Top 10 cost codes by total spend
        var topCostCodes = allLines
            .AggregateBy(b => b.CostCode, 0m, (sum, b) => sum + b.ActualToDate)
            .OrderByDescending(kvp => kvp.Value)
            .Take(10)
            .Select(kvp => new CostCodeSummary(kvp.Key, kvp.Value))
            .ToList();

        // Projects over budget (variance > 10%)
        var overBudgetProjects = allLines
            .AggregateBy(
                b => b.ProjectId,
                (Revised: 0m, Actual: 0m),
                (acc, b) => (acc.Revised + b.RevisedBudget, acc.Actual + b.ActualToDate))
            .Where(kvp => kvp.Value.Revised > 0 &&
                          (kvp.Value.Actual - kvp.Value.Revised) / kvp.Value.Revised > 0.10m)
            .Select(kvp => kvp.Key)
            .ToList();

        // Batch for reporting (1000 rows per page)
        var pagedResults = allLines
            .OrderBy(b => b.ProjectId)
            .ThenBy(b => b.CostCode)
            .Chunk(1000)
            .Select((chunk, pageIndex) => new ReportPage(pageIndex + 1, chunk))
            .ToList();

        return new AnalyticsReport(phaseBreakdown, topCostCodes, overBudgetProjects);
    }
}

public record CostCodeSummary(string CostCode, decimal TotalSpend);
public record ReportPage(int PageNumber, BudgetLine[] Lines);
public record AnalyticsReport(
    Dictionary<string, int> PhaseBreakdown,
    List<CostCodeSummary> TopCostCodes,
    List<string> OverBudgetProjects);
```

### When to Push Logic to SQL vs Use LINQ

| Scenario | Approach | Reason |
|----------|----------|--------|
| Filter 10M rows to 1K results | SQL `WHERE` | Do not pull 10M rows over the network |
| Aggregate across a table | SQL `GROUP BY` | Database has indexes and statistics |
| Transform 1K rows already in memory | LINQ | Data is local, LINQ is expressive |
| Join data from two different sources | LINQ | Cannot do cross-source joins in SQL |
| Complex business logic per row | LINQ | SQL stored procs are harder to test |

## Interview / Senior Dev Questions

1. **Q: What is the difference between `GroupBy` + `Sum` and `AggregateBy`?**
   A: `GroupBy` materializes every element into group collections, then you iterate each
   group to compute the aggregate. `AggregateBy` uses a dictionary to accumulate the
   result in a single pass, never storing individual elements. For large datasets,
   `AggregateBy` uses dramatically less memory (KB vs MB).

2. **Q: When does LINQ hurt performance, and what do you do about it?**
   A: LINQ hurts when: (a) used in a per-row hot path (delegate allocation overhead),
   (b) `GroupBy` on millions of rows (memory), (c) multiple enumeration of a database
   query. The fix depends on the case: (a) use a manual loop, (b) use `AggregateBy` or
   a manual dictionary, (c) materialize with `.ToList()` first.

3. **Q: Explain deferred execution and why it matters for data pipelines.**
   A: Deferred execution means LINQ builds an execution plan (iterator chain) without
   running it. Execution happens when you enumerate (e.g., `foreach`, `.ToList()`,
   `.Count()`). For data pipelines, this means you can compose complex queries and only
   pay the cost once at enumeration time. But it also means if the source changes between
   composition and enumeration, you get stale or inconsistent data.

4. **Q: How would you process a 50 GB dataset with LINQ?**
   A: You would not load it into memory. Use streaming (`IAsyncEnumerable`) with LINQ-like
   extension methods. Read in chunks, apply filters and transforms per chunk, and write
   results incrementally. For aggregations, use `AggregateBy` or a manual dictionary that
   accumulates across chunks.

## Quiz

**Question 1:** What is the advantage of `CountBy` over `GroupBy` + `Count`?

a) `CountBy` supports async operations
b) `CountBy` avoids materializing group elements — it only tracks counts
c) `CountBy` works on databases but `GroupBy` does not
d) `CountBy` returns a sorted result

<details>
<summary>Answer</summary>

**b) `CountBy` avoids materializing group elements.** `GroupBy` stores every element in its
group collection. `CountBy` only maintains a dictionary of key-to-count, using far less
memory for large datasets.

</details>

**Question 2:** What does `lines.Index()` return?

a) A dictionary mapping index to element
b) A sequence of `(int Index, T Item)` tuples
c) The index of the first element
d) A sorted version of the sequence

<details>
<summary>Answer</summary>

**b) A sequence of `(int Index, T Item)` tuples.** The `Index` method pairs each element
with its zero-based index, similar to Python's `enumerate()`.

</details>

**Question 3:** You call `.Where(x => x > 0)` on an `IEnumerable`. When does the filtering
actually happen?

a) Immediately when `Where` is called
b) When the result is enumerated (e.g., `foreach`, `.ToList()`)
c) When the garbage collector runs
d) After a 100ms delay

<details>
<summary>Answer</summary>

**b) When the result is enumerated.** LINQ uses deferred execution. The `Where` call returns
an iterator that stores the predicate but does not execute it. The actual filtering runs
when you enumerate the result.

</details>

**Question 4:** Which approach uses less memory for grouping 1 million rows by cost code?

a) `.GroupBy(b => b.CostCode).Select(g => new { g.Key, Total = g.Sum(x => x.Amount) })`
b) `.AggregateBy(b => b.CostCode, 0m, (sum, b) => sum + b.Amount)`
c) They use the same amount of memory
d) It depends on the number of unique cost codes

<details>
<summary>Answer</summary>

**b) `AggregateBy`.** `GroupBy` stores all 1 million elements in group lists (even though
you only need the sum). `AggregateBy` stores one entry per unique cost code in a dictionary,
with just the accumulated decimal value. The memory difference can be 1000x.

</details>
