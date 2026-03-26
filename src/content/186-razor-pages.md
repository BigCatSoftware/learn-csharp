# Razor Pages

*Chapter 12.7 --- ASP.NET Core MVC & Razor Pages*

## Overview

Razor Pages is a page-based programming model in ASP.NET Core that simplifies web UI
development. Instead of the Controller + View split, each page is a self-contained unit
with a `.cshtml` file (the markup) and a `.cshtml.cs` **PageModel** class (the logic).
Razor Pages is not a replacement for MVC --- it is an alternative that works better for
page-focused scenarios like forms, dashboards, and CRUD screens.

Razor Pages ships in the same `Microsoft.AspNetCore.Mvc` package, uses the same Razor
syntax, tag helpers, model binding, and validation. The difference is structural:
convention is organized around **pages**, not **controllers**.

## Core Concepts

### PageModel Pattern

Every Razor Page has a **PageModel** class that acts as both the controller and the view
model for that page:

```
/Pages
    /Projects
        Index.cshtml          <-- markup
        Index.cshtml.cs       <-- PageModel (handler methods + bound properties)
        Create.cshtml
        Create.cshtml.cs
        Edit.cshtml
        Edit.cshtml.cs
```

The PageModel inherits from `PageModel` and contains handler methods that respond to
HTTP verbs.

### Handler Methods

| Method | HTTP Verb | When It Runs |
|---|---|---|
| `OnGet()` / `OnGetAsync()` | GET | Page load |
| `OnPost()` / `OnPostAsync()` | POST | Form submission |
| `OnPut()` / `OnPutAsync()` | PUT | REST-style updates |
| `OnDelete()` / `OnDeleteAsync()` | DELETE | REST-style deletes |

### Named Handlers

A single page can have multiple POST actions using **named handlers**:

- `OnPostApproveAsync()` --- triggered by `asp-page-handler="Approve"`
- `OnPostRejectAsync()` --- triggered by `asp-page-handler="Reject"`

The form adds a `handler` query string parameter (e.g., `?handler=Approve`).

### [BindProperty]

In MVC controllers, action parameters are automatically bound. In Razor Pages, you must
opt in with `[BindProperty]`:

- `[BindProperty]` --- Binds on POST only (default).
- `[BindProperty(SupportsGet = true)]` --- Also binds on GET (needed for query string
  parameters).

### Routing in Razor Pages

Routes are derived from the file path:

| File Path | Default Route |
|---|---|
| `/Pages/Index.cshtml` | `/` or `/Index` |
| `/Pages/Projects/Index.cshtml` | `/Projects` |
| `/Pages/Projects/Details.cshtml` | `/Projects/Details` |
| `/Pages/Projects/Edit.cshtml` | `/Projects/Edit` |

You can customize with `@page "{id:int}"` in the `.cshtml` file to add route parameters.

### TempData

`TempData` survives a single redirect. It is stored in a cookie or session and is cleared
after being read. Perfect for flash messages after PRG.

## Code Examples

### Basic Razor Page --- Project List

```csharp
// Pages/Projects/Index.cshtml.cs
public class IndexModel : PageModel
{
    private readonly IProjectService _projectService;

    public IndexModel(IProjectService projectService)
    {
        _projectService = projectService;
    }

    public IList<ProjectSummaryViewModel> Projects { get; set; } = new();

    [BindProperty(SupportsGet = true)]
    public string? SearchTerm { get; set; }

    [TempData]
    public string? SuccessMessage { get; set; }

    public async Task OnGetAsync()
    {
        Projects = await _projectService.SearchAsync(SearchTerm);
    }
}
```

```html
@page
@model BNBuilders.Web.Pages.Projects.IndexModel

@{
    ViewData["Title"] = "Projects";
}

<h1>Projects</h1>

@if (!string.IsNullOrEmpty(Model.SuccessMessage))
{
    <div class="alert alert-success">@Model.SuccessMessage</div>
}

<form method="get" class="mb-3">
    <div class="input-group">
        <input asp-for="SearchTerm" class="form-control"
               placeholder="Search projects..." />
        <button class="btn btn-outline-secondary" type="submit">Search</button>
    </div>
</form>

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
        @foreach (var project in Model.Projects)
        {
            <tr>
                <td>@project.ProjectNumber</td>
                <td>@project.Name</td>
                <td>@project.Budget.ToString("C")</td>
                <td>
                    <a asp-page="./Details" asp-route-id="@project.Id">View</a> |
                    <a asp-page="./Edit" asp-route-id="@project.Id">Edit</a>
                </td>
            </tr>
        }
    </tbody>
</table>

<a asp-page="./Create" class="btn btn-primary">Create New Project</a>
```

