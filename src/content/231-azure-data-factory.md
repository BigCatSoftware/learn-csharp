# Azure Data Factory

*Chapter 15.2 — Azure Data Factory*

## Overview

Azure Data Factory (ADF) is Microsoft's cloud-based ETL/ELT orchestration service. For Data
Engineers at BNBuilders, ADF is the central hub that moves data between on-premises systems
(Sage 300, file shares) and Azure services (Azure SQL, Blob Storage, Data Lake). It replaces
custom-built Windows Services, SQL Agent jobs, and SSIS packages with a managed, visual
pipeline designer.

This lesson covers:

- **Core concepts** — Pipelines, activities, datasets, linked services, integration runtimes.
- **Data movement** — Copy activity for moving data between 90+ sources and sinks.
- **Data transformation** — Data flows (visual Spark) and external activities.
- **Scheduling** — Triggers (schedule, tumbling window, event-based).
- **Parameterization** — Dynamic pipelines that adapt to different projects or dates.
- **Monitoring** — Tracking pipeline runs, alerting on failures.

ADF is not a replacement for C# code — it is an orchestrator. Your C# pipelines, stored
procedures, and Azure Functions are *called by* ADF, not replaced by it.

## Core Concepts

### Architecture Components

```
┌──────────────────────────────────────────────────────────────┐
│                    Azure Data Factory                         │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Pipeline 1  │    │  Pipeline 2  │    │  Pipeline 3  │     │
│  │             │    │             │    │             │     │
│  │ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │     │
│  │ │Activity 1│ │    │ │Copy Data│ │    │ │Data Flow│ │     │
│  │ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │     │
│  │ ┌─────────┐ │    │ ┌─────────┐ │    │             │     │
│  │ │Activity 2│ │    │ │Run SP   │ │    │             │     │
│  │ └─────────┘ │    │ └─────────┘ │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐    │
│  │ Datasets  │  │ Linked   │  │ Integration Runtimes   │    │
│  │          │  │ Services │  │ ┌────────┐ ┌─────────┐ │    │
│  │ Source    │  │ Azure SQL│  │ │ Azure  │ │Self-Host│ │    │
│  │ Sink     │  │ Blob     │  │ │ IR     │ │ IR      │ │    │
│  │          │  │ Sage API │  │ └────────┘ └─────────┘ │    │
│  └──────────┘  └──────────┘  └────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### Key Terminology

| Concept | What It Is | Analogy |
|---------|-----------|---------|
| **Pipeline** | A logical grouping of activities | A workflow / job |
| **Activity** | A single step (copy, transform, call SP) | A task in the job |
| **Dataset** | A named reference to data (table, file, blob) | A table name |
| **Linked Service** | Connection string to a data store | A database connection |
| **Integration Runtime** | The compute that runs activities | The server running your code |
| **Trigger** | What starts a pipeline | A cron job / event listener |

### Integration Runtimes

| Type | Where It Runs | Use Case |
|------|--------------|----------|
| Azure IR | Microsoft-managed VMs | Cloud-to-cloud data movement |
| Self-Hosted IR | Your on-prem server | On-prem to cloud (Sage 300 to Azure) |
| Azure-SSIS IR | Managed SSIS cluster | Running existing SSIS packages |

The Self-Hosted IR is critical for BNBuilders — it bridges on-premises Sage 300 / file
shares to Azure without opening inbound firewall ports.

## Code Examples

### Triggering ADF Pipeline from C#

```csharp
using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.DataFactory;
using Azure.ResourceManager.DataFactory.Models;

public class AdfPipelineRunner
{
    private readonly string _subscriptionId;
    private readonly string _resourceGroup;
    private readonly string _factoryName;

    public AdfPipelineRunner(string subscriptionId, string resourceGroup, string factoryName)
    {
        _subscriptionId = subscriptionId;
        _resourceGroup = resourceGroup;
        _factoryName = factoryName;
    }

