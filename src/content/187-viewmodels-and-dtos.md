# ViewModels and DTOs

*Chapter 12.8 --- ASP.NET Core MVC & Razor Pages*

## Overview

In a well-architected ASP.NET Core application, **domain models** (EF entities) should
never be exposed directly to views or API consumers. Instead, you use **ViewModels** to
shape data for a specific view and **DTOs (Data Transfer Objects)** to define the contract
for data crossing application boundaries (API requests/responses, service layer inputs/outputs).

This lesson covers why these abstractions exist, how to design them, mapping strategies
(AutoMapper and manual), record types as DTOs, and efficient database queries through
projection.

## Core Concepts

### Why ViewModels Exist

| Problem with exposing EF entities | ViewModel solution |
|---|---|
| Over-posting attacks (mass assignment) | Only includes properties the user should see/edit |
| Exposes internal structure (navigation properties, IDs) | Flattens and reshapes data for the view |
| Tightly couples view to database schema | View and schema evolve independently |
| Sends unnecessary data to the client | Only the fields the view needs |
| Circular references in serialization | No navigation properties to cause cycles |

### ViewModel vs DTO

| Concept | Purpose | Lives In |
|---|---|---|
| **ViewModel** | Shapes data for a specific view | Web/UI project |
| **DTO** | Transfers data across boundaries (API, service layer) | Shared/Contracts project |

In practice, the terms overlap. A ViewModel is a DTO specialized for a view. The key
principle is the same: **never expose your domain model to external consumers**.

### AutoMapper

A library that automates property-to-property mapping between types. It eliminates
repetitive `new ViewModel { Prop = entity.Prop }` code.

Key concepts:
- **Profile** --- A class that defines mapping configurations.
- **`CreateMap<TSource, TDest>()`** --- Registers a mapping.
- **`ProjectTo<TDest>()`** --- Translates mappings into LINQ/SQL projections (efficient DB queries).
- **`Map<TDest>(source)`** --- Maps an in-memory object.

### Manual Mapping

For small projects or when you want full control, extension methods or static factory
methods that map explicitly. No reflection, no magic, easy to debug.

### Record Types as DTOs

C# `record` types are ideal for DTOs:
- Immutable by default (init-only properties).
- Value-based equality.
- Concise syntax with positional parameters.
- Built-in `ToString()`.

### Projection with Select()

Instead of loading full EF entities and then mapping, use `.Select()` to project directly
in the LINQ query. EF Core translates this into a SQL `SELECT` with only the needed columns.

## Code Examples

### EF Entity (Domain Model) --- What NOT to Expose

```csharp
// This is the database entity. Never send this to a view or API response.
public class Project
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ProjectNumber { get; set; } = string.Empty;
    public decimal Budget { get; set; }
    public decimal ContingencyBudget { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public bool IsArchived { get; set; }
    public string InternalNotes { get; set; } = string.Empty;  // Sensitive!
    public int ProjectManagerId { get; set; }

    // Navigation properties
    public Employee ProjectManager { get; set; } = default!;
    public ICollection<JobCost> JobCosts { get; set; } = new List<JobCost>();
    public ICollection<ChangeOrder> ChangeOrders { get; set; } = new List<ChangeOrder>();
}
```

### ViewModels for Different Purposes