### Create Page with Form Handling

```csharp
// Pages/Projects/Create.cshtml.cs
public class CreateModel : PageModel
{
    private readonly IProjectService _projectService;
    private readonly ILookupService _lookupService;

    public CreateModel(IProjectService projectService, ILookupService lookupService)
    {
        _projectService = projectService;
        _lookupService = lookupService;
    }

    [BindProperty]
    public ProjectCreateViewModel Input { get; set; } = new();

    public SelectList ProjectManagers { get; set; } = default!;

    public async Task<IActionResult> OnGetAsync()
    {
        ProjectManagers = new SelectList(
            await _lookupService.GetProjectManagersAsync(), "Id", "Name");
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
    {
        if (!ModelState.IsValid)
        {
            ProjectManagers = new SelectList(
                await _lookupService.GetProjectManagersAsync(), "Id", "Name");
            return Page();
        }

        await _projectService.CreateAsync(Input);
        TempData["SuccessMessage"] = "Project created successfully.";
        return RedirectToPage("./Index");
    }
}
```

```html
@page
@model BNBuilders.Web.Pages.Projects.CreateModel

@{
    ViewData["Title"] = "Create Project";
}

<h1>Create Project</h1>

<form method="post">
    <div asp-validation-summary="ModelOnly" class="text-danger"></div>

    <div class="mb-3">
        <label asp-for="Input.Name" class="form-label"></label>
        <input asp-for="Input.Name" class="form-control" />
        <span asp-validation-for="Input.Name" class="text-danger"></span>
    </div>

    <div class="mb-3">
        <label asp-for="Input.ProjectNumber" class="form-label"></label>
        <input asp-for="Input.ProjectNumber" class="form-control" />
        <span asp-validation-for="Input.ProjectNumber" class="text-danger"></span>
    </div>

    <div class="mb-3">
        <label asp-for="Input.Budget" class="form-label"></label>
        <input asp-for="Input.Budget" class="form-control" type="number" step="0.01" />
        <span asp-validation-for="Input.Budget" class="text-danger"></span>
    </div>

    <div class="mb-3">
        <label asp-for="Input.ProjectManagerId" class="form-label"></label>
        <select asp-for="Input.ProjectManagerId" asp-items="Model.ProjectManagers"
                class="form-select">
            <option value="">-- Select PM --</option>
        </select>
        <span asp-validation-for="Input.ProjectManagerId" class="text-danger"></span>
    </div>

    <button type="submit" class="btn btn-primary">Create</button>
    <a asp-page="./Index" class="btn btn-secondary">Cancel</a>
</form>

@section Scripts {
    <partial name="_ValidationScriptsPartial" />
}
```

### Named Handlers

```csharp
// Pages/ChangeOrders/Details.cshtml.cs
public class DetailsModel : PageModel
{
    private readonly IChangeOrderService _changeOrderService;

    public DetailsModel(IChangeOrderService changeOrderService)
    {
        _changeOrderService = changeOrderService;
    }

    public ChangeOrderDetailViewModel ChangeOrder { get; set; } = default!;

    public async Task<IActionResult> OnGetAsync(int id)
    {
        ChangeOrder = await _changeOrderService.GetByIdAsync(id);
        if (ChangeOrder == null) return NotFound();
        return Page();
    }

    public async Task<IActionResult> OnPostApproveAsync(int id)
    {
        await _changeOrderService.ApproveAsync(id);
        TempData["SuccessMessage"] = "Change order approved.";
        return RedirectToPage("./Details", new { id });
    }

    public async Task<IActionResult> OnPostRejectAsync(int id, string reason)
    {
        await _changeOrderService.RejectAsync(id, reason);
        TempData["SuccessMessage"] = "Change order rejected.";
        return RedirectToPage("./Details", new { id });
    }
}
```

```html
@page "{id:int}"
@model BNBuilders.Web.Pages.ChangeOrders.DetailsModel

<h1>Change Order #@Model.ChangeOrder.Number</h1>
<p>Amount: @Model.ChangeOrder.Amount.ToString("C")</p>
<p>Status: @Model.ChangeOrder.Status</p>

@if (Model.ChangeOrder.Status == "Pending")
{
    <form method="post" asp-page-handler="Approve" class="d-inline">
        <input type="hidden" name="id" value="@Model.ChangeOrder.Id" />
        <button type="submit" class="btn btn-success">Approve</button>
    </form>

    <form method="post" asp-page-handler="Reject" class="d-inline">
        <input type="hidden" name="id" value="@Model.ChangeOrder.Id" />
        <input type="text" name="reason" placeholder="Reason" class="form-control d-inline w-auto" />
        <button type="submit" class="btn btn-danger">Reject</button>
    </form>
}
```

