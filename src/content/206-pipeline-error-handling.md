# Pipeline Error Handling

*Chapter 13.7 — Data Engineering Patterns in C#*

## Overview

Data pipelines fail. Oracle goes down for maintenance. Network connections drop. A
single malformed row in 15 million causes a type conversion exception. The difference
between a junior and senior data engineer is not whether pipelines fail, but how they
fail: gracefully, observably, and recoverably.

This lesson covers dead letter queues for poison rows, retry with exponential backoff,
partial failure handling (do not lose 999,999 good rows because of 1 bad one), circuit
breakers to stop hammering a failing dependency, and how to compose these patterns in
C# ETL pipelines.

## Core Concepts

### Dead Letter Queue (DLQ)
A holding area for rows that fail processing. Instead of crashing the pipeline, bad
rows are diverted to a DLQ table for later inspection and remediation. The pipeline
continues processing good rows.

### Retry with Exponential Backoff
Transient failures (network timeout, connection reset) often resolve on their own.
Retry the operation with increasing delays: 1s, 2s, 4s, 8s. This avoids overwhelming
a recovering service while giving it time to stabilize.

### Poison Messages
Rows or batches that consistently fail regardless of retries. After N retry attempts,
they must be sent to the DLQ, not retried forever.

### Partial Failure
When a batch of 10,000 rows has 3 that fail transformation, you should load the 9,997
good rows and DLQ the 3 bad ones. Not all-or-nothing.

### Circuit Breaker
When a dependency is consistently failing (Oracle down, SQL Server unreachable), stop
sending requests entirely for a cooldown period. This prevents resource exhaustion from
endless retry loops and gives the dependency time to recover.

## Code Examples

### Dead Letter Queue Table

```sql
CREATE TABLE etl.DeadLetterQueue (
    Id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    PipelineName    NVARCHAR(128)   NOT NULL,
    TableName       NVARCHAR(128)   NOT NULL,
    StepName        NVARCHAR(128)   NOT NULL,
    ErrorMessage    NVARCHAR(MAX)   NOT NULL,
    ErrorType       NVARCHAR(256)   NOT NULL,
    RowData         NVARCHAR(MAX)   NULL,   -- JSON serialized row
    RetryCount      INT             NOT NULL DEFAULT 0,
    CreatedAtUtc    DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    ResolvedAtUtc   DATETIME2       NULL,
    Status          NVARCHAR(20)    NOT NULL DEFAULT 'Pending'
    -- Status: Pending, Retrying, Resolved, Abandoned
);

CREATE INDEX IX_DLQ_Status ON etl.DeadLetterQueue(Status, CreatedAtUtc);
```

### Dead Letter Queue in C#

```csharp
public interface IDeadLetterQueue
{
    Task EnqueueAsync(DeadLetterEntry entry, CancellationToken ct);
    Task<IReadOnlyList<DeadLetterEntry>> GetPendingAsync(
        string tableName, int limit, CancellationToken ct);
    Task MarkResolvedAsync(long id, CancellationToken ct);
}

public record DeadLetterEntry(
    string PipelineName,
    string TableName,
    string StepName,
    string ErrorMessage,
    string ErrorType,
    string? RowDataJson,
    int RetryCount);

public class SqlDeadLetterQueue : IDeadLetterQueue
{
    private readonly SqlConnection _connection;

    public async Task EnqueueAsync(DeadLetterEntry entry, CancellationToken ct)
    {
        const string sql = @"
            INSERT INTO etl.DeadLetterQueue
                (PipelineName, TableName, StepName, ErrorMessage,
                 ErrorType, RowData, RetryCount)
            VALUES
                (@pipeline, @table, @step, @error,
                 @errorType, @rowData, @retryCount)";

        await using var cmd = new SqlCommand(sql, _connection);
        cmd.Parameters.AddWithValue("@pipeline", entry.PipelineName);
        cmd.Parameters.AddWithValue("@table", entry.TableName);
        cmd.Parameters.AddWithValue("@step", entry.StepName);
        cmd.Parameters.AddWithValue("@error", entry.ErrorMessage);
        cmd.Parameters.AddWithValue("@errorType", entry.ErrorType);
        cmd.Parameters.AddWithValue("@rowData",
            (object?)entry.RowDataJson ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@retryCount", entry.RetryCount);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
```