```csharp
// For the project list page --- minimal fields
public class ProjectListItemViewModel
{
    public int Id { get; set; }
    public string ProjectNumber { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Budget { get; set; }
    public string ProjectManagerName { get; set; } = string.Empty;  // Flattened
}

// For the project details page --- more fields, computed values
public class ProjectDetailViewModel
{
    public int Id { get; set; }
    public string ProjectNumber { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Budget { get; set; }
    public decimal TotalSpent { get; set; }         // Computed from JobCosts
    public decimal Variance => Budget - TotalSpent;  // Computed
    public bool IsOverBudget => TotalSpent > Budget;  // Computed
    public string ProjectManagerName { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int ChangeOrderCount { get; set; }        // Aggregated
    public List<CostCodeSummary> CostCodes { get; set; } = new();
}

// For the create form --- only editable fields
public class ProjectCreateViewModel
{
    [Required]
    [StringLength(200, MinimumLength = 3)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [RegularExpression(@"^BNB-\d{4}-\d{3}$")]
    public string ProjectNumber { get; set; } = string.Empty;

    [Required]
    [Range(1000, 500_000_000)]
    public decimal Budget { get; set; }

    [Required]
    public int ProjectManagerId { get; set; }

    // For the dropdown --- not bound from form, populated by controller
    public SelectList? ProjectManagers { get; set; }
}

// For the edit form --- includes Id but not fields user cannot change
public class ProjectEditViewModel
{
    public int Id { get; set; }

    [Required]
    [StringLength(200, MinimumLength = 3)]
    public string Name { get; set; } = string.Empty;

    // ProjectNumber is read-only after creation, so not editable
    public string ProjectNumber { get; set; } = string.Empty;

    [Required]
    [Range(1000, 500_000_000)]
    public decimal Budget { get; set; }

    [Required]
    public int ProjectManagerId { get; set; }

    public SelectList? ProjectManagers { get; set; }
}
```

### Record Types as DTOs

```csharp
// Positional record --- immutable, concise
public record JobCostDto(
    int Id,
    string CostCode,
    string Description,
    decimal Amount,
    DateTime TransactionDate,
    string ProjectNumber);

// Record with init-only properties --- more explicit
public record ProjectSummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string ProjectNumber { get; init; } = string.Empty;
    public decimal Budget { get; init; }
    public decimal TotalSpent { get; init; }
}

// Record for API input
public record JobCostCreateDto(
    int ProjectId,
    string CostCode,
    string Description,
    decimal Amount,
    DateTime TransactionDate);
```

### AutoMapper Configuration

```csharp
// Install: dotnet add package AutoMapper.Extensions.Microsoft.DependencyInjection

// MappingProfile.cs
public class MappingProfile : Profile
{
    public MappingProfile()
    {
        // Simple map --- properties with same names map automatically
        CreateMap<Project, ProjectListItemViewModel>()
            .ForMember(dest => dest.ProjectManagerName,
                opt => opt.MapFrom(src => src.ProjectManager.FullName));

        CreateMap<Project, ProjectDetailViewModel>()
            .ForMember(dest => dest.TotalSpent,
                opt => opt.MapFrom(src => src.JobCosts.Sum(jc => jc.Amount)))
            .ForMember(dest => dest.ChangeOrderCount,
                opt => opt.MapFrom(src => src.ChangeOrders.Count))
            .ForMember(dest => dest.ProjectManagerName,
                opt => opt.MapFrom(src => src.ProjectManager.FullName));

        CreateMap<ProjectCreateViewModel, Project>();
        CreateMap<Project, ProjectEditViewModel>().ReverseMap();

        CreateMap<JobCost, JobCostDto>()
            .ForMember(dest => dest.ProjectNumber,
                opt => opt.MapFrom(src => src.Project.ProjectNumber));
    }
}

// Registration in Program.cs
builder.Services.AddAutoMapper(typeof(MappingProfile));
```

### Using AutoMapper in a Service

```csharp
public class ProjectService : IProjectService
{
    private readonly BNBuildersDbContext _db;
    private readonly IMapper _mapper;

    public ProjectService(BNBuildersDbContext db, IMapper mapper)
    {
        _db = db;
        _mapper = mapper;
    }

    // ProjectTo --- generates efficient SQL SELECT
    public async Task<List<ProjectListItemViewModel>> GetAllAsync()
    {
        return await _db.Projects
            .Where(p => !p.IsArchived)
            .OrderBy(p => p.ProjectNumber)
            .ProjectTo<ProjectListItemViewModel>(_mapper.ConfigurationProvider)
            .ToListAsync();
    }

    // Map --- in-memory mapping after loading
    public async Task<ProjectDetailViewModel?> GetByIdAsync(int id)
    {
        var project = await _db.Projects
            .Include(p => p.ProjectManager)
            .Include(p => p.JobCosts)
            .Include(p => p.ChangeOrders)
            .FirstOrDefaultAsync(p => p.Id == id);

        return project == null ? null : _mapper.Map<ProjectDetailViewModel>(project);
    }

    // Map ViewModel to Entity for creation
    public async Task CreateAsync(ProjectCreateViewModel model)
    {
        var project = _mapper.Map<Project>(model);
        _db.Projects.Add(project);
        await _db.SaveChangesAsync();
    }
}
```