### Page Conventions

```csharp
// Program.cs --- configure Razor Pages conventions
builder.Services.AddRazorPages(options =>
{
    // Require authentication for all pages under /Admin
    options.Conventions.AuthorizeFolder("/Admin");

    // Allow anonymous access to the login page
    options.Conventions.AllowAnonymousToPage("/Account/Login");

    // Custom route for a page
    options.Conventions.AddPageRoute("/Projects/Details", "p/{id:int}");
});
```

### Custom Route Templates

```html
<!-- Pages/Projects/Details.cshtml -->
@page "{id:int}"
@model BNBuilders.Web.Pages.Projects.DetailsModel

<!-- This page responds to /Projects/Details/42 -->
```

```html
<!-- Pages/Reports/Monthly.cshtml -->
@page "{year:int}/{month:range(1,12)}"
@model BNBuilders.Web.Pages.Reports.MonthlyModel

<!-- This page responds to /Reports/Monthly/2026/3 -->
```

### TempData Usage

```csharp
// Setting TempData (before redirect)
TempData["SuccessMessage"] = "Record saved successfully.";
return RedirectToPage("./Index");

// Reading TempData (on the target page)
// Option 1: In PageModel with [TempData] attribute
[TempData]
public string? SuccessMessage { get; set; }

// Option 2: In Razor markup
@if (TempData["SuccessMessage"] is string message)
{
    <div class="alert alert-success alert-dismissible">
        @message
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
}
```

## Common Patterns

1. **One PageModel per page** --- Each page is self-contained. The `Index.cshtml.cs` handles
   listing, `Create.cshtml.cs` handles creation, etc. No shared controller.
2. **`[BindProperty]` on an `Input` object** --- Group all form-bound properties into a
   single `Input` property. Keeps the PageModel clean and avoids accidentally binding
   display-only properties.
3. **Named handlers for multi-button forms** --- Approve/Reject, Save/SaveAndContinue,
   Delete confirmation --- all on the same page with different `asp-page-handler` values.
4. **Page conventions for auth** --- `AuthorizeFolder` and `AllowAnonymousToPage` in
   `Program.cs` keep authorization rules centralized.
5. **TempData for flash messages** --- After a successful POST that redirects, set
   `TempData["SuccessMessage"]` and display it on the target page.

## Gotchas and Pitfalls

- **`[BindProperty]` does NOT bind on GET by default.** If you need a query string
  parameter on GET, you must add `SupportsGet = true`. Otherwise the property is always
  null/default on GET requests.
- **Forgetting `@page` directive** --- Without `@page` at the top of the `.cshtml` file,
  it is treated as a regular view, not a Razor Page. Routing will not find it.
- **Named handler casing** --- `OnPostApproveAsync` maps to `handler=Approve` (not
  `handler=approve`). The handler name is case-insensitive in the URL but must match the
  method name pattern exactly: `OnPost{HandlerName}Async`.
- **Non-handler public methods** --- Any public method on the PageModel that matches the
  `On{Verb}{Handler}` pattern is treated as a handler. Be careful naming utility methods.
- **SelectList not surviving POST** --- `SelectList` properties are not bound from forms.
  You must repopulate them in `OnPostAsync` when returning `Page()` after validation failure.
- **`asp-page` routing** --- Use `./` prefix for relative page links within the same folder:
  `asp-page="./Details"`. Without the prefix, the path is resolved from the root.

## Performance Considerations

- **Razor Pages have slightly less overhead than MVC** for simple page scenarios because
  there is no controller activation and action selection step.
- **Use `OnGetAsync` with `CancellationToken`** for database calls so that if the user
  navigates away, the query is cancelled.
- **Avoid loading unnecessary data in `OnGetAsync`** --- Only fetch what the page needs.
  Use projection (`Select`) to avoid loading entire EF entities.
- **Cache expensive lookups** --- If every page in a folder needs the same dropdown data,
  consider caching the `SelectList` in `IMemoryCache`.

## BNBuilders Context

- **Project CRUD pages** --- The `/Pages/Projects/` folder contains `Index`, `Create`,
  `Edit`, `Details`, and `Delete` pages. Each is self-contained with its own PageModel.
  This is the bread-and-butter pattern for internal tools.
- **Change Order Workflow** --- Named handlers (`OnPostApproveAsync`, `OnPostRejectAsync`)
  on the change order details page let project managers approve or reject with a single
  click. The handler name appears in the URL as `?handler=Approve`.
