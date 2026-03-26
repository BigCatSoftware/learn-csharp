# Controllers and Routing

*Chapter 12.3 --- ASP.NET Core MVC & Razor Pages*

## Overview

Controllers are the entry point for handling HTTP requests in ASP.NET Core MVC. Each
public method on a controller is an **action** that maps to a URL through the **routing
system**. ASP.NET Core offers two routing approaches --- **conventional routing** (pattern-based,
configured in `Program.cs`) and **attribute routing** (declared directly on controllers and
actions). Understanding both, along with return types, route constraints, and the
`[ApiController]` attribute, is critical for building clean, predictable APIs and web apps.

## Core Concepts

### The Controller Base Class

Controllers typically inherit from `Controller` (for MVC views) or `ControllerBase` (for
APIs without view support). `Controller` adds view-related helpers like `View()`, `PartialView()`,
and `ViewBag`.

### Action Methods

Any **public, non-static** method on a controller is an action by default. Actions:

- Accept parameters populated by **model binding**.
- Return an `IActionResult` (or a concrete type, or `Task<IActionResult>` for async).
- Can be restricted to specific HTTP verbs with `[HttpGet]`, `[HttpPost]`, etc.

### IActionResult Return Types

| Return Type | Helper Method | Use Case |
|---|---|---|
| `ViewResult` | `View()` | Render a Razor view |
| `JsonResult` | `Json()` | Return JSON data |
| `RedirectToActionResult` | `RedirectToAction()` | PRG redirect |
| `RedirectResult` | `Redirect()` | Redirect to a URL |
| `ContentResult` | `Content()` | Return plain text |
| `FileResult` | `File()` | Return a file download |
| `StatusCodeResult` | `StatusCode()` | Return a specific HTTP status |
| `NotFoundResult` | `NotFound()` | 404 response |
| `BadRequestResult` | `BadRequest()` | 400 response |
| `OkObjectResult` | `Ok()` | 200 with object (API) |

### Conventional Routing

Defined in `Program.cs` with a pattern:

```csharp
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");
```

The URL `/Project/Details/42` maps to `ProjectController.Details(int id)`.

### Attribute Routing

Defined on the controller and action with `[Route]`:

```csharp
[Route("api/[controller]")]
public class ProjectsController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult Get(int id) { ... }
}
```

### Route Constraints

Constraints restrict which values a route parameter accepts:

| Constraint | Example | Matches |
|---|---|---|
| `int` | `{id:int}` | Integer values only |
| `guid` | `{id:guid}` | GUID format |
| `minlength(n)` | `{name:minlength(3)}` | String with min length |
| `range(min,max)` | `{page:range(1,100)}` | Number in range |
| `regex(expr)` | `{code:regex(^[A-Z]{{3}}$)}` | Regex match |
| `alpha` | `{name:alpha}` | Alphabetic characters |

### [ApiController] Attribute

Applied to controllers that serve as APIs. It enables:

- Automatic HTTP 400 responses when `ModelState` is invalid.
- Binding source inference (`[FromBody]` for complex types, `[FromRoute]`/`[FromQuery]` for simple types).
- Problem details responses for error status codes.

## Code Examples

### Full MVC Controller with CRUD

