# Model Binding and Validation

*Chapter 12.5 --- ASP.NET Core MVC & Razor Pages*

## Overview

Model binding is the process by which ASP.NET Core maps data from HTTP requests (form
fields, route parameters, query strings, headers, and request bodies) onto action method
parameters and properties. It eliminates the need to manually parse `Request.Form` or
`Request.Query` --- the framework does it automatically based on parameter names and types.

Understanding binding sources, complex type binding, collections, and custom model binders
gives you full control over how incoming data flows into your application.

## Core Concepts

### How Model Binding Works

When a request hits an action method, the model binder:

1. Examines each parameter of the action method.
2. Searches **binding sources** in a default order to find matching values.
3. Converts the string values to the parameter's .NET type.
4. Populates the parameter (or object properties for complex types).
5. Runs validation (data annotations, `IValidatableObject`).
6. Sets `ModelState.IsValid` based on the results.

### Default Binding Source Order

For **non-API controllers** (MVC), the binder checks these sources in order:

1. **Form data** (POST body with `application/x-www-form-urlencoded` or `multipart/form-data`)
2. **Route data** (`{id}` in the route template)
3. **Query string** (`?projectId=42`)

For **`[ApiController]`** controllers, binding source inference changes:
- Complex types default to `[FromBody]`.
- Simple types default to `[FromRoute]` or `[FromQuery]`.

### Binding Source Attributes

| Attribute | Source | Example |
|---|---|---|
| `[FromForm]` | Form data | File uploads, HTML forms |
| `[FromRoute]` | Route parameters | `{id}` in URL path |
| `[FromQuery]` | Query string | `?page=2&size=25` |
| `[FromBody]` | Request body (JSON/XML) | API POST/PUT payloads |
| `[FromHeader]` | HTTP headers | `X-Correlation-Id` |
| `[FromServices]` | DI container | Inject a service into an action |

### Complex Type Binding

For a class like `ProjectCreateViewModel`, the binder matches each property name to form
fields, query string parameters, or JSON properties:

```csharp
public class ProjectCreateViewModel
{
    public string Name { get; set; }        // Bound from "Name" field
    public string ProjectNumber { get; set; } // Bound from "ProjectNumber" field
    public decimal Budget { get; set; }     // Bound from "Budget" field
}
```

### Collections Binding

ASP.NET Core can bind arrays and lists from indexed form fields or JSON arrays.

### Custom Model Binders

When the built-in binding is insufficient (e.g., parsing a custom date format or a
composite key), you can implement `IModelBinder`.

## Code Examples

### Form Binding (MVC)

```csharp
// The form POSTs data as application/x-www-form-urlencoded
// Fields: Name, ProjectNumber, Budget, ProjectManagerId

[HttpPost]
[ValidateAntiForgeryToken]
public async Task<IActionResult> Create(ProjectCreateViewModel model)
{
    // model.Name, model.ProjectNumber, model.Budget are all bound from form data
    if (!ModelState.IsValid)
        return View(model);

    await _projectService.CreateAsync(model);
    return RedirectToAction(nameof(Index));
}
```

### Route and Query String Binding

```csharp
// GET /Project/Details/42?includeArchived=true
public async Task<IActionResult> Details(
    int id,                              // Bound from route: {id}
    [FromQuery] bool includeArchived = false) // Bound from query string
{
    var project = await _projectService.GetByIdAsync(id, includeArchived);
    if (project == null) return NotFound();
    return View(project);
}
```

### [FromBody] for API Controllers

```csharp
[ApiController]
[Route("api/[controller]")]
public class JobCostsController : ControllerBase
{
    // POST api/jobcosts
    // Body: { "projectId": 42, "costCode": "03-100", "amount": 15000.00 }
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] JobCostCreateDto dto)
    {
        // dto is deserialized from JSON body
        var created = await _jobCostService.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }
}
```

### [FromHeader] Binding

```csharp
[HttpGet]
public IActionResult GetReport(
    [FromHeader(Name = "X-Correlation-Id")] string? correlationId,
    [FromQuery] int projectId)
{
    _logger.LogInformation("Correlation: {CorrelationId}, Project: {ProjectId}",
        correlationId, projectId);
    // ...
    return Ok();
}
```

### [FromServices] --- Inject Into Action

```csharp
// Instead of constructor injection for a rarely-used service
[HttpPost]
public async Task<IActionResult> ExportToExcel(
    int projectId,
    [FromServices] IExcelExportService excelService)
{
    var bytes = await excelService.ExportProjectAsync(projectId);
    return File(bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        $"Project_{projectId}.xlsx");
}
```

### Collections Binding from Forms

```html
<!-- HTML form with indexed fields -->
<form method="post" asp-action="CreateBatch">
    @for (int i = 0; i < Model.Items.Count; i++)
    {
        <div class="row mb-2">
            <div class="col">
                <input asp-for="Items[i].CostCode" class="form-control"
                       placeholder="Cost Code" />
            </div>
            <div class="col">
                <input asp-for="Items[i].Description" class="form-control"
                       placeholder="Description" />
            </div>
            <div class="col">
                <input asp-for="Items[i].Amount" class="form-control"
                       type="number" step="0.01" />
            </div>
        </div>
    }
    <button type="submit" class="btn btn-primary">Submit All</button>
</form>
```

