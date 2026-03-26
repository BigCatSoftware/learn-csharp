# Azure Blob Storage from C#

*Chapter 15.3 — Azure Blob Storage from C#*

## Overview

Azure Blob Storage is the backbone of cloud data storage. For Data Engineers, it serves as
the landing zone for raw data, the staging area for ETL pipelines, and the archive for
historical files. At BNBuilders, blobs hold everything from Sage budget exports to Bluebeam
plan documents to daily log photos from job sites.

This lesson covers:

- **SDK basics** — `BlobServiceClient`, `BlobContainerClient`, `BlobClient`.
- **Upload/download patterns** — Small files, large files, streaming.
- **Security** — SAS tokens, managed identity, `DefaultAzureCredential`.
- **Access tiers** — Hot, Cool, Cold, Archive — and when to use each.
- **Lifecycle management** — Automatic tier transitions and deletion.
- **Real patterns** — Batch uploads, parallel downloads, event-driven processing.

The `Azure.Storage.Blobs` NuGet package (v12+) is the modern SDK. Do not use the older
`WindowsAzure.Storage` or `Microsoft.Azure.Storage.Blob` packages.

## Core Concepts

### Blob Storage Hierarchy

```
Storage Account:  bnbuildersstorage
├── Container:    budget-exports
│   ├── Blob:     2026/03/budget-2026-101.csv
│   ├── Blob:     2026/03/budget-2026-102.csv
│   └── Blob:     2026/02/budget-2026-101.csv
├── Container:    daily-logs
│   ├── Blob:     2026/03/24/log-site-a.json
│   └── Blob:     2026/03/24/log-site-b.json
├── Container:    plan-documents
│   └── Blob:     projects/2026-101/plans/structural-L2.pdf
└── Container:    pipeline-staging
    └── Blob:     temp/transform-batch-001.parquet
```

Containers are like top-level folders. Blob names can include `/` to simulate a folder
structure, but there are no real directories — it is a flat namespace.

### Client Hierarchy

```csharp
BlobServiceClient          // Account-level operations
└── BlobContainerClient    // Container-level operations
    └── BlobClient         // Individual blob operations
```

### Authentication Options

| Method | Use Case | Secret Management |
|--------|----------|-------------------|
| Connection string | Development/local | Store in user secrets |
| `DefaultAzureCredential` | Production (Azure-hosted) | No secrets needed |
| SAS token | External/temporary access | Time-limited, scoped |
| Account key | Service-to-service (legacy) | Rotate regularly |

## Code Examples

### Setting Up the Client

```csharp
using Azure.Identity;
using Azure.Storage.Blobs;

// Option 1: DefaultAzureCredential (recommended for production)
var serviceClient = new BlobServiceClient(
    new Uri("https://bnbuildersstorage.blob.core.windows.net"),
    new DefaultAzureCredential()
);

// Option 2: Connection string (development only)
var serviceClient2 = new BlobServiceClient(
    "DefaultEndpointsProtocol=https;AccountName=bnbuildersstorage;AccountKey=...;EndpointSuffix=core.windows.net"
);

// Get a container client
var containerClient = serviceClient.GetBlobContainerClient("budget-exports");

// Get a blob client
var blobClient = containerClient.GetBlobClient("2026/03/budget-2026-101.csv");
```

### Uploading Files

