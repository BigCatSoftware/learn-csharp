# Views and Razor Syntax

*Chapter 12.4 --- ASP.NET Core MVC & Razor Pages*

## Overview

Razor is the server-side markup language used in ASP.NET Core to embed C# code inside HTML.
Views (`.cshtml` files) use Razor syntax to dynamically render content. The view engine
combines layouts, partial views, view components, and tag helpers to produce the final
HTML sent to the browser. Mastering Razor syntax and the view infrastructure is essential
for building maintainable, DRY web applications.

## Core Concepts

### Razor Syntax Basics

| Syntax | Purpose | Example |
|---|---|---|
| `@expression` | Inline C# expression | `@Model.Name` |
| `@{ ... }` | C# code block | `@{ var total = 0; }` |
| `@if / @else` | Conditional rendering | `@if (Model.IsActive) { ... }` |
| `@for` | For loop | `@for (int i = 0; i < 10; i++) { ... }` |
| `@foreach` | Foreach loop | `@foreach (var item in Model) { ... }` |
| `@model` | Declares the view's model type | `@model ProjectViewModel` |
| `@using` | Import a namespace | `@using BNBuilders.Models` |
| `@@` | Escape the `@` sign | `@@username` renders as `@username` |
| `@:` | Explicit text line | `@: This is plain text` |
| `<text>` | Explicit text block | `<text>Not HTML</text>` |

### Layouts

Layouts provide a consistent page structure (header, navigation, footer). Every view
renders inside a layout.

- **`_Layout.cshtml`** --- The default layout file in `/Views/Shared/`.
- **`@RenderBody()`** --- Placeholder in the layout where the child view's content appears.
- **`@RenderSection("name", required: false)`** --- Named slots for optional content
  (e.g., page-specific scripts).
- **`_ViewStart.cshtml`** --- Runs before every view in its directory. Typically sets the
  default layout: `@{ Layout = "_Layout"; }`.

### Partial Views

Reusable fragments of HTML/Razor. Named with an underscore prefix by convention
(`_ProjectCard.cshtml`).

Rendered with:
- `<partial name="_ProjectCard" model="project" />` (tag helper, preferred)
- `@await Html.PartialAsync("_ProjectCard", project)` (HTML helper)
- `@{ await Html.RenderPartialAsync("_ProjectCard", project); }` (writes directly to response)

### View Components

More powerful than partials --- they have their own logic class (like a mini-controller)
and a view. Use them when a partial needs to fetch its own data.

### Tag Helpers

Server-side components that participate in rendering HTML elements. They look like HTML
attributes, making views cleaner than the older `@Html` helpers.

| Tag Helper | Purpose |
|---|---|
| `asp-for` | Binds an input to a model property |
| `asp-action` | Generates the URL for a controller action |
| `asp-controller` | Specifies the controller for URL generation |
| `asp-route-*` | Adds route parameters |
| `asp-page` | Links to a Razor Page |
| `asp-validation-for` | Displays validation errors for a property |
| `asp-validation-summary` | Displays all validation errors |
| `asp-append-version` | Appends a file hash for cache busting |

### _ViewImports.cshtml

Declares shared directives for all views in its directory tree:

```
@using BNBuilders.Models
@using BNBuilders.ViewModels
@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers
@addTagHelper *, BNBuilders.Web
```

## Code Examples

### Basic Razor Syntax

```html
@model ProjectDetailViewModel

<h1>@Model.Name</h1>
<p>Project Number: @Model.ProjectNumber</p>

@if (Model.IsOverBudget)
{
    <div class="alert alert-danger">
        This project is over budget by @Model.Variance.ToString("C")
    </div>
}

<h3>Cost Codes</h3>
<table class="table table-striped">
    <thead>
        <tr>
            <th>Code</th>
            <th>Description</th>
            <th class="text-end">Budgeted</th>
            <th class="text-end">Actual</th>
        </tr>
    </thead>
    <tbody>
        @foreach (var costCode in Model.CostCodes)
        {
            <tr class="@(costCode.IsOverBudget ? "table-danger" : "")">
                <td>@costCode.Code</td>
                <td>@costCode.Description</td>
                <td class="text-end">@costCode.Budgeted.ToString("C")</td>
                <td class="text-end">@costCode.Actual.ToString("C")</td>
            </tr>
        }
    </tbody>
</table>

@{
    var lastUpdated = Model.LastUpdated.ToString("g");
}
<footer>
    <small>Last updated: @lastUpdated</small>
</footer>
```

