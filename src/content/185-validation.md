# Validation

*Chapter 12.6 --- ASP.NET Core MVC & Razor Pages*

## Overview

Validation ensures that data entering your application meets business rules before it is
processed or persisted. ASP.NET Core provides a layered validation system: **data
annotations** on model properties, **`IValidatableObject`** for cross-field rules,
**custom validation attributes**, **client-side validation** via jQuery Unobtrusive
Validation, and integration points for third-party libraries like **FluentValidation**.

Getting validation right means catching bad data early, providing clear feedback to users,
and keeping your controllers thin.

## Core Concepts

### Data Annotations

Built-in attributes from `System.ComponentModel.DataAnnotations`:

| Attribute | Purpose | Example |
|---|---|---|
| `[Required]` | Field must have a value | `[Required(ErrorMessage = "Name is required")]` |
| `[StringLength]` | Max (and optional min) length | `[StringLength(100, MinimumLength = 3)]` |
| `[Range]` | Numeric or date range | `[Range(0, 1_000_000)]` |
| `[RegularExpression]` | Pattern match | `[RegularExpression(@"^BNB-\d{4}-\d{3}$")]` |
| `[Compare]` | Must match another property | `[Compare("Password")]` |
| `[EmailAddress]` | Valid email format | `[EmailAddress]` |
| `[Phone]` | Valid phone format | `[Phone]` |
| `[Url]` | Valid URL format | `[Url]` |
| `[CreditCard]` | Luhn check | `[CreditCard]` |
| `[MaxLength]` / `[MinLength]` | Collection or string length | `[MaxLength(50)]` |

### ModelState

After model binding runs, validation results are stored in `ModelState`. Each property
has an entry with its errors (if any).

```csharp
if (!ModelState.IsValid)
{
    // Re-display the form with validation errors
    return View(model);
}
```

### IValidatableObject

Implement this interface on your model for cross-field validation that cannot be expressed
with a single attribute.

### FluentValidation

A popular third-party library that moves validation rules out of attributes and into
dedicated validator classes. Offers richer rules, conditional validation, and better
testability.

### Client-Side Validation

ASP.NET Core ships with jQuery Unobtrusive Validation. Tag helpers like `asp-for` emit
`data-val-*` attributes that jQuery picks up to validate in the browser before the form
is submitted.

### Remote Validation

Validates a field by making an AJAX call to the server. Useful for checking uniqueness
(e.g., "Is this project number already taken?").

## Code Examples

### ViewModel with Data Annotations

```csharp
public class ProjectCreateViewModel
{
    [Required(ErrorMessage = "Project name is required.")]
    [StringLength(200, MinimumLength = 3,
        ErrorMessage = "Name must be between 3 and 200 characters.")]
    [Display(Name = "Project Name")]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Project number is required.")]
    [RegularExpression(@"^BNB-\d{4}-\d{3}$",
        ErrorMessage = "Format must be BNB-YYYY-NNN (e.g., BNB-2026-042).")]
    [Display(Name = "Project Number")]
    public string ProjectNumber { get; set; } = string.Empty;

    [Required]
    [Range(1000, 500_000_000,
        ErrorMessage = "Budget must be between $1,000 and $500,000,000.")]
    [DataType(DataType.Currency)]
    public decimal Budget { get; set; }

    [Required]
    [Display(Name = "Start Date")]
    [DataType(DataType.Date)]
    public DateTime StartDate { get; set; }

    [Display(Name = "End Date")]
    [DataType(DataType.Date)]
    public DateTime? EndDate { get; set; }

    [Required]
    [Display(Name = "Project Manager")]
    public int ProjectManagerId { get; set; }
}
```

### Controller Checking ModelState

```csharp
[HttpPost]
[ValidateAntiForgeryToken]
public async Task<IActionResult> Create(ProjectCreateViewModel model)
{
    if (!ModelState.IsValid)
    {
        // Re-populate dropdowns before returning the view
        model.ProjectManagers = await _lookupService.GetProjectManagersAsync();
        return View(model);
    }

    await _projectService.CreateAsync(model);
    TempData["Success"] = "Project created successfully.";
    return RedirectToAction(nameof(Index));
}
```

### Adding Manual Errors to ModelState

```csharp
[HttpPost]
[ValidateAntiForgeryToken]
public async Task<IActionResult> Create(ProjectCreateViewModel model)
{
    // Custom server-side check
    if (await _projectService.ProjectNumberExistsAsync(model.ProjectNumber))
    {
        ModelState.AddModelError(
            nameof(model.ProjectNumber),
            "This project number is already in use.");
    }

    if (!ModelState.IsValid)
    {
        model.ProjectManagers = await _lookupService.GetProjectManagersAsync();
        return View(model);
    }

    await _projectService.CreateAsync(model);
    return RedirectToAction(nameof(Index));
}
```

