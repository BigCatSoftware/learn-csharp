# Expression Trees

Expression trees represent code as data. Instead of compiling a lambda directly into executable IL, the compiler can produce a tree of objects that describe the structure of the expression. This is the mechanism that powers LINQ-to-SQL, Entity Framework Core, and other query providers — they read the tree and translate it into SQL or another query language.

## Delegates vs Expression Trees

A delegate is compiled code. An expression tree is a data structure that describes code.

```csharp
// This is a delegate — compiled directly to IL
Func<int, bool> isEvenDelegate = x => x % 2 == 0;

// This is an expression tree — a data structure representing the same logic
Expression<Func<int, bool>> isEvenExpr = x => x % 2 == 0;
```

| Aspect | `Func<T, TResult>` (Delegate) | `Expression<Func<T, TResult>>` |
|---|---|---|
| **What it holds** | Compiled executable code | A tree describing the code |
| **Can execute directly** | Yes | No (must compile first) |
| **Can be inspected** | No | Yes — traverse the tree |
| **Can be translated** | No | Yes — to SQL, REST queries, etc. |
| **Used by** | LINQ-to-Objects | EF Core, OData, remote LINQ providers |

## Inspecting an Expression Tree

```csharp
Expression<Func<int, int, int>> addExpr = (a, b) => a + b;

// The tree structure:
// BinaryExpression (NodeType = Add)
//   Left:  ParameterExpression (Name = "a")
//   Right: ParameterExpression (Name = "b")

BinaryExpression body = (BinaryExpression)addExpr.Body;
Console.WriteLine($"NodeType: {body.NodeType}");   // Add
Console.WriteLine($"Left: {body.Left}");           // a
Console.WriteLine($"Right: {body.Right}");         // b
Console.WriteLine($"Type: {body.Type}");           // System.Int32
```

## How EF Core Uses Expression Trees

When you write a LINQ query against a `DbSet`, EF Core receives an expression tree, not a delegate. It walks the tree and translates each node into SQL.

```csharp
// You write this C# code:
var adults = dbContext.Users
    .Where(u => u.Age >= 18 && u.IsActive)
    .OrderBy(u => u.LastName)
    .Select(u => new { u.FirstName, u.LastName, u.Email });

// EF Core receives expression trees for each lambda and translates them to:
// SELECT [u].[FirstName], [u].[LastName], [u].[Email]
// FROM [Users] AS [u]
// WHERE [u].[Age] >= 18 AND [u].[IsActive] = 1
// ORDER BY [u].[LastName]
```

