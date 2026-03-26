# Project 11: Distributed ETL Orchestrator

*Difficulty: Very Hard — Estimated: 3-4 weeks — Category: Data Engineering / Distributed Systems*

---

## Project Overview

This is the capstone project. Build a simplified Airflow-like DAG-based ETL orchestration engine in pure C#/.NET 10 — from the task dependency graph through the execution engine to a web UI and CLI.

The orchestrator lets you define pipelines as directed acyclic graphs (DAGs) using a fluent C# API. Each DAG is a collection of tasks with explicit dependencies. The engine validates the graph (cycle detection, orphaned tasks), computes execution order via topological sort, and runs tasks in parallel where dependencies allow. Tasks progress through a state machine (Pending, Running, Success, Failed, Skipped, Retrying) with retry policies, exponential backoff, and cancellation timeout support.

Built-in task types cover real-world ETL scenarios: `SqlTask` for running T-SQL, `OracleExtractTask` for pulling from Oracle, `BulkCopyTask` for high-throughput loads, `FileTask` for file operations, `HttpTask` for API calls, and `ShellTask` for running external processes. A cron-based scheduler powered by NCrontab triggers DAGs on schedule.

A full ASP.NET Core MVC web UI provides DAG list and detail views, a visual dependency graph, run history with drill-down, real-time log streaming via SignalR, and manual trigger/pause/unpause controls. A CLI provides command-line access for automation and CI/CD integration.

This project synthesizes everything: concurrency, graph algorithms, state machines, web development, database access, and systems design. It is the kind of project that anchors a portfolio.

---

## Learning Objectives

By completing this project you will:

1. Design and implement a DAG data structure with validation and topological sort
2. Build a fluent API for defining complex task dependency graphs in C#
3. Implement a task state machine with well-defined transitions and event hooks
4. Execute tasks in parallel using `Task.WhenAll` with dependency-aware scheduling
5. Implement retry policies with exponential backoff and jitter
6. Use `CancellationToken` for cooperative task timeout and graceful shutdown
7. Build a cron-based scheduler using NCrontab for periodic DAG execution
8. Stream real-time logs from executing tasks to a web UI via SignalR
9. Create both a web UI and CLI interface for the same underlying engine
10. Design a plugin-like task type system with a common `ITaskRunner` interface

---

## Prerequisites

Before starting this project, complete these lessons:

| Lesson | Topic | Why You Need It |
|--------|-------|-----------------|
| 201 | Pipeline Architecture | Understanding ETL pipeline design patterns |
| 203 | Parallel Data Processing | Parallel execution strategies and trade-offs |
| 208 | Config-Driven Pipelines | Externalizing pipeline configuration |
| 180 | ASP.NET Core Fundamentals | Web hosting, middleware, startup |
| 181 | MVC Pattern | Model-View-Controller for the web UI |
| 34 | Channels | Producer-consumer patterns for log streaming |
| 23 | Concurrency | async/await, Task, SemaphoreSlim, CancellationToken |
| 100 | Topological Sort | Graph ordering algorithm for task scheduling |
| 24 | Design Patterns | Strategy (task types), state machine, builder (fluent API) |
| 07 | Async/Await | Deep understanding of async execution |
| 32 | Threading Primitives | Locks, semaphores for concurrency control |
| 12 | Delegates and Events | Event-driven task lifecycle hooks |

---

## Architecture

```
Orchestrator/
├── Orchestrator.sln
├── src/
│   ├── Orchestrator.Core/
│   │   ├── Orchestrator.Core.csproj
│   │   ├── Dag/
│   │   │   ├── Dag.cs                   # DAG definition (tasks + edges)
│   │   │   ├── DagBuilder.cs            # Fluent API for building DAGs
│   │   │   ├── DagValidator.cs          # Cycle detection, orphan detection
│   │   │   ├── DagTask.cs              # Single task in a DAG
│   │   │   └── TaskDependency.cs        # Edge between two tasks
│   │   ├── Execution/
│   │   │   ├── TaskState.cs             # Enum: Pending, Running, Success, Failed, Skipped, Retrying
│   │   │   ├── TaskStateMachine.cs      # Valid state transitions
│   │   │   ├── TaskResult.cs            # Execution result (state, duration, output, error)
│   │   │   ├── RetryPolicy.cs           # Retry count, backoff, jitter
│   │   │   └── TaskContext.cs           # Runtime context passed to task runners
│   │   ├── Tasks/
│   │   │   ├── ITaskRunner.cs           # Interface all task types implement
│   │   │   ├── SqlTask.cs              # Execute T-SQL against SQL Server
│   │   │   ├── OracleExtractTask.cs     # Extract from Oracle
│   │   │   ├── BulkCopyTask.cs          # SqlBulkCopy high-throughput load
│   │   │   ├── FileTask.cs             # File copy, move, delete
│   │   │   ├── HttpTask.cs             # HTTP GET/POST
│   │   │   ├── ShellTask.cs            # Run external process
│   │   │   └── PipelineTask.cs          # Composite: runs a sub-pipeline
│   │   ├── Scheduling/
│   │   │   ├── CronSchedule.cs          # NCrontab wrapper
│   │   │   └── DagSchedule.cs           # DAG + cron + enabled flag
│   │   ├── Events/
│   │   │   ├── IDagEventHandler.cs      # Lifecycle event hooks
│   │   │   └── DagEvents.cs             # OnTaskStarted, OnTaskCompleted, etc.
│   │   └── Models/
│   │       ├── DagRun.cs                # Single execution of a DAG
│   │       ├── TaskRun.cs               # Single execution of a task
│   │       └── DagRunStatus.cs          # Enum: Queued, Running, Success, Failed, Cancelled
│   │
│   ├── Orchestrator.Engine/
│   │   ├── Orchestrator.Engine.csproj
│   │   ├── DagExecutor.cs              # Topological sort + parallel execution
│   │   ├── Scheduler.cs                # Cron-based DAG scheduler
│   │   ├── ExecutionPlan.cs            # Ordered list of task batches
│   │   ├── LogStream.cs               # Channel-based log streaming
│   │   └── OrchestratorService.cs      # IHostedService coordinating everything
│   │
│   ├── Orchestrator.SqlServer/
│   │   ├── Orchestrator.SqlServer.csproj
│   │   ├── SqlTaskRunner.cs
│   │   ├── BulkCopyTaskRunner.cs
│   │   └── SqlServerConnectionFactory.cs
│   │
│   ├── Orchestrator.Oracle/
│   │   ├── Orchestrator.Oracle.csproj
│   │   └── OracleExtractRunner.cs
│   │
│   ├── Orchestrator.Web/
│   │   ├── Orchestrator.Web.csproj
│   │   ├── Program.cs
│   │   ├── Controllers/
│   │   │   ├── DagsController.cs
│   │   │   ├── RunsController.cs
│   │   │   └── Api/
│   │   │       └── OrchestratorApiController.cs
│   │   ├── Hubs/
│   │   │   └── LogHub.cs               # SignalR hub for log streaming
│   │   ├── ViewModels/
│   │   │   ├── DagListViewModel.cs
│   │   │   ├── DagDetailViewModel.cs
│   │   │   └── RunDetailViewModel.cs
│   │   ├── Views/
│   │   │   ├── Shared/
│   │   │   │   └── _Layout.cshtml
│   │   │   ├── Dags/
│   │   │   │   ├── Index.cshtml
│   │   │   │   └── Detail.cshtml
│   │   │   └── Runs/
│   │   │       └── Detail.cshtml
│   │   └── wwwroot/
│   │       ├── css/
│   │       └── js/
│   │           ├── dag-graph.js         # Visual dependency graph
│   │           └── log-stream.js        # Real-time log viewer
│   │
│   ├── Orchestrator.Cli/
│   │   ├── Orchestrator.Cli.csproj
│   │   ├── Program.cs
│   │   └── Commands/
│   │       ├── RunCommand.cs
│   │       ├── ListCommand.cs
│   │       └── HistoryCommand.cs
│   │
│   └── Orchestrator.Demo/
│       ├── Orchestrator.Demo.csproj
│       └── SampleDags.cs               # Example DAG definitions
│
└── tests/
    └── Orchestrator.Tests/
        ├── Orchestrator.Tests.csproj
        ├── Dag/
        │   ├── DagBuilderTests.cs
        │   ├── DagValidatorTests.cs
        │   └── TopologicalSortTests.cs
        ├── Execution/
        │   ├── TaskStateMachineTests.cs
        │   ├── DagExecutorTests.cs
        │   └── RetryPolicyTests.cs
        └── Integration/
            └── EndToEndTests.cs
```

---

## Requirements

### Core Requirements