### Manual Mapping with Extension Methods

```csharp
public static class ProjectMappingExtensions
{
    public static ProjectListItemViewModel ToListItem(this Project project)
    {
        return new ProjectListItemViewModel
        {
            Id = project.Id,
            ProjectNumber = project.ProjectNumber,
            Name = project.Name,
            Budget = project.Budget,
            ProjectManagerName = project.ProjectManager?.FullName ?? "Unassigned"
        };
    }

    public static ProjectDetailViewModel ToDetailViewModel(this Project project)
    {
        return new ProjectDetailViewModel
        {
            Id = project.Id,
            ProjectNumber = project.ProjectNumber,
            Name = project.Name,
            Budget = project.Budget,
            TotalSpent = project.JobCosts?.Sum(jc => jc.Amount) ?? 0,
            ProjectManagerName = project.ProjectManager?.FullName ?? "Unassigned",
            StartDate = project.StartDate,
            EndDate = project.EndDate,
            ChangeOrderCount = project.ChangeOrders?.Count ?? 0
        };
    }

    public static Project ToEntity(this ProjectCreateViewModel model)
    {
        return new Project
        {
            Name = model.Name,
            ProjectNumber = model.ProjectNumber,
            Budget = model.Budget,
            ProjectManagerId = model.ProjectManagerId,
            StartDate = DateTime.UtcNow
        };
    }
}

// Usage in service
public async Task<List<ProjectListItemViewModel>> GetAllAsync()
{
    var projects = await _db.Projects
        .Include(p => p.ProjectManager)
        .Where(p => !p.IsArchived)
        .OrderBy(p => p.ProjectNumber)
        .ToListAsync();

    return projects.Select(p => p.ToListItem()).ToList();
}
```

### Projection with Select() --- Most Efficient

```csharp
// Best approach: project directly in the query
// EF Core generates a SQL SELECT with only the needed columns
public async Task<List<ProjectListItemViewModel>> GetAllAsync()
{
    return await _db.Projects
        .Where(p => !p.IsArchived)
        .OrderBy(p => p.ProjectNumber)
        .Select(p => new ProjectListItemViewModel
        {
            Id = p.Id,
            ProjectNumber = p.ProjectNumber,
            Name = p.Name,
            Budget = p.Budget,
            ProjectManagerName = p.ProjectManager.FullName
        })
        .ToListAsync();
}

// For complex aggregations
public async Task<ProjectDetailViewModel?> GetDetailAsync(int id)
{
    return await _db.Projects
        .Where(p => p.Id == id)
        .Select(p => new ProjectDetailViewModel
        {
            Id = p.Id,
            ProjectNumber = p.ProjectNumber,
            Name = p.Name,
            Budget = p.Budget,
            TotalSpent = p.JobCosts.Sum(jc => jc.Amount),
            ProjectManagerName = p.ProjectManager.FullName,
            StartDate = p.StartDate,
            EndDate = p.EndDate,
            ChangeOrderCount = p.ChangeOrders.Count,
            CostCodes = p.JobCosts
                .GroupBy(jc => jc.CostCode)
                .Select(g => new CostCodeSummary
                {
                    Code = g.Key,
                    Total = g.Sum(x => x.Amount)
                })
                .ToList()
        })
        .FirstOrDefaultAsync();
}
```

## Common Patterns

1. **One ViewModel per view** --- `ProjectListItemViewModel`, `ProjectDetailViewModel`,
   `ProjectCreateViewModel`, `ProjectEditViewModel`. Each has exactly the properties its
   view needs.
2. **Input vs Output ViewModels** --- Input VMs have validation attributes (for forms).
   Output VMs have computed properties (for display). Keep them separate.