```csharp
public class ProjectController : Controller
{
    private readonly IProjectService _projectService;

    public ProjectController(IProjectService projectService)
    {
        _projectService = projectService;
    }

    // GET /Project
    public async Task<IActionResult> Index()
    {
        var projects = await _projectService.GetAllAsync();
        return View(projects);
    }

    // GET /Project/Details/42
    public async Task<IActionResult> Details(int? id)
    {
        if (id == null) return BadRequest();

        var project = await _projectService.GetByIdAsync(id.Value);
        if (project == null) return NotFound();

        return View(project);
    }

    // GET /Project/Create
    public IActionResult Create()
    {
        return View();
    }

    // POST /Project/Create
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(ProjectCreateViewModel model)
    {
        if (!ModelState.IsValid)
            return View(model);

        await _projectService.CreateAsync(model);
        TempData["Success"] = "Project created successfully.";
        return RedirectToAction(nameof(Index));
    }

    // GET /Project/Edit/42
    public async Task<IActionResult> Edit(int id)
    {
        var project = await _projectService.GetForEditAsync(id);
        if (project == null) return NotFound();
        return View(project);
    }

    // POST /Project/Edit/42
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(int id, ProjectEditViewModel model)
    {
        if (id != model.Id) return BadRequest();

        if (!ModelState.IsValid)
            return View(model);

        await _projectService.UpdateAsync(model);
        TempData["Success"] = "Project updated.";
        return RedirectToAction(nameof(Details), new { id });
    }

    // POST /Project/Delete/42
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(int id)
    {
        await _projectService.DeleteAsync(id);
        TempData["Success"] = "Project deleted.";
        return RedirectToAction(nameof(Index));
    }
}
```

### API Controller with Attribute Routing

```csharp
[ApiController]
[Route("api/[controller]")]
public class JobCostsController : ControllerBase
{
    private readonly IJobCostService _jobCostService;

    public JobCostsController(IJobCostService jobCostService)
    {
        _jobCostService = jobCostService;
    }

    // GET api/jobcosts?projectId=42
    [HttpGet]
    public async Task<ActionResult<IEnumerable<JobCostDto>>> GetAll(
        [FromQuery] int projectId)
    {
        var costs = await _jobCostService.GetByProjectAsync(projectId);
        return Ok(costs);
    }

    // GET api/jobcosts/7
    [HttpGet("{id:int}")]
    public async Task<ActionResult<JobCostDto>> GetById(int id)
    {
        var cost = await _jobCostService.GetByIdAsync(id);
        if (cost == null) return NotFound();
        return Ok(cost);
    }

    // POST api/jobcosts
    [HttpPost]
    public async Task<ActionResult<JobCostDto>> Create(
        [FromBody] JobCostCreateDto dto)
    {
        var created = await _jobCostService.CreateAsync(dto);
        return CreatedAtAction(
            nameof(GetById),
            new { id = created.Id },
            created);
    }

    // PUT api/jobcosts/7
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] JobCostUpdateDto dto)
    {
        if (id != dto.Id) return BadRequest();
        await _jobCostService.UpdateAsync(dto);
        return NoContent();
    }

    // DELETE api/jobcosts/7
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _jobCostService.DeleteAsync(id);
        return NoContent();
    }
}
```

### Route Constraints in Practice

```csharp
[Route("api/projects")]
public class ProjectsApiController : ControllerBase
{
    // Only matches integer IDs: /api/projects/42
    [HttpGet("{id:int}")]
    public IActionResult GetById(int id) => Ok($"Project {id}");

    // Only matches project codes like "BNB-2025-001": /api/projects/BNB-2025-001
    [HttpGet("{code:regex(^BNB-\\d{{4}}-\\d{{3}}$)}")]
    public IActionResult GetByCode(string code) => Ok($"Project {code}");
}
```

### Multiple Route Templates

```csharp
[Route("api/[controller]")]
[Route("api/v2/[controller]")]   // supports versioned URL
public class ReportsController : ControllerBase
{
    [HttpGet("monthly/{year:int}/{month:range(1,12)}")]
    // Matches: /api/reports/monthly/2026/3
    // Matches: /api/v2/reports/monthly/2026/3
    public IActionResult Monthly(int year, int month)
    {
        return Ok(new { Year = year, Month = month });
    }
}
```

### Mixing Conventional and Attribute Routing