```csharp
public class BlobUploader
{
    private readonly BlobContainerClient _container;

    public BlobUploader(BlobContainerClient container)
    {
        _container = container;
    }

    /// <summary>
    /// Upload a small file (< 256 MB) — simple upload.
    /// </summary>
    public async Task<Uri> UploadSmallFileAsync(
        string localPath, string blobName, CancellationToken ct = default)
    {
        var blobClient = _container.GetBlobClient(blobName);

        await blobClient.UploadAsync(
            localPath,
            overwrite: true,
            cancellationToken: ct);

        return blobClient.Uri;
    }

    /// <summary>
    /// Upload a large file with progress reporting and metadata.
    /// </summary>
    public async Task<Uri> UploadLargeFileAsync(
        string localPath,
        string blobName,
        IProgress<long>? progress = null,
        CancellationToken ct = default)
    {
        var blobClient = _container.GetBlobClient(blobName);

        var options = new BlobUploadOptions
        {
            // Upload in 4 MB blocks with 8 parallel transfers
            TransferOptions = new Azure.Storage.StorageTransferOptions
            {
                InitialTransferSize = 4 * 1024 * 1024,
                MaximumTransferSize = 4 * 1024 * 1024,
                MaximumConcurrency = 8
            },
            HttpHeaders = new Azure.Storage.Blobs.Models.BlobHttpHeaders
            {
                ContentType = GetContentType(localPath)
            },
            Metadata = new Dictionary<string, string>
            {
                ["uploadedBy"] = "BNBuilders-Pipeline",
                ["uploadedAt"] = DateTime.UtcNow.ToString("O"),
                ["sourceFile"] = Path.GetFileName(localPath)
            },
            ProgressHandler = progress is not null
                ? new Progress<long>(bytes => progress.Report(bytes))
                : null
        };

        await blobClient.UploadAsync(localPath, options, ct);
        return blobClient.Uri;
    }

    /// <summary>
    /// Upload from a stream — useful when data is already in memory or from another stream.
    /// </summary>
    public async Task UploadFromStreamAsync(
        Stream data, string blobName, CancellationToken ct = default)
    {
        var blobClient = _container.GetBlobClient(blobName);
        await blobClient.UploadAsync(data, overwrite: true, cancellationToken: ct);
    }

    private static string GetContentType(string path) => Path.GetExtension(path) switch
    {
        ".csv" => "text/csv",
        ".json" => "application/json",
        ".pdf" => "application/pdf",
        ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        _ => "application/octet-stream"
    };
}
```

### Downloading Files

```csharp
public class BlobDownloader
{
    private readonly BlobContainerClient _container;

    public BlobDownloader(BlobContainerClient container)
    {
        _container = container;
    }

    /// <summary>
    /// Download to a local file.
    /// </summary>
    public async Task DownloadToFileAsync(
        string blobName, string localPath, CancellationToken ct = default)
    {
        var blobClient = _container.GetBlobClient(blobName);
        await blobClient.DownloadToAsync(localPath, ct);
    }

    /// <summary>
    /// Stream download — process line by line without loading into memory.
    /// </summary>
    public async IAsyncEnumerable<string> StreamLinesAsync(
        string blobName,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var blobClient = _container.GetBlobClient(blobName);
        var response = await blobClient.DownloadStreamingAsync(cancellationToken: ct);

        using var reader = new StreamReader(response.Value.Content);
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            yield return line;
        }
    }

    /// <summary>
    /// Download as string (small files only).
    /// </summary>
    public async Task<string> DownloadAsStringAsync(
        string blobName, CancellationToken ct = default)
    {
        var blobClient = _container.GetBlobClient(blobName);
        var response = await blobClient.DownloadContentAsync(ct);
        return response.Value.Content.ToString();
    }
}

// Usage — stream a CSV from blob without downloading the whole file
var downloader = new BlobDownloader(containerClient);
await foreach (var line in downloader.StreamLinesAsync("2026/03/budget-2026-101.csv"))
{
    var fields = line.Split(',');
    // Process each row...
}
```

### Listing Blobs

```csharp
public class BlobLister
{
    private readonly BlobContainerClient _container;

    public BlobLister(BlobContainerClient container)
    {
        _container = container;
    }

    /// <summary>
    /// List all blobs with a prefix (simulates folder browsing).
    /// </summary>
    public async Task<List<BlobInfo>> ListBlobsAsync(
        string prefix, CancellationToken ct = default)
    {
        var blobs = new List<BlobInfo>();

        await foreach (var item in _container.GetBlobsAsync(
            prefix: prefix, cancellationToken: ct))
        {
            blobs.Add(new BlobInfo(
                Name: item.Name,
                Size: item.Properties.ContentLength ?? 0,
                LastModified: item.Properties.LastModified ?? DateTimeOffset.MinValue,
                AccessTier: item.Properties.AccessTier?.ToString() ?? "Unknown"
            ));
        }

        return blobs;
    }

    /// <summary>
    /// List "folders" at a given level (hierarchical listing).
    /// </summary>
    public async Task<List<string>> ListFoldersAsync(
        string prefix, CancellationToken ct = default)
    {
        var folders = new List<string>();

        await foreach (var item in _container.GetBlobsByHierarchyAsync(
            delimiter: "/", prefix: prefix, cancellationToken: ct))
        {
            if (item.IsPrefix)
                folders.Add(item.Prefix);
        }

        return folders;
    }
}

public record BlobInfo(string Name, long Size, DateTimeOffset LastModified, string AccessTier);
```

### Generating SAS Tokens