### Transform with Partial Failure and DLQ

```csharp
public class ResilientTransformer
{
    private readonly IDeadLetterQueue _dlq;
    private readonly ILogger _logger;

    public async Task<TransformResult> TransformBatchAsync(
        IReadOnlyList<RawJobCost> batch,
        string pipelineName,
        CancellationToken ct)
    {
        var good = new List<CleanJobCost>();
        var errors = 0;

        foreach (var row in batch)
        {
            try
            {
                var clean = TransformRow(row);
                good.Add(clean);
            }
            catch (Exception ex)
            {
                errors++;
                _logger.LogWarning(ex,
                    "Transform failed for row {Job}/{CostCode}",
                    row.JobNumber, row.CostCode);

                await _dlq.EnqueueAsync(new DeadLetterEntry(
                    PipelineName: pipelineName,
                    TableName: "cmic.JCDETL",
                    StepName: "Transform",
                    ErrorMessage: ex.Message,
                    ErrorType: ex.GetType().FullName ?? "Unknown",
                    RowDataJson: JsonSerializer.Serialize(row),
                    RetryCount: 0), ct);
            }
        }

        if (errors > batch.Count * 0.1)
        {
            // More than 10% errors — something is systematically wrong
            throw new PipelineException(
                $"Transform error rate too high: {errors}/{batch.Count} " +
                $"({(double)errors / batch.Count:P1})");
        }

        return new TransformResult(good, errors);
    }

    private CleanJobCost TransformRow(RawJobCost raw)
    {
        // This can throw on bad data — caller catches and DLQs
        return new CleanJobCost
        {
            JobKey = raw.JobNumber?.Trim().ToUpperInvariant()
                ?? throw new InvalidDataException("Null job number"),
            CostCode = raw.CostCode?.Trim() ?? "UNKNOWN",
            Amount = raw.Amount,
            PostingDate = DateOnly.FromDateTime(raw.PostingDate),
            CostType = MapCostType(raw.CostType
                ?? throw new InvalidDataException("Null cost type"))
        };
    }
}

public record TransformResult(
    IReadOnlyList<CleanJobCost> Rows,
    int ErrorCount);
```

### Retry with Exponential Backoff

```csharp
public class RetryPolicy
{
    private readonly int _maxRetries;
    private readonly TimeSpan _baseDelay;
    private readonly double _backoffMultiplier;
    private readonly TimeSpan _maxDelay;
    private readonly ILogger _logger;

    public RetryPolicy(
        int maxRetries = 3,
        TimeSpan? baseDelay = null,
        double backoffMultiplier = 2.0,
        TimeSpan? maxDelay = null,
        ILogger? logger = null)
    {
        _maxRetries = maxRetries;
        _baseDelay = baseDelay ?? TimeSpan.FromSeconds(1);
        _backoffMultiplier = backoffMultiplier;
        _maxDelay = maxDelay ?? TimeSpan.FromSeconds(30);
        _logger = logger ?? NullLogger.Instance;
    }

    public async Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        Func<Exception, bool>? isRetryable = null,
        CancellationToken ct = default)
    {
        isRetryable ??= IsTransientException;

        for (int attempt = 0; ; attempt++)
        {
            try
            {
                return await operation(ct);
            }
            catch (Exception ex) when (attempt < _maxRetries && isRetryable(ex))
            {
                var delay = CalculateDelay(attempt);
                _logger.LogWarning(ex,
                    "Attempt {Attempt}/{MaxRetries} failed, " +
                    "retrying in {Delay}ms: {Message}",
                    attempt + 1, _maxRetries, delay.TotalMilliseconds,
                    ex.Message);

                await Task.Delay(delay, ct);
            }
        }
    }

    private TimeSpan CalculateDelay(int attempt)
    {
        // Exponential backoff with jitter
        var exponential = _baseDelay * Math.Pow(_backoffMultiplier, attempt);
        var capped = TimeSpan.FromMilliseconds(
            Math.Min(exponential.TotalMilliseconds, _maxDelay.TotalMilliseconds));

        // Add jitter (0-25% random variation) to prevent thundering herd
        var jitter = Random.Shared.NextDouble() * 0.25;
        return capped * (1 + jitter);
    }

    private static bool IsTransientException(Exception ex) => ex switch
    {
        OracleException ore => ore.Number is
            12170 or   // TNS:Connect timeout
            12541 or   // TNS:no listener
            3113 or    // end-of-file on communication channel
            3135,      // connection lost contact
        SqlException sqle => sqle.Number is
            -2 or      // Timeout
            53 or      // Named pipe error
            233 or     // Connection closed
            10054 or   // Connection reset
            10061,     // Connection refused
        TimeoutException => true,
        HttpRequestException => true,
        IOException => true,
        _ => false
    };
}
```

