# Design Patterns in C#

*Common solutions to recurring problems*

Design patterns are proven solutions to common software design challenges. Here are the most useful patterns in modern C# development.

## Builder Pattern

For constructing complex objects step by step:

```csharp
public class QueryBuilder
{
    private string _table = "";
    private readonly List<string> _conditions = new();
    private string? _orderBy;
    private int? _limit;

    public QueryBuilder From(string table)
    {
        _table = table;
        return this;
    }

    public QueryBuilder Where(string condition)
    {
        _conditions.Add(condition);
        return this;
    }

    public QueryBuilder OrderBy(string column)
    {
        _orderBy = column;
        return this;
    }

    public QueryBuilder Limit(int count)
    {
        _limit = count;
        return this;
    }

    public string Build()
    {
        var sql = $"SELECT * FROM {_table}";
        if (_conditions.Any())
            sql += " WHERE " + string.Join(" AND ", _conditions);
        if (_orderBy is not null)
            sql += $" ORDER BY {_orderBy}";
        if (_limit.HasValue)
            sql += $" LIMIT {_limit}";
        return sql;
    }
}

// Fluent usage
var query = new QueryBuilder()
    .From("users")
    .Where("age > 18")
    .Where("active = true")
    .OrderBy("name")
    .Limit(10)
    .Build();
```

## Strategy Pattern

Swap algorithms at runtime:

```csharp
public interface ISortStrategy<T>
{
    void Sort(List<T> items);
}

public class QuickSort<T> : ISortStrategy<T> where T : IComparable<T>
{
    public void Sort(List<T> items) => items.Sort();
}

public class BubbleSort<T> : ISortStrategy<T> where T : IComparable<T>
{
    public void Sort(List<T> items)
    {
        for (int i = 0; i < items.Count - 1; i++)
            for (int j = 0; j < items.Count - i - 1; j++)
                if (items[j].CompareTo(items[j + 1]) > 0)
                    (items[j], items[j + 1]) = (items[j + 1], items[j]);
    }
}

// Usage
public class Sorter<T>(ISortStrategy<T> strategy)
{
    public void Sort(List<T> items) => strategy.Sort(items);
}
```

## Observer Pattern

Already built into C# via events, but here's a modern approach:

```csharp
public interface IObserver<in T>
{
    void OnNext(T value);
    void OnError(Exception error);
    void OnCompleted();
}

public class EventBus
{
    private readonly ConcurrentDictionary<Type, List<Delegate>> _handlers = new();

    public void Subscribe<T>(Action<T> handler)
    {
        _handlers.AddOrUpdate(
            typeof(T),
            _ => new List<Delegate> { handler },
            (_, list) => { list.Add(handler); return list; });
    }

    public void Publish<T>(T @event)
    {
        if (_handlers.TryGetValue(typeof(T), out var handlers))
            foreach (Action<T> handler in handlers.Cast<Action<T>>())
                handler(@event);
    }
}

// Usage
var bus = new EventBus();
bus.Subscribe<OrderPlaced>(e => Console.WriteLine($"Order #{e.Id} placed!"));
bus.Subscribe<OrderPlaced>(e => SendEmailConfirmation(e));
bus.Publish(new OrderPlaced(42, DateTime.UtcNow));
```

## Repository Pattern

Abstract data access:

```csharp
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(int id);
    Task<IReadOnlyList<T>> GetAllAsync();
    Task<IReadOnlyList<T>> FindAsync(Expression<Func<T, bool>> predicate);
    Task AddAsync(T entity);
    void Update(T entity);
    void Remove(T entity);
    Task SaveChangesAsync();
}

public class EfRepository<T> : IRepository<T> where T : class
{
    private readonly DbContext _context;
    private readonly DbSet<T> _dbSet;

    public EfRepository(DbContext context)
    {
        _context = context;
        _dbSet = context.Set<T>();
    }

    public async Task<T?> GetByIdAsync(int id) =>
        await _dbSet.FindAsync(id);

    public async Task<IReadOnlyList<T>> GetAllAsync() =>
        await _dbSet.ToListAsync();

    public async Task<IReadOnlyList<T>> FindAsync(
        Expression<Func<T, bool>> predicate) =>
        await _dbSet.Where(predicate).ToListAsync();

    public async Task AddAsync(T entity) =>
        await _dbSet.AddAsync(entity);

    public void Update(T entity) => _dbSet.Update(entity);
    public void Remove(T entity) => _dbSet.Remove(entity);

    public async Task SaveChangesAsync() =>
        await _context.SaveChangesAsync();
}
```

## Decorator Pattern

Add behavior without modifying existing code:

```csharp
public interface IWeatherService
{
    Task<Weather> GetWeatherAsync(string city);
}

// Base implementation
public class WeatherService(HttpClient client) : IWeatherService
{
    public async Task<Weather> GetWeatherAsync(string city) =>
        await client.GetFromJsonAsync<Weather>($"/weather/{city}")
        ?? throw new Exception("Failed to fetch weather");
}

// Caching decorator
public class CachedWeatherService(
    IWeatherService inner,
    IMemoryCache cache) : IWeatherService
{
    public async Task<Weather> GetWeatherAsync(string city) =>
        await cache.GetOrCreateAsync($"weather:{city}",
            async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
                return await inner.GetWeatherAsync(city);
            }) ?? throw new Exception("Cache miss and fetch failed");
}

// Logging decorator
public class LoggedWeatherService(
    IWeatherService inner,
    ILogger<LoggedWeatherService> logger) : IWeatherService
{
    public async Task<Weather> GetWeatherAsync(string city)
    {
        logger.LogInformation("Fetching weather for {City}", city);
        var sw = Stopwatch.StartNew();
        var result = await inner.GetWeatherAsync(city);
        logger.LogInformation("Weather fetched in {Ms}ms", sw.ElapsedMilliseconds);
        return result;
    }
}

// Register as layered decorators in DI
services.AddHttpClient<WeatherService>();
services.AddSingleton<IWeatherService>(sp =>
    new LoggedWeatherService(
        new CachedWeatherService(
            sp.GetRequiredService<WeatherService>(),
            sp.GetRequiredService<IMemoryCache>()),
        sp.GetRequiredService<ILogger<LoggedWeatherService>>()));
```

> **Important:** Design patterns are tools, not rules. Use them when they solve a real problem. Over-applying patterns leads to unnecessary complexity. The simplest solution that meets your requirements is usually the best one.