```csharp
using Azure.Storage.Blobs;
using Azure.Storage.Sas;

public class SasTokenGenerator
{
    /// <summary>
    /// Generate a read-only SAS URL for sharing a file externally
    /// (e.g., sending a plan document to a subcontractor).
    /// </summary>
    public Uri GenerateReadOnlySas(BlobClient blobClient, TimeSpan validFor)
    {
        if (!blobClient.CanGenerateSasUri)
            throw new InvalidOperationException(
                "BlobClient must be created with account key or user delegation key");

        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = blobClient.BlobContainerName,
            BlobName = blobClient.Name,
            Resource = "b", // b = blob, c = container
            ExpiresOn = DateTimeOffset.UtcNow.Add(validFor)
        };

        sasBuilder.SetPermissions(BlobSasPermissions.Read);

        return blobClient.GenerateSasUri(sasBuilder);
    }

    /// <summary>
    /// Generate a container-level SAS for ADF to read all blobs.
    /// </summary>
    public Uri GenerateContainerSas(
        BlobContainerClient containerClient, TimeSpan validFor)
    {
        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = containerClient.Name,
            Resource = "c",
            ExpiresOn = DateTimeOffset.UtcNow.Add(validFor)
        };

        sasBuilder.SetPermissions(BlobContainerSasPermissions.Read | BlobContainerSasPermissions.List);

        return containerClient.GenerateSasUri(sasBuilder);
    }
}
```

## Common Patterns

### Access Tiers

| Tier | Storage Cost | Access Cost | Min Duration | Use Case |
|------|-------------|-------------|-------------|----------|
| Hot | Highest | Lowest | None | Active data, current month exports |
| Cool | Lower | Higher | 30 days | Previous months, occasional access |
| Cold | Lower still | Higher still | 90 days | Quarterly archives |
| Archive | Lowest | Highest (+ rehydration) | 180 days | Regulatory retention (years) |

### Lifecycle Management Policy

```json
{
    "rules": [
        {
            "name": "MoveBudgetExportsToCol",
            "type": "Lifecycle",
            "definition": {
                "filters": {
                    "blobTypes": ["blockBlob"],
                    "prefixMatch": ["budget-exports/"]
                },
                "actions": {
                    "baseBlob": {
                        "tierToCool": { "daysAfterModificationGreaterThan": 30 },
                        "tierToCold": { "daysAfterModificationGreaterThan": 90 },
                        "tierToArchive": { "daysAfterModificationGreaterThan": 365 },
                        "delete": { "daysAfterModificationGreaterThan": 2555 }
                    }
                }
            }
        }
    ]
}
```

### Batch Upload Pattern

```csharp
public async Task BatchUploadAsync(
    BlobContainerClient container,
    string localDirectory,
    string blobPrefix,
    CancellationToken ct = default)
{
    var files = Directory.GetFiles(localDirectory, "*.csv");
    var semaphore = new SemaphoreSlim(10); // Max 10 parallel uploads

    var tasks = files.Select(async file =>
    {
        await semaphore.WaitAsync(ct);
        try
        {
            var blobName = $"{blobPrefix}/{Path.GetFileName(file)}";
            var blobClient = container.GetBlobClient(blobName);
            await blobClient.UploadAsync(file, overwrite: true, cancellationToken: ct);
            Console.WriteLine($"Uploaded: {blobName}");
        }
        finally
        {
            semaphore.Release();
        }
    });

    await Task.WhenAll(tasks);
}
```

### DI Registration

```csharp
// In Program.cs or Startup.cs
using Azure.Identity;
using Azure.Storage.Blobs;
using Microsoft.Extensions.DependencyInjection;

services.AddSingleton(sp =>
{
    return new BlobServiceClient(
        new Uri("https://bnbuildersstorage.blob.core.windows.net"),
        new DefaultAzureCredential());
});

services.AddSingleton(sp =>
{
    var serviceClient = sp.GetRequiredService<BlobServiceClient>();
    return serviceClient.GetBlobContainerClient("budget-exports");
});
```

## Gotchas and Pitfalls

1. **Blob names are case-sensitive** — `Budget-2026.csv` and `budget-2026.csv` are different
   blobs. Standardize on lowercase.

2. **No atomic rename** — You cannot rename a blob. You must copy to the new name and delete
   the old one. This matters for staging patterns.

3. **Overwrite is opt-in** — `UploadAsync` throws `RequestFailedException` (409 Conflict)
   if the blob exists and `overwrite: true` is not set.

4. **Archive tier rehydration takes hours** — Retrieving a blob from Archive tier takes
   1-15 hours depending on priority. Plan ahead for audits.

