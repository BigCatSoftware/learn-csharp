# Source Generators

Source generators are a compiler feature that lets you inspect user code during compilation and generate additional C# source files that are added to the compilation. They run as part of the build process, producing code that is available at compile time — no runtime reflection needed.

## Why Source Generators?

Many common patterns in C# rely on runtime reflection: serialization, dependency injection registration, object mapping, `ToString()` generation, and validation. Reflection is flexible but comes with costs.

| Aspect | Reflection | Source Generators |
|---|---|---|
| **When it runs** | Runtime | Compile time |
| **Performance cost** | Every call pays a price | Zero runtime overhead |
| **Error detection** | Runtime exceptions | Compile-time errors |
| **Trimming-friendly** | No (breaks with trimming) | Yes (all code is statically known) |
| **AOT-compatible** | Limited | Fully compatible |
| **Debugging** | Harder (dynamic types) | Easy (generated files visible in IDE) |

> **Note:** .NET itself uses source generators extensively. `System.Text.Json` generates serializers, `LoggerMessage` generates logging methods, and `RegexGenerator` generates optimized regex matchers — all at compile time.

## How Source Generators Fit in the Pipeline

```
Your C# Code  -->  Roslyn Compiler  -->  Source Generator runs
                                              |
                                              v
                                     Generated .cs files added
                                              |
                                              v
                                     Final compilation output (.dll)
```

The generator can read your source code (via syntax trees and semantic models) and emit new `.cs` files. It cannot modify existing code — it can only add new files.

> **Important:** Source generators are **additive only**. They cannot modify or delete existing source code. They can only add new files to the compilation.

## ISourceGenerator vs IIncrementalGenerator

There are two APIs for writing source generators.

| API | Status | Characteristics |
|---|---|---|
| `ISourceGenerator` | Legacy (still supported) | Runs on every keystroke; can be slow |
| `IIncrementalGenerator` | Recommended (since .NET 6) | Caches results; only re-runs when inputs change |

> **Tip:** Always use `IIncrementalGenerator` for new generators. The incremental API avoids redundant work and keeps the IDE responsive.

## Project Setup

A source generator is a .NET Standard 2.0 class library with specific analyzer references.

```xml
<!-- AutoToString.Generator.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <EnforceExtendedAnalyzerRules>true</EnforceExtendedAnalyzerRules>
    <IsRoslynComponent>true</IsRoslynComponent>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.CodeAnalysis.Analyzers" Version="3.3.4"
                      PrivateAssets="all" />
    <PackageReference Include="Microsoft.CodeAnalysis.CSharp" Version="4.9.2"
                      PrivateAssets="all" />
  </ItemGroup>
</Project>
```

The consuming project references the generator as an analyzer.

```xml
<!-- MyApp.csproj -->
<ItemGroup>
  <ProjectReference Include="..\AutoToString.Generator\AutoToString.Generator.csproj"
                    OutputItemType="Analyzer"
                    ReferenceOutputAssembly="false" />
</ItemGroup>
```

## Example 1: Auto-Generating ToString()

### Step 1: Define a Marker Attribute

The attribute lives in a shared project or is emitted by the generator itself.

```csharp
// This attribute will be emitted by the generator
// so consuming projects don't need a separate dependency.
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct)]
public class AutoToStringAttribute : Attribute { }
```

### Step 2: Write the Incremental Generator