3. **Folder organization** --- Place ViewModels in `/ViewModels/{Feature}/` or alongside
   their page in feature folders.
4. **AutoMapper `ProjectTo` for lists** --- Always use `ProjectTo` for queries returning
   lists. It generates efficient SQL. Use `Map` only for single-object in-memory mapping.
5. **Records for API DTOs** --- Use `record` types for immutable API contracts. They signal
   intent ("this is data, not behavior") and get value equality for free.

## Gotchas and Pitfalls

- **AutoMapper silent failures** --- If a property on the destination does not have a
  matching source property, AutoMapper maps it to `default` (null, 0) without error. Use
  `AssertConfigurationIsValid()` in tests to catch unmapped properties.
- **`ProjectTo` limitations** --- Not all C# expressions translate to SQL. Custom
  `ForMember` logic using non-translatable C# methods will fail at runtime. Keep
  `ProjectTo` mappings simple.
- **Forgetting to update mappings** --- When you add a column to the database and entity,
  you must also update the ViewModel and the mapping. This is a maintenance cost.
- **Over-fetching with `.Include()` + `.Map()`** --- Loading full entities with all
  navigation properties and then mapping to a small ViewModel wastes memory and bandwidth.
  Prefer `Select()` or `ProjectTo()`.
- **ViewModel with `SelectList` on POST** --- `SelectList` properties are not round-tripped
  in forms. You must repopulate them before returning `View(model)` on validation failure.
- **Mapping entity to itself** --- Never use AutoMapper to copy entity to entity for
  "update" scenarios. Manually set changed properties on the tracked entity.

## Performance Considerations

- **`Select()` / `ProjectTo()` >> `Include()` + `Map()`** --- Projection generates a
  SQL `SELECT` with only the needed columns. `Include` loads entire related entities
  into memory, even if you only need one property.
- **Avoid `ToList()` before projection** --- `_db.Projects.ToList().Select(...)` loads all
  columns and all rows into memory, then maps. Always project before materializing.
- **AutoMapper reflection overhead** --- AutoMapper uses reflection and expression
  compilation. The first map call is slow; subsequent calls are fast. In hot paths, manual
  mapping may be measurably faster.
- **Immutable records avoid accidental mutation** --- Using records for DTOs prevents bugs
  where a downstream method accidentally modifies a shared DTO instance.
- **Batch mapping** --- When mapping a list of 10,000 entities, `ProjectTo` is dramatically
  faster than `Map` because the work happens in SQL, not in C#.

## BNBuilders Context

- **Job Cost Dashboard** --- The dashboard view uses `ProjectDetailViewModel` with computed
  `TotalSpent`, `Variance`, and `IsOverBudget` properties. EF Core computes `TotalSpent`
  as a SQL `SUM` via `Select()` projection, not by loading all `JobCost` rows into memory.
- **Field Daily Log Forms** --- `DailyLogCreateViewModel` contains only the fields a
  superintendent fills in. The EF entity `DailyLog` has additional fields like `CreatedBy`,
  `CreatedDate`, `ApprovedBy` that are set in the service layer, not exposed to the form.
- **Power BI API** --- The `JobCostsController` returns `JobCostDto` records. The API
  contract (DTO) is stable even when the underlying entity schema changes. Power BI
  dashboards do not break when the team adds internal columns.
- **Report Export** --- `ReportRowDto` records are projected from complex joins and
  aggregations. Using `Select()` ensures the SQL query is optimized and only fetches the
  columns needed for the Excel export.
- **AutoMapper profiles** --- The `BNBuildersAutoMapperProfile` class centralizes all
  mappings. A unit test calls `AssertConfigurationIsValid()` to catch missing mappings
  before they reach production.

## Interview / Senior Dev Questions

1. **Why should you never expose EF entities directly to views?**
   Expected: Over-posting attacks, tight coupling to DB schema, unnecessary data transfer,
   serialization issues with navigation properties, exposing sensitive fields.

2. **What is the difference between `ProjectTo<T>()` and `Map<T>()`?**
   Expected: `ProjectTo` translates the mapping into a LINQ expression that EF Core converts
   to SQL (only queries needed columns). `Map` operates in memory on already-loaded objects.

