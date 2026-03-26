# The MVC Pattern

*Chapter 12.2 --- ASP.NET Core MVC & Razor Pages*

## Overview

The **Model-View-Controller (MVC)** pattern separates an application into three
interconnected components so that each has a single responsibility. In ASP.NET Core MVC,
this separation is enforced by convention: controllers live in `/Controllers`, views in
`/Views/{ControllerName}/`, and models in `/Models`.

Understanding MVC is not just about knowing where files go --- it is about understanding
the **request lifecycle**, how the framework locates controllers and views by convention,
and how to organize a growing codebase with Areas and proper separation of concerns.

## Core Concepts

### The Three Components

| Component | Responsibility | ASP.NET Core Artifact |
|---|---|---|
| **Model** | Business data, logic, rules, database access | POCO classes, EF entities, ViewModels |
| **View** | Presentation, HTML rendering | `.cshtml` Razor files |
| **Controller** | Handles HTTP requests, orchestrates Model and View | Classes inheriting `Controller` |

### Request Lifecycle in ASP.NET Core MVC

1. **HTTP request** arrives at Kestrel.
2. **Middleware pipeline** runs (auth, routing, etc.).
3. **Routing middleware** matches the request to a controller action.
4. **Model binding** maps request data (form, query, route) to action parameters.
5. **Action filters** execute (before/after the action).
6. **Action method** runs --- calls services, prepares a model.
7. **Result execution** --- the `IActionResult` (e.g., `ViewResult`) is executed.
8. **View engine** locates and renders the `.cshtml` file with the model.
9. **Response** flows back through middleware (bottom-to-top) to the client.

### Convention Over Configuration

ASP.NET Core MVC follows strong conventions:

- A class named `ProjectController` handles routes under `/Project/`.
- The `Index` action method maps to `/Project` or `/Project/Index`.
- The view for `ProjectController.Index` is found at `/Views/Project/Index.cshtml`.
- Shared layouts and partials live in `/Views/Shared/`.
- `_ViewStart.cshtml` sets the default layout for all views in its directory tree.

You can override every convention, but following them makes the codebase predictable
for any ASP.NET Core developer who joins the team.

### Areas

Areas partition a large MVC application into functional groups, each with its own
controllers, views, and models:

```
/Areas
    /Admin
        /Controllers/DashboardController.cs
        /Views/Dashboard/Index.cshtml
    /FieldOps
        /Controllers/DailyLogController.cs
        /Views/DailyLog/Index.cshtml
```

Each area is essentially a mini-MVC app within the larger application.

### Separation of Concerns

- **Controllers** should be thin --- delegate business logic to **services**.
- **Views** should contain minimal C# --- only display logic.
- **Models** should not know about HTTP, views, or controllers.
- Use **ViewModels** to shape data for a specific view rather than passing EF entities.

## Code Examples

### Basic Controller

```csharp
public class ProjectController : Controller
{
    private readonly IProjectService _projectService;

    public ProjectController(IProjectService projectService)
    {
        _projectService = projectService;
    }

    // GET /Project or /Project/Index
    public async Task<IActionResult> Index()
    {
        var projects = await _projectService.GetActiveProjectsAsync();
        return View(projects); // Views/Project/Index.cshtml
    }

    // GET /Project/Details/42
    public async Task<IActionResult> Details(int id)
    {
        var project = await _projectService.GetByIdAsync(id);
        if (project == null)
            return NotFound();

        return View(project); // Views/Project/Details.cshtml
    }
}
```

### Corresponding View (Views/Project/Index.cshtml)

```html
@model IEnumerable<ProjectViewModel>

<h1>Active Projects</h1>

<table class="table">
    <thead>
        <tr>
            <th>Project Number</th>
            <th>Name</th>
            <th>Budget</th>
            <th></th>
        </tr>
    </thead>
    <tbody>
        @foreach (var project in Model)
        {
            <tr>
                <td>@project.ProjectNumber</td>
                <td>@project.Name</td>
                <td>@project.Budget.ToString("C")</td>
                <td>
                    <a asp-action="Details" asp-route-id="@project.Id">View</a>
                </td>
            </tr>
        }
    </tbody>
</table>
```

### Model (ViewModel)

```csharp
public class ProjectViewModel
{
    public int Id { get; set; }
    public string ProjectNumber { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Budget { get; set; }
}
```