### Circuit Breaker

```csharp
public class CircuitBreaker
{
    private readonly int _failureThreshold;
    private readonly TimeSpan _cooldownPeriod;
    private readonly ILogger _logger;

    private int _failureCount;
    private DateTime _lastFailureUtc;
    private CircuitState _state = CircuitState.Closed;
    private readonly object _lock = new();

    public CircuitBreaker(
        int failureThreshold = 5,
        TimeSpan? cooldownPeriod = null,
        ILogger? logger = null)
    {
        _failureThreshold = failureThreshold;
        _cooldownPeriod = cooldownPeriod ?? TimeSpan.FromMinutes(2);
        _logger = logger ?? NullLogger.Instance;
    }

    public CircuitState State
    {
        get
        {
            lock (_lock)
            {
                if (_state == CircuitState.Open &&
                    DateTime.UtcNow - _lastFailureUtc > _cooldownPeriod)
                {
                    _state = CircuitState.HalfOpen;
                    _logger.LogInformation(
                        "Circuit breaker transitioning to HalfOpen");
                }
                return _state;
            }
        }
    }

    public async Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        CancellationToken ct)
    {
        if (State == CircuitState.Open)
        {
            throw new CircuitBreakerOpenException(
                $"Circuit is open. Retry after {_cooldownPeriod}");
        }

        try
        {
            var result = await operation(ct);

            lock (_lock)
            {
                _failureCount = 0;
                _state = CircuitState.Closed;
            }

            return result;
        }
        catch (Exception ex)
        {
            lock (_lock)
            {
                _failureCount++;
                _lastFailureUtc = DateTime.UtcNow;

                if (_failureCount >= _failureThreshold)
                {
                    _state = CircuitState.Open;
                    _logger.LogError(
                        "Circuit breaker OPEN after {Count} failures: {Error}",
                        _failureCount, ex.Message);
                }
            }

            throw;
        }
    }
}

public enum CircuitState { Closed, Open, HalfOpen }

public class CircuitBreakerOpenException : Exception
{
    public CircuitBreakerOpenException(string message)
        : base(message) { }
}
```

### Composing Error Handling in a Pipeline

```csharp
public class ResilientPipeline
{
    private readonly RetryPolicy _retryPolicy;
    private readonly CircuitBreaker _oracleBreaker;
    private readonly CircuitBreaker _sqlServerBreaker;
    private readonly IDeadLetterQueue _dlq;
    private readonly ILogger _logger;

    public async Task<PipelineResult> RunAsync(
        TableConfig config, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var totalRows = 0;
        var totalErrors = 0;

        // Extract with retry and circuit breaker
        var chunks = await _retryPolicy.ExecuteAsync(
            token => _oracleBreaker.ExecuteAsync(
                t => GetChunksAsync(config, t), token),
            ct: ct);

        // Process each chunk independently
        foreach (var chunk in chunks)
        {
            try
            {
                // Extract chunk with retry
                var raw = await _retryPolicy.ExecuteAsync(
                    token => ExtractChunkAsync(config, chunk, token),
                    ct: ct);

                // Transform with partial failure handling
                var result = await TransformWithDlqAsync(
                    raw, config.PipelineName, ct);

                totalErrors += result.ErrorCount;

                if (result.Rows.Count > 0)
                {
                    // Load with retry
                    await _retryPolicy.ExecuteAsync(
                        token => _sqlServerBreaker.ExecuteAsync(
                            t => LoadAsync(result.Rows, config, t), token),
                        ct: ct);

                    totalRows += result.Rows.Count;
                }
            }
            catch (CircuitBreakerOpenException)
            {
                _logger.LogError(
                    "Circuit breaker open — aborting remaining chunks");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Chunk {Chunk} failed after all retries", chunk);
                // Continue to next chunk — partial pipeline success
            }
        }

        return new PipelineResult(
            config.TableName,
            totalRows,
            totalErrors,
            sw.Elapsed);
    }
}
```

