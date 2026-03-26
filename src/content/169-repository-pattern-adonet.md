# Repository Pattern with ADO.NET

*Chapter 11.10 — ADO.NET and Data Access*

## Overview

The repository pattern abstracts data access behind an interface, decoupling your
business logic from the details of how data is stored and retrieved. Instead of
scattering `SqlConnection` and `SqlCommand` calls throughout your codebase, you
centralize them in repository classes that implement a well-defined contract.

For a data engineer building ETL services, reporting APIs, and data validation tools,
repositories bring structure to what can quickly become a tangle of inline SQL. They
also make your code testable — you can mock the repository interface in unit tests
without touching a real database.

This lesson covers interface design, generic base repositories, the Unit of Work
pattern, dependency injection, mapping strategies, and testing approaches.

## Core Concepts

### What a Repository Is (and Is Not)

**A repository IS:**
- An abstraction over data access for a specific aggregate/entity.
- A place to centralize SQL queries, parameter binding, and result mapping.
- A seam for unit testing — you mock the interface, not the database.

**A repository IS NOT:**
- A generic wrapper around every possible SQL operation (that is an anti-pattern
  called the "repository of everything").
- A replacement for the database — it does not cache or manage state.
- An ORM — it does not track changes or generate SQL.

### The Interface

```csharp
public interface IProjectRepository
{
    Task<Project?> GetByIdAsync(int projectId, CancellationToken ct = default);
    Task<IReadOnlyList<Project>> GetActiveAsync(CancellationToken ct = default);
    Task<int> CreateAsync(Project project, CancellationToken ct = default);
    Task UpdateAsync(Project project, CancellationToken ct = default);
    Task DeleteAsync(int projectId, CancellationToken ct = default);
}
```

This is a **specific** repository interface. It speaks the language of the domain
(projects), not the language of the database (connections, commands, readers).

### Generic Repository Interface

```csharp
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<IReadOnlyList<T>> GetAllAsync(CancellationToken ct = default);
    Task<int> AddAsync(T entity, CancellationToken ct = default);
    Task UpdateAsync(T entity, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}
```

**Warning:** Generic repositories are controversial. They force every entity into the
same CRUD shape, which does not reflect reality. A `CostCode` might be read-only in
your system. A `Project` might have complex queries that do not fit `GetAll`. Use
generic repositories as a **base class**, not as the public contract.

### Unit of Work

The Unit of Work pattern coordinates multiple repositories that share a single
database transaction. Instead of each repository managing its own connection and
transaction, a `UnitOfWork` object owns the connection and transaction, and
repositories borrow it.

### Dependency Injection

Repositories are registered in the DI container and injected into services. The
connection string is injected via configuration, not hard-coded.

## Code Examples

### Domain Model

```csharp
public record Project(
    int ProjectId,
    string ProjectName,
    decimal Budget,
    string Status,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? ModifiedAt);

public record CostCode(
    int CostCodeId,
    string Code,
    string Description,
    string Category);
```

### Specific Repository Interface

```csharp
public interface IProjectRepository
{
    Task<Project?> GetByIdAsync(int projectId, CancellationToken ct = default);
    Task<IReadOnlyList<Project>> GetActiveAsync(CancellationToken ct = default);
    Task<IReadOnlyList<Project>> GetByStatusAsync(string status, CancellationToken ct = default);
    Task<int> CreateAsync(Project project, CancellationToken ct = default);
    Task UpdateBudgetAsync(int projectId, decimal newBudget, CancellationToken ct = default);
    Task<bool> ExistsAsync(int projectId, CancellationToken ct = default);
}
```

### ADO.NET Implementation (Manual Mapping)