1. **DAG definition**: A `Dag` object contains named tasks and directed edges representing dependencies. Tasks are defined with a name, a task runner type, configuration dictionary, retry policy, and timeout. Dependencies declare "task A must complete before task B starts."

2. **Fluent builder API**: Build DAGs using a readable fluent syntax:
   ```csharp
   var dag = new DagBuilder("daily-etl")
       .AddTask("extract", new SqlTask("SELECT * FROM source"))
       .AddTask("transform", new ShellTask("python transform.py"))
       .AddTask("load", new BulkCopyTask("dbo.Target"))
       .AddDependency("transform", "extract")
       .AddDependency("load", "transform")
       .WithSchedule("0 6 * * *")
       .Build();
   ```

3. **DAG validation**: Before execution, validate the DAG: detect cycles (throw if found), detect orphaned tasks (tasks with no path from any root), warn on redundant edges. Use depth-first search for cycle detection.

4. **Topological sort execution**: Compute execution order using Kahn's algorithm or DFS-based topological sort. Group tasks into "levels" — all tasks in a level can run in parallel because their dependencies are satisfied. Execute level by level.

5. **Task state machine**: Each task progresses through states with well-defined transitions:
   - `Pending` -> `Running` (when dependencies satisfied)
   - `Running` -> `Success` (on completion)
   - `Running` -> `Failed` (on exception)
   - `Failed` -> `Retrying` (if retries remain)
   - `Retrying` -> `Running` (after backoff delay)
   - `Failed` -> `Skipped` (downstream tasks when upstream fails)
   - Any -> `Cancelled` (on cancellation token)

   Invalid transitions throw `InvalidStateTransitionException`.

6. **Retry with exponential backoff**: Configurable per task: max retries (default 3), base delay (default 1s), max delay (default 60s), jitter (random 0-500ms). Delay formula: `min(baseDelay * 2^attempt + jitter, maxDelay)`.

7. **Task timeout**: Each task has a configurable timeout. Use `CancellationTokenSource.CreateLinkedTokenSource` combining the task timeout with the global DAG cancellation token. If a task exceeds its timeout, cancel it and transition to `Failed`.

8. **Built-in task types**: Implement `ITaskRunner` for at least: `SqlTask` (executes a SQL command), `FileTask` (copy/move/delete files), `HttpTask` (HTTP request), `ShellTask` (run a process and capture output). Other types can be stubs with simulated execution for demo purposes.

9. **REPL/CLI**: Command-line interface with commands: `run --dag <name>` (execute a DAG and stream output), `list` (show all registered DAGs), `history --dag <name>` (show recent runs), `status --run <id>` (show task states for a run).

### Extended Requirements

10. **Cron scheduler**: A background service that evaluates all DAG schedules every minute. When a DAG's cron expression matches the current time, queue it for execution. Use NCrontab for cron parsing. Handle overlapping runs (skip if previous run still active).

11. **SignalR log streaming**: As tasks execute, stream log lines to connected web clients via a SignalR hub. Each log line includes: timestamp, DAG name, task name, log level, message. Use a `Channel<LogEntry>` as a buffer between the executor and the hub.

12. **Web UI — DAG list**: Page showing all registered DAGs with name, schedule, last run status, next scheduled run, and a "Trigger Now" button.

13. **Web UI — DAG detail**: Page showing a specific DAG's tasks as a visual dependency graph (rendered with JavaScript/SVG), current run status with task state badges, and run history table.

14. **Web UI — Run detail**: Page showing a specific run's task-by-task execution timeline, log output, duration, and error messages. Real-time updates via SignalR during active runs.

### Stretch Requirements

15. **Pause/Unpause**: Ability to pause a running DAG (stops scheduling new tasks, lets current tasks finish) and unpause (resumes from where it left off).
16. **Task output passing**: Tasks can produce output that downstream tasks consume via `TaskContext.GetUpstreamOutput<T>("task-name")`.
17. **Conditional execution**: Tasks can define a condition function `Func<TaskContext, bool>` that determines whether to execute or skip.
18. **Persistent state**: Store DAG runs and task states in SQLite or SQL Server so history survives restarts.

---

## Technical Guidance

### DAG Data Structure

Represent the DAG as an adjacency list: `Dictionary<string, List<string>>` where key is a task name and value is the list of tasks that depend on it (its downstream neighbors). Also store a reverse map for finding a task's upstream dependencies.

The key insight for execution is "in-degree": a task with in-degree 0 (no unsatisfied dependencies) is ready to run. After a task completes, decrement the in-degree of all its downstream tasks. Any downstream task whose in-degree reaches 0 is now ready.

This is Kahn's algorithm applied to real-time scheduling.

### Fluent Builder Pattern

Your `DagBuilder` accumulates tasks and edges, then `Build()` validates and freezes the DAG. Make the DAG immutable after building — execution state lives in `DagRun` and `TaskRun` objects, not in the DAG itself. This separation means the same DAG definition can be executed multiple times concurrently.

Return `this` from each builder method for chaining. Validate inputs eagerly in the builder (e.g., reject duplicate task names, reject self-dependencies).

### Task State Machine

Implement the state machine as a separate class with an explicit transition table. This avoids scattered if/else checks throughout the executor:

```
private static readonly Dictionary<(TaskState From, TaskState To), bool> ValidTransitions = new()
{
    [(Pending, Running)] = true,
    [(Running, Success)] = true,
    [(Running, Failed)] = true,
    ...
};
```

Raise events on state transitions so the log streamer, web UI, and persistence layer can react without the executor knowing about them.

### Parallel Execution Strategy

Do NOT launch all tasks at once and use `Task.WhenAll`. Instead, use a semaphore to limit concurrency and a queue of ready tasks:

1. Compute initial in-degrees.
2. Enqueue all tasks with in-degree 0.
3. While the queue is not empty:
   a. Dequeue a task. Acquire semaphore slot. Launch it as a `Task`.
   b. When it completes, release semaphore. Decrement downstream in-degrees. Enqueue any task that reaches in-degree 0.

Use `SemaphoreSlim` with a configurable max concurrency (default: `Environment.ProcessorCount`). Use `Channel<string>` as the ready-task queue for async-friendly producer/consumer.

### Exponential Backoff

```csharp
TimeSpan CalculateDelay(int attempt, RetryPolicy policy)
{
    double delayMs = policy.BaseDelay.TotalMilliseconds * Math.Pow(2, attempt);
    delayMs = Math.Min(delayMs, policy.MaxDelay.TotalMilliseconds);
    delayMs += Random.Shared.Next(0, 500); // jitter
    return TimeSpan.FromMilliseconds(delayMs);
}
```

Jitter prevents the "thundering herd" problem where all retries fire at the same instant.

### Log Streaming Architecture

Create a `Channel<LogEntry>` (bounded, capacity 10,000). The executor writes log entries to the channel. A background consumer reads from the channel and broadcasts via `IHubContext<LogHub>`. This decouples execution speed from SignalR delivery speed.

Group log entries by DAG run ID so the web UI can subscribe to a specific run's logs.

### Cron Scheduling with NCrontab

NCrontab parses standard cron expressions and calculates the next occurrence:

```csharp
var schedule = CrontabSchedule.Parse("0 6 * * *");
DateTime next = schedule.GetNextOccurrence(DateTime.UtcNow);
```

Your scheduler service runs a `PeriodicTimer` every 60 seconds, checks all DAG schedules, and fires any that match. Track the last fire time per DAG to avoid double-firing within the same minute.

### Visual DAG Rendering

For the web UI dependency graph, output the DAG as a JSON adjacency list and render it client-side. You have several options:
- **SVG with manual layout**: Assign layers based on topological order, space nodes evenly per layer, draw arrows between connected nodes. This is simpler than it sounds for DAGs.
- **Dagre.js**: A JavaScript library specifically for DAG layout. Feed it your nodes and edges, and it computes positions.
- **Mermaid.js**: Generate a Mermaid graph definition string server-side and let the Mermaid library render it.

Any approach works. The key is that task nodes are colored by their current state (green=success, red=failed, blue=running, gray=pending).

---

## Step-by-Step Milestones

### Milestone 1: DAG Data Structure and Validation (Days 1-3)

Implement `Dag`, `DagTask`, `DagBuilder`, and `DagValidator`. The builder accepts tasks and dependencies, validates on `Build()`. The validator detects cycles using DFS (maintain visiting/visited sets — if you revisit a "visiting" node, there is a cycle). Detect orphaned tasks (unreachable from any root). Write thorough tests: valid DAGs, single-node DAGs, diamond dependencies, cycle detection, self-loops.

**Deliverable**: `DagBuilder` constructs valid DAGs and rejects invalid ones. All validation tests pass.

### Milestone 2: Task State Machine and Retry Policy (Days 4-5)