    public async Task<string> TriggerPipelineAsync(
        string pipelineName,
        Dictionary<string, object>? parameters = null,
        CancellationToken ct = default)
    {
        var credential = new DefaultAzureCredential();
        var client = new ArmClient(credential);

        var factoryId = DataFactoryResource.CreateResourceIdentifier(
            _subscriptionId, _resourceGroup, _factoryName);
        var factory = client.GetDataFactoryResource(factoryId);

        var pipelineId = DataFactoryPipelineResource.CreateResourceIdentifier(
            _subscriptionId, _resourceGroup, _factoryName, pipelineName);
        var pipeline = client.GetDataFactoryPipelineResource(pipelineId);

        // Convert parameters
        var paramDict = parameters?.ToDictionary(
            kvp => kvp.Key,
            kvp => BinaryData.FromObjectAsJson(kvp.Value));

        var response = await pipeline.CreateRunAsync(
            paramDict is not null
                ? new Dictionary<string, BinaryData>(paramDict)
                : null,
            ct);

        string runId = response.Value.RunId.ToString();
        Console.WriteLine($"Pipeline run started: {runId}");
        return runId;
    }

    public async Task<string> WaitForCompletionAsync(
        string runId, CancellationToken ct = default)
    {
        var credential = new DefaultAzureCredential();
        var client = new ArmClient(credential);

        var factoryId = DataFactoryResource.CreateResourceIdentifier(
            _subscriptionId, _resourceGroup, _factoryName);
        var factory = client.GetDataFactoryResource(factoryId);

        while (!ct.IsCancellationRequested)
        {
            var run = await factory.GetPipelineRunAsync(Guid.Parse(runId), ct);
            var status = run.Value.Status;

            Console.WriteLine($"Pipeline status: {status}");

            if (status == "Succeeded" || status == "Failed" || status == "Cancelled")
                return status;

            await Task.Delay(TimeSpan.FromSeconds(30), ct);
        }

        return "Unknown";
    }
}

// Usage
var runner = new AdfPipelineRunner(
    subscriptionId: "your-subscription-id",
    resourceGroup: "bnbuilders-rg",
    factoryName: "bnbuilders-adf"
);

var runId = await runner.TriggerPipelineAsync(
    "CostSyncPipeline",
    new Dictionary<string, object>
    {
        ["projectId"] = "2026-101",
        ["syncDate"] = "2026-03-24"
    });