5. **SAS token leaks** — SAS URLs are bearer tokens. If someone gets the URL, they have
   access. Keep expiration times short (hours, not months).

6. **Container names** — Must be lowercase, 3-63 characters, only letters/numbers/hyphens.
   `Budget_Exports` is invalid; use `budget-exports`.

7. **404 errors from eventual consistency** — After deleting and recreating a container with
   the same name, there is a ~30 second window where operations may fail.

8. **Large file upload timeouts** — For files > 1 GB, increase `MaximumTransferSize` and
   `MaximumConcurrency` in `StorageTransferOptions`. The default single-request limit is
   256 MB.

9. **Stream position** — When uploading from a `MemoryStream`, reset `Position = 0` first:

```csharp
var stream = new MemoryStream();
// Write data to stream...
stream.Position = 0; // Reset before uploading!
await blobClient.UploadAsync(stream, overwrite: true);
```

## Performance Considerations

- **Parallel upload/download** — Set `MaximumConcurrency` in `StorageTransferOptions` to
  8-16 for large files. Each parallel stream uses a separate HTTP connection.

- **Block size** — For files > 256 MB, increase `MaximumTransferSize` to 8-16 MB. Larger
  blocks mean fewer requests but more memory per block.

- **List performance** — Listing blobs with a prefix is an O(n) scan. For containers with
  millions of blobs, use hierarchical namespace (Data Lake Storage Gen2) instead.

- **Network proximity** — Place your compute and storage in the same Azure region. Cross-
  region transfers add latency and egress costs.

- **Content-MD5** — Setting `BlobUploadOptions.HttpHeaders.ContentHash` enables integrity
  checking but adds CPU overhead. Enable for critical data, skip for high-throughput staging.

- **Streaming vs buffering** — Use `DownloadStreamingAsync` instead of `DownloadContentAsync`
  for files > 10 MB to avoid loading the entire blob into memory.

```csharp
// Streaming — constant memory
var response = await blobClient.DownloadStreamingAsync();
using var stream = response.Value.Content;

// Buffered — loads entire blob into memory
var response = await blobClient.DownloadContentAsync();
byte[] data = response.Value.Content.ToArray(); // All in memory
```

## BNBuilders Context

### Storage Account Layout

```
bnbuildersstorage (General Purpose v2, Hot default tier)
├── budget-exports/          Hot → Cool after 30 days → Archive after 1 year
│   └── {year}/{month}/budget-{project}.csv
├── daily-logs/              Hot → Cool after 60 days
│   └── {year}/{month}/{day}/log-{site}.json
├── plan-documents/          Hot (active projects), Cool (completed)
│   └── projects/{project-id}/plans/{filename}
├── submittals/              Hot → Cool after 90 days → Archive after 2 years
│   └── projects/{project-id}/submittals/{filename}
├── pipeline-staging/        Hot, auto-delete after 7 days
│   └── temp/{pipeline-run-id}/{filename}
└── backups/                 Cool → Archive after 30 days
    └── sql-backups/{date}/{database}.bacpac
```

### Pipeline Integration

```csharp
// Complete flow: Download from blob, transform, upload result
public class BudgetTransformPipeline
{
    private readonly BlobContainerClient _sourceContainer;
    private readonly BlobContainerClient _destContainer;
    private readonly ILogger<BudgetTransformPipeline> _logger;

    public BudgetTransformPipeline(
        BlobServiceClient blobService,
        ILogger<BudgetTransformPipeline> logger)
    {
        _sourceContainer = blobService.GetBlobContainerClient("budget-exports");
        _destContainer = blobService.GetBlobContainerClient("pipeline-staging");
        _logger = logger;
    }

    public async Task ProcessAsync(string blobName, CancellationToken ct)
    {
        _logger.LogInformation("Processing blob: {Blob}", blobName);

        // Stream source blob
        var sourceBlob = _sourceContainer.GetBlobClient(blobName);
        var response = await sourceBlob.DownloadStreamingAsync(cancellationToken: ct);

        // Transform and write to staging
        var outputName = $"transformed/{Path.GetFileNameWithoutExtension(blobName)}-clean.csv";
        var destBlob = _destContainer.GetBlobClient(outputName);

        using var output = new MemoryStream();
        using var writer = new StreamWriter(output, leaveOpen: true);
        using var reader = new StreamReader(response.Value.Content);

        // Write header
        await writer.WriteLineAsync("ProjectId,CostCode,Amount,Date");

        string? line;
        int processed = 0;
        while ((line = await reader.ReadLineAsync(ct)) is not null)
        {
            if (processed++ == 0) continue; // skip source header

            var transformed = TransformLine(line);
            if (transformed is not null)
                await writer.WriteLineAsync(transformed);
        }

        await writer.FlushAsync(ct);
        output.Position = 0;
        await destBlob.UploadAsync(output, overwrite: true, cancellationToken: ct);

        _logger.LogInformation("Processed {Count} rows to {Output}", processed, outputName);
    }

    private static string? TransformLine(string line)
    {
        var parts = line.Split(',');
        if (parts.Length < 4) return null;

        // Clean and standardize
        var projectId = parts[0].Trim().ToUpperInvariant();
        var costCode = parts[1].Trim();
        var amount = decimal.TryParse(parts[2], out var a) ? a : 0;
        var date = DateOnly.TryParse(parts[3], out var d) ? d : DateOnly.MinValue;

        if (date == DateOnly.MinValue) return null;

        return $"{projectId},{costCode},{amount:F2},{date:yyyy-MM-dd}";
    }
}
```