Implement `TaskStateMachine` with the explicit transition table. Implement `RetryPolicy` with exponential backoff calculation. Write `TaskResult` to capture execution outcome. Test all valid transitions, verify invalid transitions throw, test retry delay calculations for multiple attempts, verify jitter randomness is bounded.

**Deliverable**: State machine correctly enforces transitions. Retry delay grows exponentially with jitter.

### Milestone 3: DAG Executor with Topological Sort (Days 6-9)

Implement `DagExecutor` using Kahn's algorithm for parallel execution. Create the ready-task queue with `Channel<string>`, the semaphore for concurrency limiting, and the in-degree tracking. Implement `ITaskRunner` and create `ShellTask` and `FileTask` as concrete runners. Test with a diamond DAG (A -> B, A -> C, B -> D, C -> D) — verify B and C run in parallel, D runs after both. Test with a chain DAG — verify sequential execution. Test failure propagation (upstream failure skips downstream tasks).

**Deliverable**: Executor runs DAGs respecting dependencies, parallelizing where possible, handling failures.

### Milestone 4: Built-in Task Types (Days 10-12)

Implement `SqlTask` (uses `SqlConnection` + `SqlCommand`), `HttpTask` (uses `HttpClient`), `BulkCopyTask` (uses `SqlBulkCopy`), and `PipelineTask` (runs a sub-DAG). Each implements `ITaskRunner.ExecuteAsync(TaskContext, CancellationToken)`. For Oracle, create a stub that simulates extraction with a delay. Test each task type independently with appropriate mocks.

**Deliverable**: All task types execute correctly. SQL and HTTP tasks tested against local services.

### Milestone 5: Cron Scheduler (Days 13-14)

Implement `CronSchedule` wrapping NCrontab. Implement `Scheduler` as an `IHostedService` with a 60-second `PeriodicTimer`. Track registered DAGs with their schedules and last fire times. When a schedule matches, queue the DAG for execution. Handle overlap detection (skip if a previous run of the same DAG is still active).

**Deliverable**: Scheduler fires DAGs on schedule. Overlap protection works.

### Milestone 6: Web UI — DAG List and Detail (Days 15-18)

Implement `DagsController` with Index (list all DAGs) and Detail (single DAG) actions. Create Razor views with the layout, DAG cards, and the dependency graph visualization. Implement the visual graph renderer (pick one: SVG, Dagre, or Mermaid). Add "Trigger Now" button that POSTs to the API and redirects to the run detail page.

**Deliverable**: Web UI shows DAGs with visual dependency graphs. Manual trigger works.

### Milestone 7: Log Streaming and Run Detail (Days 19-22)

Implement `LogStream` using `Channel<LogEntry>`. Wire the executor to write logs. Implement `LogHub` SignalR hub that streams logs to subscribed clients. Build the Run Detail page showing task states (updating in real time), execution timeline, and scrolling log output. Connect SignalR client JavaScript.

**Deliverable**: Trigger a DAG from the web UI, watch tasks execute and logs stream in real time.

### Milestone 8: CLI and End-to-End Testing (Days 23-28)

Implement the CLI using `System.CommandLine` or manual argument parsing. Create `SampleDags.cs` in the Demo project with 3-4 realistic DAG definitions (daily ETL, weekly report, data quality check). Write end-to-end tests that define a DAG, execute it, and verify all tasks reached expected states. Write integration tests for the web API endpoints.

**Deliverable**: CLI can list, run, and show history for DAGs. Demo DAGs execute successfully. Full test suite passes.

---

## Testing Requirements

### Unit Tests

- **DagBuilderTests**: Build valid DAGs with various topologies (chain, diamond, fan-out, fan-in). Reject duplicate task names. Reject adding dependency on non-existent task.
- **DagValidatorTests**: Detect simple cycle (A->B->A). Detect complex cycle (A->B->C->A). Accept valid DAGs. Detect orphaned tasks. Detect self-loop.
- **TopologicalSortTests**: Correct ordering for chain, diamond, complex DAG. All tasks present in output. Parallel groups identified correctly.
- **TaskStateMachineTests**: All valid transitions succeed. All invalid transitions throw. State machine is reusable across multiple task runs.
- **RetryPolicyTests**: Delay doubles each attempt. Delay capped at max. Jitter is bounded. Zero retries means no retry.
- **DagExecutorTests**: Diamond DAG parallel execution (B and C overlap in time). Chain DAG sequential execution. Failed task skips downstream. Timeout cancels running task. Retry succeeds after transient failure.

### Integration Tests

- **End-to-end DAG run**: Define a DAG with 5 tasks, execute it, verify all tasks reach `Success` state, verify execution order respects dependencies.
- **Failure propagation**: DAG with A->B->C, B fails, verify C is `Skipped` and DAG run status is `Failed`.
- **Retry behavior**: Task fails twice then succeeds on third attempt. Verify retry count, verify delays were applied.
- **Concurrent DAGs**: Execute two different DAGs simultaneously. Verify they do not interfere with each other.
- **Web API**: Trigger a DAG via POST, poll for completion, verify run history shows the completed run.

### Performance Tests

- DAG with 100 tasks, max parallelism 10: completes in reasonable time
- Scheduler handles 50 registered DAGs without missing fire times
- Log channel handles 10,000 entries/second without backpressure stalling execution

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### Orchestrator.Core/Dag/DagTask.cs

```csharp
using Orchestrator.Core.Execution;
using Orchestrator.Core.Tasks;

namespace Orchestrator.Core.Dag;

public sealed class DagTask
{
    public string Name { get; }
    public ITaskRunner Runner { get; }
    public RetryPolicy RetryPolicy { get; init; } = RetryPolicy.Default;
    public TimeSpan Timeout { get; init; } = TimeSpan.FromMinutes(30);
    public Dictionary<string, object> Config { get; init; } = [];
    public Func<TaskContext, bool>? Condition { get; init; }

    public DagTask(string name, ITaskRunner runner)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentNullException.ThrowIfNull(runner);
        Name = name;
        Runner = runner;
    }
}
```

### Orchestrator.Core/Dag/Dag.cs

```csharp
namespace Orchestrator.Core.Dag;

public sealed class Dag
{
    public string Name { get; }
    public string Description { get; init; } = string.Empty;
    public IReadOnlyDictionary<string, DagTask> Tasks { get; }
    public IReadOnlyDictionary<string, List<string>> Downstream { get; }  // task -> [dependents]
    public IReadOnlyDictionary<string, List<string>> Upstream { get; }    // task -> [dependencies]
    public string? CronExpression { get; init; }

    internal Dag(
        string name,
        IReadOnlyDictionary<string, DagTask> tasks,
        IReadOnlyDictionary<string, List<string>> downstream,
        IReadOnlyDictionary<string, List<string>> upstream)
    {
        Name = name;
        Tasks = tasks;
        Downstream = downstream;
        Upstream = upstream;
    }

    public IReadOnlyList<string> GetRootTasks() =>
        Tasks.Keys.Where(t => !Upstream.ContainsKey(t) || Upstream[t].Count == 0).ToList();

    public IReadOnlyList<string> GetLeafTasks() =>
        Tasks.Keys.Where(t => !Downstream.ContainsKey(t) || Downstream[t].Count == 0).ToList();
}
```

### Orchestrator.Core/Dag/DagBuilder.cs

```csharp
using Orchestrator.Core.Tasks;

namespace Orchestrator.Core.Dag;

public sealed class DagBuilder
{
    private readonly string _name;
    private string _description = string.Empty;
    private string? _cronExpression;
    private readonly Dictionary<string, DagTask> _tasks = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<(string Downstream, string Upstream)> _edges = [];

    public DagBuilder(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        _name = name;
    }

    public DagBuilder WithDescription(string description)
    {
        _description = description;
        return this;
    }

    public DagBuilder WithSchedule(string cronExpression)
    {
        _cronExpression = cronExpression;
        return this;
    }

    public DagBuilder AddTask(string name, ITaskRunner runner, Action<TaskOptions>? configure = null)
    {
        if (_tasks.ContainsKey(name))
            throw new ArgumentException($"Task '{name}' already exists in DAG '{_name}'.");

        var options = new TaskOptions();
        configure?.Invoke(options);

        var task = new DagTask(name, runner)
        {
            RetryPolicy = options.RetryPolicy,
            Timeout = options.Timeout,
            Config = options.Config,
            Condition = options.Condition
        };

        _tasks[name] = task;
        return this;
    }

    public DagBuilder AddDependency(string downstream, string upstream)
    {
        if (string.Equals(downstream, upstream, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException($"Task '{downstream}' cannot depend on itself.");

        _edges.Add((downstream, upstream));
        return this;
    }

    public Dag Build()
    {
        // Validate all edge references exist
        foreach (var (down, up) in _edges)
        {
            if (!_tasks.ContainsKey(down))
                throw new InvalidOperationException($"Dependency references unknown task '{down}'.");
            if (!_tasks.ContainsKey(up))
                throw new InvalidOperationException($"Dependency references unknown task '{up}'.");
        }

        // Build adjacency lists
        var downstream = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        var upstream = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var name in _tasks.Keys)
        {
            downstream[name] = [];
            upstream[name] = [];
        }

        foreach (var (down, up) in _edges)
        {
            downstream[up].Add(down);
            upstream[down].Add(up);
        }

        var dag = new Dag(_name, _tasks, downstream, upstream)
        {
            Description = _description,
            CronExpression = _cronExpression
        };

        // Validate
        DagValidator.Validate(dag);

        return dag;
    }
}

public sealed class TaskOptions
{
    public Execution.RetryPolicy RetryPolicy { get; set; } = Execution.RetryPolicy.Default;
    public TimeSpan Timeout { get; set; } = TimeSpan.FromMinutes(30);
    public Dictionary<string, object> Config { get; set; } = [];
    public Func<Execution.TaskContext, bool>? Condition { get; set; }
}
```

