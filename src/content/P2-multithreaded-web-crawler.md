# Project 2: Multithreaded Web Crawler

*Difficulty: Medium — Estimated: 4-6 days — Category: Systems Programming*

---

## Project Overview

Build a production-quality concurrent web crawler in C# that can discover and index web
pages starting from one or more seed URLs. The crawler must handle real-world concerns:
politeness (respecting `robots.txt`, configurable delays between requests to the same host),
fault tolerance (retry with exponential backoff via Polly), and backpressure (bounded
channels prevent memory exhaustion on fast networks).

**Core capabilities:**

| Feature | Implementation |
|---|---|
| Async HTTP fetching | `HttpClient` with connection pooling |
| Retry / circuit breaker | Polly resilience policies |
| HTML parsing | AngleSharp DOM parser |
| Concurrent coordination | `System.Threading.Channels` (bounded, producer-consumer) |
| URL deduplication | `ConcurrentDictionary<string, byte>` |
| Depth & count limiting | Configurable max depth and max pages |
| Crawl output | JSON index (URL, title, links, timestamp, status) |
| Resume support | Save/restore crawl state to JSON |
| CLI interface | `System.CommandLine` with typed options |
| Statistics | Pages/sec, total pages, total bytes, elapsed time |

This project teaches you how async I/O, channels, and concurrency primitives work together
in a real system — skills directly applicable to building high-throughput data pipelines.

---

## Learning Objectives

- **Async/await mechanics**: Understand `Task`, `ValueTask`, `ConfigureAwait`, cancellation tokens, and how the thread pool services async continuations.
- **Channel-based producer-consumer**: Use `Channel<T>` as a concurrent queue with backpressure — the pattern behind Kafka consumers, data pipeline stages, and actor systems.
- **HttpClient best practices**: Connection pooling, DNS refresh, timeout configuration, `IHttpClientFactory` patterns.
- **Resilience with Polly**: Retry, circuit breaker, timeout, and bulkhead policies composed into a resilience pipeline.
- **Concurrent data structures**: `ConcurrentDictionary` for lock-free deduplication, `Interlocked` for atomic counters.
- **System.CommandLine**: Build professional CLI tools with typed parsing, help generation, and validation.
- **Real-world error handling**: Graceful degradation when pages fail, proper cancellation propagation, structured error logging.

---

## Prerequisites

| Lesson | Why |
|---|---|
| [Async/Await (07)](07-async-await.md) | async/await, Task, cancellation |
| [Channels (34)](34-channels.md) | Bounded/unbounded channels, producer-consumer |
| [Concurrency (23)](23-concurrency.md) | Thread safety, ConcurrentDictionary, SemaphoreSlim |
| [Error Handling Patterns (18)](18-error-handling-patterns.md) | Exception strategies, Result pattern |
| [Retry Policies with Polly (67)](67-retry-policies-polly.md) | Resilience pipelines, retry, circuit breaker |

---

## Architecture

```
WebCrawler/
├── WebCrawler.sln
├── src/
│   ├── Crawler.Core/
│   │   ├── Crawler.Core.csproj
│   │   ├── Models/
│   │   │   ├── CrawlRequest.cs          # URL + depth + parent
│   │   │   ├── CrawlResult.cs           # URL + title + links + status + bytes
│   │   │   ├── CrawlState.cs            # Serializable crawl checkpoint
│   │   │   └── CrawlOptions.cs          # MaxDepth, MaxPages, Parallelism, Delay
│   │   ├── CrawlEngine.cs              # Main orchestrator: channels + workers
│   │   ├── ICrawlEngine.cs             # Interface for testability
│   │   └── Statistics.cs               # Thread-safe stats tracker
│   ├── Crawler.Http/
│   │   ├── Crawler.Http.csproj
│   │   ├── HttpFetcher.cs              # HttpClient wrapper with Polly
│   │   ├── IHttpFetcher.cs             # Interface for mocking
│   │   └── RobotsTxtParser.cs          # robots.txt respect
│   ├── Crawler.Parser/
│   │   ├── Crawler.Parser.csproj
│   │   ├── HtmlParser.cs               # AngleSharp link/title extraction
│   │   └── IHtmlParser.cs
│   ├── Crawler.Storage/
│   │   ├── Crawler.Storage.csproj
│   │   ├── JsonIndexWriter.cs          # Write crawl results to JSON
│   │   ├── StateManager.cs             # Save/restore crawl state
│   │   └── IIndexWriter.cs
│   └── Crawler.Cli/
│       ├── Crawler.Cli.csproj          # <OutputType>Exe</OutputType>
│       └── Program.cs                  # System.CommandLine root command
└── tests/
    └── Crawler.Tests/
        ├── Crawler.Tests.csproj
        ├── CrawlEngineTests.cs
        ├── HttpFetcherTests.cs
        ├── HtmlParserTests.cs
        ├── RobotsTxtParserTests.cs
        └── Fakes/
            ├── FakeHttpFetcher.cs
            └── FakeHtmlParser.cs
```