var status = await runner.WaitForCompletionAsync(runId);
Console.WriteLine($"Pipeline completed: {status}");
```

### ADF Pipeline JSON (ARM Template)

```json
{
    "name": "CostSyncPipeline",
    "properties": {
        "activities": [
            {
                "name": "CopySageData",
                "type": "Copy",
                "inputs": [
                    {
                        "referenceName": "SageBudgetExportCsv",
                        "type": "DatasetReference"
                    }
                ],
                "outputs": [
                    {
                        "referenceName": "AzureSqlStagingTable",
                        "type": "DatasetReference"
                    }
                ],
                "typeProperties": {
                    "source": {
                        "type": "DelimitedTextSource",
                        "storeSettings": {
                            "type": "FileServerReadSettings",
                            "recursive": false
                        },
                        "formatSettings": {
                            "type": "DelimitedTextReadSettings",
                            "skipLineCount": 3
                        }
                    },
                    "sink": {
                        "type": "AzureSqlSink",
                        "writeBehavior": "insert",
                        "sqlWriterUseTableLock": true,
                        "tableOption": "autoCreate"
                    },
                    "enableStaging": false
                },
                "policy": {
                    "timeout": "01:00:00",
                    "retry": 2,
                    "retryIntervalInSeconds": 60
                }
            },
            {
                "name": "RunMergeProcedure",
                "type": "SqlServerStoredProcedure",
                "dependsOn": [
                    {
                        "activity": "CopySageData",
                        "dependencyConditions": ["Succeeded"]
                    }
                ],
                "typeProperties": {
                    "storedProcedureName": "dbo.usp_MergeBudgetData",
                    "storedProcedureParameters": {
                        "projectId": {
                            "value": {
                                "value": "@pipeline().parameters.projectId",
                                "type": "Expression"
                            }
                        },
                        "syncDate": {
                            "value": {
                                "value": "@pipeline().parameters.syncDate",
                                "type": "Expression"
                            }
                        }
                    }
                },
                "linkedServiceName": {
                    "referenceName": "AzureSqlLinkedService",
                    "type": "LinkedServiceReference"
                }
            },
            {
                "name": "NotifyOnFailure",
                "type": "WebActivity",
                "dependsOn": [
                    {
                        "activity": "RunMergeProcedure",
                        "dependencyConditions": ["Failed"]
                    }
                ],
                "typeProperties": {
                    "url": "https://bnbuilders-functions.azurewebsites.net/api/notify",
                    "method": "POST",
                    "body": {
                        "pipeline": "@pipeline().Pipeline",
                        "runId": "@pipeline().RunId",
                        "error": "@activity('RunMergeProcedure').Error.Message"
                    }
                }
            }
        ],
        "parameters": {
            "projectId": { "type": "string" },
            "syncDate": { "type": "string" }
        }
    }
}
```

### Linked Service with Key Vault Reference

```json
{
    "name": "AzureSqlLinkedService",
    "properties": {
        "type": "AzureSqlDatabase",
        "typeProperties": {
            "connectionString": {
                "type": "AzureKeyVaultSecret",
                "store": {
                    "referenceName": "AzureKeyVaultLinkedService",
                    "type": "LinkedServiceReference"
                },
                "secretName": "AzureSql-ConnectionString"
            }
        }
    }
}
```

## Common Patterns

### Triggers

#### Schedule Trigger

```json
{
    "name": "NightlySyncTrigger",
    "properties": {
        "type": "ScheduleTrigger",
        "typeProperties": {
            "recurrence": {
                "frequency": "Day",
                "interval": 1,
                "startTime": "2026-01-01T02:00:00Z",
                "timeZone": "Pacific Standard Time",
                "schedule": {
                    "hours": [2],
                    "minutes": [0]
                }
            }
        },
        "pipelines": [
            {
                "pipelineReference": {
                    "referenceName": "CostSyncPipeline",
                    "type": "PipelineReference"
                },
                "parameters": {
                    "syncDate": "@trigger().scheduledTime"
                }
            }
        ]
    }
}
```

#### Tumbling Window Trigger

Processes data in fixed time windows — ideal for backfilling:

```json
{
    "name": "HourlyProcessingTrigger",
    "properties": {
        "type": "TumblingWindowTrigger",
        "typeProperties": {
            "frequency": "Hour",
            "interval": 1,
            "startTime": "2026-01-01T00:00:00Z",
            "delay": "00:15:00",
            "maxConcurrency": 3,
            "retryPolicy": {
                "count": 2,
                "intervalInSeconds": 300
            }
        }
    }
}
```

#### Event Trigger (Blob Created)

```json
{
    "name": "BlobUploadTrigger",
    "properties": {
        "type": "BlobEventsTrigger",
        "typeProperties": {
            "blobPathBeginsWith": "/budget-uploads/blobs/",
            "blobPathEndsWith": ".csv",
            "ignoreEmptyBlobs": true,
            "scope": "/subscriptions/.../storageAccounts/bnbuildersstorage",
            "events": ["Microsoft.Storage.BlobCreated"]
        }
    }
}
```

### Parameterized Pipelines

```json
{
    "name": "GenericLoadPipeline",
    "properties": {
        "parameters": {
            "sourceFolder": { "type": "string" },
            "sourceFile": { "type": "string" },
            "targetTable": { "type": "string" },
            "targetSchema": { "type": "string", "defaultValue": "staging" }
        },
        "activities": [
            {
                "name": "CopyToStaging",
                "type": "Copy",
                "typeProperties": {
                    "source": {
                        "type": "DelimitedTextSource"
                    },
                    "sink": {
                        "type": "AzureSqlSink",
                        "tableOption": "autoCreate"
                    }
                }
            }
        ]
    }
}
```

### Pipeline Orchestration Pattern

```
Master Pipeline (Nightly Sync)
├── ForEach: Active Projects
│   ├── Copy: Sage Budget Export → Staging
│   ├── Stored Proc: Validate Staging Data
│   ├── If: Validation Passed
│   │   ├── True: Stored Proc: Merge to Production
│   │   └── False: Web Activity: Send Alert
│   └── Stored Proc: Log Pipeline Run
├── Execute Pipeline: Refresh Power BI Dataset
└── Web Activity: Send Completion Summary
```

## Gotchas and Pitfalls

1. **Self-Hosted IR is a single point of failure** — Install on at least two on-prem
   servers with shared registration. ADF load-balances between them.

2. **Copy activity column mapping** — If source CSV columns change names, the pipeline
   silently drops data. Use explicit column mappings and validate row counts.

3. **Tumbling window backfill** — If you create a tumbling window trigger with a start
   date in the past, ADF will try to run ALL missed windows. Set the start date carefully.

4. **Data flow cost** — Data flows spin up a Spark cluster. Minimum execution time is
   ~5 minutes even for small datasets. For simple transformations, a stored procedure is
   cheaper and faster.

5. **Expression language quirks** — ADF uses its own expression language, not C#:
   - String concatenation: `@concat('Hello', ' ', 'World')`
   - Current date: `@utcnow()`
   - Parameter reference: `@pipeline().parameters.projectId`
   - Activity output: `@activity('CopyData').output.rowsCopied`

6. **Pipeline timeout** — Default is 12 hours. For very large data loads, increase the
   timeout or break into smaller chunks.

7. **Git integration** — ADF supports Git for version control, but merging pipeline JSON
   is painful. Establish branch naming conventions and avoid parallel edits to the same
   pipeline.

8. **Managed Identity permissions** — ADF's managed identity needs explicit permissions on
   each resource: SQL db_datareader on Azure SQL, Storage Blob Data Contributor on Blob, etc.

## Performance Considerations

- **DIU (Data Integration Units)** — Controls parallelism for copy activities. Default is
  Auto (4-256). For large files, increase manually. Each DIU costs money.

- **Parallel copies** — Set `parallelCopies` in copy activity to control threads. For
  Azure SQL as sink, match to available DTU/vCores.

- **Staging for cross-region copies** — Enable staging via Blob Storage when copying
  between regions. This uses PolyBase under the hood and is faster.

- **Data flow cluster size** — Minimum 8 cores. For development/testing, use the smallest
  cluster. For production, scale based on data volume.

- **ForEach parallelism** — The ForEach activity processes items sequentially by default.
  Set `isSequential: false` and `batchCount: 20` for parallel processing.

```json
{
    "name": "ForEachProject",
    "type": "ForEach",
    "typeProperties": {
        "isSequential": false,
        "batchCount": 10,
        "items": { "value": "@pipeline().parameters.projects", "type": "Expression" }
    }
}
```

## BNBuilders Context

### Typical ADF Architecture at BNBuilders

```
On-Premises                        Azure
─────────────                      ─────
Sage 300 ──► Self-Hosted IR ──► Azure Data Factory
File Shares ─┘                     │
                                   ├──► Azure SQL (Data Warehouse)
                                   ├──► Azure Blob (Raw Files)
                                   ├──► Azure Functions (Custom Logic)
                                   └──► Power BI (via refresh trigger)