### IValidatableObject --- Cross-Field Validation

```csharp
public class ProjectCreateViewModel : IValidatableObject
{
    [Required]
    [DataType(DataType.Date)]
    public DateTime StartDate { get; set; }

    [DataType(DataType.Date)]
    public DateTime? EndDate { get; set; }

    [Required]
    [Range(0, double.MaxValue)]
    public decimal Budget { get; set; }

    [Range(0, double.MaxValue)]
    public decimal? ContingencyBudget { get; set; }

    // ... other properties ...

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (EndDate.HasValue && EndDate.Value <= StartDate)
        {
            yield return new ValidationResult(
                "End date must be after start date.",
                new[] { nameof(EndDate) });
        }

        if (ContingencyBudget.HasValue && ContingencyBudget.Value > Budget * 0.15m)
        {
            yield return new ValidationResult(
                "Contingency cannot exceed 15% of total budget.",
                new[] { nameof(ContingencyBudget) });
        }
    }
}
```

### FluentValidation

```csharp
// Install: dotnet add package FluentValidation.AspNetCore

// Validator class
public class ProjectCreateValidator : AbstractValidator<ProjectCreateViewModel>
{
    private readonly IProjectService _projectService;

    public ProjectCreateValidator(IProjectService projectService)
    {
        _projectService = projectService;

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Project name is required.")
            .Length(3, 200).WithMessage("Name must be between 3 and 200 characters.");

        RuleFor(x => x.ProjectNumber)
            .NotEmpty()
            .Matches(@"^BNB-\d{4}-\d{3}$")
            .WithMessage("Format must be BNB-YYYY-NNN.")
            .MustAsync(BeUniqueProjectNumber)
            .WithMessage("This project number is already in use.");

        RuleFor(x => x.Budget)
            .InclusiveBetween(1000, 500_000_000);

        RuleFor(x => x.EndDate)
            .GreaterThan(x => x.StartDate)
            .When(x => x.EndDate.HasValue)
            .WithMessage("End date must be after start date.");

        RuleFor(x => x.ContingencyBudget)
            .LessThanOrEqualTo(x => x.Budget * 0.15m)
            .When(x => x.ContingencyBudget.HasValue)
            .WithMessage("Contingency cannot exceed 15% of budget.");
    }

    private async Task<bool> BeUniqueProjectNumber(
        string projectNumber, CancellationToken ct)
    {
        return !await _projectService.ProjectNumberExistsAsync(projectNumber);
    }
}

// Registration in Program.cs
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<ProjectCreateValidator>();
```

### Custom Validation Attribute

```csharp
public class FutureDateAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(
        object? value, ValidationContext validationContext)
    {
        if (value is DateTime date && date <= DateTime.Today)
        {
            return new ValidationResult(
                ErrorMessage ?? "Date must be in the future.");
        }

        return ValidationResult.Success;
    }
}

// Usage
public class ChangeOrderViewModel
{
    [Required]
    [FutureDate(ErrorMessage = "Effective date must be in the future.")]
    public DateTime EffectiveDate { get; set; }
}
```

### Remote Validation

```csharp
// On the ViewModel property
[Remote(action: "VerifyProjectNumber", controller: "Project",
    ErrorMessage = "This project number is already taken.")]
public string ProjectNumber { get; set; } = string.Empty;

// Controller action
[AcceptVerbs("GET", "POST")]
public async Task<IActionResult> VerifyProjectNumber(string projectNumber)
{
    var exists = await _projectService.ProjectNumberExistsAsync(projectNumber);
    if (exists)
        return Json($"Project number {projectNumber} is already in use.");

    return Json(true);  // true = valid
}
```

### View with Validation Summary and Per-Field Errors