### Layout File (_Layout.cshtml)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>@ViewData["Title"] - BNBuilders</title>
    <link rel="stylesheet" href="~/css/site.css" asp-append-version="true" />
    @await RenderSectionAsync("Styles", required: false)
</head>
<body>
    <nav class="navbar navbar-dark bg-dark">
        <div class="container">
            <a class="navbar-brand" asp-controller="Home" asp-action="Index">
                BNBuilders
            </a>
            <ul class="navbar-nav me-auto">
                <li class="nav-item">
                    <a class="nav-link" asp-controller="Project" asp-action="Index">
                        Projects
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" asp-controller="JobCost" asp-action="Index">
                        Job Costs
                    </a>
                </li>
            </ul>
        </div>
    </nav>

    <div class="container mt-4">
        @RenderBody()
    </div>

    <footer class="container mt-5 mb-3 text-muted">
        <hr />
        &copy; @DateTime.Now.Year BNBuilders
    </footer>

    <script src="~/lib/jquery/dist/jquery.min.js"></script>
    <script src="~/js/site.js" asp-append-version="true"></script>
    @await RenderSectionAsync("Scripts", required: false)
</body>
</html>
```

### Partial View (_ProjectCard.cshtml)

```html
@model ProjectSummaryViewModel

<div class="card mb-3">
    <div class="card-body">
        <h5 class="card-title">@Model.Name</h5>
        <h6 class="card-subtitle text-muted">@Model.ProjectNumber</h6>
        <p class="card-text mt-2">
            Budget: @Model.Budget.ToString("C") |
            Spent: @Model.ActualCost.ToString("C")
        </p>
        <div class="progress">
            <div class="progress-bar @(Model.PercentSpent > 90 ? "bg-danger" : "bg-success")"
                 style="width: @(Model.PercentSpent)%">
                @Model.PercentSpent%
            </div>
        </div>
        <a asp-controller="Project" asp-action="Details" asp-route-id="@Model.Id"
           class="btn btn-sm btn-outline-primary mt-2">
            View Details
        </a>
    </div>
</div>
```

### Using the Partial

```html
@model IEnumerable<ProjectSummaryViewModel>

<h1>Active Projects</h1>
<div class="row">
    @foreach (var project in Model)
    {
        <div class="col-md-4">
            <partial name="_ProjectCard" model="project" />
        </div>
    }
</div>
```

### View Component

```csharp
// ViewComponents/RecentActivityViewComponent.cs
public class RecentActivityViewComponent : ViewComponent
{
    private readonly IActivityService _activityService;

    public RecentActivityViewComponent(IActivityService activityService)
    {
        _activityService = activityService;
    }

    public async Task<IViewComponentResult> InvokeAsync(int count = 5)
    {
        var activities = await _activityService.GetRecentAsync(count);
        return View(activities);  // Views/Shared/Components/RecentActivity/Default.cshtml
    }
}
```

```html
<!-- Views/Shared/Components/RecentActivity/Default.cshtml -->
@model IEnumerable<ActivityViewModel>

<div class="card">
    <div class="card-header">Recent Activity</div>
    <ul class="list-group list-group-flush">
        @foreach (var activity in Model)
        {
            <li class="list-group-item">
                <strong>@activity.User</strong> @activity.Description
                <small class="text-muted">@activity.Timestamp.Humanize()</small>
            </li>
        }
    </ul>
</div>
```

```html
<!-- Invoke from any view -->
@await Component.InvokeAsync("RecentActivity", new { count = 10 })

<!-- Or with tag helper syntax -->
<vc:recent-activity count="10"></vc:recent-activity>
```

### Tag Helpers in a Form

```html
@model ProjectCreateViewModel