### Orchestrator.Core/Dag/DagValidator.cs

```csharp
namespace Orchestrator.Core.Dag;

public static class DagValidator
{
    public static void Validate(Dag dag)
    {
        if (dag.Tasks.Count == 0)
            throw new InvalidOperationException($"DAG '{dag.Name}' has no tasks.");

        DetectCycles(dag);
        DetectOrphans(dag);
    }

    private static void DetectCycles(Dag dag)
    {
        var visiting = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var task in dag.Tasks.Keys)
        {
            if (!visited.Contains(task))
                DfsCycleCheck(task, dag, visiting, visited);
        }
    }

    private static void DfsCycleCheck(string node, Dag dag,
        HashSet<string> visiting, HashSet<string> visited)
    {
        visiting.Add(node);

        if (dag.Downstream.TryGetValue(node, out var neighbors))
        {
            foreach (var neighbor in neighbors)
            {
                if (visiting.Contains(neighbor))
                    throw new InvalidOperationException(
                        $"Cycle detected in DAG '{dag.Name}': {node} -> {neighbor}");

                if (!visited.Contains(neighbor))
                    DfsCycleCheck(neighbor, dag, visiting, visited);
            }
        }

        visiting.Remove(node);
        visited.Add(node);
    }

    private static void DetectOrphans(Dag dag)
    {
        // BFS from all root tasks — any task not reached is an orphan
        var roots = dag.GetRootTasks();
        if (roots.Count == 0)
            throw new InvalidOperationException(
                $"DAG '{dag.Name}' has no root tasks (all tasks have dependencies — likely a cycle was missed).");

        var reachable = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<string>(roots);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!reachable.Add(current)) continue;

            if (dag.Downstream.TryGetValue(current, out var neighbors))
            {
                foreach (var neighbor in neighbors)
                {
                    if (!reachable.Contains(neighbor))
                        queue.Enqueue(neighbor);
                }
            }
        }

        var orphans = dag.Tasks.Keys.Where(t => !reachable.Contains(t)).ToList();
        if (orphans.Count > 0)
            throw new InvalidOperationException(
                $"DAG '{dag.Name}' has orphaned tasks: {string.Join(", ", orphans)}");
    }
}
```

### Orchestrator.Core/Execution/TaskState.cs

```csharp
namespace Orchestrator.Core.Execution;

public enum TaskState
{
    Pending,
    Running,
    Success,
    Failed,
    Skipped,
    Retrying,
    Cancelled
}

public enum DagRunStatus
{
    Queued,
    Running,
    Success,
    Failed,
    Cancelled
}
```

### Orchestrator.Core/Execution/TaskStateMachine.cs

```csharp
namespace Orchestrator.Core.Execution;

public sealed class TaskStateMachine
{
    private static readonly HashSet<(TaskState From, TaskState To)> ValidTransitions =
    [
        (TaskState.Pending, TaskState.Running),
        (TaskState.Pending, TaskState.Skipped),
        (TaskState.Pending, TaskState.Cancelled),
        (TaskState.Running, TaskState.Success),
        (TaskState.Running, TaskState.Failed),
        (TaskState.Running, TaskState.Cancelled),
        (TaskState.Failed, TaskState.Retrying),
        (TaskState.Failed, TaskState.Skipped),
        (TaskState.Retrying, TaskState.Running),
        (TaskState.Retrying, TaskState.Cancelled),
    ];

    private TaskState _state = TaskState.Pending;
    public TaskState Current => _state;

    public event Action<TaskState, TaskState>? OnTransition;

    public void TransitionTo(TaskState newState)
    {
        if (!ValidTransitions.Contains((_state, newState)))
            throw new InvalidStateTransitionException(_state, newState);

        var old = _state;
        _state = newState;
        OnTransition?.Invoke(old, newState);
    }

    public bool CanTransitionTo(TaskState newState) =>
        ValidTransitions.Contains((_state, newState));

    public void Reset() => _state = TaskState.Pending;
}

public sealed class InvalidStateTransitionException : InvalidOperationException
{
    public TaskState FromState { get; }
    public TaskState ToState { get; }

    public InvalidStateTransitionException(TaskState from, TaskState to)
        : base($"Invalid task state transition: {from} -> {to}")
    {
        FromState = from;
        ToState = to;
    }
}
```

### Orchestrator.Core/Execution/RetryPolicy.cs

```csharp
namespace Orchestrator.Core.Execution;

public sealed record RetryPolicy(
    int MaxRetries,
    TimeSpan BaseDelay,
    TimeSpan MaxDelay,
    int MaxJitterMs = 500)
{
    public static readonly RetryPolicy Default = new(3, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(60));
    public static readonly RetryPolicy None = new(0, TimeSpan.Zero, TimeSpan.Zero, 0);

    public TimeSpan CalculateDelay(int attempt)
    {
        if (MaxRetries == 0) return TimeSpan.Zero;

        double delayMs = BaseDelay.TotalMilliseconds * Math.Pow(2, attempt);
        delayMs = Math.Min(delayMs, MaxDelay.TotalMilliseconds);
        delayMs += Random.Shared.Next(0, MaxJitterMs + 1);
        return TimeSpan.FromMilliseconds(delayMs);
    }
}
```

### Orchestrator.Core/Execution/TaskContext.cs

```csharp
namespace Orchestrator.Core.Execution;

public sealed class TaskContext
{
    public string DagName { get; }
    public string TaskName { get; }
    public Guid RunId { get; }
    public Dictionary<string, object> Config { get; }
    public CancellationToken CancellationToken { get; }

    private readonly Dictionary<string, object> _outputs;
    private readonly Action<string, string> _logCallback;

    public TaskContext(string dagName, string taskName, Guid runId,
        Dictionary<string, object> config, CancellationToken ct,
        Dictionary<string, object> outputs, Action<string, string> logCallback)
    {
        DagName = dagName;
        TaskName = taskName;
        RunId = runId;
        Config = config;
        CancellationToken = ct;
        _outputs = outputs;
        _logCallback = logCallback;
    }

    public void Log(string message) => _logCallback(TaskName, message);

    public void SetOutput<T>(string key, T value) where T : notnull =>
        _outputs[$"{TaskName}.{key}"] = value;

    public T? GetUpstreamOutput<T>(string taskName, string key)
    {
        var fullKey = $"{taskName}.{key}";
        return _outputs.TryGetValue(fullKey, out var val) ? (T)val : default;
    }
}
```

### Orchestrator.Core/Execution/TaskResult.cs

```csharp
namespace Orchestrator.Core.Execution;

public sealed record TaskResult(
    string TaskName,
    TaskState FinalState,
    TimeSpan Duration,
    int AttemptCount,
    string? Output,
    string? ErrorMessage,
    Exception? Exception);
```

### Orchestrator.Core/Tasks/ITaskRunner.cs

```csharp
using Orchestrator.Core.Execution;

namespace Orchestrator.Core.Tasks;

public interface ITaskRunner
{
    string TypeName { get; }
    Task<string?> ExecuteAsync(TaskContext context, CancellationToken cancellationToken);
}
```

### Orchestrator.Core/Tasks/ShellTask.cs