```csharp
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;
using System.Collections.Immutable;
using System.Text;

[Generator]
public class AutoToStringGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        // Step 1: Emit the marker attribute into the compilation
        context.RegisterPostInitializationOutput(ctx =>
        {
            ctx.AddSource("AutoToStringAttribute.g.cs", SourceText.From("""
                using System;

                [AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct)]
                public class AutoToStringAttribute : Attribute { }
                """, Encoding.UTF8));
        });

        // Step 2: Find all classes/structs decorated with [AutoToString]
        IncrementalValuesProvider<ClassDeclarationSyntax> classDeclarations =
            context.SyntaxProvider
                .CreateSyntaxProvider(
                    predicate: static (node, _) =>
                        node is ClassDeclarationSyntax c && c.AttributeLists.Count > 0,
                    transform: static (ctx, _) =>
                        GetTargetClass(ctx))
                .Where(static c => c is not null)!;

        // Step 3: Combine with compilation and generate
        IncrementalValueProvider<(Compilation, ImmutableArray<ClassDeclarationSyntax>)>
            compilationAndClasses = context.CompilationProvider
                .Combine(classDeclarations.Collect());

        context.RegisterSourceOutput(compilationAndClasses,
            static (spc, source) => Execute(source.Item1, source.Item2, spc));
    }

    private static ClassDeclarationSyntax? GetTargetClass(
        GeneratorSyntaxContext context)
    {
        var classDecl = (ClassDeclarationSyntax)context.Node;
        foreach (var attrList in classDecl.AttributeLists)
        {
            foreach (var attr in attrList.Attributes)
            {
                if (context.SemanticModel.GetSymbolInfo(attr).Symbol
                    is IMethodSymbol attrSymbol
                    && attrSymbol.ContainingType.ToDisplayString()
                        == "AutoToStringAttribute")
                {
                    return classDecl;
                }
            }
        }
        return null;
    }

    private static void Execute(
        Compilation compilation,
        ImmutableArray<ClassDeclarationSyntax> classes,
        SourceProductionContext context)
    {
        foreach (var classDecl in classes.Distinct())
        {
            SemanticModel model = compilation.GetSemanticModel(classDecl.SyntaxTree);
            if (model.GetDeclaredSymbol(classDecl) is not INamedTypeSymbol classSymbol)
                continue;

            string namespaceName = classSymbol.ContainingNamespace.ToDisplayString();
            string className = classSymbol.Name;

            var properties = classSymbol.GetMembers()
                .OfType<IPropertySymbol>()
                .Where(p => p.DeclaredAccessibility == Accessibility.Public
                         && !p.IsStatic);

            var sb = new StringBuilder();
            sb.AppendLine($"namespace {namespaceName};");
            sb.AppendLine();
            sb.AppendLine($"partial class {className}");
            sb.AppendLine("{");
            sb.AppendLine("    public override string ToString()");
            sb.AppendLine("    {");
            sb.Append($"        return $\"{className} {{ ");

            var parts = new List<string>();
            foreach (var prop in properties)
                parts.Add($"{prop.Name} = {{{prop.Name}}}");

            sb.Append(string.Join(", ", parts));
            sb.AppendLine(" }\";");
            sb.AppendLine("    }");
            sb.AppendLine("}");

            context.AddSource($"{className}.ToString.g.cs",
                SourceText.From(sb.ToString(), Encoding.UTF8));
        }
    }
}
```

### Step 3: Use It

```csharp
[AutoToString]
public partial class Product
{
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public string Category { get; set; } = "";
}

var product = new Product { Name = "Keyboard", Price = 79.99m, Category = "Electronics" };
Console.WriteLine(product.ToString());
// Output: Product { Name = Keyboard, Price = 79.99, Category = Electronics }
```

> **Note:** The class must be `partial` so the generator can add the `ToString()` method in a separate file. If the class is not partial, the generator would produce a compilation error.

## Example 2: Generating DTOs from Interfaces

```csharp
// User writes this:
[GenerateDto]
public interface IUserDto
{
    string Name { get; }
    int Age { get; }
    string Email { get; }
}

// Generator produces this:
public class UserDto : IUserDto
{
    public string Name { get; set; } = default!;
    public int Age { get; set; }
    public string Email { get; set; } = default!;

    public UserDto() { }

    public UserDto(string name, int age, string email)
    {
        Name = name;
        Age = age;
        Email = email;
    }
}
```

The generator walks the interface members and emits a concrete class with settable properties and a constructor.

## Example 3: Compile-Time JSON Serialization

.NET's `System.Text.Json` includes a built-in source generator. Instead of using reflection at runtime, it generates serialization code at compile time.

```csharp
using System.Text.Json.Serialization;

public class WeatherForecast
{
    public DateTime Date { get; set; }
    public int TemperatureC { get; set; }
    public string Summary { get; set; } = "";
}

// This triggers the System.Text.Json source generator
[JsonSerializable(typeof(WeatherForecast))]
[JsonSerializable(typeof(List<WeatherForecast>))]
public partial class AppJsonContext : JsonSerializerContext { }

// Usage — no reflection at runtime
string json = JsonSerializer.Serialize(forecast, AppJsonContext.Default.WeatherForecast);
WeatherForecast? parsed = JsonSerializer.Deserialize(json,
    AppJsonContext.Default.WeatherForecast);
```

> **Tip:** Using `JsonSerializerContext` with source generation is required for AOT (ahead-of-time) compilation scenarios and significantly improves startup time in all applications.

