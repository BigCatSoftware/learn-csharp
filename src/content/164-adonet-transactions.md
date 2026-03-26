# Transactions in ADO.NET

*Chapter 11.5 — ADO.NET and Data Access*

## Overview

A transaction groups multiple database operations into a single atomic unit: either
all succeed (commit) or all fail (rollback). For a Data Engineer working on ETL
pipelines, data migrations, and financial data at a construction company, transactions
are not optional -- they are the difference between consistent data and corrupted data.

This lesson covers `SqlTransaction`, isolation levels, savepoints, `TransactionScope`,
distributed transactions, and the async patterns you need to write correct
transactional code.

## Core Concepts

### ACID in ADO.NET Terms

| Property      | Meaning                                | ADO.NET Mechanism            |
|---------------|----------------------------------------|------------------------------|
| Atomicity     | All or nothing                         | `Commit()` / `Rollback()`   |
| Consistency   | Data meets all constraints after txn   | SQL Server enforces          |
| Isolation     | Concurrent txns do not interfere       | `IsolationLevel` enum        |
| Durability    | Committed data survives crashes        | SQL Server write-ahead log   |

### SqlTransaction Lifecycle

```
Connection.Open()
  -> Connection.BeginTransaction(IsolationLevel)
    -> Command.Transaction = txn  (MUST assign to every command)
    -> Execute commands...
    -> txn.Commit()   OR   txn.Rollback()
Connection.Dispose()
```

### Isolation Levels

| Level               | Dirty Reads | Non-Repeatable Reads | Phantom Reads | Lock Behavior        |
|---------------------|-------------|----------------------|---------------|----------------------|
| `ReadUncommitted`   | Yes         | Yes                  | Yes           | No shared locks      |
| `ReadCommitted`     | No          | Yes                  | Yes           | Shared locks released after read |
| `RepeatableRead`    | No          | No                   | Yes           | Shared locks held to end of txn  |
| `Serializable`      | No          | No                   | No            | Range locks          |
| `Snapshot`          | No          | No                   | No            | Row versioning (tempdb) |

Default is `ReadCommitted`. For ETL pipelines that read and write to the same
database, `Snapshot` or `ReadCommitted Snapshot` avoids blocking readers while
writers hold locks.

## Code Examples

### Basic Transaction Pattern

```csharp
await using var conn = new SqlConnection(connStr);
await conn.OpenAsync();

// Begin transaction
await using var txn = (SqlTransaction)await conn.BeginTransactionAsync(
    IsolationLevel.ReadCommitted);

try
{
    // IMPORTANT: assign transaction to every command
    await using var cmd1 = new SqlCommand(
        "INSERT INTO Projects (Name, Status) VALUES (@name, @status)", conn, txn);
    cmd1.Parameters.Add("@name", SqlDbType.NVarChar, 200).Value = "New Tower";
    cmd1.Parameters.Add("@status", SqlDbType.NVarChar, 50).Value = "Active";
    await cmd1.ExecuteNonQueryAsync();

    await using var cmd2 = new SqlCommand(
        "INSERT INTO ProjectBudgets (ProjectId, Amount) VALUES (SCOPE_IDENTITY(), @amt)",
        conn, txn);
    cmd2.Parameters.Add("@amt", SqlDbType.Decimal).Value = 2_500_000m;
    await cmd2.ExecuteNonQueryAsync();

    // Both succeeded -- commit
    await txn.CommitAsync();
}
catch (Exception ex)
{
    // Something failed -- rollback
    await txn.RollbackAsync();
    throw; // re-throw after rollback
}
```

### Forgetting to Assign the Transaction (Common Bug)

```csharp
// BUG: command not assigned to transaction
var cmd = new SqlCommand("INSERT INTO ...", conn);
// Missing: cmd.Transaction = txn;
await cmd.ExecuteNonQueryAsync();
// Throws: "ExecuteNonQuery requires the command to have a transaction
//          when the connection assigned to the command is in a pending
//          local transaction."
```

**Rule: every `SqlCommand` executed on a connection with an active transaction
must have its `Transaction` property set.** Use the 3-argument constructor:
`new SqlCommand(sql, conn, txn)`.

### Isolation Level from C#

```csharp
// Pass isolation level to BeginTransaction
await using var txn = (SqlTransaction)await conn.BeginTransactionAsync(
    IsolationLevel.Snapshot);  // requires ALTER DATABASE ... SET ALLOW_SNAPSHOT_ISOLATION ON

// Other options: ReadUncommitted (dirty reads, diagnostics only),
// ReadCommitted (default), RepeatableRead, Serializable (strongest, most blocking)
```

### Savepoints

Savepoints let you partially roll back within a transaction without aborting
the entire thing:

```csharp
await using var conn = new SqlConnection(connStr);
await conn.OpenAsync();
await using var txn = (SqlTransaction)await conn.BeginTransactionAsync();

try
{
    // Phase 1: Insert header
    await using var cmd1 = new SqlCommand(
        "INSERT INTO BatchHeaders (BatchDate) VALUES (@d)", conn, txn);
    cmd1.Parameters.Add("@d", SqlDbType.Date).Value = DateTime.Today;
    await cmd1.ExecuteNonQueryAsync();

    txn.Save("AfterHeader"); // savepoint

    try
    {
        // Phase 2: Insert details (might fail)
        await InsertDetailsAsync(conn, txn, details);
    }
    catch (SqlException)
    {
        txn.Rollback("AfterHeader"); // undo only details, keep header
        await LogErrorAsync(conn, txn, batchId, "Detail insert failed");
    }

    await txn.CommitAsync();
}
catch (Exception) { await txn.RollbackAsync(); throw; }
```

### TransactionScope (Ambient Transactions)

`TransactionScope` creates an "ambient" transaction that automatically enlists
any connection opened within its scope. No need to pass `SqlTransaction` to
every command.

```csharp
using System.Transactions;

using var scope = new TransactionScope(
    TransactionScopeOption.Required,
    new TransactionOptions
    {
        IsolationLevel = System.Transactions.IsolationLevel.ReadCommitted,
        Timeout = TimeSpan.FromMinutes(5)
    },
    TransactionScopeAsyncFlowOption.Enabled  // CRITICAL for async
);

await using var conn = new SqlConnection(connStr);
await conn.OpenAsync();  // auto-enlists in the ambient transaction

await using var cmd = new SqlCommand("INSERT INTO ...", conn);
await cmd.ExecuteNonQueryAsync();

scope.Complete();  // Commit. If Complete() is never called, rollback on Dispose.
```

**Critical: `TransactionScopeAsyncFlowOption.Enabled`.** Without this, the ambient
transaction does not flow across `await` points. Your code silently runs without
a transaction after the first `await`. This is a devastating bug.

### Async Transaction Patterns

```csharp
// Pattern 1: Explicit SqlTransaction (preferred for single-connection work)
public async Task TransferBudgetAsync(
    string connStr, int fromId, int toId, decimal amount, CancellationToken ct)
{
    await using var conn = new SqlConnection(connStr);
    await conn.OpenAsync(ct);
    await using var txn = (SqlTransaction)await conn.BeginTransactionAsync(ct);

    try
    {
        // Deduct from source -- fail if insufficient
        await using var deduct = new SqlCommand(@"
            UPDATE ProjectBudgets SET Amount = Amount - @amt
            WHERE ProjectId = @pid AND Amount >= @amt", conn, txn);
        deduct.Parameters.Add("@amt", SqlDbType.Decimal).Value = amount;
        deduct.Parameters.Add("@pid", SqlDbType.Int).Value = fromId;
        if (await deduct.ExecuteNonQueryAsync(ct) == 0)
            throw new InvalidOperationException("Insufficient budget");

        // Add to destination
        await using var add = new SqlCommand(@"
            UPDATE ProjectBudgets SET Amount = Amount + @amt
            WHERE ProjectId = @pid", conn, txn);
        add.Parameters.Add("@amt", SqlDbType.Decimal).Value = amount;
        add.Parameters.Add("@pid", SqlDbType.Int).Value = toId;
        await add.ExecuteNonQueryAsync(ct);

        await txn.CommitAsync(ct);
    }
    catch { await txn.RollbackAsync(ct); throw; }
}
```

### Error Handling: The Zombie Transaction

After connection drops or severe SQL errors, the transaction enters a "zombie" state
where `Rollback()` itself throws `InvalidOperationException`. Always wrap rollback
in a try/catch:

```csharp
catch (Exception)
{
    try { await txn.RollbackAsync(); }
    catch (InvalidOperationException) { /* zombie -- server already rolled back */ }
    throw;
}
```

### Distributed Transactions (MSDTC)

When a `TransactionScope` spans multiple SQL Server instances, it promotes to a
distributed transaction via MSDTC (2-phase commit). Important limitations:

- MSDTC must be running on the machines involved.
- **Azure SQL Database does NOT support MSDTC.**
- .NET Core on Linux has limited MSDTC support.
- Significant overhead (10-100ms per operation).

For cross-database consistency without MSDTC, use the **saga pattern** or
**outbox pattern** instead.

## Common Patterns

### Pattern: Unit of Work with Auto-Rollback

Wrap connection + transaction into a disposable unit that auto-rolls-back if
`CommitAsync` is never called:

```csharp
public class SqlUnitOfWork : IAsyncDisposable
{
    private readonly SqlConnection _conn;
    private readonly SqlTransaction _txn;
    private bool _committed;

    public static async Task<SqlUnitOfWork> CreateAsync(
        string connStr, CancellationToken ct = default)
    {
        var conn = new SqlConnection(connStr);
        await conn.OpenAsync(ct);
        var txn = (SqlTransaction)await conn.BeginTransactionAsync(ct);
        return new SqlUnitOfWork(conn, txn);
    }

    private SqlUnitOfWork(SqlConnection c, SqlTransaction t) { _conn = c; _txn = t; }

    public SqlCommand CreateCommand(string sql) => new(sql, _conn, _txn);

    public async Task CommitAsync(CancellationToken ct = default)
    {
        await _txn.CommitAsync(ct);
        _committed = true;
    }

    public async ValueTask DisposeAsync()
    {
        if (!_committed)
            try { await _txn.RollbackAsync(); } catch { /* zombie-safe */ }
        await _txn.DisposeAsync();
        await _conn.DisposeAsync();
    }
}

// Usage -- if exception occurs before CommitAsync, DisposeAsync rolls back
await using var uow = await SqlUnitOfWork.CreateAsync(connStr);
await using var cmd1 = uow.CreateCommand("INSERT INTO ...");
await cmd1.ExecuteNonQueryAsync();
await uow.CommitAsync();
```

### Pattern: ETL Batch with Checkpoint Savepoints

Use the same savepoint technique in a loop -- save before each batch, rollback on
failure, continue processing. This lets you commit all successful batches while
logging failures, without aborting the entire load.

## Gotchas and Pitfalls

1. **Forgetting `TransactionScopeAsyncFlowOption.Enabled`.** Without it,
   `TransactionScope` does not flow across `await`. Your code silently runs
   without a transaction. This is arguably the worst gotcha in ADO.NET.

2. **Not assigning `cmd.Transaction = txn`.** Every command on a connection with
   an active transaction must have the transaction assigned. Otherwise you get an
   `InvalidOperationException`.

3. **Long-running transactions hold locks.** A transaction that runs for 5 minutes
   holds locks the entire time, blocking other queries. Keep transactions as short
   as possible. Do transformations outside the transaction; only do the writes inside.

4. **Deadlocks.** Two transactions acquiring locks in different order causes a
   deadlock. SQL Server kills one (the "deadlock victim"). Always handle error
   1205 with retry logic.

5. **Nested `BeginTransaction` throws.** SQL Server does not support nested
   transactions via ADO.NET. Use savepoints instead, or `TransactionScope` with
   `TransactionScopeOption.Required` (which reuses the ambient transaction).

6. **TransactionScope timeout default is 1 minute.** For ETL operations, this is
   far too short. Set it explicitly. The machine-wide maximum is controlled by
   `machine.config` (`maxTimeout`), which defaults to 10 minutes.

7. **`Commit()` after `Rollback()` throws.** Once rolled back, calling `Commit()`
   throws `InvalidOperationException`.

8. **Connection pooling and transactions.** A connection with an active transaction
   is not returned to the pool until commit/rollback. Forgetting both leaks it.

## Performance Considerations

- **Keep transactions short.** Read data, compute transformations, THEN open a
  transaction, write, and commit. Do not hold a transaction open during CPU-bound
  work or API calls.

- **Use Snapshot Isolation for read-heavy workloads.** It avoids reader-writer
  blocking at the cost of tempdb usage for row versioning.

- **Batch writes within a transaction.** 10,000 individual INSERTs in a transaction
  is slower than one `SqlBulkCopy` call. The transaction still provides atomicity,
  but bulk operations have far less overhead per row.

- **Savepoints add minimal overhead.** Use them for partial rollback in batch
  processing. The cost is negligible compared to the value of not losing an
  entire batch due to one bad record.

- **`TransactionScope` promotion cost.** If a `TransactionScope` promotes to
  MSDTC (distributed), latency increases significantly (10-100ms per operation).
  Avoid promotion by using a single connection within the scope when possible.

- **Deadlock prevention.** Access tables in consistent order. Use `UPDLOCK` hints
  when you read-then-update to avoid conversion deadlocks.

## BNBuilders Context

Transactions are critical in BNBuilders' data operations:

- **Cost data loading.** When loading monthly cost data from Sage, the entire batch
  must succeed or fail atomically. If 999 of 1,000 cost lines load but one fails
  due to a constraint violation, you do not want a partial load. Wrap the batch in
  a transaction.

- **Budget transfers.** Moving budget between cost codes or projects must be atomic.
  Deducting from one and adding to another must both succeed. Use the transfer
  pattern shown above.