```csharp
using Microsoft.Data.SqlClient;
using System.Data;

public class AdoNetProjectRepository : IProjectRepository
{
    private readonly string _connectionString;

    public AdoNetProjectRepository(string connectionString)
        => _connectionString = connectionString;

    public async Task<Project?> GetByIdAsync(int projectId, CancellationToken ct = default)
    {
        const string sql = @"
            SELECT ProjectId, ProjectName, Budget, Status, IsActive, CreatedAt, ModifiedAt
            FROM dbo.Projects WHERE ProjectId = @ProjectId";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct).ConfigureAwait(false);
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.Add("@ProjectId", SqlDbType.Int).Value = projectId;
        await using var reader = await command.ExecuteReaderAsync(ct).ConfigureAwait(false);

        return await reader.ReadAsync(ct).ConfigureAwait(false) ? MapProject(reader) : null;
    }

    public async Task<IReadOnlyList<Project>> GetActiveAsync(CancellationToken ct = default)
    {
        const string sql = @"
            SELECT ProjectId, ProjectName, Budget, Status, IsActive, CreatedAt, ModifiedAt
            FROM dbo.Projects WHERE IsActive = 1 ORDER BY ProjectName";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct).ConfigureAwait(false);
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(ct).ConfigureAwait(false);

        var projects = new List<Project>();
        while (await reader.ReadAsync(ct).ConfigureAwait(false))
            projects.Add(MapProject(reader));
        return projects;
    }

    // GetByStatusAsync, CreateAsync, UpdateBudgetAsync, ExistsAsync follow the same
    // pattern — open connection, create command, bind parameters, execute, map result.
    // Full implementations omitted for brevity; see the Dapper version below for a
    // side-by-side comparison that shows how much boilerplate Dapper eliminates.

    private static Project MapProject(SqlDataReader reader)
    {
        return new Project(
            ProjectId:   reader.GetInt32(reader.GetOrdinal("ProjectId")),
            ProjectName: reader.GetString(reader.GetOrdinal("ProjectName")),
            Budget:      reader.GetDecimal(reader.GetOrdinal("Budget")),
            Status:      reader.GetString(reader.GetOrdinal("Status")),
            IsActive:    reader.GetBoolean(reader.GetOrdinal("IsActive")),
            CreatedAt:   reader.GetDateTime(reader.GetOrdinal("CreatedAt")),
            ModifiedAt:  reader.IsDBNull(reader.GetOrdinal("ModifiedAt"))
                            ? null
                            : reader.GetDateTime(reader.GetOrdinal("ModifiedAt")));
    }
}
```

### Dapper Implementation (Same Interface, Far Less Boilerplate)

```csharp
using Dapper;
using Microsoft.Data.SqlClient;

public class DapperProjectRepository : IProjectRepository
{
    private readonly string _connectionString;
    public DapperProjectRepository(string connectionString) => _connectionString = connectionString;

    public async Task<Project?> GetByIdAsync(int projectId, CancellationToken ct = default)
    {
        await using var db = new SqlConnection(_connectionString);
        return await db.QuerySingleOrDefaultAsync<Project>(
            @"SELECT ProjectId, ProjectName, Budget, Status, IsActive, CreatedAt, ModifiedAt
              FROM dbo.Projects WHERE ProjectId = @ProjectId",
            new { ProjectId = projectId });
    }

    public async Task<IReadOnlyList<Project>> GetActiveAsync(CancellationToken ct = default)
    {
        await using var db = new SqlConnection(_connectionString);
        return (await db.QueryAsync<Project>(
            @"SELECT ProjectId, ProjectName, Budget, Status, IsActive, CreatedAt, ModifiedAt
              FROM dbo.Projects WHERE IsActive = 1 ORDER BY ProjectName")).AsList();
    }

    public async Task<IReadOnlyList<Project>> GetByStatusAsync(
        string status, CancellationToken ct = default)
    {
        await using var db = new SqlConnection(_connectionString);
        return (await db.QueryAsync<Project>(
            @"SELECT ProjectId, ProjectName, Budget, Status, IsActive, CreatedAt, ModifiedAt
              FROM dbo.Projects WHERE Status = @Status ORDER BY ProjectName",
            new { Status = status })).AsList();
    }

    public async Task<int> CreateAsync(Project project, CancellationToken ct = default)
    {
        await using var db = new SqlConnection(_connectionString);
        return await db.QuerySingleAsync<int>(
            @"INSERT INTO dbo.Projects (ProjectName, Budget, Status, IsActive, CreatedAt)
              OUTPUT INSERTED.ProjectId
              VALUES (@ProjectName, @Budget, @Status, @IsActive, SYSUTCDATETIME())", project);
    }

    public async Task UpdateBudgetAsync(int projectId, decimal newBudget, CancellationToken ct = default)
    {
        await using var db = new SqlConnection(_connectionString);
        int rows = await db.ExecuteAsync(
            "UPDATE dbo.Projects SET Budget = @Budget, ModifiedAt = SYSUTCDATETIME() WHERE ProjectId = @ProjectId",
            new { ProjectId = projectId, Budget = newBudget });
        if (rows == 0) throw new InvalidOperationException($"Project {projectId} not found.");
    }

    public async Task<bool> ExistsAsync(int projectId, CancellationToken ct = default)
    {
        await using var db = new SqlConnection(_connectionString);
        return await db.ExecuteScalarAsync<bool>(
            "SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.Projects WHERE ProjectId = @Id) THEN 1 ELSE 0 END AS BIT)",
            new { Id = projectId });
    }
}
```