## Example 4: LoggerMessage Source Generator

```csharp
public static partial class LogMessages
{
    [LoggerMessage(Level = LogLevel.Information,
        Message = "Processing order {OrderId} for customer {CustomerId}")]
    public static partial void ProcessingOrder(
        ILogger logger, int orderId, string customerId);

    [LoggerMessage(Level = LogLevel.Error,
        Message = "Failed to process payment: {ErrorMessage}")]
    public static partial void PaymentFailed(
        ILogger logger, string errorMessage, Exception ex);
}

// Usage — zero-allocation, high-performance logging
LogMessages.ProcessingOrder(logger, 12345, "CUST-001");
```

## Example 5: Regex Source Generator

```csharp
public partial class Validators
{
    // Generator creates an optimized, compiled regex at build time
    [GeneratedRegex(@"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")]
    public static partial Regex EmailRegex();

    [GeneratedRegex(@"^\d{3}-\d{3}-\d{4}$")]
    public static partial Regex PhoneRegex();
}

bool validEmail = Validators.EmailRegex().IsMatch("user@example.com"); // True
bool validPhone = Validators.PhoneRegex().IsMatch("555-123-4567");     // True
```

## Debugging Source Generators

You can inspect the generated output in your IDE or by adding a property to your project file.

```xml
<PropertyGroup>
  <!-- Save generated files to disk for inspection -->
  <EmitCompilerGeneratedFiles>true</EmitCompilerGeneratedFiles>
  <CompilerGeneratedFilesOutputPath>Generated</CompilerGeneratedFilesOutputPath>
</PropertyGroup>
```

Generated files appear under `Generated/{GeneratorAssemblyName}/{GeneratorTypeName}/`.

> **Caution:** Add the generated output directory to `.gitignore` — these files are build artifacts.

## Testing Source Generators

Use `CSharpGeneratorDriver` from the Roslyn test infrastructure.

```csharp
[Fact]
public void Generator_Produces_ToString_For_Decorated_Class()
{
    string source = """
        [AutoToString]
        public partial class TestClass
        {
            public string Name { get; set; }
            public int Value { get; set; }
        }
        """;

    var generator = new AutoToStringGenerator();
    var driver = CSharpGeneratorDriver.Create(generator);

    var compilation = CSharpCompilation.Create("Tests",
        new[] { CSharpSyntaxTree.ParseText(source) },
        new[] { MetadataReference.CreateFromFile(typeof(object).Assembly.Location) });

    driver = driver.RunGeneratorsAndUpdateCompilation(
        compilation, out var outputCompilation, out var diagnostics);

    // Verify no errors
    Assert.Empty(diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error));

    // Verify the generated source contains ToString
    var generatedTrees = outputCompilation.SyntaxTrees
        .Where(t => t.FilePath.Contains(".g.cs"));
    Assert.Contains(generatedTrees,
        t => t.ToString().Contains("public override string ToString()"));
}
```

## Source Generator Limitations

- **Additive only** — cannot modify existing source files.
- **No cross-generator dependencies** — one generator cannot see output from another.
- **Must target .NET Standard 2.0** — the generator assembly itself runs inside the compiler.
- **IDE integration** — generated code may take a moment to appear in IntelliSense after changes.
- **Debugging** — attaching a debugger to the generator requires launching a second VS instance or using `Debugger.Launch()`.

## When to Use Source Generators

| Use Case | Example |
|---|---|
| Eliminating reflection | JSON serialization, object mapping |
| Boilerplate reduction | `ToString()`, `Equals()`, `GetHashCode()` |
| Compile-time validation | Verifying attribute usage, configuration |
| AOT compatibility | Any scenario where trimming/NativeAOT is required |
| Performance-critical code | Logging, serialization in hot paths |

## Key Takeaways

1. Source generators produce C# code at compile time, eliminating runtime reflection overhead.
2. Use `IIncrementalGenerator` for efficient, IDE-friendly generators that cache results.
3. Generated classes must be `partial` to allow the generator to add members.
4. .NET ships with several built-in source generators: `System.Text.Json`, `LoggerMessage`, `RegexGenerator`.
5. Generators are additive — they add new files but cannot modify existing ones.
6. Source generators are essential for AOT compilation and trimming scenarios.
7. Test generators using `CSharpGeneratorDriver` from the Roslyn APIs.