```html
@model ProjectCreateViewModel

<h1>Create Project</h1>

<form asp-action="Create" method="post">
    <div asp-validation-summary="ModelOnly" class="alert alert-danger"></div>

    <div class="mb-3">
        <label asp-for="Name" class="form-label"></label>
        <input asp-for="Name" class="form-control" />
        <span asp-validation-for="Name" class="text-danger"></span>
    </div>

    <div class="mb-3">
        <label asp-for="ProjectNumber" class="form-label"></label>
        <input asp-for="ProjectNumber" class="form-control"
               placeholder="BNB-2026-042" />
        <span asp-validation-for="ProjectNumber" class="text-danger"></span>
    </div>

    <div class="mb-3">
        <label asp-for="Budget" class="form-label"></label>
        <input asp-for="Budget" class="form-control" type="number" step="0.01" />
        <span asp-validation-for="Budget" class="text-danger"></span>
    </div>

    <div class="row">
        <div class="col-md-6 mb-3">
            <label asp-for="StartDate" class="form-label"></label>
            <input asp-for="StartDate" class="form-control" type="date" />
            <span asp-validation-for="StartDate" class="text-danger"></span>
        </div>
        <div class="col-md-6 mb-3">
            <label asp-for="EndDate" class="form-label"></label>
            <input asp-for="EndDate" class="form-control" type="date" />
            <span asp-validation-for="EndDate" class="text-danger"></span>
        </div>
    </div>

    <button type="submit" class="btn btn-primary">Create</button>
</form>

@section Scripts {
    <partial name="_ValidationScriptsPartial" />
}
```

### _ValidationScriptsPartial.cshtml

```html
<script src="~/lib/jquery-validation/dist/jquery.validate.min.js"></script>
<script src="~/lib/jquery-validation-unobtrusive/jquery.validate.unobtrusive.min.js"></script>
```

## Common Patterns

1. **Server-side validation is mandatory; client-side is a convenience.** Never trust
   client-side validation alone --- it can be bypassed.
2. **`ModelOnly` vs `All` validation summary** --- `ModelOnly` shows errors not tied to a
   specific property (e.g., cross-field rules). `All` shows every error. Use `ModelOnly` in
   the summary and `asp-validation-for` next to each field.
3. **Re-populate dropdowns on validation failure** --- When returning `View(model)` after
   validation fails, dropdowns are empty because `SelectList` values are not round-tripped.
   Re-fetch them before returning.
4. **FluentValidation for complex rules** --- Data annotations handle simple rules. For
   conditional logic, async checks, or deeply nested objects, FluentValidation is cleaner.
5. **Separate validation from domain logic** --- Validation ensures data format/completeness.
   Business rules (e.g., "cannot approve an invoice above your authorization limit") belong
   in the service layer.

## Gotchas and Pitfalls

- **`[Required]` on value types** --- `int` always has a value (default `0`). `[Required]`
  on an `int` does nothing useful. Use `int?` (nullable) if the field is truly optional, or
  `[Range(1, int.MaxValue)]` to reject zero.
- **Client-side validation not firing** --- Ensure `_ValidationScriptsPartial` is included
  in the `@section Scripts` block and that jQuery is loaded before it.
- **FluentValidation and Data Annotations fighting** --- If both are active, rules can
  conflict or duplicate. Pick one approach per ViewModel.
- **`[Compare]` requires matching property names** ---
  `[Compare("ConfirmPassword")]` must exactly match the property name string.
  Use `nameof(ConfirmPassword)` for safety.
- **Remote validation limitations** --- Only fires on blur/change of the specific field,
  not on form submit. It also requires jQuery Unobtrusive Validation. It should supplement,
  not replace, server-side checks.
- **Error messages not appearing** --- Missing `asp-validation-for` span or missing
  `asp-validation-summary` div means errors exist in `ModelState` but are not displayed.

## Performance Considerations

- **FluentValidation async rules** --- `MustAsync` makes an async call (e.g., database
  uniqueness check). This adds latency to every form submission. Cache results if possible
  or use Remote validation for immediate feedback without blocking the POST.
- **Avoid excessive validation on read-only fields** --- Only validate fields the user can
  change.
- **Client-side validation reduces server load** --- By catching obvious errors in the
  browser, you avoid a round trip. Ensure the unobtrusive scripts are cached by the browser.
- **`ModelState` size** --- For very large forms (100+ fields), `ModelState` can become
  significant. Batch entry forms should consider paginating or chunking submissions.

## BNBuilders Context

- **Project Setup Form** --- Uses `[Required]`, `[RegularExpression]` for the BNB project
  number format, and `[Range]` for budget. `IValidatableObject` enforces that end date is
  after start date and contingency does not exceed 15% of budget.
- **Field Daily Log** --- FluentValidation rules ensure labor hours do not exceed 24 per
  person per day, weather conditions are selected, and at least one activity is logged.
  Conditional rules: if `HasIncident` is true, `IncidentDescription` is required.
- **Change Order Approval** --- Custom `FutureDateAttribute` ensures the effective date is
  in the future. Remote validation checks that the change order number is unique before
  the user submits.