```csharp
public class BatchCreateViewModel
{
    public List<JobCostLineItem> Items { get; set; } = new();
}

public class JobCostLineItem
{
    public string CostCode { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

[HttpPost]
[ValidateAntiForgeryToken]
public async Task<IActionResult> CreateBatch(BatchCreateViewModel model)
{
    // model.Items is a List<JobCostLineItem> bound from indexed form fields
    // Items[0].CostCode, Items[0].Description, Items[0].Amount
    // Items[1].CostCode, Items[1].Description, Items[1].Amount
    if (!ModelState.IsValid)
        return View(model);

    await _jobCostService.CreateBatchAsync(model.Items);
    return RedirectToAction(nameof(Index));
}
```

### Custom Model Binder

```csharp
// Scenario: BNBuilders uses composite project codes like "BNB-2026-042"
// We want to bind this into a strongly-typed ProjectCode object.

public class ProjectCode
{
    public string Prefix { get; set; } = string.Empty;
    public int Year { get; set; }
    public int Sequence { get; set; }

    public override string ToString() => $"{Prefix}-{Year}-{Sequence:D3}";
}

public class ProjectCodeModelBinder : IModelBinder
{
    public Task BindModelAsync(ModelBindingContext bindingContext)
    {
        var value = bindingContext.ValueProvider
            .GetValue(bindingContext.FieldName)
            .FirstValue;

        if (string.IsNullOrEmpty(value))
        {
            bindingContext.Result = ModelBindingResult.Failed();
            return Task.CompletedTask;
        }

        var parts = value.Split('-');
        if (parts.Length != 3 ||
            !int.TryParse(parts[1], out var year) ||
            !int.TryParse(parts[2], out var sequence))
        {
            bindingContext.ModelState.AddModelError(
                bindingContext.FieldName,
                "Invalid project code format. Expected: BNB-2026-042");
            bindingContext.Result = ModelBindingResult.Failed();
            return Task.CompletedTask;
        }

        var code = new ProjectCode
        {
            Prefix = parts[0],
            Year = year,
            Sequence = sequence
        };

        bindingContext.Result = ModelBindingResult.Success(code);
        return Task.CompletedTask;
    }
}

// Register via attribute on the type
[ModelBinder(BinderType = typeof(ProjectCodeModelBinder))]
public class ProjectCode { /* ... */ }

// Or register globally in Program.cs
builder.Services.AddControllersWithViews(options =>
{
    options.ModelBinderProviders.Insert(0, new ProjectCodeModelBinderProvider());
});
```

### ModelBinderProvider for the Custom Binder

```csharp
public class ProjectCodeModelBinderProvider : IModelBinderProvider
{
    public IModelBinder? GetBinder(ModelBinderProviderContext context)
    {
        if (context.Metadata.ModelType == typeof(ProjectCode))
            return new BinderTypeModelBinder(typeof(ProjectCodeModelBinder));

        return null;
    }
}
```

## Common Patterns

1. **Explicit binding source on API parameters** --- Even though `[ApiController]` infers
   sources, being explicit with `[FromBody]`, `[FromQuery]`, `[FromRoute]` improves
   readability and prevents surprises.
2. **Nullable parameters with defaults** --- Use `int? id` or `int page = 1` for optional
   parameters so the binder does not fail when they are absent.
3. **Prefix-based binding** --- When a form has a prefix (`Address.Street`, `Address.City`),
   the binder automatically maps to nested properties of a complex type.
4. **`[Bind]` attribute to whitelist properties** --- Prevent over-posting:
   `public IActionResult Edit([Bind("Name,Budget")] ProjectViewModel model)`.
5. **`TryUpdateModelAsync`** --- Manually trigger binding in the action body. Useful when
   you need to load an entity from the database first, then update only certain fields.

## Gotchas and Pitfalls

- **Over-posting (mass assignment)** --- If your model has an `IsAdmin` property and the
  attacker adds `IsAdmin=true` to the form, it gets bound. Use ViewModels with only the
  fields you expect, or use `[Bind]` / `[BindNever]`.
- **`[FromBody]` can only be used once per action** --- The request body can only be read
  once. Multiple `[FromBody]` parameters cause an error.
- **Binding fails silently for value types** --- If `int id` cannot be bound (e.g., the
  route does not have `{id}`), it defaults to `0` --- not an error. Use `int? id` and
  check for null.
- **JSON property casing** --- By default, `System.Text.Json` uses camelCase. A JSON body
  with `"ProjectId"` will not bind to a C# property `ProjectId` if the serializer expects
  `"projectId"`. Configure `PropertyNameCaseInsensitive = true` in options.
- **File uploads require `[FromForm]`** --- `IFormFile` parameters need form encoding.
  They will not bind from JSON.