### Unit of Work Pattern

```csharp
public interface IUnitOfWork : IAsyncDisposable
{
    IProjectRepository Projects { get; }
    ICostCodeRepository CostCodes { get; }
    Task BeginTransactionAsync(CancellationToken ct = default);
    Task CommitAsync(CancellationToken ct = default);
    Task RollbackAsync(CancellationToken ct = default);
}

public class AdoNetUnitOfWork : IUnitOfWork
{
    private readonly SqlConnection _connection;
    private SqlTransaction? _transaction;

    public IProjectRepository Projects { get; }
    public ICostCodeRepository CostCodes { get; }

    public AdoNetUnitOfWork(string connectionString)
    {
        _connection = new SqlConnection(connectionString);
        Projects = new UoWProjectRepository(_connection, () => _transaction);
        CostCodes = new UoWCostCodeRepository(_connection, () => _transaction);
    }

    public async Task BeginTransactionAsync(CancellationToken ct = default)
    {
        if (_connection.State != ConnectionState.Open)
            await _connection.OpenAsync(ct).ConfigureAwait(false);
        _transaction = (SqlTransaction)await connection.BeginTransactionAsync(ct).ConfigureAwait(false);
    }

    public async Task CommitAsync(CancellationToken ct = default)
    {
        await _transaction!.CommitAsync(ct).ConfigureAwait(false);
        await _transaction.DisposeAsync(); _transaction = null;
    }

    public async Task RollbackAsync(CancellationToken ct = default)
    {
        if (_transaction is not null)
        {
            await _transaction.RollbackAsync(ct).ConfigureAwait(false);
            await _transaction.DisposeAsync(); _transaction = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_transaction is not null) await _transaction.DisposeAsync();
        await _connection.DisposeAsync();
    }
}
```

Usage — a service coordinates two repository calls in a single transaction:

```csharp
public class ProjectService(Func<IUnitOfWork> uowFactory)
{
    public async Task TransferBudgetAsync(int fromId, int toId, decimal amount, CancellationToken ct)
    {
        await using var uow = uowFactory();
        await uow.BeginTransactionAsync(ct);
        try
        {
            var from = await uow.Projects.GetByIdAsync(fromId, ct)
                ?? throw new InvalidOperationException($"Project {fromId} not found.");
            var to = await uow.Projects.GetByIdAsync(toId, ct)
                ?? throw new InvalidOperationException($"Project {toId} not found.");

            await uow.Projects.UpdateBudgetAsync(fromId, from.Budget - amount, ct);
            await uow.Projects.UpdateBudgetAsync(toId, to.Budget + amount, ct);
            await uow.CommitAsync(ct);
        }
        catch { await uow.RollbackAsync(ct); throw; }
    }
}
```

### Dependency Injection Registration

```csharp
public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddDataAccess(this IServiceCollection services, string connectionString)
    {
        services.AddScoped<IProjectRepository>(_ => new DapperProjectRepository(connectionString));
        services.AddScoped<ICostCodeRepository>(_ => new DapperCostCodeRepository(connectionString));
        services.AddTransient<IUnitOfWork>(_ => new AdoNetUnitOfWork(connectionString));
        return services;
    }
}
```

### Unit Testing with Moq

```csharp
using Moq;
using Xunit;

public class ProjectServiceTests
{
    [Fact]
    public async Task TransferBudget_UpdatesBothProjects()
    {
        var mockRepo = new Mock<IProjectRepository>();
        mockRepo.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Project(1, "Alpha", 100_000m, "Active", true, DateTime.UtcNow, null));
        mockRepo.Setup(r => r.GetByIdAsync(2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Project(2, "Beta", 50_000m, "Active", true, DateTime.UtcNow, null));

        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Projects).Returns(mockRepo.Object);
        var service = new ProjectService(() => mockUow.Object);

        await service.TransferBudgetAsync(1, 2, 25_000m, CancellationToken.None);

        mockRepo.Verify(r => r.UpdateBudgetAsync(1, 75_000m, It.IsAny<CancellationToken>()), Times.Once);
        mockRepo.Verify(r => r.UpdateBudgetAsync(2, 75_000m, It.IsAny<CancellationToken>()), Times.Once);
        mockUow.Verify(u => u.CommitAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task TransferBudget_SourceNotFound_RollsBack()
    {
        var mockRepo = new Mock<IProjectRepository>();
        mockRepo.Setup(r => r.GetByIdAsync(999, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Project?)null);
        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Projects).Returns(mockRepo.Object);

        var service = new ProjectService(() => mockUow.Object);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.TransferBudgetAsync(999, 2, 10_000m, CancellationToken.None));
        mockUow.Verify(u => u.RollbackAsync(It.IsAny<CancellationToken>()), Times.Once);
        mockUow.Verify(u => u.CommitAsync(It.IsAny<CancellationToken>()), Times.Never);
    }
}
```