- **Field Daily Log** --- Field superintendents use a Razor Page form to enter daily
  activities. `[BindProperty]` binds the `DailyLogInput` object on POST. `TempData` shows
  a success banner after redirect.
- **Admin Section** --- Page conventions authorize the entire `/Admin` folder, requiring
  the `Admin` role. The login page is exempted with `AllowAnonymousToPage`.
- **Reporting** --- Custom route templates like `@page "{year:int}/{month:range(1,12)}"`
  create clean URLs like `/Reports/Monthly/2026/3` for monthly cost reports.

## Interview / Senior Dev Questions

1. **What is the difference between Razor Pages and MVC? When would you choose one over
   the other?**
   Expected: Razor Pages is page-centric (one page = one file pair). MVC is
   controller-centric (one controller handles many actions). Razor Pages is simpler for
   CRUD forms and page-focused apps. MVC is better for complex routing, APIs, and apps
   where multiple views share a controller's logic.

2. **How do named handlers work?**
   Expected: Methods named `OnPost{Name}Async` are triggered by
   `asp-page-handler="Name"` on a form. The framework adds `?handler=Name` to the URL
   and routes to the matching method.

3. **Why does `[BindProperty]` not bind on GET by default?**
   Expected: Security. GET requests should be safe and idempotent. Automatically binding
   GET query strings to properties could lead to unexpected state changes. You must
   explicitly opt in with `SupportsGet = true`.

4. **How do you handle authorization at the folder level in Razor Pages?**
   Expected: `options.Conventions.AuthorizeFolder("/Admin")` in
   `builder.Services.AddRazorPages(options => ...)`.

5. **What happens if you forget the `@page` directive?**
   Expected: The file is treated as a partial view or MVC view, not a Razor Page.
   The routing system does not discover it, and navigating to its expected URL returns 404.

## Quiz

**Q1: You have a property `[BindProperty] public string Name { get; set; }` on a PageModel. A GET request arrives with `?Name=test`. What is the value of `Name`?**

a) `"test"`
b) `null`
c) Empty string
d) It throws an exception

<details><summary>Answer</summary>

**b) `null`** --- By default, `[BindProperty]` only binds on POST. To bind from GET query strings, you must use `[BindProperty(SupportsGet = true)]`. Without `SupportsGet`, the property retains its default value (null for string).

</details>

**Q2: You have a Razor Page at `/Pages/Projects/Details.cshtml` with `@page "{id:int}"`. What URL matches this page?**

a) `/Details/42`
b) `/Projects/Details/42`
c) `/Pages/Projects/Details/42`
d) `/Projects/42`

<details><summary>Answer</summary>

**b) `/Projects/Details/42`** --- Razor Pages routing strips the `/Pages` prefix and uses the remaining folder structure. The `@page "{id:int}"` directive appends an `{id:int}` segment to the derived route, producing `/Projects/Details/{id:int}`.

</details>

**Q3: A Razor Page has two forms: one with `asp-page-handler="Approve"` and one with `asp-page-handler="Reject"`. What must the handler method names be in the PageModel?**

a) `Approve()` and `Reject()`
b) `OnPostApprove()` and `OnPostReject()` (or their async variants)
c) `HandleApprove()` and `HandleReject()`
d) `PostApprove()` and `PostReject()`

<details><summary>Answer</summary>

**b) `OnPostApprove()` and `OnPostReject()`** (or `OnPostApproveAsync()` and `OnPostRejectAsync()`). Named handlers follow the convention `On{Verb}{HandlerName}[Async]`. The handler name in `asp-page-handler` maps to the `{HandlerName}` portion of the method name.

</details>

**Q4: What is the purpose of `TempData` in the context of Razor Pages?**

a) To store data permanently in the database
b) To pass data between requests (survives one redirect, then is cleared)
c) To cache data for the application lifetime
d) To store user session data indefinitely

<details><summary>Answer</summary>

**b) To pass data between requests.** `TempData` is stored in a cookie or session and persists for exactly one subsequent request. It is ideal for flash messages after a Post-Redirect-Get pattern: set `TempData["Message"]` before the redirect, display it on the target page, and it is automatically cleared after reading.

</details>

**Q5: When would you choose MVC over Razor Pages?**

a) When building simple CRUD forms
b) When a single controller needs to serve multiple views with shared logic, or when building APIs
c) When you want page-focused organization
d) When you need model binding

<details><summary>Answer</summary>

**b) When a single controller needs to serve multiple views with shared logic, or when building APIs.** MVC's controller-based model excels when multiple actions share dependencies, filters, or base class logic. It is also the standard for Web APIs (`[ApiController]`). Razor Pages is better suited for page-centric CRUD where each page is independent.

</details>