```csharp
// This controller uses conventional routing (no [Route] attribute)
public class HomeController : Controller
{
    public IActionResult Index() => View();    // /Home/Index or /
    public IActionResult About() => View();    // /Home/About
}

// This controller uses attribute routing
[Route("[controller]/[action]")]
public class SettingsController : Controller
{
    [HttpGet]
    public IActionResult General() => View();  // /Settings/General

    [HttpGet]
    public IActionResult Notifications() => View(); // /Settings/Notifications
}
```

## Common Patterns

1. **Consistent return types** --- Use `ActionResult<T>` for API controllers so Swagger can
   document the response shape. Use `IActionResult` for MVC controllers returning views.
2. **`nameof()` for action names** --- `RedirectToAction(nameof(Index))` is refactoring-safe
   compared to `RedirectToAction("Index")`.
3. **`[ValidateAntiForgeryToken]`** on every POST action in MVC --- Prevents CSRF attacks
   on form submissions.
4. **Separate MVC and API controllers** --- MVC controllers inherit `Controller` and live
   in `/Controllers`. API controllers inherit `ControllerBase`, use `[ApiController]`, and
   may live in `/Controllers/Api/` or a separate project.
5. **Use `CreatedAtAction` for POST APIs** --- Returns 201 with a `Location` header pointing
   to the new resource.

## Gotchas and Pitfalls

- **Attribute routing and conventional routing do not mix on the same controller.** If a
  controller has `[Route]`, conventional route patterns in `Program.cs` are ignored for it.
- **Route parameter names must match action parameter names** --- `{projectId:int}` in the
  route requires the action to have a parameter named `projectId`, not `id`.
- **Ambiguous routes** --- Two actions matching the same URL pattern cause a runtime
  `AmbiguousMatchException`. Use constraints or HTTP verb attributes to disambiguate.
- **Forgetting `[HttpPost]`** --- Without it, the action responds to GET by default (in
  conventional routing). A form POST could match the wrong action.
- **`[ApiController]` auto-validation** --- If you apply `[ApiController]`, the framework
  automatically returns 400 when `ModelState.IsValid` is false. Your manual
  `if (!ModelState.IsValid)` check never runs. This is a feature, not a bug, but it can
  surprise you.
- **Route order matters** --- More specific routes should be defined before catch-all routes.
  `{id:int}` should come before `{slug}`.

## Performance Considerations

- **Async actions** --- Always use `async Task<IActionResult>` when calling databases or
  external services. Synchronous calls block thread pool threads and degrade throughput
  under load.
- **Avoid heavy work in constructors** --- Controller constructors run on every request.
  Inject lightweight interfaces; defer expensive initialization to action methods.
- **`[ResponseCache]`** --- Apply response caching attributes to GET actions that return
  data that does not change often (e.g., lookup lists, project metadata).
- **Action filters vs middleware** --- Use middleware for cross-cutting concerns that apply
  to all requests. Use action filters for logic that only applies to specific controllers
  or actions (less overhead).

## BNBuilders Context

- **Job Cost API** --- The `JobCostsController` is an `[ApiController]` with attribute
  routing under `api/jobcosts`. Power BI and Excel add-ins call this API to pull cost data.
  Route constraints ensure `{id:int}` prevents accidental string lookups against the
  database.
- **Project Management MVC** --- `ProjectController` uses conventional routing. Project
  managers navigate to `/Project/Details/42` to view a project. The `Edit` action uses
  `[ValidateAntiForgeryToken]` to protect against CSRF on the project setup form.
- **Field Data Entry** --- The `DailyLogController` in the FieldOps area uses
  `[HttpPost] [ValidateAntiForgeryToken]` for all form submissions. Field superintendents
  submit logs from tablets; the PRG pattern prevents duplicate entries on flaky cell
  connections.
- **Report Downloads** --- `ReportsController.DownloadExcel(int projectId)` returns
  `File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName)`.
  Route constraint `{projectId:int}` ensures clean URLs.
- **API Versioning** --- Multiple `[Route]` templates on the `ReportsController` support
  both `/api/reports` and `/api/v2/reports` while the team migrates consumers.