```csharp
using System.Diagnostics;
using System.Text;
using Orchestrator.Core.Execution;

namespace Orchestrator.Core.Tasks;

public sealed class ShellTask : ITaskRunner
{
    public string TypeName => "Shell";
    public string Command { get; }
    public string? Arguments { get; }
    public string? WorkingDirectory { get; init; }

    public ShellTask(string command, string? arguments = null)
    {
        Command = command;
        Arguments = arguments;
    }

    public async Task<string?> ExecuteAsync(TaskContext context, CancellationToken ct)
    {
        context.Log($"Executing: {Command} {Arguments}");

        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = Command,
                Arguments = Arguments ?? string.Empty,
                WorkingDirectory = WorkingDirectory ?? Environment.CurrentDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        var output = new StringBuilder();
        var errors = new StringBuilder();

        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not null)
            {
                output.AppendLine(e.Data);
                context.Log(e.Data);
            }
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null) errors.AppendLine(e.Data);
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        await process.WaitForExitAsync(ct);

        if (process.ExitCode != 0)
            throw new InvalidOperationException(
                $"Process exited with code {process.ExitCode}: {errors}");

        context.Log($"Process completed with exit code 0.");
        return output.ToString();
    }
}
```

### Orchestrator.Core/Tasks/HttpTask.cs

```csharp
using Orchestrator.Core.Execution;

namespace Orchestrator.Core.Tasks;

public sealed class HttpTask : ITaskRunner
{
    public string TypeName => "Http";
    public HttpMethod Method { get; }
    public string Url { get; }
    public string? RequestBody { get; init; }
    public Dictionary<string, string> Headers { get; init; } = [];

    private static readonly HttpClient SharedClient = new() { Timeout = TimeSpan.FromMinutes(5) };

    public HttpTask(HttpMethod method, string url)
    {
        Method = method;
        Url = url;
    }

    public async Task<string?> ExecuteAsync(TaskContext context, CancellationToken ct)
    {
        context.Log($"HTTP {Method} {Url}");

        using var request = new HttpRequestMessage(Method, Url);
        foreach (var (key, value) in Headers)
            request.Headers.TryAddWithoutValidation(key, value);

        if (RequestBody is not null)
            request.Content = new StringContent(RequestBody, System.Text.Encoding.UTF8, "application/json");

        var response = await SharedClient.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        context.Log($"Response: {(int)response.StatusCode} {response.StatusCode} ({body.Length} bytes)");

        response.EnsureSuccessStatusCode();
        return body;
    }
}
```

### Orchestrator.Core/Tasks/FileTask.cs

```csharp
using Orchestrator.Core.Execution;

namespace Orchestrator.Core.Tasks;

public sealed class FileTask : ITaskRunner
{
    public string TypeName => "File";
    public FileOperation Operation { get; }
    public string SourcePath { get; }
    public string? DestinationPath { get; }

    public FileTask(FileOperation operation, string sourcePath, string? destinationPath = null)
    {
        Operation = operation;
        SourcePath = sourcePath;
        DestinationPath = destinationPath;
    }

    public Task<string?> ExecuteAsync(TaskContext context, CancellationToken ct)
    {
        context.Log($"File {Operation}: {SourcePath}");

        switch (Operation)
        {
            case FileOperation.Copy:
                ArgumentException.ThrowIfNullOrWhiteSpace(DestinationPath);
                File.Copy(SourcePath, DestinationPath, overwrite: true);
                context.Log($"Copied to {DestinationPath}");
                break;

            case FileOperation.Move:
                ArgumentException.ThrowIfNullOrWhiteSpace(DestinationPath);
                File.Move(SourcePath, DestinationPath, overwrite: true);
                context.Log($"Moved to {DestinationPath}");
                break;

            case FileOperation.Delete:
                File.Delete(SourcePath);
                context.Log($"Deleted {SourcePath}");
                break;

            case FileOperation.EnsureDirectory:
                Directory.CreateDirectory(SourcePath);
                context.Log($"Directory ensured: {SourcePath}");
                break;
        }

        return Task.FromResult<string?>(null);
    }
}

public enum FileOperation
{
    Copy,
    Move,
    Delete,
    EnsureDirectory
}
```

### Orchestrator.Core/Tasks/SqlTask.cs

```csharp
using Orchestrator.Core.Execution;

namespace Orchestrator.Core.Tasks;

/// <summary>
/// Executes a SQL command. In production, this would use SqlConnection.
/// For the reference solution, it simulates execution.
/// </summary>
public sealed class SqlTask : ITaskRunner
{
    public string TypeName => "Sql";
    public string Sql { get; }
    public string? ConnectionStringKey { get; init; }

    public SqlTask(string sql)
    {
        Sql = sql;
    }

    public async Task<string?> ExecuteAsync(TaskContext context, CancellationToken ct)
    {
        string connKey = ConnectionStringKey ?? context.Config.GetValueOrDefault("connectionString") as string ?? "default";
        context.Log($"Executing SQL against [{connKey}]: {Sql[..Math.Min(100, Sql.Length)]}...");

        // Simulate execution time based on query complexity
        int simulatedMs = Sql.Contains("SELECT", StringComparison.OrdinalIgnoreCase) ? 500 : 200;
        await Task.Delay(simulatedMs, ct);

        int simulatedRows = Random.Shared.Next(10, 10_000);
        context.Log($"SQL completed: {simulatedRows} rows affected.");

        context.SetOutput("rowsAffected", simulatedRows);
        return $"{simulatedRows} rows affected";
    }
}
```

### Orchestrator.Core/Models/DagRun.cs

```csharp
using Orchestrator.Core.Execution;

namespace Orchestrator.Core.Models;

public sealed class DagRun
{
    public Guid Id { get; } = Guid.NewGuid();
    public string DagName { get; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DagRunStatus Status { get; set; } = DagRunStatus.Queued;
    public Dictionary<string, TaskRun> TaskRuns { get; } = new(StringComparer.OrdinalIgnoreCase);

    public DagRun(string dagName)
    {
        DagName = dagName;
    }

    public TimeSpan Duration => (CompletedAt ?? DateTime.UtcNow) - StartedAt;
}

public sealed class TaskRun
{
    public string TaskName { get; }
    public TaskState State { get; set; } = TaskState.Pending;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int AttemptCount { get; set; }
    public string? Output { get; set; }
    public string? ErrorMessage { get; set; }
    public List<string> LogLines { get; } = [];

    public TaskRun(string taskName)
    {
        TaskName = taskName;
    }

    public TimeSpan Duration => StartedAt.HasValue
        ? (CompletedAt ?? DateTime.UtcNow) - StartedAt.Value
        : TimeSpan.Zero;
}
```

### Orchestrator.Engine/DagExecutor.cs