### Error Rate Monitoring

```csharp
public class ErrorRateMonitor
{
    private readonly int _windowSize;
    private readonly double _threshold;
    private readonly ConcurrentQueue<bool> _results = new();

    public ErrorRateMonitor(int windowSize = 1000, double threshold = 0.05)
    {
        _windowSize = windowSize;
        _threshold = threshold;
    }

    public void RecordSuccess()
    {
        _results.Enqueue(true);
        TrimWindow();
    }

    public void RecordFailure()
    {
        _results.Enqueue(false);
        TrimWindow();
        CheckThreshold();
    }

    private void TrimWindow()
    {
        while (_results.Count > _windowSize)
            _results.TryDequeue(out _);
    }

    private void CheckThreshold()
    {
        if (_results.Count < _windowSize / 2)
            return; // Not enough data yet

        var errorRate = 1.0 - (double)_results.Count(r => r) / _results.Count;

        if (errorRate > _threshold)
        {
            throw new PipelineException(
                $"Error rate {errorRate:P1} exceeds threshold {_threshold:P1}");
        }
    }
}
```

## Common Patterns

### Pattern 1: Error Escalation Hierarchy

```
Row error → DLQ the row, continue batch
Batch error → Retry batch 3x, then DLQ all rows, continue pipeline
Chunk error → Retry chunk 3x, then skip chunk, continue pipeline
Pipeline error → Circuit breaker, alert on-call
```

### Pattern 2: Structured Error Context

```csharp
public record PipelineError(
    string PipelineName,
    string StepName,
    string TableName,
    string? ChunkId,
    string? RowKey,
    string ErrorMessage,
    string ExceptionType,
    string? StackTrace,
    int AttemptNumber,
    DateTime OccurredAtUtc);
```

### Pattern 3: Compensating Actions

When a load partially succeeds and then fails, you may need to roll back the partial
load. Use transactions for small batches, or compensating deletes for large ones.

## Gotchas and Pitfalls

### 1. Retrying Non-Idempotent Operations
Retrying an INSERT without idempotent design creates duplicates. Always pair retry
with MERGE/upsert patterns.

### 2. Unbounded Retry Loops
Without a max retry count or circuit breaker, a failing pipeline retries forever,
consuming resources and generating alerts. Always set `maxRetries` and back off.

### 3. Catching Too Broadly
`catch (Exception ex) { retry; }` retries `ArgumentNullException`, which is a bug,
not a transient failure. Only retry transient exceptions (network, timeout, connection).

### 4. DLQ Table Growth
Without cleanup, the DLQ grows forever. Schedule a job to archive or purge resolved
entries older than 30 days. Alert on the count of pending entries.

### 5. Hiding Systemic Failures
If 90% of rows fail, the pipeline "succeeds" (it loaded the 10% that passed) but the
data is wrong. Set an error rate threshold (e.g., >5% fails = pipeline failure).

### 6. Jitter in Backoff
Without jitter, all retrying clients hit the server at the same time after the backoff
period (thundering herd). Always add randomized jitter to backoff delays.

## Performance Considerations

- **DLQ writes should be async and batched.** Do not write one DLQ row per failed record
  synchronously. Buffer DLQ entries and batch-insert periodically.
- **Circuit breaker avoids wasted work.** If Oracle is down, 10,000 retry attempts over
  5 minutes waste CPU and network. A circuit breaker fails fast after 5 attempts.
- **Partial failure preserves throughput.** Processing 9,997 out of 10,000 rows is
  dramatically better than processing 0 out of 10,000.
- **Error rate calculation is O(1) amortized** using a fixed-size sliding window.

## BNBuilders Context

### Oracle CMiC Maintenance Windows

CMiC Oracle may go offline for maintenance during overnight hours — exactly when ETL
jobs run. The circuit breaker pattern prevents the pipeline from hammering Oracle
during maintenance and allows it to resume automatically when the database comes back.

### SQL Server Availability