## Interview / Senior Dev Questions

1. **What is the difference between conventional and attribute routing? When do you use each?**
   Expected: Conventional is pattern-based in `Program.cs`, good for MVC apps with uniform
   URL patterns. Attribute routing is on the controller/action, preferred for APIs.

2. **What does `[ApiController]` do?**
   Expected: Automatic 400 on invalid ModelState, binding source inference, problem details
   for errors.

3. **Explain `CreatedAtAction` --- what status code and headers does it return?**
   Expected: 201 Created with a `Location` header pointing to the GET endpoint for the new
   resource, plus the created object in the body.

4. **How do you prevent CSRF attacks in MVC form submissions?**
   Expected: `[ValidateAntiForgeryToken]` on POST actions + `@Html.AntiForgeryToken()` or
   the `<form>` tag helper (which auto-adds it).

5. **A route `{id}` and `{slug}` both match `/Project/hello`. How do you fix this?**
   Expected: Add a route constraint like `{id:int}` so it only matches numeric values,
   leaving string values for `{slug}`.

## Quiz

**Q1: Which base class should an API controller that does not return views inherit from?**

a) `Controller`
b) `ControllerBase`
c) `ApiController`
d) `HttpController`

<details><summary>Answer</summary>

**b) `ControllerBase`** --- `ControllerBase` provides action result helpers (`Ok()`, `NotFound()`, `BadRequest()`) without view-related methods. `Controller` inherits from `ControllerBase` and adds `View()`, `PartialView()`, `ViewBag`, etc. `[ApiController]` is an attribute, not a base class.

</details>

**Q2: What is the result of applying `[ApiController]` to a controller where the POST action body has validation errors?**

a) The action runs normally and you check `ModelState.IsValid` yourself
b) The framework automatically returns a 400 Bad Request before the action executes
c) The framework throws an exception
d) The framework returns a 500 Internal Server Error

<details><summary>Answer</summary>

**b) The framework automatically returns a 400 Bad Request.** With `[ApiController]`, ASP.NET Core adds a model validation filter that short-circuits the action and returns a `ValidationProblemDetails` response (400) when `ModelState` is invalid. The action method body never executes.

</details>

**Q3: Given this route template: `[HttpGet("{id:int}")]` --- which URL matches?**

a) `/api/projects/hello`
b) `/api/projects/42`
c) `/api/projects/`
d) `/api/projects/3.14`

<details><summary>Answer</summary>

**b) `/api/projects/42`** --- The `int` constraint only matches integer values. `hello` is a string (no match), the empty segment has no value (no match), and `3.14` is a decimal, not an integer (no match).

</details>

**Q4: Why should you use `nameof(Index)` instead of the string `"Index"` when calling `RedirectToAction`?**

a) It is faster at runtime
b) It provides compile-time safety --- renaming the action causes a build error
c) It is required by the framework
d) It enables attribute routing

<details><summary>Answer</summary>

**b) Compile-time safety.** `nameof(Index)` is evaluated at compile time and produces the string `"Index"`. If you rename the `Index` method, the `nameof` reference causes a build error, alerting you to update it. A hard-coded string would silently break at runtime with a 404.

</details>

**Q5: You have a POST action that creates a new job cost entry. What should it return to follow REST conventions?**

a) `Ok(newEntry)`
b) `View(newEntry)`
c) `CreatedAtAction(nameof(GetById), new { id = newEntry.Id }, newEntry)`
d) `RedirectToAction("Index")`

<details><summary>Answer</summary>

**c) `CreatedAtAction(...)`** --- For REST APIs, a successful POST should return HTTP 201 Created with a `Location` header pointing to the new resource and the created object in the body. `Ok()` returns 200 which is technically wrong for creation. `View()` is for MVC, not APIs. `RedirectToAction` is for MVC PRG pattern.

</details>