- **Job Cost Entry** --- Batch entry form uses collection validation. Each line item must
  have a cost code matching the project's cost code structure and a positive amount.
- **Reporting Filters** --- Date range validation on report parameter forms prevents users
  from selecting a start date after the end date, saving the server from running an
  impossible query.

## Interview / Senior Dev Questions

1. **What is the difference between `ModelState.IsValid` and
   `ModelState.AddModelError`?**
   Expected: `IsValid` checks if all bound properties passed validation. `AddModelError`
   manually adds an error entry (e.g., from a service-layer business rule), which makes
   `IsValid` return false.

2. **When would you choose FluentValidation over data annotations?**
   Expected: Complex conditional rules, async validation (database checks), better
   testability (validator classes can be unit tested), when you want to avoid cluttering
   models with attributes.

3. **How does client-side validation work in ASP.NET Core?**
   Expected: Tag helpers emit `data-val-*` HTML attributes. jQuery Unobtrusive Validation
   reads these attributes and wires up jQuery Validate rules in the browser. No custom JS
   needed for standard rules.

4. **Why is `[Required]` on a non-nullable `int` property misleading?**
   Expected: A non-nullable `int` defaults to `0` when not provided. `[Required]` checks
   for null, which never happens for value types. The validation always passes. Use
   `int?` + `[Required]` or `[Range]` to reject zero.

5. **How do you test validation rules?**
   Expected: For data annotations, use `Validator.TryValidateObject`. For FluentValidation,
   instantiate the validator and call `TestValidate(model)` --- it returns a result with
   `ShouldHaveValidationErrorFor` assertions.

## Quiz

**Q1: A property is defined as `public int Quantity { get; set; }` with `[Required]`. The user submits the form without filling in the Quantity field. What happens?**

a) Validation fails because the field is empty
b) Validation passes with `Quantity = 0`
c) An exception is thrown
d) The form cannot be submitted

<details><summary>Answer</summary>

**b) Validation passes with `Quantity = 0`.** Non-nullable value types always have a value (0 for int). `[Required]` only checks for null, which cannot happen for `int`. The binder assigns the default value 0. To properly validate, use `int?` with `[Required]`, or add `[Range(1, int.MaxValue)]`.

</details>

**Q2: You are using FluentValidation. The rule is: "If `HasIncident` is `true`, then `IncidentDescription` is required." Which FluentValidation method enables this?**

a) `.NotEmpty().When(x => x.HasIncident)`
b) `.RequiredIf(x => x.HasIncident)`
c) `.NotEmpty().Unless(x => !x.HasIncident)`
d) Both a) and c)

<details><summary>Answer</summary>

**d) Both a) and c).** `.When(condition)` applies the rule only when the condition is true. `.Unless(condition)` applies the rule only when the condition is false. Since `!x.HasIncident` being false is the same as `x.HasIncident` being true, both expressions produce the same result. Option a) is the more readable approach.

</details>

**Q3: What does `asp-validation-summary="ModelOnly"` display?**

a) All validation errors for all properties
b) Only errors not associated with a specific property
c) Only the first error
d) A count of total errors

<details><summary>Answer</summary>

**b) Only errors not associated with a specific property.** `ModelOnly` shows errors added with an empty key or a key that does not match any model property (e.g., cross-field validation errors from `IValidatableObject` or manual `ModelState.AddModelError("", "...")`). Property-specific errors are shown by `asp-validation-for` spans next to each field.

</details>

**Q4: Remote validation sends an AJAX request to the server. When does it fire?**

a) On form submit only
b) On field blur/change
c) On every keystroke
d) On page load

<details><summary>Answer</summary>

**b) On field blur/change.** jQuery Unobtrusive Validation triggers remote validation when the user leaves the field (blur) or changes its value. It does NOT fire on every keystroke (that would flood the server). It also fires as part of form submission validation, but the primary UX benefit is the immediate feedback on blur.

</details>

**Q5: You add both `[Required]` data annotation and a FluentValidation `NotEmpty()` rule to the same property. What happens?**

a) Only the data annotation runs
b) Only FluentValidation runs
c) Both run, potentially showing duplicate error messages
d) The application throws an error at startup

<details><summary>Answer</summary>

**c) Both run, potentially showing duplicate error messages.** By default, both validation systems are active. The data annotation runs during model binding, and FluentValidation runs afterward. This produces duplicate errors for the same property. Best practice: pick one approach per model. You can disable data annotations with `DisableDataAnnotationsValidation` when using FluentValidation.

</details>