### Integration Testing Against Real Database

```csharp
[Collection("Database")]
public class ProjectRepositoryIntegrationTests : IAsyncLifetime
{
    private readonly string _connStr = "Server=(localdb)\\MSSQLLocalDB;Database=BNBuildersTest;Trusted_Connection=True;";
    private DapperProjectRepository _repo = null!;

    public async Task InitializeAsync()
    {
        _repo = new DapperProjectRepository(_connStr);
        await using var conn = new SqlConnection(_connStr); await conn.OpenAsync();
        await new SqlCommand("DELETE FROM dbo.Projects WHERE ProjectName LIKE 'TEST_%'", conn).ExecuteNonQueryAsync();
        await new SqlCommand("INSERT INTO dbo.Projects (ProjectName,Budget,Status,IsActive,CreatedAt) VALUES ('TEST_Alpha',100000,'Active',1,SYSUTCDATETIME())", conn).ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        await using var conn = new SqlConnection(_connStr); await conn.OpenAsync();
        await new SqlCommand("DELETE FROM dbo.Projects WHERE ProjectName LIKE 'TEST_%'", conn).ExecuteNonQueryAsync();
    }

    [Fact]
    public async Task CreateAndRetrieve_RoundTrips()
    {
        int id = await _repo.CreateAsync(new Project(0, "TEST_Bravo", 250_000m, "Planning", true, DateTime.UtcNow, null));
        var retrieved = await _repo.GetByIdAsync(id);
        Assert.Equal("TEST_Bravo", retrieved!.ProjectName);
    }
}
```

## Common Patterns

### Factory Pattern for Connection Creation

```csharp
public interface IDbConnectionFactory { SqlConnection CreateConnection(); }

public class SqlConnectionFactory(string connectionString) : IDbConnectionFactory
{
    public SqlConnection CreateConnection() => new(connectionString);
}
```

Injecting the factory instead of the raw string makes testing easier and centralizes
connection creation. Repositories accept `IDbConnectionFactory` rather than a string.

## Gotchas and Pitfalls

1. **Leaking repository abstractions.** If `IProjectRepository` returns `SqlDataReader`
   or accepts `SqlConnection`, the abstraction is broken. Use domain types only.

2. **Generic repository as public contract.** `IRepository<T>.GetAll()` encourages
   loading entire tables. Use specific query methods instead.

3. **Forgetting to test the mapping.** Manual `MapFromReader` is error-prone. A wrong
   ordinal breaks at runtime. Integration tests catch these; mocks do not.

4. **Connection lifetime in Unit of Work.** Keep the scope tight — begin, work, commit,
   dispose. Do not hold a `UnitOfWork` open across HTTP requests.

5. **Over-mocking.** Mocked repositories give zero confidence the SQL is correct.
   Balance unit tests with integration tests against a real database.

6. **Not disposing the Unit of Work.** If `CommitAsync` throws, the connection and
   transaction leak. Always use `await using` or try/finally.

## Performance Considerations

- **Connection per method vs shared connection.** Opening a new connection per
  repository method is simple and safe (connection pooling makes it cheap). Sharing a
  connection across methods is only necessary inside a transaction (Unit of Work).

- **Dapper vs manual mapping.** Dapper adds ~0.01ms overhead but saves 20-50 lines of
  mapping code per method. For most applications, Dapper is the right default.

- **Avoid N+1 queries.** Do not call `GetByIdAsync` in a loop. Write a
  `GetByIdsAsync(IEnumerable<int> ids)` method that uses `WHERE Id IN @Ids`.

- **Compiled mapping.** Dapper uses IL emit to compile mappers on first use. Manual
  ADO.NET mapping can be compiled similarly using expression trees or source
  generators, but this is rarely worth the effort.

## BNBuilders Context

As a Data Engineer at BNBuilders:

- **ETL service structure.** Your data pipeline services follow the pattern:
  `PipelineService` -> `IProjectRepository` / `ICostCodeRepository` -> SQL. The
  service orchestrates the load; the repository handles the SQL. When the Sage
  database schema changes, you update one repository method, not 15 scattered queries.