> **Important:** If the lambda contains logic that EF Core cannot translate to SQL (e.g., calling a custom C# method), it throws a runtime exception. This is why understanding expression trees matters — they define the boundary between what runs in the database and what runs in memory.

## Building Expression Trees Programmatically

You can construct expression trees manually using the `Expression` factory methods. This is essential when the shape of a query is not known at compile time.

```csharp
// Build: (int x) => x > 5
ParameterExpression param = Expression.Parameter(typeof(int), "x");
ConstantExpression constant = Expression.Constant(5);
BinaryExpression comparison = Expression.GreaterThan(param, constant);

Expression<Func<int, bool>> lambda =
    Expression.Lambda<Func<int, bool>>(comparison, param);

Console.WriteLine(lambda); // x => (x > 5)

// Compile and execute
Func<int, bool> compiled = lambda.Compile();
Console.WriteLine(compiled(10)); // True
Console.WriteLine(compiled(3));  // False
```

## Common Expression Node Types

| Factory Method | Node Type | Example |
|---|---|---|
| `Expression.Constant(42)` | `ConstantExpression` | Literal value |
| `Expression.Parameter(type, name)` | `ParameterExpression` | Lambda parameter |
| `Expression.Property(expr, name)` | `MemberExpression` | Property access |
| `Expression.Field(expr, name)` | `MemberExpression` | Field access |
| `Expression.Call(instance, method, args)` | `MethodCallExpression` | Method call |
| `Expression.Add(left, right)` | `BinaryExpression` | Arithmetic |
| `Expression.Equal(left, right)` | `BinaryExpression` | Comparison |
| `Expression.AndAlso(left, right)` | `BinaryExpression` | Logical AND (`&&`) |
| `Expression.OrElse(left, right)` | `BinaryExpression` | Logical OR (`\|\|`) |
| `Expression.Lambda(body, params)` | `LambdaExpression` | Lambda wrapper |

## Practical Example: Dynamic Filter Builder

This is the most common real-world use case — building `Where` clauses dynamically based on user input (search forms, API query parameters, report filters).

```csharp
public class FilterBuilder<T>
{
    private readonly ParameterExpression _param = Expression.Parameter(typeof(T), "x");
    private readonly List<Expression> _conditions = new();

    public FilterBuilder<T> Where(string propertyName, object value)
    {
        MemberExpression property = Expression.Property(_param, propertyName);
        ConstantExpression constant = Expression.Constant(value);
        BinaryExpression equals = Expression.Equal(property, constant);
        _conditions.Add(equals);
        return this;
    }

    public FilterBuilder<T> WhereGreaterThan(string propertyName, object value)
    {
        MemberExpression property = Expression.Property(_param, propertyName);
        ConstantExpression constant = Expression.Constant(
            Convert.ChangeType(value, property.Type));
        BinaryExpression comparison = Expression.GreaterThan(property, constant);
        _conditions.Add(comparison);
        return this;
    }

    public FilterBuilder<T> WhereContains(string propertyName, string value)
    {
        MemberExpression property = Expression.Property(_param, propertyName);
        MethodInfo containsMethod = typeof(string).GetMethod(
            "Contains", new[] { typeof(string) })!;
        MethodCallExpression call = Expression.Call(
            property, containsMethod, Expression.Constant(value));
        _conditions.Add(call);
        return this;
    }

    public Expression<Func<T, bool>> Build()
    {
        if (_conditions.Count == 0)
            return Expression.Lambda<Func<T, bool>>(
                Expression.Constant(true), _param);

        Expression combined = _conditions[0];
        for (int i = 1; i < _conditions.Count; i++)
            combined = Expression.AndAlso(combined, _conditions[i]);

        return Expression.Lambda<Func<T, bool>>(combined, _param);
    }
}
```

### Using the Filter Builder with EF Core

```csharp
public class ProductSearchService
{
    private readonly AppDbContext _db;

    public ProductSearchService(AppDbContext db) => _db = db;

    public async Task<List<Product>> SearchAsync(ProductSearchCriteria criteria)
    {
        var filter = new FilterBuilder<Product>();

        if (!string.IsNullOrEmpty(criteria.Category))
            filter.Where("Category", criteria.Category);

        if (criteria.MinPrice.HasValue)
            filter.WhereGreaterThan("Price", criteria.MinPrice.Value);

        if (!string.IsNullOrEmpty(criteria.NameContains))
            filter.WhereContains("Name", criteria.NameContains);

        Expression<Func<Product, bool>> predicate = filter.Build();

        // EF Core translates this expression tree to SQL
        return await _db.Products
            .Where(predicate)
            .OrderBy(p => p.Name)
            .ToListAsync();
    }
}

// Generates SQL like:
// SELECT * FROM Products
// WHERE Category = 'Electronics'
//   AND Price > 100
//   AND Name LIKE '%phone%'
// ORDER BY Name
```

> **Tip:** This pattern is how libraries like `System.Linq.Dynamic.Core` work under the hood. Understanding expression trees lets you build your own query abstractions tailored to your domain.

## Building a Dynamic Sort Expression

```csharp
public static IQueryable<T> OrderByProperty<T>(
    IQueryable<T> source,
    string propertyName,
    bool descending = false)
{
    ParameterExpression param = Expression.Parameter(typeof(T), "x");
    MemberExpression property = Expression.Property(param, propertyName);

    // Create the key selector: x => x.PropertyName
    LambdaExpression keySelector = Expression.Lambda(property, param);

    // Call Queryable.OrderBy or Queryable.OrderByDescending
    string methodName = descending ? "OrderByDescending" : "OrderBy";

    MethodCallExpression call = Expression.Call(
        typeof(Queryable),
        methodName,
        new[] { typeof(T), property.Type },
        source.Expression,
        Expression.Quote(keySelector));

    return source.Provider.CreateQuery<T>(call);
}

// Usage — sort by any column name from a request parameter
string sortColumn = "Price";
var sorted = OrderByProperty(dbContext.Products, sortColumn, descending: true);
```

## Compiling Expressions for Performance

When you need the flexibility of runtime-built logic with near-native performance, compile expression trees into delegates.

```csharp
public static class FastPropertyAccessor<T>
{
    private static readonly ConcurrentDictionary<string, Func<T, object?>> _getters = new();

    public static Func<T, object?> GetGetter(string propertyName)
    {
        return _getters.GetOrAdd(propertyName, name =>
        {
            ParameterExpression param = Expression.Parameter(typeof(T), "obj");
            MemberExpression property = Expression.Property(param, name);
            UnaryExpression boxed = Expression.Convert(property, typeof(object));
            return Expression.Lambda<Func<T, object?>>(boxed, param).Compile();
        });
    }
}

// 50-100x faster than PropertyInfo.GetValue after first call
var getter = FastPropertyAccessor<Product>.GetGetter("Price");
object? price = getter(myProduct);
```

> **Note:** The first call pays the cost of building and compiling the expression tree. Subsequent calls use the cached delegate and run at near-native speed.

## Expression Visitors

The `ExpressionVisitor` class lets you walk and transform expression trees. This is how query providers rewrite expressions.

```csharp
// A visitor that replaces all string comparisons with case-insensitive ones
public class CaseInsensitiveVisitor : ExpressionVisitor
{
    protected override Expression VisitMethodCall(MethodCallExpression node)
    {
        // Replace string.Equals(a, b) with string.Equals(a, b, OrdinalIgnoreCase)
        if (node.Method.DeclaringType == typeof(string)
            && node.Method.Name == "Equals"
            && node.Arguments.Count == 1)
        {
            MethodInfo ciMethod = typeof(string).GetMethod(
                "Equals",
                new[] { typeof(string), typeof(StringComparison) })!;

            return Expression.Call(
                node.Object!,
                ciMethod,
                node.Arguments[0],
                Expression.Constant(StringComparison.OrdinalIgnoreCase));
        }

        return base.VisitMethodCall(node);
    }
}

// Usage
Expression<Func<User, bool>> original = u => u.Name.Equals("alice");
var visitor = new CaseInsensitiveVisitor();
var modified = (Expression<Func<User, bool>>)visitor.Visit(original);
// modified is now: u => u.Name.Equals("alice", OrdinalIgnoreCase)
```

## Combining Expressions

A utility for combining multiple filter expressions with AND/OR logic.

```csharp
public static class ExpressionCombiner
{
    public static Expression<Func<T, bool>> And<T>(
        Expression<Func<T, bool>> left,
        Expression<Func<T, bool>> right)
    {
        ParameterExpression param = left.Parameters[0];

        // Replace right's parameter with left's so they share the same parameter
        Expression rightBody = new ParameterReplacer(
            right.Parameters[0], param).Visit(right.Body);

        return Expression.Lambda<Func<T, bool>>(
            Expression.AndAlso(left.Body, rightBody), param);
    }

    public static Expression<Func<T, bool>> Or<T>(
        Expression<Func<T, bool>> left,
        Expression<Func<T, bool>> right)
    {
        ParameterExpression param = left.Parameters[0];

        Expression rightBody = new ParameterReplacer(
            right.Parameters[0], param).Visit(right.Body);

        return Expression.Lambda<Func<T, bool>>(
            Expression.OrElse(left.Body, rightBody), param);
    }

    private class ParameterReplacer : ExpressionVisitor
    {
        private readonly ParameterExpression _old;
        private readonly ParameterExpression _new;

        public ParameterReplacer(ParameterExpression old, ParameterExpression @new)
        {
            _old = old;
            _new = @new;
        }

        protected override Expression VisitParameter(ParameterExpression node)
            => node == _old ? _new : base.VisitParameter(node);
    }
}

// Usage
Expression<Func<Product, bool>> priceFilter = p => p.Price > 10;
Expression<Func<Product, bool>> categoryFilter = p => p.Category == "Books";
Expression<Func<Product, bool>> combined =
    ExpressionCombiner.And(priceFilter, categoryFilter);

var results = await dbContext.Products.Where(combined).ToListAsync();
```

## When to Use Expression Trees

- **Query providers** — translating C# expressions to SQL, REST, GraphQL, or other query languages.
- **Dynamic filtering and sorting** — building predicates from user input or configuration.
- **Fast reflection alternatives** — compiling property accessors and method invocations into delegates.
- **Rule engines** — representing business rules as inspectable, serializable data structures.

> **Caution:** Expression trees add significant complexity. If you can express your logic with regular LINQ and delegates, do that first. Reach for expression trees only when you need runtime inspection or translation of code.

## Key Takeaways

1. Expression trees represent code as data — a tree of objects describing the structure of an expression.
2. `Expression<Func<T>>` captures a lambda as a tree instead of compiling it directly.
3. EF Core and other query providers walk expression trees to generate SQL.
4. You can build expression trees programmatically for dynamic queries, filters, and sorts.
5. Compiled expression trees (`lambda.Compile()`) give you near-native performance with runtime flexibility.
6. `ExpressionVisitor` lets you walk and transform trees — essential for query rewriting.