### Area Registration

```csharp
// Controller in an Area
[Area("Admin")]
public class DashboardController : Controller
{
    public IActionResult Index()
    {
        return View();
    }
}
```

```csharp
// Program.cs --- register area routes
app.MapControllerRoute(
    name: "areas",
    pattern: "{area:exists}/{controller=Home}/{action=Index}/{id?}");

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");
```

### Thin Controller, Fat Service

```csharp
// BAD --- business logic in the controller
public class InvoiceController : Controller
{
    private readonly BNBuildersDbContext _db;

    public InvoiceController(BNBuildersDbContext db) => _db = db;

    [HttpPost]
    public async Task<IActionResult> Approve(int id)
    {
        var invoice = await _db.Invoices.FindAsync(id);
        if (invoice == null) return NotFound();

        // Business logic leaking into controller
        if (invoice.Amount > 50000)
            invoice.RequiresVPApproval = true;
        invoice.Status = InvoiceStatus.Approved;
        invoice.ApprovedDate = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return RedirectToAction("Index");
    }
}
```

```csharp
// GOOD --- controller delegates to a service
public class InvoiceController : Controller
{
    private readonly IInvoiceService _invoiceService;

    public InvoiceController(IInvoiceService invoiceService)
        => _invoiceService = invoiceService;

    [HttpPost]
    public async Task<IActionResult> Approve(int id)
    {
        var result = await _invoiceService.ApproveAsync(id);
        if (!result.Success)
            return NotFound();

        return RedirectToAction("Index");
    }
}
```

### Passing Data to Views --- Three Approaches

```csharp
// 1. Strongly-typed model (preferred)
public IActionResult Details(int id)
{
    var vm = new ProjectDetailViewModel { Id = id, Name = "Harbor Tower" };
    return View(vm);
}

// 2. ViewBag (dynamic, avoid in large apps)
public IActionResult Details(int id)
{
    ViewBag.ProjectName = "Harbor Tower";
    return View();
}

// 3. ViewData (dictionary, avoid in large apps)
public IActionResult Details(int id)
{
    ViewData["ProjectName"] = "Harbor Tower";
    return View();
}
```

## Common Patterns

1. **Repository + Service + Controller layering** --- Controllers call services, services
   call repositories or DbContext. Each layer has a single responsibility.
2. **PRG (Post-Redirect-Get)** --- After a POST that changes data, redirect to a GET
   action. Prevents duplicate form submissions on browser refresh.
3. **TempData for flash messages** --- After a redirect, use `TempData["Message"]` to
   display a success banner on the next page.
4. **Shared layouts for consistent chrome** --- All BNBuilders apps use a common
   `_Layout.cshtml` with the company sidebar nav, user info, and footer.
5. **Feature folders (alternative to convention)** --- Instead of grouping by type
   (all controllers together, all views together), group by feature:
   ```
   /Features
       /JobCost
           JobCostController.cs
           JobCostService.cs
           Index.cshtml
           JobCostViewModel.cs
   ```

## Gotchas and Pitfalls

- **Returning a model from a GET and a different model on POST** --- Use the same ViewModel
  for both the form display (GET) and the form submission (POST), or you will fight model
  binding mismatches.
- **Forgetting the `[Area]` attribute** --- The controller will not be found under the area
  route without it, even if it physically lives in the Area folder.
- **Large controllers** --- A controller with 30+ actions is a sign that it should be split
  into multiple controllers or moved to Areas.
- **Exposing EF entities directly to views** --- Leads to over-posting vulnerabilities and
  tight coupling. Always use ViewModels.
- **Using `ViewBag` excessively** --- It is dynamic and has no compile-time checking. A typo
  in the property name silently returns null. Prefer strongly-typed ViewModels.

## Performance Considerations

- **View compilation** --- In Production, Razor views are precompiled at publish time. In
  Development, runtime compilation (`AddRazorRuntimeCompilation`) enables edit-and-refresh
  but is slower.
- **Avoid calling the database in views** --- Lazy loading in a `@foreach` loop causes
  N+1 queries. Eagerly load all data in the controller/service.
- **Cache expensive view data** --- If a sidebar shows project counts across the company,
  cache that in `IMemoryCache` rather than querying on every page load.
- **Async all the way** --- Every database or HTTP call in a controller should be `async`
  to avoid blocking thread pool threads under load.