```

### Pipeline Catalog

| Pipeline | Schedule | Source | Sink | Purpose |
|----------|----------|--------|------|---------|
| CostSync | Nightly 2 AM | Sage 300 CSV | Azure SQL | Budget and cost data |
| DailyLogSync | Nightly 3 AM | Procore API | Azure SQL | Field reports |
| SubcontractorPayments | Weekly Fri 6 PM | Sage AP | Azure SQL | Payment tracking |
| DocumentArchive | On blob upload | Blob Storage | Data Lake | Archive construction docs |
| PowerBIRefresh | After CostSync | Azure SQL | Power BI | Refresh dashboards |

### Cost Estimation

ADF pricing (approximate, 2025-2026):
- Pipeline orchestration: $1/1000 activity runs
- Copy activity: $0.25/DIU-hour
- Data flow: ~$0.27/vCore-hour (min 8 cores)
- Self-Hosted IR: Free (you provide the server)

For BNBuilders running 5 nightly pipelines with ~20 activities each:
- ~3,000 activity runs/month = $3
- ~10 DIU-hours/month = $2.50
- Monitoring and alerts: included
- Total: **~$10-20/month** (much less than maintaining an SSIS server)

## Interview / Senior Dev Questions

1. **Q: What is the purpose of a Self-Hosted Integration Runtime?**
   A: It runs on your on-premises server and provides secure connectivity between on-prem
   data sources (like Sage 300 or file shares) and Azure. It initiates outbound HTTPS
   connections to ADF — no inbound firewall ports needed. It handles data encryption in
   transit and can be installed on multiple machines for high availability.

2. **Q: When would you use a Data Flow vs a Stored Procedure for transformation?**
   A: Use a Stored Procedure when: the transformation is SQL-friendly (joins, aggregations),
   the data is already in Azure SQL, and you want minimal cost. Use a Data Flow when: the
   transformation is complex (multiple sources, conditional splits, pivots), you want a
   visual design surface, or you need to process data from non-SQL sources.

3. **Q: Explain the difference between Schedule, Tumbling Window, and Event triggers.**
   A: Schedule triggers fire at specific times (like cron). Tumbling Window triggers process
   data in non-overlapping time intervals with support for backfill and dependencies.
   Event triggers fire when something happens (like a blob being created). For nightly ETL,
   use Schedule. For time-series processing with backfill, use Tumbling Window. For
   file-arrival processing, use Event.

4. **Q: How would you handle pipeline failures and retries?**
   A: At the activity level: set retry count and interval in the policy. At the pipeline
   level: use "If Condition" activities after critical steps to branch on success/failure.
   For notifications: add a Web Activity calling an Azure Function or Logic App to send
   Teams/email alerts. Monitor via ADF's built-in monitoring or Azure Monitor alerts on
   pipeline failure metrics.

## Quiz

**Question 1:** What component allows ADF to access on-premises data sources like Sage 300?

a) Azure IR
b) Self-Hosted Integration Runtime
c) Azure-SSIS IR
d) VPN Gateway

<details>
<summary>Answer</summary>

**b) Self-Hosted Integration Runtime.** The Self-Hosted IR is installed on an on-premises
server and creates outbound HTTPS connections to ADF. It securely moves data from on-prem
sources to Azure without requiring inbound firewall ports.

</details>

**Question 2:** Which trigger type supports automatic backfill of missed time windows?

a) Schedule Trigger
b) Event Trigger
c) Tumbling Window Trigger
d) Manual Trigger

<details>
<summary>Answer</summary>

**c) Tumbling Window Trigger.** Tumbling Window triggers process data in fixed, non-
overlapping time intervals. If a window is missed (or the trigger is created with a past
start date), ADF automatically queues and processes the missed windows.

</details>

**Question 3:** What is the minimum execution cost concern with ADF Data Flows?

a) They require a Premium ADF tier
b) They spin up a Spark cluster, incurring minimum ~5 minutes of compute
c) They require Azure Databricks
d) They are free but limited to 10 runs per day

<details>
<summary>Answer</summary>

**b) They spin up a Spark cluster, incurring minimum ~5 minutes of compute.** Even for a
simple transformation on 100 rows, the Spark cluster takes ~5 minutes to start. For small
datasets, stored procedures are faster and cheaper.

</details>

**Question 4:** How do you reference a pipeline parameter in an ADF expression?

a) `${parameter.projectId}`
b) `@pipeline().parameters.projectId`
c) `#projectId`
d) `pipeline.params["projectId"]`

<details>
<summary>Answer</summary>

**b) `@pipeline().parameters.projectId`.** ADF uses its own expression language prefixed
with `@`. Pipeline parameters are accessed via `@pipeline().parameters.<name>`. Activity
outputs use `@activity('<name>').output.<property>`.

</details>