3. **When would you use manual mapping over AutoMapper?**
   Expected: Small projects, performance-critical paths, complex mappings that are hard to
   configure in AutoMapper, when you want zero "magic" and full debuggability.

4. **Why are C# `record` types good for DTOs?**
   Expected: Immutable by default (init-only), value-based equality, concise syntax,
   built-in `ToString`, clear intent that the type is a data carrier.

5. **What is the problem with this code?
   `var projects = await _db.Projects.Include(p => p.JobCosts).ToListAsync();
   return projects.Select(p => new ProjectListItemViewModel { Name = p.Name });`**
   Expected: It loads all projects with all their JobCosts into memory, then only maps
   the `Name` property. The `Include` is wasted, and all rows are loaded before filtering.
   Should use `Select()` projection directly on the queryable.

## Quiz

**Q1: What is the main risk of passing an EF entity directly to a view with a form?**

a) The view renders slower
b) Over-posting: an attacker can bind properties you did not intend (e.g., `IsAdmin`)
c) EF Core throws an exception
d) The entity becomes detached from the context

<details><summary>Answer</summary>

**b) Over-posting.** If the entity has properties like `IsAdmin`, `IsApproved`, or `InternalNotes`, an attacker can add hidden form fields that bind to these properties during model binding. A ViewModel with only the intended editable fields prevents this.

</details>

**Q2: Which approach generates the most efficient SQL query?**

a) `_db.Projects.Include(p => p.PM).ToList()` then AutoMapper `Map<List<ProjectDto>>()`
b) `_db.Projects.ProjectTo<ProjectDto>(config).ToList()`
c) `_db.Projects.Select(p => new ProjectDto { Name = p.Name, PM = p.PM.Name }).ToList()`
d) Both b) and c) are equally efficient

<details><summary>Answer</summary>

**d) Both b) and c) are equally efficient.** Both `ProjectTo` and `Select()` generate SQL with only the needed columns. `ProjectTo` translates AutoMapper mappings into the same LINQ expressions that `Select` produces manually. Option a) loads entire entities into memory first, which is wasteful.

</details>

**Q3: Which C# feature makes record types ideal for DTOs?**

a) They support inheritance
b) They are mutable by default
c) They have value-based equality and are immutable by default
d) They can only be used with System.Text.Json

<details><summary>Answer</summary>

**c) Value-based equality and immutability.** Records use `init`-only properties by default, preventing accidental modification after creation. Their value-based equality means two records with the same property values are considered equal, which is the expected behavior for data transfer objects. These traits make records safer and more predictable than classes for DTO scenarios.

</details>

**Q4: You add a new `PhoneNumber` column to the `Employee` entity but forget to update the `EmployeeDetailViewModel` and its AutoMapper mapping. What happens when you call `Map<EmployeeDetailViewModel>(employee)`?**

a) AutoMapper throws a `MappingException`
b) The `PhoneNumber` is silently ignored --- the ViewModel does not have the property
c) The application fails to compile
d) AutoMapper creates the property dynamically

<details><summary>Answer</summary>

**b) Silently ignored.** AutoMapper maps matching property names. If the destination type does not have a `PhoneNumber` property, the source value is simply not mapped. No error occurs at runtime. To catch this, call `configuration.AssertConfigurationIsValid()` in a unit test with the `MemberList.Source` option, which flags unmapped source members.

</details>

**Q5: A PageModel has `[BindProperty] public ProjectEditViewModel Input { get; set; }` and also `public ProjectDisplayViewModel Display { get; set; }`. After a POST, which property is populated by model binding?**

a) Both `Input` and `Display`
b) Only `Input`
c) Only `Display`
d) Neither --- PageModels do not support model binding

<details><summary>Answer</summary>

**b) Only `Input`.** The `[BindProperty]` attribute explicitly marks `Input` for model binding. `Display` does not have the attribute, so it is not bound. This is a deliberate design in Razor Pages to prevent accidental binding of display-only properties. You must populate `Display` manually in the handler method (e.g., by querying the database).

</details>