- **Swappable implementations.** During development, you use a Dapper repository
  against a local database. In production, the same interface points to Azure SQL with
  retry-enabled repositories. The service layer code is identical.

- **Testing data transformations.** Your ETL logic (deduplicate, validate, enrich)
  lives in the service layer. Unit tests mock the repository to feed the service known
  data and verify the output. Integration tests hit a test database to verify the SQL.

- **Reporting endpoints.** The Power BI gateway calls your API. The controller injects
  `IProjectRepository` and calls domain-specific methods like
  `GetBudgetSummaryByFiscalYearAsync`. The repository encapsulates the complex SQL
  join.

- **Audit trail.** Every write method in the repository includes `ModifiedAt =
  SYSUTCDATETIME()` and can log to an audit table. Centralizing this in the repository
  ensures consistency.

## Interview / Senior Dev Questions

1. **Q: What is the difference between the Repository pattern and the Unit of Work
   pattern?**
   A: A Repository encapsulates data access for a single entity/aggregate. A Unit of
   Work coordinates multiple repositories under a single transaction, ensuring that
   changes across entities are committed or rolled back atomically.

2. **Q: Why is a generic `IRepository<T>` with `GetAll()` considered an anti-pattern
   by some?**
   A: Because it exposes a lowest-common-denominator interface that does not reflect
   the actual data access needs. `GetAll()` encourages loading entire tables. Not
   every entity supports every CRUD operation. Specific interfaces
   (`IProjectRepository`) are more honest and easier to optimize.

3. **Q: How do you test that your SQL queries are correct if unit tests mock the
   repository?**
   A: Unit tests verify business logic in the service layer. Integration tests verify
   SQL correctness by running against a real database (e.g., LocalDB, Docker SQL
   Server, or a test Azure SQL database). Both are needed.

4. **Q: Should a repository open its own connection, or receive one via constructor
   injection?**
   A: For standalone operations, opening a connection per method is simplest and
   safest — the connection pool makes it cheap. For transactional operations spanning
   multiple repositories, inject a shared connection (and transaction) via the Unit of
   Work pattern.

## Quiz

**1. Your `IProjectRepository` has a method `Task<SqlDataReader> GetProjectReaderAsync(int id)`. What is wrong with this design?**

<details>
<summary>Show Answer</summary>

It leaks the implementation detail (`SqlDataReader`) through the abstraction. The interface should return domain types (`Project`, `IReadOnlyList<Project>`), not ADO.NET types. Returning a `SqlDataReader` means callers depend on `Microsoft.Data.SqlClient` and must manage the reader's lifecycle (close, dispose), defeating the purpose of the abstraction.
</details>

**2. You register your repository as a Singleton in DI. Each method opens and closes its own `SqlConnection`. Is this safe?**

<details>
<summary>Show Answer</summary>

Yes, this is safe. Since the repository holds no mutable state and opens a new connection per method call (returned to the pool on close), there are no concurrency issues. However, if the repository held an open connection as a field, a Singleton would share it across threads — which is unsafe, as `SqlConnection` is not thread-safe.
</details>

**3. You have a `ProjectService` that calls `IProjectRepository.UpdateBudgetAsync` for two projects inside a Unit of Work. The second update throws. What should happen to the first update?**

<details>
<summary>Show Answer</summary>

The first update should be rolled back. Both updates share the same database transaction via the Unit of Work. When the second update throws, the service catches the exception and calls `uow.RollbackAsync()`, which rolls back both updates atomically. This is the entire purpose of the Unit of Work pattern.
</details>

**4. Why should you write integration tests against a real database in addition to unit tests with mocked repositories?**

<details>
<summary>Show Answer</summary>

Unit tests with mocked repositories verify service logic but tell you nothing about whether the SQL is correct, whether column mappings match, whether parameters bind correctly, or whether the database schema matches your expectations. Integration tests catch these real-world issues: wrong column names, type mismatches, missing indexes, and SQL syntax errors that only a real database can surface.
</details>

**5. You use Dapper for your repository but need a `SqlBulkCopy` operation for a bulk load. Does this break the repository pattern?**

<details>
<summary>Show Answer</summary>

No. The repository encapsulates *how* data is accessed. A method like `BulkLoadTimesheetsAsync(IDataReader reader)` on `ITimesheetRepository` hides the `SqlBulkCopy` implementation behind the interface. The caller does not know or care that bulk copy is used internally. You can even mix Dapper for reads and raw ADO.NET/SqlBulkCopy for writes within the same repository.
</details>