```csharp
using System.Threading.Channels;
using Orchestrator.Core.Dag;
using Orchestrator.Core.Execution;
using Orchestrator.Core.Models;
using Microsoft.Extensions.Logging;

namespace Orchestrator.Engine;

public sealed class DagExecutor
{
    private readonly ILogger<DagExecutor> _logger;
    private readonly int _maxConcurrency;

    public event Action<string, string, string>? OnLog; // dagName, taskName, message

    public DagExecutor(ILogger<DagExecutor> logger, int maxConcurrency = 0)
    {
        _logger = logger;
        _maxConcurrency = maxConcurrency > 0 ? maxConcurrency : Environment.ProcessorCount;
    }

    public async Task<DagRun> ExecuteAsync(Dag dag, CancellationToken ct = default)
    {
        var run = new DagRun(dag.Name) { StartedAt = DateTime.UtcNow, Status = DagRunStatus.Running };

        // Initialize task runs and in-degree map
        var inDegree = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var stateMachines = new Dictionary<string, TaskStateMachine>(StringComparer.OrdinalIgnoreCase);
        var outputs = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        foreach (var (name, _) in dag.Tasks)
        {
            run.TaskRuns[name] = new TaskRun(name);
            stateMachines[name] = new TaskStateMachine();
            int upstreamCount = dag.Upstream.TryGetValue(name, out var ups) ? ups.Count : 0;
            inDegree[name] = upstreamCount;
        }

        // Ready queue: tasks with in-degree 0
        var readyChannel = Channel.CreateUnbounded<string>();
        foreach (var (name, degree) in inDegree)
        {
            if (degree == 0)
                await readyChannel.Writer.WriteAsync(name, ct);
        }

        // Track completion
        int totalTasks = dag.Tasks.Count;
        int completedTasks = 0;
        bool dagFailed = false;
        var semaphore = new SemaphoreSlim(_maxConcurrency);
        var activeTasks = new List<Task>();
        var lockObj = new object();

        _logger.LogInformation("Executing DAG '{Dag}' with {Count} tasks, max concurrency {Max}",
            dag.Name, totalTasks, _maxConcurrency);

        while (completedTasks < totalTasks)
        {
            // If no tasks are ready and no active tasks, we are stuck (should not happen with valid DAG)
            if (!readyChannel.Reader.TryRead(out var taskName))
            {
                if (activeTasks.Count == 0)
                    break;

                // Wait for any active task to complete
                await Task.WhenAny(activeTasks);
                activeTasks.RemoveAll(t => t.IsCompleted);
                continue;
            }

            await semaphore.WaitAsync(ct);

            var task = ExecuteTaskAsync(dag, run, taskName, stateMachines[taskName],
                outputs, readyChannel.Writer, inDegree, ct,
                () =>
                {
                    semaphore.Release();
                    lock (lockObj)
                    {
                        completedTasks++;
                        if (stateMachines[taskName].Current == TaskState.Failed)
                            dagFailed = true;
                    }
                });

            activeTasks.Add(task);
        }

        // Wait for all remaining tasks
        await Task.WhenAll(activeTasks);

        run.CompletedAt = DateTime.UtcNow;
        run.Status = dagFailed ? DagRunStatus.Failed : DagRunStatus.Success;

        _logger.LogInformation("DAG '{Dag}' completed with status {Status} in {Duration}",
            dag.Name, run.Status, run.Duration);

        return run;
    }

    private async Task ExecuteTaskAsync(
        Dag dag, DagRun run, string taskName,
        TaskStateMachine sm, Dictionary<string, object> outputs,
        ChannelWriter<string> readyWriter,
        Dictionary<string, int> inDegree,
        CancellationToken ct,
        Action onComplete)
    {
        var dagTask = dag.Tasks[taskName];
        var taskRun = run.TaskRuns[taskName];

        void Log(string tn, string msg)
        {
            string line = $"[{DateTime.UtcNow:HH:mm:ss.fff}] [{tn}] {msg}";
            taskRun.LogLines.Add(line);
            OnLog?.Invoke(dag.Name, tn, msg);
        }

        try
        {
            // Check if upstream failed — skip this task
            bool upstreamFailed = dag.Upstream.TryGetValue(taskName, out var upstreams) &&
                upstreams.Any(u => run.TaskRuns[u].State is TaskState.Failed or TaskState.Skipped);

            if (upstreamFailed)
            {
                sm.TransitionTo(TaskState.Skipped);
                taskRun.State = TaskState.Skipped;
                Log(taskName, "Skipped — upstream task failed.");
                MarkDownstreamReady(dag, taskName, readyWriter, inDegree);
                return;
            }

            // Check condition
            if (dagTask.Condition is not null)
            {
                var condCtx = new TaskContext(dag.Name, taskName, run.Id,
                    dagTask.Config, ct, outputs, Log);
                if (!dagTask.Condition(condCtx))
                {
                    sm.TransitionTo(TaskState.Skipped);
                    taskRun.State = TaskState.Skipped;
                    Log(taskName, "Skipped — condition not met.");
                    MarkDownstreamReady(dag, taskName, readyWriter, inDegree);
                    return;
                }
            }

            int attempt = 0;

            while (true)
            {
                attempt++;
                taskRun.AttemptCount = attempt;
                taskRun.StartedAt ??= DateTime.UtcNow;

                sm.TransitionTo(TaskState.Running);
                taskRun.State = TaskState.Running;
                Log(taskName, $"Started (attempt {attempt}/{dagTask.RetryPolicy.MaxRetries + 1})");

                try
                {
                    // Create timeout-linked cancellation token
                    using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    timeoutCts.CancelAfter(dagTask.Timeout);

                    var context = new TaskContext(dag.Name, taskName, run.Id,
                        dagTask.Config, timeoutCts.Token, outputs, Log);

                    string? output = await dagTask.Runner.ExecuteAsync(context, timeoutCts.Token);

                    sm.TransitionTo(TaskState.Success);
                    taskRun.State = TaskState.Success;
                    taskRun.Output = output;
                    taskRun.CompletedAt = DateTime.UtcNow;
                    Log(taskName, $"Succeeded in {taskRun.Duration.TotalSeconds:F2}s");
                    break;
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    sm.TransitionTo(TaskState.Cancelled);
                    taskRun.State = TaskState.Cancelled;
                    taskRun.CompletedAt = DateTime.UtcNow;
                    Log(taskName, "Cancelled.");
                    break;
                }
                catch (Exception ex)
                {
                    sm.TransitionTo(TaskState.Failed);
                    taskRun.State = TaskState.Failed;
                    taskRun.ErrorMessage = ex.Message;
                    Log(taskName, $"Failed: {ex.Message}");

                    if (attempt <= dagTask.RetryPolicy.MaxRetries)
                    {
                        sm.TransitionTo(TaskState.Retrying);
                        taskRun.State = TaskState.Retrying;

                        var delay = dagTask.RetryPolicy.CalculateDelay(attempt - 1);
                        Log(taskName, $"Retrying in {delay.TotalSeconds:F1}s...");
                        await Task.Delay(delay, ct);
                    }
                    else
                    {
                        taskRun.CompletedAt = DateTime.UtcNow;
                        Log(taskName, $"Exhausted all {dagTask.RetryPolicy.MaxRetries} retries.");
                        break;
                    }
                }
            }

            MarkDownstreamReady(dag, taskName, readyWriter, inDegree);
        }
        finally
        {
            onComplete();
        }
    }

    private static void MarkDownstreamReady(Dag dag, string taskName,
        ChannelWriter<string> readyWriter, Dictionary<string, int> inDegree)
    {
        if (!dag.Downstream.TryGetValue(taskName, out var downstreamTasks))
            return;

        foreach (var downstream in downstreamTasks)
        {
            int remaining;
            lock (inDegree)
            {
                inDegree[downstream]--;
                remaining = inDegree[downstream];
            }

            if (remaining == 0)
                readyWriter.TryWrite(downstream);
        }
    }
}
```

### Orchestrator.Engine/Scheduler.cs

```csharp
using NCrontab;
using Orchestrator.Core.Dag;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Orchestrator.Engine;

public sealed class ScheduledDag
{
    public Dag Dag { get; }
    public CrontabSchedule CronSchedule { get; }
    public DateTime? LastFiredAt { get; set; }
    public bool IsRunning { get; set; }

    public ScheduledDag(Dag dag)
    {
        Dag = dag;
        CronSchedule = CrontabSchedule.Parse(dag.CronExpression
            ?? throw new ArgumentException("DAG has no cron expression."));
    }
}

public sealed class Scheduler : BackgroundService
{
    private readonly DagExecutor _executor;
    private readonly ILogger<Scheduler> _logger;
    private readonly Dictionary<string, ScheduledDag> _schedules = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _lock = new();

    public Scheduler(DagExecutor executor, ILogger<Scheduler> logger)
    {
        _executor = executor;
        _logger = logger;
    }

    public void Register(Dag dag)
    {
        if (dag.CronExpression is null)
            throw new ArgumentException($"DAG '{dag.Name}' has no cron expression.");

        lock (_lock)
        {
            _schedules[dag.Name] = new ScheduledDag(dag);
        }

        _logger.LogInformation("Registered DAG '{Dag}' with schedule '{Cron}'",
            dag.Name, dag.CronExpression);
    }

    public void Unregister(string dagName)
    {
        lock (_lock) { _schedules.Remove(dagName); }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Scheduler started.");
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(60));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await EvaluateSchedulesAsync(stoppingToken);
        }
    }

    private async Task EvaluateSchedulesAsync(CancellationToken ct)
    {
        List<ScheduledDag> toFire;

        lock (_lock)
        {
            var now = DateTime.UtcNow;
            toFire = _schedules.Values
                .Where(s => !s.IsRunning && ShouldFire(s, now))
                .ToList();
        }

        foreach (var scheduled in toFire)
        {
            scheduled.IsRunning = true;
            scheduled.LastFiredAt = DateTime.UtcNow;

            // Fire and forget — but track completion
            _ = Task.Run(async () =>
            {
                try
                {
                    _logger.LogInformation("Scheduler firing DAG '{Dag}'", scheduled.Dag.Name);
                    await _executor.ExecuteAsync(scheduled.Dag, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Scheduled execution of '{Dag}' failed.", scheduled.Dag.Name);
                }
                finally
                {
                    scheduled.IsRunning = false;
                }
            }, ct);
        }
    }

    private static bool ShouldFire(ScheduledDag scheduled, DateTime now)
    {
        var from = scheduled.LastFiredAt ?? now.AddMinutes(-2);
        var next = scheduled.CronSchedule.GetNextOccurrence(from);
        return next <= now;
    }
}
```

### Orchestrator.Engine/LogStream.cs

```csharp
using System.Threading.Channels;

namespace Orchestrator.Engine;

public sealed record LogEntry(
    DateTime Timestamp,
    string DagName,
    Guid RunId,
    string TaskName,
    string Level,
    string Message);

public sealed class LogStream
{
    private readonly Channel<LogEntry> _channel;

    public ChannelReader<LogEntry> Reader => _channel.Reader;
    public ChannelWriter<LogEntry> Writer => _channel.Writer;

    public LogStream(int capacity = 10_000)
    {
        _channel = Channel.CreateBounded<LogEntry>(new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = false,
            SingleWriter = false
        });
    }

    public void Write(string dagName, Guid runId, string taskName, string message)
    {
        _channel.Writer.TryWrite(new LogEntry(
            DateTime.UtcNow, dagName, runId, taskName, "INFO", message));
    }
}
```