## BNBuilders Context

MVC is the backbone of BNBuilders' internal tools:

- **Job Cost Dashboard** --- The `JobCostController` fetches data from the `IJobCostService`
  and passes a `JobCostSummaryViewModel` to the view. The view renders a table with cost
  codes, budgeted amounts, actual costs, and variance columns.
- **Field Data Entry** --- Uses Areas: the `FieldOps` area has controllers for daily logs,
  safety inspections, and material receipts. Each area has its own layout with
  mobile-friendly navigation for field staff on tablets.
- **Admin Portal** --- The `Admin` area contains user management, project setup, and
  system configuration. Access is restricted by the `[Authorize(Roles = "Admin")]`
  attribute on the area's controllers.
- **Reporting Apps** --- Follow PRG strictly. When a user generates a report (POST), the
  app redirects to a GET endpoint that displays the cached result, preventing duplicate
  expensive report generation on refresh.
- **Convention compliance** --- New developers onboarding at BNBuilders can navigate any
  internal app immediately because every project follows the standard MVC folder structure.

## Interview / Senior Dev Questions

1. **What are the three components of MVC and what is each responsible for?**
   Expected: Model (data/logic), View (presentation), Controller (request handling/orchestration).

2. **Describe the full request lifecycle from HTTP request to rendered HTML.**
   Expected: Kestrel -> middleware -> routing -> model binding -> filters -> action ->
   result execution -> view rendering -> response through middleware.

3. **Why should controllers be "thin"?**
   Expected: Business logic in controllers is hard to unit test, hard to reuse, and violates
   separation of concerns. Delegate to services.

4. **When would you use Areas instead of just more controllers?**
   Expected: When the app has distinct functional sections (Admin, FieldOps, Reporting)
   with their own views and potentially their own layouts.

5. **What is the PRG pattern and why is it important?**
   Expected: Post-Redirect-Get. After a state-changing POST, redirect to a GET. Prevents
   duplicate submissions when the user refreshes the browser.

## Quiz

**Q1: A controller named `ReportController` has an action named `Monthly`. By convention, where does ASP.NET Core look for the view?**

a) `/Views/Monthly/Report.cshtml`
b) `/Views/Report/Monthly.cshtml`
c) `/Views/Shared/Monthly.cshtml`
d) `/Pages/Report/Monthly.cshtml`

<details><summary>Answer</summary>

**b) `/Views/Report/Monthly.cshtml`** --- The convention is `/Views/{ControllerName}/{ActionName}.cshtml`. The controller name is `Report` (without the `Controller` suffix) and the action is `Monthly`. If not found there, the framework also checks `/Views/Shared/Monthly.cshtml`.

</details>

**Q2: Which approach for passing data from controller to view provides compile-time type safety?**

a) `ViewBag`
b) `ViewData`
c) Strongly-typed `@model` with a ViewModel
d) `TempData`

<details><summary>Answer</summary>

**c) Strongly-typed `@model`** --- Using `@model ProjectViewModel` at the top of the Razor view gives full IntelliSense and compile-time checking. `ViewBag` is dynamic, `ViewData` is a dictionary of `object`, and `TempData` is for cross-request data and also lacks type safety.

</details>

**Q3: What is wrong with this controller action?**

```csharp
[HttpPost]
public async Task<IActionResult> Create(ProjectViewModel model)
{
    await _projectService.CreateAsync(model);
    return View("Index");
}
```

a) Nothing, it is correct
b) It should return `RedirectToAction("Index")` to follow the PRG pattern
c) It should use `ViewBag` instead of a model
d) The `async` keyword is unnecessary

<details><summary>Answer</summary>

**b) It should return `RedirectToAction("Index")`** --- After a POST that changes state, you should redirect to a GET action (Post-Redirect-Get pattern). Returning `View("Index")` directly means the browser's URL still shows the POST URL, and refreshing the page will resubmit the form.

</details>

**Q4: You have a BNBuilders app with Admin, FieldOps, and Reporting sections. What MVC feature best organizes this?**

a) Multiple projects in one solution
b) Areas
c) Nested controllers
d) Separate `Program.cs` files

<details><summary>Answer</summary>

**b) Areas** --- Areas provide isolated folders for controllers, views, and models for each functional section. Each area can have its own layout and routing. This keeps the codebase organized without the overhead of separate deployable projects.

</details>