<form asp-controller="Project" asp-action="Create" method="post">
    <div asp-validation-summary="ModelOnly" class="text-danger"></div>

    <div class="mb-3">
        <label asp-for="Name" class="form-label"></label>
        <input asp-for="Name" class="form-control" />
        <span asp-validation-for="Name" class="text-danger"></span>
    </div>

    <div class="mb-3">
        <label asp-for="ProjectNumber" class="form-label"></label>
        <input asp-for="ProjectNumber" class="form-control" />
        <span asp-validation-for="ProjectNumber" class="text-danger"></span>
    </div>

    <div class="mb-3">
        <label asp-for="Budget" class="form-label"></label>
        <input asp-for="Budget" class="form-control" type="number" step="0.01" />
        <span asp-validation-for="Budget" class="text-danger"></span>
    </div>

    <div class="mb-3">
        <label asp-for="ProjectManagerId" class="form-label"></label>
        <select asp-for="ProjectManagerId"
                asp-items="Model.ProjectManagers"
                class="form-select">
            <option value="">-- Select PM --</option>
        </select>
        <span asp-validation-for="ProjectManagerId" class="text-danger"></span>
    </div>

    <button type="submit" class="btn btn-primary">Create Project</button>
</form>

@section Scripts {
    <partial name="_ValidationScriptsPartial" />
}
```

### _ViewImports.cshtml

```
@using BNBuilders.Web
@using BNBuilders.Web.Models
@using BNBuilders.Web.ViewModels
@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers
@addTagHelper *, BNBuilders.Web
```

### _ViewStart.cshtml

```
@{
    Layout = "_Layout";
}
```

## Common Patterns

1. **Sections for page-specific scripts** --- Define `@section Scripts { ... }` in views
   that need extra JS (e.g., chart libraries for the dashboard). The layout renders it
   at the bottom with `@await RenderSectionAsync("Scripts", required: false)`.
2. **Nested layouts** --- An Admin area can have its own `_AdminLayout.cshtml` that inherits
   from the main `_Layout.cshtml` by setting `Layout = "_Layout"` in the admin layout.
3. **View components for sidebar widgets** --- Sidebar project stats, notification badges,
   and user menus are ideal for view components since they need their own data.
4. **`asp-append-version`** --- Add to CSS/JS link tags for cache busting. The framework
   appends a hash query string that changes when the file changes.
5. **Conditional CSS classes** --- Use ternary expressions inline:
   `class="@(condition ? "active" : "")"`.

## Gotchas and Pitfalls

- **Missing `@addTagHelper` in `_ViewImports.cshtml`** --- Tag helpers like `asp-for` will
  render as literal HTML attributes, not processed by the server. No error is shown.
- **`@RenderSection("Scripts")` without `required: false`** --- If any view does not define
  that section, the page crashes. Always use `required: false` for optional sections.
- **Razor encodes output by default.** `@Model.HtmlContent` will show escaped HTML. Use
  `@Html.Raw(Model.HtmlContent)` for trusted HTML only --- never with user input.
- **View component naming** --- The class must end with `ViewComponent` (e.g.,
  `RecentActivityViewComponent`). The tag helper name is kebab-case: `<vc:recent-activity>`.
- **Partial view model mismatch** --- If the partial expects `ProjectSummaryViewModel` but
  you pass `ProjectDetailViewModel`, you get a runtime error. No compile-time check.
- **`@model` vs `@Model`** --- Lowercase `@model` declares the type. Uppercase `@Model`
  accesses the instance. Confusing them causes compilation errors.

## Performance Considerations

- **Precompiled views** --- In Release/Publish, views are compiled into the assembly. No
  `.cshtml` parsing at runtime. This is the default in .NET 6+.
- **View component caching** --- Wrap view components in `<cache>` tag helper for
  server-side caching of expensive widget HTML.
- **Avoid heavy logic in views** --- LINQ queries, formatting, and calculations should
  happen in the controller or ViewModel. Views should only bind and display.
- **Partial views vs view components** --- Partials are faster (no class instantiation) but
  cannot fetch their own data. Use partials for simple templates; view components when data
  access is needed.
- **Minimize `@Html.Raw`** --- It bypasses encoding and creates XSS risk. Pre-sanitize
  content in the service layer.

## BNBuilders Context

- **Shared Layout** --- All BNBuilders internal apps share a `_Layout.cshtml` with the
  company logo, sidebar navigation (Projects, Job Costs, Field Ops, Reports, Admin), and
  a user menu showing the logged-in Azure AD user.
- **Dashboard Partial Views** --- The job cost dashboard uses `_ProjectCard.cshtml` partials
  in a responsive grid. Each card shows budget vs actual with a color-coded progress bar.
- **View Components for Notifications** --- A `NotificationBadgeViewComponent` queries
  unread notifications for the current user and renders a badge in the navbar. It runs on
  every page load via the layout.
- **Field Data Entry Forms** --- Tag helpers (`asp-for`, `asp-validation-for`) generate
  forms that bind directly to ViewModels. The `@section Scripts` block loads validation
  scripts only on pages with forms, not globally.
- **Reporting Views** --- Report pages define `@section Styles` to include chart CSS and
  `@section Scripts` for Chart.js, keeping the main layout clean.

## Interview / Senior Dev Questions

1. **What is the difference between `@Html.Partial`, `@await Html.PartialAsync`, and
   `<partial>`?**
   Expected: `@Html.Partial` is synchronous (deprecated). `@await Html.PartialAsync` is
   async. `<partial>` is the tag helper equivalent of `PartialAsync` and is the preferred
   approach.

2. **When should you use a View Component instead of a Partial View?**
   Expected: When the partial needs its own data (e.g., query the database). Partials
   receive their model from the parent. View components have an `InvokeAsync` method
   that can resolve services and fetch data.

3. **What does `@Html.Raw()` do and when is it dangerous?**
   Expected: It renders a string without HTML encoding. Dangerous with user-supplied
   content because it opens the door to XSS attacks.

4. **Explain `_ViewStart.cshtml` and `_ViewImports.cshtml`.**
   Expected: `_ViewStart` runs code before every view (typically sets Layout).
   `_ViewImports` adds shared `@using`, `@addTagHelper`, `@model` directives.

5. **How does `asp-append-version` work for cache busting?**
   Expected: The tag helper computes a hash of the file contents and appends it as a query
   string (e.g., `site.css?v=abc123`). When the file changes, the hash changes, forcing
   browsers to download the new version.

## Quiz

**Q1: What is the difference between `@model` and `@Model` in a Razor view?**

a) They are the same thing
b) `@model` declares the type; `@Model` accesses the instance
c) `@Model` declares the type; `@model` accesses the instance
d) `@model` is used in Razor Pages; `@Model` in MVC

<details><summary>Answer</summary>

**b) `@model` declares the type; `@Model` accesses the instance.** For example, `@model ProjectViewModel` sets the model type for the view, while `@Model.Name` accesses the `Name` property on the model instance passed from the controller.

</details>

**Q2: You want a sidebar widget that displays the count of active projects. It needs to query the database independently. What should you use?**

a) A partial view
b) A view component
c) An HTML helper
d) A `@section`

<details><summary>Answer</summary>

**b) A view component.** Partial views receive their model from the parent view and cannot independently query data. View components have their own `InvokeAsync` method where you can inject services and query the database, making them ideal for independent widgets.

</details>

**Q3: What happens if you forget to add `@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers` to `_ViewImports.cshtml`?**

a) The application throws an error at startup
b) Tag helpers like `asp-for` and `asp-action` are rendered as literal HTML attributes and ignored by the server
c) Only custom tag helpers stop working
d) Views fall back to HTML helpers automatically

<details><summary>Answer</summary>

**b) Tag helpers are rendered as literal HTML attributes.** Without the `@addTagHelper` directive, the Razor engine does not recognize tag helper attributes. They appear in the rendered HTML as-is (e.g., `<input asp-for="Name" />` becomes a literal `asp-for` attribute in the browser), which does nothing. No error is thrown, making this bug easy to miss.

</details>

**Q4: Which tag helper attribute should you add to `<link>` and `<script>` tags to enable cache busting?**

a) `asp-cache="true"`
b) `asp-append-version="true"`
c) `asp-hash="true"`
d) `asp-no-cache="true"`

<details><summary>Answer</summary>

**b) `asp-append-version="true"`** --- This tag helper computes a SHA-256 hash of the referenced file and appends it as a query string parameter (e.g., `site.css?v=Kl_dqr9...`). When the file changes, the hash changes, busting the browser cache.

</details>