### Orchestrator.Web/Hubs/LogHub.cs

```csharp
using Microsoft.AspNetCore.SignalR;
using Orchestrator.Engine;

namespace Orchestrator.Web.Hubs;

public interface ILogClient
{
    Task ReceiveLog(LogEntry entry);
    Task ReceiveTaskStateChange(string dagName, string taskName, string newState);
    Task ReceiveDagComplete(string dagName, Guid runId, string status);
}

public sealed class LogHub : Hub<ILogClient>
{
    public async Task SubscribeToRun(Guid runId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, runId.ToString());
    }

    public async Task UnsubscribeFromRun(Guid runId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, runId.ToString());
    }
}
```

### Orchestrator.Web/Controllers/DagsController.cs

```csharp
using Microsoft.AspNetCore.Mvc;
using Orchestrator.Core.Dag;
using Orchestrator.Engine;
using Orchestrator.Web.ViewModels;

namespace Orchestrator.Web.Controllers;

public sealed class DagsController : Controller
{
    private readonly DagRegistry _registry;
    private readonly DagExecutor _executor;

    public DagsController(DagRegistry registry, DagExecutor executor)
    {
        _registry = registry;
        _executor = executor;
    }

    public IActionResult Index()
    {
        var vm = new DagListViewModel
        {
            Dags = _registry.GetAll().Select(d => new DagSummaryViewModel
            {
                Name = d.Name,
                Description = d.Description,
                TaskCount = d.Tasks.Count,
                CronExpression = d.CronExpression ?? "Manual",
                LastRunStatus = _registry.GetLastRunStatus(d.Name),
                LastRunAt = _registry.GetLastRunTime(d.Name)
            }).ToList()
        };

        return View(vm);
    }

    public IActionResult Detail(string name)
    {
        var dag = _registry.Get(name);
        if (dag is null) return NotFound();

        var vm = new DagDetailViewModel
        {
            Name = dag.Name,
            Description = dag.Description,
            CronExpression = dag.CronExpression ?? "Manual",
            Tasks = dag.Tasks.Values.Select(t => new TaskNodeViewModel
            {
                Name = t.Name,
                TypeName = t.Runner.TypeName,
                Timeout = t.Timeout,
                MaxRetries = t.RetryPolicy.MaxRetries,
                Upstream = dag.Upstream.TryGetValue(t.Name, out var ups) ? ups : [],
                Downstream = dag.Downstream.TryGetValue(t.Name, out var downs) ? downs : []
            }).ToList(),
            RecentRuns = _registry.GetRunHistory(name, 20).Select(r => new RunSummaryViewModel
            {
                RunId = r.Id,
                StartedAt = r.StartedAt,
                CompletedAt = r.CompletedAt,
                Status = r.Status.ToString(),
                Duration = r.Duration
            }).ToList()
        };

        return View(vm);
    }

    [HttpPost]
    public async Task<IActionResult> Trigger(string name)
    {
        var dag = _registry.Get(name);
        if (dag is null) return NotFound();

        var run = await _executor.ExecuteAsync(dag);
        _registry.RecordRun(name, run);

        return RedirectToAction("Detail", "Runs", new { id = run.Id });
    }
}

/// <summary>
/// In-memory registry of DAGs and their run history.
/// In production, back this with a database.
/// </summary>
public sealed class DagRegistry
{
    private readonly Dictionary<string, Dag> _dags = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, List<Core.Models.DagRun>> _history = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _lock = new();

    public void Register(Dag dag)
    {
        lock (_lock)
        {
            _dags[dag.Name] = dag;
            if (!_history.ContainsKey(dag.Name))
                _history[dag.Name] = [];
        }
    }

    public Dag? Get(string name)
    {
        lock (_lock) { return _dags.GetValueOrDefault(name); }
    }

    public IReadOnlyList<Dag> GetAll()
    {
        lock (_lock) { return _dags.Values.ToList(); }
    }

    public void RecordRun(string dagName, Core.Models.DagRun run)
    {
        lock (_lock)
        {
            if (!_history.ContainsKey(dagName))
                _history[dagName] = [];
            _history[dagName].Insert(0, run);
        }
    }

    public string? GetLastRunStatus(string dagName)
    {
        lock (_lock)
        {
            return _history.TryGetValue(dagName, out var runs) && runs.Count > 0
                ? runs[0].Status.ToString()
                : null;
        }
    }

    public DateTime? GetLastRunTime(string dagName)
    {
        lock (_lock)
        {
            return _history.TryGetValue(dagName, out var runs) && runs.Count > 0
                ? runs[0].StartedAt
                : null;
        }
    }

    public IReadOnlyList<Core.Models.DagRun> GetRunHistory(string dagName, int count)
    {
        lock (_lock)
        {
            return _history.TryGetValue(dagName, out var runs)
                ? runs.Take(count).ToList()
                : [];
        }
    }
}
```

### Orchestrator.Web/ViewModels/DagDetailViewModel.cs

```csharp
namespace Orchestrator.Web.ViewModels;

public sealed class DagListViewModel
{
    public List<DagSummaryViewModel> Dags { get; set; } = [];
}

public sealed class DagSummaryViewModel
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int TaskCount { get; set; }
    public string CronExpression { get; set; } = string.Empty;
    public string? LastRunStatus { get; set; }
    public DateTime? LastRunAt { get; set; }
}

public sealed class DagDetailViewModel
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string CronExpression { get; set; } = string.Empty;
    public List<TaskNodeViewModel> Tasks { get; set; } = [];
    public List<RunSummaryViewModel> RecentRuns { get; set; } = [];
}

public sealed class TaskNodeViewModel
{
    public string Name { get; set; } = string.Empty;
    public string TypeName { get; set; } = string.Empty;
    public TimeSpan Timeout { get; set; }
    public int MaxRetries { get; set; }
    public List<string> Upstream { get; set; } = [];
    public List<string> Downstream { get; set; } = [];
}

public sealed class RunSummaryViewModel
{
    public Guid RunId { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public TimeSpan Duration { get; set; }
}
```

### Orchestrator.Demo/SampleDags.cs

```csharp
using Orchestrator.Core.Dag;
using Orchestrator.Core.Execution;
using Orchestrator.Core.Tasks;

namespace Orchestrator.Demo;

public static class SampleDags
{
    public static Dag DailyEtl() => new DagBuilder("daily-etl")
        .WithDescription("Daily ETL pipeline: extract from Procore/Oracle, transform, load to SQL Server")
        .WithSchedule("0 6 * * *")
        .AddTask("extract-procore", new SqlTask("SELECT * FROM procore.projects WHERE modified > @watermark"),
            opts => opts.RetryPolicy = new RetryPolicy(3, TimeSpan.FromSeconds(5), TimeSpan.FromMinutes(2)))
        .AddTask("extract-oracle", new SqlTask("SELECT * FROM oracle.ap_invoices WHERE last_update > :watermark"),
            opts => opts.RetryPolicy = new RetryPolicy(3, TimeSpan.FromSeconds(5), TimeSpan.FromMinutes(2)))
        .AddTask("stage-procore", new SqlTask("INSERT INTO staging.projects SELECT ..."))
        .AddTask("stage-oracle", new SqlTask("INSERT INTO staging.ap_invoices SELECT ..."))
        .AddTask("validate-data", new SqlTask("EXEC dbo.sp_ValidateStaging"))
        .AddTask("load-warehouse", new SqlTask("EXEC dbo.sp_LoadWarehouse"))
        .AddTask("notify-complete", new HttpTask(HttpMethod.Post, "https://hooks.slack.com/services/T00/B00/xxx")
        {
            RequestBody = """{"text": "Daily ETL completed successfully"}"""
        })
        .AddDependency("stage-procore", "extract-procore")
        .AddDependency("stage-oracle", "extract-oracle")
        .AddDependency("validate-data", "stage-procore")
        .AddDependency("validate-data", "stage-oracle")
        .AddDependency("load-warehouse", "validate-data")
        .AddDependency("notify-complete", "load-warehouse")
        .Build();

    public static Dag WeeklyReport() => new DagBuilder("weekly-report")
        .WithDescription("Weekly data quality report generation")
        .WithSchedule("0 8 * * 1")
        .AddTask("run-quality-checks", new SqlTask("EXEC dbo.sp_RunAllQualityChecks"))
        .AddTask("generate-report", new ShellTask("dotnet", "run --project ReportGenerator"))
        .AddTask("email-report", new HttpTask(HttpMethod.Post, "https://api.sendgrid.com/v3/mail/send"))
        .AddDependency("generate-report", "run-quality-checks")
        .AddDependency("email-report", "generate-report")
        .Build();

    public static Dag DataQualityCheck() => new DagBuilder("data-quality")
        .WithDescription("Hourly data quality monitoring")
        .WithSchedule("0 * * * *")
        .AddTask("check-nulls", new SqlTask("SELECT COUNT(*) FROM dbo.Projects WHERE Name IS NULL"),
            opts => opts.Timeout = TimeSpan.FromMinutes(5))
        .AddTask("check-duplicates", new SqlTask("SELECT ProjectId, COUNT(*) FROM dbo.Projects GROUP BY ProjectId HAVING COUNT(*) > 1"),
            opts => opts.Timeout = TimeSpan.FromMinutes(5))
        .AddTask("check-orphans", new SqlTask("SELECT * FROM dbo.CostCodes WHERE ProjectId NOT IN (SELECT Id FROM dbo.Projects)"),
            opts => opts.Timeout = TimeSpan.FromMinutes(5))
        .AddTask("aggregate-results", new SqlTask("EXEC dbo.sp_AggregateQualityResults"))
        .AddDependency("aggregate-results", "check-nulls")
        .AddDependency("aggregate-results", "check-duplicates")
        .AddDependency("aggregate-results", "check-orphans")
        .Build();
}
```