SQL Server in a Microsoft shop typically has high availability (Always On). Transient
failovers last 10-30 seconds. Retry with 3 attempts and exponential backoff handles
these seamlessly.

### Bad Data from CMiC

CMiC allows free-text fields that occasionally contain invalid characters, unexpected
nulls, or out-of-range dates. The DLQ pattern captures these rows without blocking
the pipeline. A weekly review of DLQ entries reveals systematic data quality issues
that should be fixed at the source.

### Error Alerting

Pipe DLQ counts into a Power BI dashboard or send Teams notifications (Microsoft shop)
when error rates spike. This gives the data team early warning of CMiC data issues
before business users notice stale or incorrect reports.

### Month-End Close

During month-end close, accountants post thousands of adjustments. Error rates
may temporarily spike due to unusual data patterns. Consider raising the error
threshold during the first week of each month.

## Interview / Senior Dev Questions

1. **"How do you handle a row that consistently fails transformation?"**
   After N retries, send it to the dead letter queue with full error context (error
   message, row data as JSON, step name, timestamp). A human reviews DLQ entries
   and either fixes the source data or updates the transform logic.

2. **"What is the difference between retry and circuit breaker?"**
   Retry handles transient failures on individual operations. Circuit breaker detects
   systemic failures (many operations failing) and stops all operations for a cooldown
   period. Retry is per-operation; circuit breaker is per-dependency.

3. **"How do you prevent a DLQ from hiding data quality issues?"**
   Monitor DLQ entry rate. Alert when the rate exceeds a threshold. Track DLQ entries
   by error type and table — a spike in one error type indicates a systemic issue.
   Do not treat DLQ as "fire and forget."

4. **"Why add jitter to exponential backoff?"**
   Without jitter, all clients that fail at the same time will retry at the same time
   (after the same backoff delay), creating a "thundering herd" that overwhelms the
   recovering service. Jitter spreads retries over time.

## Quiz

### Question 1
Your transform processes 100,000 rows. 50 rows have null job numbers and fail. The
pipeline stops and processes 0 rows. What pattern should you apply?

<details>
<summary>Show Answer</summary>

**Partial failure with DLQ.** Wrap each row's transform in a try/catch. On failure,
send the row to the dead letter queue and continue. Process the 99,950 good rows.
Set an error rate threshold (e.g., 10%) to fail the pipeline only if errors are
systemic, not sporadic.
</details>

### Question 2
Oracle goes down for 30-minute maintenance. Your pipeline retries every 2 seconds for
30 minutes (900 attempts). What is wrong and how do you fix it?

<details>
<summary>Show Answer</summary>

**No circuit breaker.** The pipeline wastes resources on 900 doomed connection attempts.
Fix: add a circuit breaker that opens after 5 consecutive failures with a 2-minute
cooldown. After 5 failures (~10 seconds), the circuit opens. The pipeline fails fast
for 2 minutes, then tries one probe request. If Oracle is still down, the circuit
re-opens. This reduces 900 attempts to ~15 over 30 minutes.
</details>

### Question 3
Your retry policy retries on all exceptions. A row has `amount = "not_a_number"` which
throws `FormatException` on every attempt. What happens?

<details>
<summary>Show Answer</summary>

The pipeline retries 3 times with exponential backoff, wasting ~7 seconds (1s + 2s +
4s), then fails. `FormatException` is a data quality issue, not a transient failure —
retrying will never succeed. Fix: only retry transient exceptions (network, timeout,
connection errors). Send data quality exceptions directly to the DLQ without retrying.
</details>

### Question 4
You have a circuit breaker with `failureThreshold = 5` and `cooldownPeriod = 2 minutes`.
Oracle recovers after 1 minute. When does your pipeline resume?

<details>
<summary>Show Answer</summary>

**After 2 minutes** (the cooldown period), not after 1 minute. The circuit breaker
transitions to HalfOpen after the cooldown expires, then allows one probe request.
If Oracle is back, the probe succeeds and the circuit closes. The 1-minute gap between
Oracle recovery and circuit reset is unavoidable with a 2-minute cooldown. Reduce the
cooldown to 1 minute if faster recovery is needed, but shorter cooldowns risk
re-opening the circuit if the dependency is flapping.
</details>