- **Reporting table refresh.** Truncate-and-reload of aggregation tables must be
  atomic so Power BI always sees complete data.

- **ETL error handling.** Use savepoints to skip bad records without aborting the
  entire batch. Load what you can, log what you cannot, and commit the successful
  portion.

- **Isolation level choice.** For the nightly ETL that reads from production and
  writes to a staging database, use `Snapshot` isolation on the read side so the
  ETL does not block daytime users. Use `ReadCommitted` on the write side
  (staging has no concurrent readers during ETL).

## Interview / Senior Dev Questions

1. **What happens if you `await` inside a `TransactionScope` without
   `TransactionScopeAsyncFlowOption.Enabled`?** The ambient transaction is stored
   in `CallContext`, which does not flow across async continuations. After the first
   `await`, the code runs without a transaction -- writes are auto-committed.
   This is silent and devastating.

2. **How do you handle deadlocks in ADO.NET?** Catch `SqlException` where
   `Number == 1205`, rollback the transaction, wait briefly, and retry. Limit
   retries (3-5). Also fix the root cause: ensure consistent lock ordering and
   use appropriate isolation levels.

3. **When would you use savepoints vs. separate transactions?** Savepoints let you
   partially rollback within a single transaction. Use them for batch processing
   where you want to skip bad records but commit good ones in a single atomic unit.
   Separate transactions are appropriate when operations are truly independent.

4. **Why does `TransactionScope` sometimes promote to MSDTC, and how do you prevent
   it?** It promotes when a second connection to a different server is opened within
   the scope. Prevent it by using a single connection, or by ensuring both connections
   target the same SQL Server instance (same server, potentially different databases
   on SQL Server 2008+).

5. **Explain the trade-offs of Snapshot Isolation.** Benefits: readers do not block
   writers, writers do not block readers, no dirty/phantom/non-repeatable reads.
   Costs: tempdb stores row versions (can grow large), update conflicts must be
   handled (optimistic concurrency), slight overhead per write operation.

## Quiz

### Question 1
You run this code and the INSERT is committed even though `scope.Complete()` is
never called. Why?

```csharp
using var scope = new TransactionScope();

await using var conn = new SqlConnection(connStr);
await conn.OpenAsync();

await using var cmd = new SqlCommand("INSERT INTO ...", conn);
await cmd.ExecuteNonQueryAsync();

// scope.Complete() intentionally omitted
```

<details>
<summary>Answer</summary>

The `TransactionScope` was created without `TransactionScopeAsyncFlowOption.Enabled`.
The ambient transaction does not flow across the `await conn.OpenAsync()` call. The
connection opens outside the transaction context, so the INSERT auto-commits.

Fix: `new TransactionScope(TransactionScopeAsyncFlowOption.Enabled)` or use the
overload that takes `TransactionScopeOption`, `TransactionOptions`, and the async
flow option.
</details>

### Question 2
What is a "zombie transaction" and how do you handle it?

<details>
<summary>Answer</summary>

A zombie transaction occurs when the underlying connection is broken (network failure,
server kill) while a transaction is active. The `SqlTransaction` object still exists
in C#, but the server-side transaction is gone. Calling `Rollback()` on a zombie
transaction throws `InvalidOperationException`.

Handle it with a try/catch around the `Rollback()` call:

```csharp
catch (Exception)
{
    try { await txn.RollbackAsync(); }
    catch (InvalidOperationException) { /* zombie -- already gone */ }
    throw;
}
```
</details>

### Question 3
Your ETL pipeline loads 50,000 records. If one record fails a constraint violation,
you want to skip it and continue loading the rest. How do you implement this without
losing atomicity for the successful records?

<details>
<summary>Answer</summary>

Use savepoints within a single transaction:

1. Begin a transaction.
2. Before each record (or batch of records), call `txn.Save("checkpoint")`.
3. If a record fails, call `txn.Rollback("checkpoint")` to undo just that record.
4. Log the error and continue with the next record.
5. After all records are processed, call `txn.Commit()`.

This way, all successful records are committed atomically, and failed records are
individually rolled back to their savepoint without affecting the rest.
</details>

### Question 4
Why should you avoid holding a transaction open during a long-running CPU computation
or external API call?

<details>
<summary>Answer</summary>

Transactions hold database locks for their entire duration. While the transaction is
open:
- Other queries that need those rows are blocked (causing timeouts).
- The transaction log cannot be truncated past the oldest open transaction (log growth).
- Connection pool resources are consumed (the connection cannot be reused).

Best practice: read data, close the transaction, do the computation, then open a new
transaction for the write. Only hold transactions open for the minimum necessary
database operations.
</details>