### Orchestrator.Cli/Program.cs

```csharp
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Orchestrator.Core.Dag;
using Orchestrator.Demo;
using Orchestrator.Engine;

namespace Orchestrator.Cli;

public static class Program
{
    private static readonly Dictionary<string, Dag> RegisteredDags = new(StringComparer.OrdinalIgnoreCase);
    private static DagExecutor _executor = null!;

    public static async Task<int> Main(string[] args)
    {
        var services = new ServiceCollection()
            .AddLogging(b => b.AddConsole().SetMinimumLevel(LogLevel.Information))
            .AddSingleton<DagExecutor>()
            .BuildServiceProvider();

        _executor = services.GetRequiredService<DagExecutor>();

        // Register sample DAGs
        RegisteredDags["daily-etl"] = SampleDags.DailyEtl();
        RegisteredDags["weekly-report"] = SampleDags.WeeklyReport();
        RegisteredDags["data-quality"] = SampleDags.DataQualityCheck();

        if (args.Length == 0)
        {
            PrintUsage();
            return 1;
        }

        return args[0].ToLowerInvariant() switch
        {
            "list" => ListDags(),
            "run" => await RunDag(args),
            "info" => ShowDagInfo(args),
            _ => PrintUsage()
        };
    }

    private static int ListDags()
    {
        Console.WriteLine($"{"Name",-25} {"Tasks",-8} {"Schedule",-15} Description");
        Console.WriteLine(new string('-', 80));
        foreach (var dag in RegisteredDags.Values)
        {
            Console.WriteLine($"{dag.Name,-25} {dag.Tasks.Count,-8} {dag.CronExpression ?? "manual",-15} {dag.Description}");
        }
        return 0;
    }

    private static async Task<int> RunDag(string[] args)
    {
        string? dagName = null;
        for (int i = 1; i < args.Length; i++)
        {
            if (args[i] == "--dag" && i + 1 < args.Length)
                dagName = args[++i];
        }

        if (dagName is null || !RegisteredDags.TryGetValue(dagName, out var dag))
        {
            Console.Error.WriteLine($"DAG '{dagName}' not found. Use 'list' to see available DAGs.");
            return 1;
        }

        Console.WriteLine($"Executing DAG '{dag.Name}' ({dag.Tasks.Count} tasks)...");
        Console.WriteLine();

        _executor.OnLog += (d, task, msg) =>
            Console.WriteLine($"  [{task}] {msg}");

        var run = await _executor.ExecuteAsync(dag);

        Console.WriteLine();
        Console.WriteLine($"DAG '{dag.Name}' completed: {run.Status} in {run.Duration.TotalSeconds:F1}s");
        Console.WriteLine();
        Console.WriteLine($"{"Task",-25} {"State",-12} {"Duration",-12} {"Attempts",-10} Error");
        Console.WriteLine(new string('-', 80));

        foreach (var (name, taskRun) in run.TaskRuns.OrderBy(t => t.Value.StartedAt))
        {
            Console.WriteLine($"{name,-25} {taskRun.State,-12} {taskRun.Duration.TotalSeconds:F1}s{"",-8} {taskRun.AttemptCount,-10} {taskRun.ErrorMessage ?? ""}");
        }

        return run.Status == Core.Execution.DagRunStatus.Success ? 0 : 1;
    }

    private static int ShowDagInfo(string[] args)
    {
        string? dagName = args.Length > 1 ? args[1] : null;
        if (dagName is null || !RegisteredDags.TryGetValue(dagName, out var dag))
        {
            Console.Error.WriteLine($"DAG '{dagName}' not found.");
            return 1;
        }

        Console.WriteLine($"DAG: {dag.Name}");
        Console.WriteLine($"Description: {dag.Description}");
        Console.WriteLine($"Schedule: {dag.CronExpression ?? "manual"}");
        Console.WriteLine($"Tasks: {dag.Tasks.Count}");
        Console.WriteLine();

        Console.WriteLine("Task Graph:");
        foreach (var task in dag.Tasks.Values)
        {
            var ups = dag.Upstream.TryGetValue(task.Name, out var u) ? u : [];
            var downs = dag.Downstream.TryGetValue(task.Name, out var d) ? d : [];

            Console.Write($"  {task.Name} [{task.Runner.TypeName}]");
            if (ups.Count > 0) Console.Write($" <- [{string.Join(", ", ups)}]");
            if (downs.Count > 0) Console.Write($" -> [{string.Join(", ", downs)}]");
            Console.WriteLine();
        }

        return 0;
    }

    private static int PrintUsage()
    {
        Console.WriteLine("Usage: orchestrator <command> [options]");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  list                  List all registered DAGs");
        Console.WriteLine("  run --dag <name>      Execute a DAG");
        Console.WriteLine("  info <name>           Show DAG details and task graph");
        return 1;
    }
}
```

</details>

---

## What to Show Off

### Portfolio Presentation

- **GitHub README**: Lead with a GIF/video showing: define a DAG in code, trigger it from the web UI, watch tasks light up green in the dependency graph in real-time, see logs streaming. This is a compelling visual.
- **Architecture section**: Diagram the engine internals — Kahn's algorithm feeding a concurrent executor, the Channel-based log stream, the cron scheduler loop. This shows systems thinking.
- **Comparison to Airflow**: Write a section explaining how your design mirrors (and simplifies) Apache Airflow's core concepts: DAG, Operator (your ITaskRunner), Executor, Scheduler.

### Interview Talking Points

- "I built a DAG-based task orchestrator with parallel execution using Kahn's algorithm and SemaphoreSlim for concurrency control."
- "Tasks follow a strict state machine with exponential backoff retry — the same patterns used in production workflow engines."
- "I used Channels for back-pressured log streaming from the executor to the SignalR hub — separating execution speed from delivery speed."
- "The DAG builder uses the fluent pattern and validates at build time — cycle detection via DFS, orphan detection via BFS from roots."
- "The same engine powers both a web UI and a CLI — demonstrating clean separation between core logic and presentation."

### Code Quality Signals

- Immutable DAG definition with mutable execution state in separate DagRun objects
- Explicit state machine with transition table rather than scattered conditionals
- Task timeout via linked CancellationTokenSource — cooperative cancellation throughout
- Channel-based log streaming with bounded capacity and drop-oldest backpressure
- ITaskRunner abstraction enabling new task types without modifying the executor

---

## Stretch Goals

1. **Persistent execution history**: Store DAG runs and task states in SQLite using EF Core. Survive application restarts. Resume incomplete DAG runs on startup by checking which tasks were pending.

2. **Task output passing**: Implement `TaskContext.SetOutput<T>(key, value)` and `GetUpstreamOutput<T>(taskName, key)` so downstream tasks can consume upstream task outputs. Store outputs in a thread-safe dictionary keyed by `{taskName}.{key}`.

3. **Dynamic DAG generation**: Load DAG definitions from YAML or JSON files at runtime instead of compiling them into C#. Parse a YAML file into the DagBuilder API. This enables non-developers to modify pipelines.

4. **Web-based DAG editor**: A drag-and-drop web interface for creating DAGs visually. Nodes represent tasks (configured via form), edges represent dependencies (drawn by dragging between nodes). Serialize to JSON and register with the engine.

5. **Distributed execution**: Instead of running all tasks in a single process, publish task execution requests to a message queue (Azure Service Bus or RabbitMQ). Worker processes consume from the queue and report results back. This enables horizontal scaling for CPU-intensive tasks.