## Interview / Senior Dev Questions

1. **Q: How do you securely access Azure Blob Storage from a production application?**
   A: Use `DefaultAzureCredential` with Managed Identity. The application running in Azure
   (App Service, Function, Container) gets an identity automatically. Grant "Storage Blob
   Data Contributor" role to that identity on the storage account. No connection strings or
   keys in configuration.

2. **Q: When would you use SAS tokens instead of Managed Identity?**
   A: When granting access to external parties (subcontractors viewing plan documents),
   when the client cannot use Azure AD (legacy tools), or for time-limited operations. Always
   scope SAS tokens to the minimum permissions needed and set short expiration times.

3. **Q: How would you handle uploading a 10 GB file to Blob Storage from C#?**
   A: Use `BlobClient.UploadAsync` with `StorageTransferOptions`: set `MaximumTransferSize`
   to 8-16 MB and `MaximumConcurrency` to 8-16. The SDK automatically splits the file into
   blocks and uploads them in parallel. Add a `ProgressHandler` for monitoring.

4. **Q: Explain the blob access tier strategy for a construction company's data lifecycle.**
   A: Active project files (current month) stay in Hot tier for frequent access. After the
   month ends, move to Cool (30 days min, lower storage cost). After project completion,
   move to Cold or Archive for regulatory retention (7+ years for construction). Use lifecycle
   management policies to automate tier transitions based on last-modified date.

## Quiz

**Question 1:** Which authentication method is recommended for Azure-hosted applications
accessing Blob Storage?

a) Account key in app settings
b) SAS token hardcoded in source code
c) `DefaultAzureCredential` with Managed Identity
d) Anonymous public access

<details>
<summary>Answer</summary>

**c) `DefaultAzureCredential` with Managed Identity.** Managed Identity eliminates the need
for any secrets. The Azure platform handles authentication automatically. Grant the
appropriate RBAC role (e.g., Storage Blob Data Contributor) to the identity.

</details>

**Question 2:** What is the minimum duration for the Archive access tier?

a) 7 days
b) 30 days
c) 90 days
d) 180 days

<details>
<summary>Answer</summary>

**d) 180 days.** Blobs moved to Archive tier incur early deletion charges if removed before
180 days. Archive is designed for long-term retention (regulatory compliance, historical
records). Rehydration takes 1-15 hours.

</details>

**Question 3:** You need to share a plan document with a subcontractor who does not have
an Azure account. What is the best approach?

a) Make the container public
b) Generate a time-limited, read-only SAS URL
c) Give them your account key
d) Download the file and email it

<details>
<summary>Answer</summary>

**b) Generate a time-limited, read-only SAS URL.** A SAS token scoped to a single blob with
read-only permission and a short expiration (e.g., 24 hours) provides secure, temporary
access without exposing account credentials or making data public.

</details>

**Question 4:** When downloading a 500 MB CSV for processing, which method should you use?

a) `DownloadContentAsync` — loads entire blob into a `BinaryData` object
b) `DownloadStreamingAsync` — streams data without loading it all into memory
c) `DownloadToAsync` — always the fastest option
d) It does not matter — they are all equivalent

<details>
<summary>Answer</summary>

**b) `DownloadStreamingAsync`.** This returns a stream that you can read incrementally (line
by line for CSV). `DownloadContentAsync` loads the entire 500 MB into memory, which wastes
resources and risks `OutOfMemoryException`. Use streaming for any file over ~10 MB.

</details>