**Key design decisions:**
- **Interfaces everywhere**: `IHttpFetcher`, `IHtmlParser`, `IIndexWriter` make every component testable in isolation.
- **Channel as central bus**: A bounded `Channel<CrawlRequest>` connects the coordinator to workers. Backpressure is automatic.
- **Separation of concerns**: HTTP fetching, HTML parsing, storage, and orchestration are in separate projects.

---

## Requirements

### Core (Must Have)

1. **CrawlEngine** — Accepts seed URLs, coordinates N async workers reading from a shared channel. Each worker: dequeues URL, checks dedup, fetches, parses, enqueues discovered links, writes result.
2. **HttpFetcher** — Wraps `HttpClient` with Polly retry (3 attempts, exponential backoff). Respects `CancellationToken`. Returns content + status code + byte count.
3. **HtmlParser** — Uses AngleSharp to extract page title and all `<a href>` links. Resolves relative URLs to absolute. Filters non-HTTP schemes.
4. **URL deduplication** — `ConcurrentDictionary` tracks visited URLs. Normalize URLs before checking (lowercase host, remove fragment, remove trailing slash).
5. **Depth and count limits** — Stop discovering new links beyond `maxDepth`. Stop crawling after `maxPages` total.
6. **JSON output** — Write a JSON file with an array of crawl results (URL, title, outbound links, HTTP status, byte count, crawl timestamp).
7. **CLI** — `crawl <url> --depth 3 --max-pages 100 --parallelism 5 --output crawl.json`
8. **Statistics** — Print summary on completion: total pages, total bytes, elapsed time, pages/second.

### Extended (Should Have)

9. **robots.txt** — Fetch and parse `/robots.txt` for each domain. Respect `Disallow` rules. Cache per domain.
10. **Politeness delay** — Configurable minimum delay between requests to the same host. Use a `ConcurrentDictionary<string, DateTime>` for last-access tracking.
11. **Resume support** — Save crawl state (visited URLs, pending queue) to JSON on Ctrl+C or completion. `--resume state.json` flag to continue.
12. **Progress reporting** — Live console output showing pages crawled, queue depth, current URL.

### Stretch (Nice to Have)

13. Content-type filtering (only crawl `text/html`, skip PDFs/images).
14. Sitemap.xml parsing for URL discovery.
15. Export to SQLite database instead of JSON.
16. Docker packaging with multi-stage build.
17. Rate limiting with `System.Threading.RateLimiting.TokenBucketRateLimiter`.

---

## Technical Guidance

### Channel-Based Architecture

The core pattern is a bounded channel as a work queue:

```
Seed URLs → Channel<CrawlRequest> → N Workers → Results
                 ↑                        |
                 └── new discovered URLs ──┘
```

Create a `BoundedChannelOptions` with capacity (e.g., 1000) and `FullMode.Wait`. This gives
you automatic backpressure: if workers discover URLs faster than they can process them, the
channel blocks writers until there is space.

Think about: When do you complete the channel (call `Writer.Complete()`)? You need to detect
when all workers are idle AND the channel is empty. One approach: use an atomic "in-flight"
counter. Increment when a worker dequeues, decrement when done. When counter hits 0 and
channel is empty, complete the channel.

### HttpClient Lifetime

Never create `HttpClient` per request — it leaks sockets. Use a single `HttpClient` instance
(or `IHttpClientFactory` if using DI). Set `PooledConnectionLifetime` to handle DNS changes.
Set sensible timeouts (30s connect, 60s total).

### Polly Resilience Pipeline

Use the new `Polly.Core` (v8+) resilience pipeline builder:

```csharp
new ResiliencePipelineBuilder<HttpResponseMessage>()
    .AddRetry(new RetryStrategyOptions<HttpResponseMessage>
    {
        MaxRetryAttempts = 3,
        BackoffType = DelayBackoffType.Exponential,
        Delay = TimeSpan.FromMilliseconds(500),
        ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
            .Handle<HttpRequestException>()
            .Handle<TaskCanceledException>()
            .HandleResult(r => r.StatusCode >= HttpStatusCode.InternalServerError)
    })
    .AddTimeout(TimeSpan.FromSeconds(30))
    .Build();
```

### URL Normalization

Before checking deduplication, normalize:
- Lowercase the scheme and host
- Remove default ports (:80 for http, :443 for https)
- Remove fragment (#...)
- Remove trailing slash on path (unless path is just "/")
- Sort query parameters alphabetically

This prevents crawling the same page under slightly different URLs.

### Cancellation Pattern

Thread a `CancellationTokenSource` from the CLI down through all async operations. On
Ctrl+C, the token cancels, workers exit their loops gracefully, and the engine saves state.

---

## Step by Step Milestones

### Milestone 1: Project Setup and Models (1 hour)
Create the solution and all projects. Define `CrawlRequest`, `CrawlResult`, `CrawlOptions`.
Add NuGet packages: `AngleSharp`, `Microsoft.Extensions.Http.Polly`, `System.CommandLine`,
`Polly.Core`. Verify build.

### Milestone 2: HTML Parser (2-3 hours)
Implement `HtmlParser` with AngleSharp. Write tests with hardcoded HTML strings: extract
title, extract absolute links, handle relative links, handle malformed HTML, handle pages
with no links. This is the simplest component — start here.

### Milestone 3: HTTP Fetcher with Polly (3-4 hours)
Implement `HttpFetcher` wrapping `HttpClient`. Add Polly retry policy. Write tests using
a mock HTTP handler (`DelegatingHandler` subclass that returns canned responses). Test
retry behavior, timeout, non-HTML content-type handling.

### Milestone 4: Crawl Engine — Single Worker (3-4 hours)
Wire fetcher + parser into the engine with a single worker. Use a `Channel<CrawlRequest>`
as the work queue. Test with `FakeHttpFetcher` that returns predictable pages with known
link structures. Verify depth limiting and deduplication work correctly.

### Milestone 5: Multi-Worker Parallelism (2-3 hours)
Scale to N workers reading from the same channel. Add the "in-flight" counter for
completion detection. Test that increasing parallelism actually speeds up crawling (use
`FakeHttpFetcher` with simulated 100ms delay).

### Milestone 6: JSON Output and Statistics (2 hours)
Implement `JsonIndexWriter` using `System.Text.Json`. Add thread-safe `Statistics` class
using `Interlocked`. Print summary table on completion.

### Milestone 7: CLI with System.CommandLine (2 hours)
Build the CLI: `crawl <url> --depth --max-pages --parallelism --delay --output`. Add
validation (depth > 0, parallelism > 0). Add `--verbose` flag for debug logging.

### Milestone 8: Polish — robots.txt, Resume, Real Testing (3-4 hours)
Add robots.txt parsing (it is just a text format — no special library needed). Add state
save/restore. Do a real crawl of a small site. Fix edge cases found during real usage.

---

## Testing Requirements

### Unit Tests

- **HtmlParser**: Known HTML input -> expected title + links. Test relative URL resolution. Test malformed HTML (no crash). Test empty page. Test page with 100 links.
- **RobotsTxtParser**: Standard robots.txt -> allowed/disallowed paths. Test wildcard rules. Test multiple user-agents. Test empty robots.txt (everything allowed).
- **URL normalization**: Equivalence classes (http vs https, trailing slash, fragments, query order).
- **Statistics**: Thread-safe increment from multiple tasks -> correct totals.

### Integration Tests (with Fakes)

- **CrawlEngine with FakeHttpFetcher**: Seed a graph of fake pages. Verify all reachable pages within depth are crawled. Verify deduplication (page linked from 10 pages is crawled once). Verify max-pages limit is respected.
- **Completion detection**: Verify engine terminates when all pages are crawled (no deadlock, no infinite wait).
- **Cancellation**: Start a crawl, cancel after N pages, verify graceful shutdown.

### Edge Cases

- Circular links (A -> B -> A): Must not infinite loop.
- Massive fan-out (page with 10,000 links): Must not OOM — backpressure should kick in.
- Slow server (3+ second response): Polly timeout kicks in.
- Non-HTML content: Fetcher returns content-type, parser skips it.
- Invalid URLs in href: Parser must not crash.
- Connection refused: Polly retries, then moves on.

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### CrawlEngine.cs — The Core Orchestrator

```csharp
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Crawler.Core.Models;

namespace Crawler.Core;

/// <summary>
/// Coordinates concurrent web crawling using channels and async workers.
/// </summary>
public sealed class CrawlEngine : ICrawlEngine
{
    private readonly IHttpFetcher _fetcher;
    private readonly IHtmlParser _parser;
    private readonly IIndexWriter _writer;
    private readonly CrawlOptions _options;
    private readonly ConcurrentDictionary<string, byte> _visited = new();
    private readonly Statistics _stats = new();
    private int _inFlight;

    public CrawlEngine(
        IHttpFetcher fetcher,
        IHtmlParser parser,
        IIndexWriter writer,
        CrawlOptions options)
    {
        _fetcher = fetcher ?? throw new ArgumentNullException(nameof(fetcher));
        _parser = parser ?? throw new ArgumentNullException(nameof(parser));
        _writer = writer ?? throw new ArgumentNullException(nameof(writer));
        _options = options ?? throw new ArgumentNullException(nameof(options));
    }

    public Statistics Stats => _stats;

    /// <summary>
    /// Runs the crawl from the given seed URLs until completion or cancellation.
    /// </summary>
    public async Task<IReadOnlyList<CrawlResult>> CrawlAsync(
        IEnumerable<string> seedUrls,
        CancellationToken ct = default)
    {
        var results = new ConcurrentBag<CrawlResult>();
        var stopwatch = Stopwatch.StartNew();

        // Bounded channel provides backpressure
        var channel = Channel.CreateBounded<CrawlRequest>(
            new BoundedChannelOptions(_options.ChannelCapacity)
            {
                FullMode = BoundedChannelFullMode.Wait,
                SingleReader = false,
                SingleWriter = false
            });

        // Seed the channel
        foreach (var url in seedUrls)
        {
            var normalized = UrlNormalizer.Normalize(url);
            if (normalized != null && _visited.TryAdd(normalized, 0))
            {
                await channel.Writer.WriteAsync(
                    new CrawlRequest(normalized, Depth: 0, ParentUrl: null), ct);
            }
        }

        // Launch workers
        var workers = Enumerable.Range(0, _options.Parallelism)
            .Select(_ => WorkerLoop(channel, results, ct))
            .ToArray();

        // Completion detector — runs on a separate task
        var completionTask = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(100, ct);

                // All workers idle AND channel empty => done
                if (Volatile.Read(ref _inFlight) == 0
                    && channel.Reader.Count == 0)
                {
                    // Double-check after a short delay to avoid race
                    await Task.Delay(200, ct);
                    if (Volatile.Read(ref _inFlight) == 0
                        && channel.Reader.Count == 0)
                    {
                        channel.Writer.TryComplete();
                        break;
                    }
                }
            }
        }, ct);

        // Wait for all workers to finish
        try
        {
            await Task.WhenAll(workers);
        }
        catch (ChannelClosedException)
        {
            // Expected when channel completes
        }

        stopwatch.Stop();
        _stats.SetElapsed(stopwatch.Elapsed);

        // Write results
        var resultList = results.ToList();
        await _writer.WriteAsync(resultList, ct);

        return resultList;
    }

    private async Task WorkerLoop(
        Channel<CrawlRequest> channel,
        ConcurrentBag<CrawlResult> results,
        CancellationToken ct)
    {
        await foreach (var request in channel.Reader.ReadAllAsync(ct))
        {
            Interlocked.Increment(ref _inFlight);
            try
            {
                if (_stats.TotalPages >= _options.MaxPages)
                    continue;

                var result = await ProcessRequestAsync(request, channel, ct);
                if (result != null)
                {
                    results.Add(result);
                    _stats.RecordPage(result.ByteCount);

                    if (_options.Verbose)
                    {
                        Console.WriteLine(
                            $"[{_stats.TotalPages}/{_options.MaxPages}] " +
                            $"d={request.Depth} {request.Url} " +
                            $"({result.Links.Count} links, {result.ByteCount:N0} bytes)");
                    }
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _stats.RecordError();
                if (_options.Verbose)
                    Console.Error.WriteLine($"Error crawling {request.Url}: {ex.Message}");
            }
            finally
            {
                Interlocked.Decrement(ref _inFlight);
            }
        }
    }

    private async Task<CrawlResult?> ProcessRequestAsync(
        CrawlRequest request,
        Channel<CrawlRequest> channel,
        CancellationToken ct)
    {
        // Respect politeness delay
        if (_options.DelayMs > 0)
        {
            var host = new Uri(request.Url).Host;
            await _fetcher.RespectDelayAsync(host, _options.DelayMs, ct);
        }

        // Fetch the page
        var fetchResult = await _fetcher.FetchAsync(request.Url, ct);
        if (!fetchResult.IsSuccess || fetchResult.Content == null)
        {
            return new CrawlResult(
                Url: request.Url,
                Title: null,
                Links: Array.Empty<string>(),
                StatusCode: fetchResult.StatusCode,
                ByteCount: 0,
                CrawledAt: DateTimeOffset.UtcNow,
                Depth: request.Depth);
        }

        // Parse HTML
        var parseResult = await _parser.ParseAsync(
            fetchResult.Content, request.Url, ct);

        // Enqueue discovered links (if within depth)
        if (request.Depth < _options.MaxDepth)
        {
            foreach (var link in parseResult.Links)
            {
                var normalized = UrlNormalizer.Normalize(link);
                if (normalized != null
                    && _visited.TryAdd(normalized, 0)
                    && _stats.TotalPages + _visited.Count < _options.MaxPages * 2)
                {
                    await channel.Writer.WriteAsync(
                        new CrawlRequest(normalized, request.Depth + 1, request.Url),
                        ct);
                }
            }
        }

        return new CrawlResult(
            Url: request.Url,
            Title: parseResult.Title,
            Links: parseResult.Links,
            StatusCode: fetchResult.StatusCode,
            ByteCount: fetchResult.ByteCount,
            CrawledAt: DateTimeOffset.UtcNow,
            Depth: request.Depth);
    }
}
```

### Models

```csharp
namespace Crawler.Core.Models;

/// <summary>A URL to be crawled, with its depth from the seed.</summary>
public sealed record CrawlRequest(string Url, int Depth, string? ParentUrl);

/// <summary>The result of crawling a single page.</summary>
public sealed record CrawlResult(
    string Url,
    string? Title,
    IReadOnlyList<string> Links,
    int StatusCode,
    long ByteCount,
    DateTimeOffset CrawledAt,
    int Depth);

/// <summary>Configuration for a crawl session.</summary>
public sealed record CrawlOptions
{
    public int MaxDepth { get; init; } = 3;
    public int MaxPages { get; init; } = 100;
    public int Parallelism { get; init; } = 5;
    public int DelayMs { get; init; } = 500;
    public int ChannelCapacity { get; init; } = 1000;
    public bool Verbose { get; init; } = false;
    public string OutputPath { get; init; } = "crawl-results.json";
}

/// <summary>Serializable crawl checkpoint for resume support.</summary>
public sealed record CrawlState(
    IReadOnlyList<string> VisitedUrls,
    IReadOnlyList<CrawlRequest> PendingRequests,
    DateTimeOffset SavedAt);
```

### Statistics.cs — Thread-Safe Counters

```csharp
using System;
using System.Threading;

namespace Crawler.Core;

/// <summary>Thread-safe crawl statistics using Interlocked operations.</summary>
public sealed class Statistics
{
    private long _totalPages;
    private long _totalBytes;
    private long _totalErrors;
    private TimeSpan _elapsed;

    public long TotalPages => Interlocked.Read(ref _totalPages);
    public long TotalBytes => Interlocked.Read(ref _totalBytes);
    public long TotalErrors => Interlocked.Read(ref _totalErrors);
    public TimeSpan Elapsed => _elapsed;

    public double PagesPerSecond =>
        _elapsed.TotalSeconds > 0 ? TotalPages / _elapsed.TotalSeconds : 0;

    public void RecordPage(long bytes)
    {
        Interlocked.Increment(ref _totalPages);
        Interlocked.Add(ref _totalBytes, bytes);
    }

    public void RecordError() => Interlocked.Increment(ref _totalErrors);

    public void SetElapsed(TimeSpan elapsed) => _elapsed = elapsed;

    public override string ToString() =>
        $"""
        Crawl Statistics:
          Total pages:  {TotalPages:N0}
          Total bytes:  {TotalBytes:N0} ({TotalBytes / (1024.0 * 1024):F2} MB)
          Total errors: {TotalErrors:N0}
          Elapsed:      {Elapsed:hh\:mm\:ss\.ff}
          Pages/sec:    {PagesPerSecond:F1}
        """;
}
```

### HttpFetcher.cs — With Polly Resilience

```csharp
using System;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Polly;
using Polly.Retry;

namespace Crawler.Http;

public sealed record FetchResult(
    bool IsSuccess,
    int StatusCode,
    string? Content,
    long ByteCount,
    string? ContentType);

public interface IHttpFetcher
{
    Task<FetchResult> FetchAsync(string url, CancellationToken ct);
    Task RespectDelayAsync(string host, int delayMs, CancellationToken ct);
}

/// <summary>
/// HTTP fetcher with Polly retry, timeout, and per-host delay tracking.
/// </summary>
public sealed class HttpFetcher : IHttpFetcher, IDisposable
{
    private readonly HttpClient _client;
    private readonly ResiliencePipeline<HttpResponseMessage> _pipeline;
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastAccess = new();

    public HttpFetcher(HttpClient? client = null)
    {
        _client = client ?? new HttpClient(new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(5),
            MaxConnectionsPerServer = 10
        })
        {
            Timeout = TimeSpan.FromSeconds(30)
        };

        _client.DefaultRequestHeaders.UserAgent.ParseAdd(
            "TigerCrawler/1.0 (+https://github.com/tiger)");

        _pipeline = new ResiliencePipelineBuilder<HttpResponseMessage>()
            .AddRetry(new RetryStrategyOptions<HttpResponseMessage>
            {
                MaxRetryAttempts = 3,
                BackoffType = DelayBackoffType.Exponential,
                Delay = TimeSpan.FromMilliseconds(500),
                ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
                    .Handle<HttpRequestException>()
                    .Handle<TaskCanceledException>()
                    .HandleResult(r => (int)r.StatusCode >= 500)
            })
            .Build();
    }

    public async Task<FetchResult> FetchAsync(string url, CancellationToken ct)
    {
        try
        {
            var response = await _pipeline.ExecuteAsync(
                async token => await _client.GetAsync(url, token),
                ct);

            var contentType = response.Content.Headers.ContentType?.MediaType;

            // Only read body for HTML content
            if (contentType != null && !contentType.Contains("html", StringComparison.OrdinalIgnoreCase))
            {
                return new FetchResult(
                    IsSuccess: false,
                    StatusCode: (int)response.StatusCode,
                    Content: null,
                    ByteCount: response.Content.Headers.ContentLength ?? 0,
                    ContentType: contentType);
            }

            var content = await response.Content.ReadAsStringAsync(ct);
            var byteCount = response.Content.Headers.ContentLength
                            ?? System.Text.Encoding.UTF8.GetByteCount(content);

            return new FetchResult(
                IsSuccess: response.IsSuccessStatusCode,
                StatusCode: (int)response.StatusCode,
                Content: content,
                ByteCount: byteCount,
                ContentType: contentType);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return new FetchResult(
                IsSuccess: false,
                StatusCode: 0,
                Content: null,
                ByteCount: 0,
                ContentType: null);
        }
    }

    /// <summary>
    /// Enforces a minimum delay between requests to the same host.
    /// </summary>
    public async Task RespectDelayAsync(string host, int delayMs, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        if (_lastAccess.TryGetValue(host, out var lastTime))
        {
            var elapsed = now - lastTime;
            if (elapsed.TotalMilliseconds < delayMs)
            {
                var waitMs = delayMs - (int)elapsed.TotalMilliseconds;
                await Task.Delay(waitMs, ct);
            }
        }
        _lastAccess[host] = DateTimeOffset.UtcNow;
    }

    public void Dispose() => _client.Dispose();
}
```

### HtmlParser.cs — AngleSharp Link Extraction

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AngleSharp;
using AngleSharp.Html.Parser;

namespace Crawler.Parser;

public sealed record ParseResult(string? Title, IReadOnlyList<string> Links);

public interface IHtmlParser
{
    Task<ParseResult> ParseAsync(string html, string baseUrl, CancellationToken ct);
}

/// <summary>
/// Extracts title and links from HTML using AngleSharp.
/// Resolves relative URLs and filters non-HTTP schemes.
/// </summary>
public sealed class HtmlParser : IHtmlParser
{
    public async Task<ParseResult> ParseAsync(
        string html, string baseUrl, CancellationToken ct)
    {
        var context = BrowsingContext.New(Configuration.Default);
        var parser = context.GetService<IHtmlParser>()!;
        var document = await parser.ParseDocumentAsync(html, ct);

        var title = document.Title;

        var baseUri = new Uri(baseUrl);
        var links = new List<string>();

        foreach (var anchor in document.QuerySelectorAll("a[href]"))
        {
            var href = anchor.GetAttribute("href");
            if (string.IsNullOrWhiteSpace(href))
                continue;

            try
            {
                var resolved = new Uri(baseUri, href);

                // Only follow HTTP(S) links
                if (resolved.Scheme == "http" || resolved.Scheme == "https")
                {
                    links.Add(resolved.AbsoluteUri);
                }
            }
            catch (UriFormatException)
            {
                // Skip malformed URIs
            }
        }

        return new ParseResult(title, links.Distinct().ToList());
    }
}
```

### Program.cs — CLI with System.CommandLine

```csharp
using System;
using System.Collections.Generic;
using System.CommandLine;
using System.Threading;
using System.Threading.Tasks;
using Crawler.Core;
using Crawler.Core.Models;
using Crawler.Http;
using Crawler.Parser;
using Crawler.Storage;

var urlArgument = new Argument<string[]>(
    "urls", "One or more seed URLs to start crawling from");

var depthOption = new Option<int>(
    "--depth", () => 3, "Maximum crawl depth from seed URLs");

var maxPagesOption = new Option<int>(
    "--max-pages", () => 100, "Maximum number of pages to crawl");

var parallelismOption = new Option<int>(
    "--parallelism", () => 5, "Number of concurrent workers");

var delayOption = new Option<int>(
    "--delay", () => 500, "Minimum delay (ms) between requests to the same host");

var outputOption = new Option<string>(
    "--output", () => "crawl-results.json", "Output JSON file path");

var verboseOption = new Option<bool>(
    "--verbose", () => false, "Print detailed crawl progress");

var rootCommand = new RootCommand("A concurrent web crawler built with C# and Channels")
{
    urlArgument,
    depthOption,
    maxPagesOption,
    parallelismOption,
    delayOption,
    outputOption,
    verboseOption
};

rootCommand.SetHandler(async (context) =>
{
    var urls = context.ParseResult.GetValueForArgument(urlArgument);
    var options = new CrawlOptions
    {
        MaxDepth = context.ParseResult.GetValueForOption(depthOption),
        MaxPages = context.ParseResult.GetValueForOption(maxPagesOption),
        Parallelism = context.ParseResult.GetValueForOption(parallelismOption),
        DelayMs = context.ParseResult.GetValueForOption(delayOption),
        OutputPath = context.ParseResult.GetValueForOption(outputOption)!,
        Verbose = context.ParseResult.GetValueForOption(verboseOption)
    };

    var ct = context.GetCancellationToken();

    Console.WriteLine($"Starting crawl: {urls.Length} seed URL(s), " +
                      $"depth={options.MaxDepth}, max={options.MaxPages}, " +
                      $"workers={options.Parallelism}");
    Console.WriteLine();

    using var fetcher = new HttpFetcher();
    var parser = new HtmlParser();
    var writer = new JsonIndexWriter(options.OutputPath);

    var engine = new CrawlEngine(fetcher, parser, writer, options);

    try
    {
        var results = await engine.CrawlAsync(urls, ct);
        Console.WriteLine();
        Console.WriteLine(engine.Stats);
        Console.WriteLine($"Results written to: {options.OutputPath}");
    }
    catch (OperationCanceledException)
    {
        Console.WriteLine("\nCrawl cancelled. Partial results saved.");
    }
});

await rootCommand.InvokeAsync(args);
```

### UrlNormalizer.cs

```csharp
using System;
using System.Linq;

namespace Crawler.Core;

/// <summary>
/// Normalizes URLs for consistent deduplication.
/// </summary>
public static class UrlNormalizer
{
    /// <summary>
    /// Normalizes a URL: lowercases scheme/host, removes default ports,
    /// removes fragments, removes trailing slashes, sorts query params.
    /// Returns null for invalid URLs.
    /// </summary>
    public static string? Normalize(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return null;

        if (uri.Scheme != "http" && uri.Scheme != "https")
            return null;

        var builder = new UriBuilder(uri)
        {
            Fragment = string.Empty,
            Host = uri.Host.ToLowerInvariant(),
            Scheme = uri.Scheme.ToLowerInvariant()
        };

        // Remove default ports
        if ((uri.Scheme == "http" && uri.Port == 80) ||
            (uri.Scheme == "https" && uri.Port == 443))
        {
            builder.Port = -1;
        }

        // Sort query parameters for consistency
        if (!string.IsNullOrEmpty(uri.Query) && uri.Query.Length > 1)
        {
            var sorted = uri.Query[1..] // skip '?'
                .Split('&')
                .OrderBy(p => p)
                .ToArray();
            builder.Query = string.Join("&", sorted);
        }

        var result = builder.Uri.AbsoluteUri;

        // Remove trailing slash (unless path is just "/")
        if (result.EndsWith('/') && builder.Path != "/")
            result = result[..^1];

        return result;
    }
}
```

### JsonIndexWriter.cs

```csharp
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Crawler.Core.Models;

namespace Crawler.Storage;

public interface IIndexWriter
{
    Task WriteAsync(IReadOnlyList<CrawlResult> results, CancellationToken ct);
}

public sealed class JsonIndexWriter : IIndexWriter
{
    private readonly string _path;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public JsonIndexWriter(string path) => _path = path;

    public async Task WriteAsync(IReadOnlyList<CrawlResult> results, CancellationToken ct)
    {
        await using var stream = File.Create(_path);
        await JsonSerializer.SerializeAsync(stream, results, JsonOptions, ct);
    }
}
```

</details>

---

## What to Show Off

### In Your Portfolio

- **Architecture diagram** showing the channel-based producer-consumer pattern — this is the same pattern used in data pipeline architectures.
- **Metrics dashboard** — Screenshot of crawl statistics on a real site (e.g., crawl docs.microsoft.com to depth 2).
- **README with usage examples** — Show the CLI in action with real output.

### In Interviews

- **"Explain your concurrency model"** — Channels provide a bounded, thread-safe queue. Workers are async, so they do not block threads while waiting for HTTP responses. The in-flight counter enables clean shutdown detection.
- **"How do you handle backpressure?"** — The bounded channel blocks producers when full, preventing unbounded memory growth. This is the same concept as Kafka consumer lag or Azure Service Bus prefetch limits.
- **"What happens when a request fails?"** — Polly retries with exponential backoff. After max retries, the URL is recorded as failed and the worker moves on. Circuit breaker can trip if a whole domain is down.
- **"How would you scale this?"** — Distribute across machines with a shared queue (Redis, Azure Service Bus). Partition by domain for politeness. Use consistent hashing for URL assignment.

### Key Talking Points for a DE Role

- "This uses the same producer-consumer pattern I apply in data pipelines — reading from a source, processing concurrently, writing to a sink."
- "The backpressure mechanism prevents OOM, which is critical when ingesting data at scale."
- "Polly resilience policies are how I handle transient failures in database connections and API calls in production pipelines."

---

## Stretch Goals

1. **Distributed crawling** — Use Redis or Azure Service Bus as the shared queue. Multiple crawler instances partition work by domain hash.
2. **Full-text search index** — Feed crawled content into Lucene.NET or Azure Cognitive Search. Build a search CLI.
3. **Link graph visualization** — Export the crawl graph as a DOT file, render with Graphviz. Show the network structure.
4. **Screenshot capture** — Use Playwright to capture page screenshots during crawl. Store in a directory with URL-based naming.
5. **Respect `Crawl-delay`** — Parse the `Crawl-delay` directive from robots.txt and dynamically adjust per-host delays.