- **Collections need sequential indices** --- Form fields `Items[0]`, `Items[1]`, `Items[3]`
  (missing `[2]`) will only bind the first two. The binder stops at the gap.

## Performance Considerations

- **Avoid binding large objects unnecessarily** --- If an action only needs two fields, do
  not bind a 30-property ViewModel. Smaller models bind faster and reduce attack surface.
- **`[FromBody]` reads the entire request body into memory** --- For large payloads (file
  uploads), use streaming (`Request.Body`) instead.
- **Custom model binders should be lightweight** --- They run on every matching request.
  Avoid database calls or heavy computation.
- **`TryUpdateModelAsync` re-reads form data** --- It is efficient for targeted updates but
  avoid calling it multiple times in the same action.

## BNBuilders Context

- **Field Data Entry Forms** --- Superintendents enter daily logs with labor hours, material
  deliveries, and weather conditions. Complex type binding maps the entire form to a
  `DailyLogCreateViewModel` with nested `LaborEntry[]` and `MaterialDelivery[]` collections.
- **Job Cost Batch Import** --- The batch entry form uses indexed collection binding
  (`Items[0].CostCode`, `Items[0].Amount`) to let cost engineers enter multiple line items
  at once.
- **Project Code Binder** --- A custom model binder parses BNBuilders project codes
  (`BNB-2026-042`) into a `ProjectCode` type with `Prefix`, `Year`, and `Sequence`
  properties, used across multiple controllers.
- **API for Power BI** --- The `JobCostsController` uses `[FromQuery]` for filter parameters
  (`projectId`, `dateFrom`, `dateTo`) and `[FromBody]` for create/update payloads.
- **Over-posting protection** --- All internal apps use dedicated ViewModels rather than EF
  entities to prevent field workers from manipulating hidden form fields to alter records
  they should not change (e.g., `ApprovedBy`, `IsLocked`).

## Interview / Senior Dev Questions

1. **What is model binding and what sources does it check by default?**
   Expected: Automatically maps HTTP request data to action parameters. Default order:
   form data, route data, query string.

2. **What is the over-posting vulnerability and how do you prevent it?**
   Expected: An attacker sends extra form fields that bind to properties you did not intend.
   Prevent with ViewModels, `[Bind]`, or `[BindNever]`.

3. **When would you write a custom model binder?**
   Expected: When the built-in binders cannot handle a custom format (composite IDs, special
   date formats, encrypted tokens).

4. **What is the difference between `[FromBody]` and `[FromForm]`?**
   Expected: `[FromBody]` reads JSON/XML from the request body. `[FromForm]` reads
   URL-encoded or multipart form data. They use different formatters.

5. **Why can `[FromBody]` only be used once per action?**
   Expected: The request body is a forward-only stream. Once read, it cannot be re-read
   (unless buffering is explicitly enabled).

## Quiz

**Q1: An action parameter is `int id` but the route template does not include `{id}` and no query string is provided. What value does `id` have?**

a) It throws an exception
b) It is `0` (default for int)
c) It is `null`
d) It is `-1`

<details><summary>Answer</summary>

**b) `0`** --- Value types like `int` cannot be null, so when binding fails, they receive their default value (`0` for int, `false` for bool, etc.). This is why nullable types (`int?`) are safer for optional parameters --- you can distinguish "not provided" (null) from "provided as zero."

</details>

**Q2: You have an API action: `public IActionResult Create([FromBody] JobCostDto dto, [FromBody] AuditDto audit)`. What happens?**

a) Both parameters bind correctly from different parts of the JSON
b) Only the first parameter binds
c) The framework throws an error --- `[FromBody]` can only appear once per action
d) The second parameter defaults to null

<details><summary>Answer</summary>

**c) The framework throws an error.** The request body can only be read once (it is a forward-only stream). Having two `[FromBody]` parameters causes an `InvalidOperationException`. To fix this, create a single wrapper DTO that contains both objects, or put one parameter on the query string.

</details>

**Q3: A form sends fields `Items[0].Code`, `Items[1].Code`, `Items[3].Code` (index 2 is missing). How many items does the model binder populate?**

a) 4 (with index 2 having default values)
b) 3 (all provided indices)
c) 2 (stops at the gap)
d) 0 (the entire collection fails)

<details><summary>Answer</summary>

**c) 2** --- The default model binder for collections uses sequential indexing. It starts at index 0 and increments. When it does not find index 2, it stops. Items at index 0 and 1 are bound. The item at index 3 is ignored. To avoid this, ensure indices are sequential or use a non-sequential binding approach with explicit index fields.

</details>

**Q4: Which attribute prevents a property from being bound during model binding?**

a) `[Required]`
b) `[BindNever]`
c) `[NotMapped]`
d) `[JsonIgnore]`

<details><summary>Answer</summary>

**b) `[BindNever]`** --- This attribute tells the model binder to skip the property entirely. `[Required]` is validation, not binding prevention. `[NotMapped]` is an EF Core attribute for database mapping. `[JsonIgnore]` affects JSON serialization but not form-based model binding.

</details>
