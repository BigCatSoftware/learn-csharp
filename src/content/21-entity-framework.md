# Entity Framework Core

*Object-relational mapping for .NET*

Entity Framework Core (EF Core) is the recommended way to interact with databases in .NET. It maps your C# classes to database tables and lets you query and manipulate data using LINQ.

## Getting Started

```csharp
// Define your entities
public class Blog
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Url { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    public List<Post> Posts { get; set; } = new();
}

public class Post
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Content { get; set; } = "";
    public DateTime PublishedAt { get; set; }

    // Foreign key
    public int BlogId { get; set; }
    public Blog Blog { get; set; } = null!;
}
```

## DbContext

```csharp
public class AppDbContext : DbContext
{
    public DbSet<Blog> Blogs => Set<Blog>();
    public DbSet<Post> Posts => Set<Post>();

    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Blog>(entity =>
        {
            entity.HasKey(b => b.Id);
            entity.Property(b => b.Title).HasMaxLength(200).IsRequired();
            entity.HasIndex(b => b.Url).IsUnique();
            entity.HasMany(b => b.Posts).WithOne(p => p.Blog);
        });

        modelBuilder.Entity<Post>(entity =>
        {
            entity.Property(p => p.Title).HasMaxLength(500).IsRequired();
        });
    }
}
```

## CRUD Operations

```csharp
// Create
var blog = new Blog { Title = "My Blog", Url = "https://myblog.com" };
context.Blogs.Add(blog);
await context.SaveChangesAsync();

// Read
var blog = await context.Blogs
    .Include(b => b.Posts)
    .FirstOrDefaultAsync(b => b.Id == 1);

// Update
blog.Title = "Updated Title";
await context.SaveChangesAsync(); // EF tracks changes automatically

// Delete
context.Blogs.Remove(blog);
await context.SaveChangesAsync();
```

## Querying with LINQ

```csharp
// Simple query
var recentPosts = await context.Posts
    .Where(p => p.PublishedAt > DateTime.UtcNow.AddDays(-7))
    .OrderByDescending(p => p.PublishedAt)
    .Take(10)
    .ToListAsync();

// Projection
var blogSummaries = await context.Blogs
    .Select(b => new
    {
        b.Title,
        PostCount = b.Posts.Count,
        LatestPost = b.Posts
            .OrderByDescending(p => p.PublishedAt)
            .Select(p => p.Title)
            .FirstOrDefault()
    })
    .ToListAsync();

// Eager loading (Include)
var blogsWithPosts = await context.Blogs
    .Include(b => b.Posts.Where(p => p.PublishedAt.Year == 2024))
    .ToListAsync();
```

> **Tip:** Always use projections (`Select`) when you don't need the full entity. This generates more efficient SQL and avoids loading unnecessary data.

## Migrations

```bash
# Create a migration
dotnet ef migrations add InitialCreate

# Apply to database
dotnet ef database update

# Generate SQL script
dotnet ef migrations script

# Revert last migration
dotnet ef migrations remove
```

> **Warning:** Never manually edit migration files after they've been applied to a shared database. Instead, create a new migration with the changes.

## Transactions

```csharp
using var transaction = await context.Database.BeginTransactionAsync();

try
{
    var blog = new Blog { Title = "New Blog", Url = "https://new.blog" };
    context.Blogs.Add(blog);
    await context.SaveChangesAsync();

    var post = new Post
    {
        Title = "First Post",
        Content = "Hello!",
        BlogId = blog.Id
    };
    context.Posts.Add(post);
    await context.SaveChangesAsync();

    await transaction.CommitAsync();
}
catch
{
    await transaction.RollbackAsync();
    throw;
}
```

## Performance Tips

```csharp
// Use AsNoTracking for read-only queries
var blogs = await context.Blogs
    .AsNoTracking()
    .ToListAsync();

// Use ExecuteUpdate for bulk updates (EF 7+)
await context.Posts
    .Where(p => p.PublishedAt < cutoffDate)
    .ExecuteUpdateAsync(p => p.SetProperty(x => x.IsArchived, true));

// Use ExecuteDelete for bulk deletes
await context.Posts
    .Where(p => p.IsArchived)
    .ExecuteDeleteAsync();
```

> **Important:** EF Core tracks all entities it loads by default, which has memory and performance overhead. Use `AsNoTracking()` for queries where you're just reading data and not planning to modify it.
