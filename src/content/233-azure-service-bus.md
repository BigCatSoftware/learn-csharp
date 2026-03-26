# Azure Service Bus

*Chapter 15.4 — Azure Service Bus*

## Overview

Azure Service Bus is a fully managed enterprise message broker. For Data Engineers, it
decouples pipeline steps, enables reliable message delivery between systems, and provides
patterns for handling failures gracefully. At BNBuilders, Service Bus connects the data
platform — Sage exports trigger processing pipelines, cost approvals flow between systems,
and pipeline failures route to dead-letter queues for investigation.

This lesson covers:

- **Queues vs Topics/Subscriptions** — Point-to-point vs publish-subscribe.
- **C# SDK** — `Azure.Messaging.ServiceBus` for sending and receiving.
- **Message features** — Properties, scheduling, sessions, dead-letter queues.
- **Reliability patterns** — Duplicate detection, at-least-once delivery, poison messages.

Service Bus is the right choice when you need guaranteed delivery, ordering, or transactions.
For simple fire-and-forget events, consider Azure Event Grid instead.

## Core Concepts

### Queues vs Topics

```
Queue (Point-to-Point):
  Sender → [Queue] → Receiver
  One message is delivered to exactly one receiver.

Topic/Subscription (Publish-Subscribe):
  Sender → [Topic] → Subscription A → Receiver A
                   → Subscription B → Receiver B
  One message is delivered to ALL subscriptions.
```

| Feature | Queue | Topic/Subscription |
|---------|-------|-------------------|
| Delivery | One receiver | Multiple receivers |
| Use case | Task processing | Event broadcasting |
| Example | "Process this budget file" | "Budget was updated" (notify dashboard, audit log, etc.) |
| Filtering | No | Subscription filters on message properties |

### Message Lifecycle

```
Sent → [Queue/Subscription] → Received (locked) → Completed
                                                 → Abandoned (returns to queue)
                                                 → Dead-lettered (moved to DLQ)
```

Messages have a **lock duration** (default 30 seconds). While locked, no other receiver
can see the message. If the receiver does not complete/abandon within the lock duration,
the message becomes visible again.

### Tiers

| Tier | Max Message Size | Topics | Sessions | Price |
|------|-----------------|--------|----------|-------|
| Basic | 256 KB | No | No | Cheapest |
| Standard | 256 KB | Yes | Yes | $0.05/million operations |
| Premium | 100 MB | Yes | Yes | Dedicated capacity |

For data pipeline workloads, Standard tier is usually sufficient. Premium is for high-
throughput or large message payloads.

## Code Examples

### Sending Messages

```csharp
using Azure.Messaging.ServiceBus;
using Azure.Identity;
using System.Text.Json;

public class BudgetMessageSender : IAsyncDisposable
{
    private readonly ServiceBusClient _client;
    private readonly ServiceBusSender _sender;

    public BudgetMessageSender(string fullyQualifiedNamespace, string queueName)
    {
        _client = new ServiceBusClient(fullyQualifiedNamespace, new DefaultAzureCredential());
        _sender = _client.CreateSender(queueName);
    }

    /// <summary>
    /// Send a single message.
    /// </summary>
    public async Task SendBudgetUpdateAsync(BudgetUpdateMessage message, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(message);
        var sbMessage = new ServiceBusMessage(json)
        {
            ContentType = "application/json",
            Subject = "BudgetUpdate",
            MessageId = $"{message.ProjectId}-{message.Timestamp:yyyyMMddHHmmss}",
            ApplicationProperties =
            {
                ["ProjectId"] = message.ProjectId,
                ["Source"] = "SageSync",
                ["Priority"] = message.IsUrgent ? "High" : "Normal"
            },
            // Auto-expire after 24 hours if not processed
            TimeToLive = TimeSpan.FromHours(24)
        };

        await _sender.SendMessageAsync(sbMessage, ct);
    }

    /// <summary>
    /// Send a batch of messages (more efficient than individual sends).
    /// </summary>
    public async Task SendBatchAsync(
        IReadOnlyList<BudgetUpdateMessage> messages, CancellationToken ct)
    {
        using var batch = await _sender.CreateMessageBatchAsync(ct);

        foreach (var message in messages)
        {
            var json = JsonSerializer.Serialize(message);
            var sbMessage = new ServiceBusMessage(json)
            {
                ContentType = "application/json",
                Subject = "BudgetUpdate",
                MessageId = $"{message.ProjectId}-{message.Timestamp:yyyyMMddHHmmss}"
            };

            if (!batch.TryAddMessage(sbMessage))
            {
                // Batch is full — send it and start a new one
                await _sender.SendMessagesAsync(batch, ct);

                using var newBatch = await _sender.CreateMessageBatchAsync(ct);
                if (!newBatch.TryAddMessage(sbMessage))
                    throw new InvalidOperationException("Message too large for batch");

                // Continue adding to newBatch...
            }
        }

        // Send remaining messages
        if (batch.Count > 0)
            await _sender.SendMessagesAsync(batch, ct);
    }

    /// <summary>
    /// Schedule a message for future delivery.
    /// </summary>
    public async Task<long> ScheduleMessageAsync(
        BudgetUpdateMessage message,
        DateTimeOffset scheduledTime,
        CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(message);
        var sbMessage = new ServiceBusMessage(json)
        {
            ContentType = "application/json",
            Subject = "ScheduledBudgetUpdate"
        };

        // Returns a sequence number you can use to cancel
        long sequenceNumber = await _sender.ScheduleMessageAsync(
            sbMessage, scheduledTime, ct);

        return sequenceNumber;
    }

    public async ValueTask DisposeAsync()
    {
        await _sender.DisposeAsync();
        await _client.DisposeAsync();
    }
}

public record BudgetUpdateMessage(
    string ProjectId,
    string CostCode,
    decimal NewAmount,
    DateTimeOffset Timestamp,
    bool IsUrgent = false
);
```

### Receiving Messages

```csharp
using Azure.Messaging.ServiceBus;

public class BudgetMessageProcessor : IAsyncDisposable
{
    private readonly ServiceBusClient _client;
    private readonly ServiceBusProcessor _processor;
    private readonly ILogger<BudgetMessageProcessor> _logger;

    public BudgetMessageProcessor(
        string fullyQualifiedNamespace,
        string queueName,
        ILogger<BudgetMessageProcessor> logger)
    {
        _logger = logger;
        _client = new ServiceBusClient(fullyQualifiedNamespace, new DefaultAzureCredential());
        _processor = _client.CreateProcessor(queueName, new ServiceBusProcessorOptions
        {
            MaxConcurrentCalls = 10,
            AutoCompleteMessages = false, // We complete manually after processing
            PrefetchCount = 20,
            MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(10)
        });

        _processor.ProcessMessageAsync += HandleMessageAsync;
        _processor.ProcessErrorAsync += HandleErrorAsync;
    }

    public async Task StartAsync(CancellationToken ct)
    {
        await _processor.StartProcessingAsync(ct);
        _logger.LogInformation("Message processor started");
    }

    public async Task StopAsync(CancellationToken ct)
    {
        await _processor.StopProcessingAsync(ct);
        _logger.LogInformation("Message processor stopped");
    }

    private async Task HandleMessageAsync(ProcessMessageEventArgs args)
    {
        var body = args.Message.Body.ToString();
        var message = JsonSerializer.Deserialize<BudgetUpdateMessage>(body);

        _logger.LogInformation("Processing budget update for {ProjectId}, Cost Code: {CostCode}",
            message?.ProjectId, message?.CostCode);

        try
        {
            // Process the message (update database, trigger report, etc.)
            await ProcessBudgetUpdateAsync(message!);

            // Mark as completed — removes from queue
            await args.CompleteMessageAsync(args.Message);
            _logger.LogInformation("Message completed: {MessageId}", args.Message.MessageId);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to process message {MessageId}", args.Message.MessageId);

            if (args.Message.DeliveryCount >= 3)
            {
                // After 3 attempts, dead-letter it
                await args.DeadLetterMessageAsync(
                    args.Message,
                    deadLetterReason: "ProcessingFailed",
                    deadLetterErrorDescription: ex.Message);
            }
            else
            {
                // Return to queue for retry
                await args.AbandonMessageAsync(args.Message);
            }
        }
    }

    private Task HandleErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception,
            "Service Bus error: {Source}, {Namespace}, {Entity}",
            args.ErrorSource, args.FullyQualifiedNamespace, args.EntityPath);
        return Task.CompletedTask;
    }

    private async Task ProcessBudgetUpdateAsync(BudgetUpdateMessage message)
    {
        // Your business logic here
        await Task.Delay(100); // Simulate work
    }

    public async ValueTask DisposeAsync()
    {
        await _processor.DisposeAsync();
        await _client.DisposeAsync();
    }
}
```

### Dead-Letter Queue Processing

```csharp
public class DeadLetterProcessor
{
    private readonly ServiceBusClient _client;

    public DeadLetterProcessor(string fullyQualifiedNamespace)
    {
        _client = new ServiceBusClient(fullyQualifiedNamespace, new DefaultAzureCredential());
    }

    /// <summary>
    /// Inspect and reprocess dead-lettered messages.
    /// </summary>
    public async Task ProcessDeadLettersAsync(
        string queueName, CancellationToken ct)
    {
        // Dead-letter queue is a sub-queue with a special name
        var dlqPath = $"{queueName}/$deadletterqueue";
        var receiver = _client.CreateReceiver(dlqPath, new ServiceBusReceiverOptions
        {
            ReceiveMode = ServiceBusReceiveMode.PeekLock
        });

        while (!ct.IsCancellationRequested)
        {
            var message = await receiver.ReceiveMessageAsync(
                TimeSpan.FromSeconds(5), ct);

            if (message is null) break; // No more dead letters

            Console.WriteLine($"Dead letter: {message.MessageId}");
            Console.WriteLine($"  Reason: {message.DeadLetterReason}");
            Console.WriteLine($"  Error: {message.DeadLetterErrorDescription}");
            Console.WriteLine($"  Delivery count: {message.DeliveryCount}");
            Console.WriteLine($"  Body: {message.Body}");

            // Option 1: Fix and resubmit to the main queue
            var sender = _client.CreateSender(queueName);
            var newMessage = new ServiceBusMessage(message.Body)
            {
                ContentType = message.ContentType,
                Subject = message.Subject,
                ApplicationProperties = { ["resubmitted"] = true }
            };
            await sender.SendMessageAsync(newMessage, ct);
            await receiver.CompleteMessageAsync(message, ct);

            // Option 2: Log and discard
            // await receiver.CompleteMessageAsync(message, ct);
        }
    }
}
```

### Topic/Subscription with Filters

```csharp
// Sending to a topic
public class PipelineEventPublisher : IAsyncDisposable
{
    private readonly ServiceBusClient _client;
    private readonly ServiceBusSender _sender;

    public PipelineEventPublisher(string fullyQualifiedNamespace)
    {
        _client = new ServiceBusClient(fullyQualifiedNamespace, new DefaultAzureCredential());
        _sender = _client.CreateSender("pipeline-events"); // topic name
    }

    public async Task PublishAsync(PipelineEvent evt, CancellationToken ct)
    {
        var message = new ServiceBusMessage(JsonSerializer.Serialize(evt))
        {
            ContentType = "application/json",
            Subject = evt.EventType,
            ApplicationProperties =
            {
                ["EventType"] = evt.EventType,
                ["ProjectId"] = evt.ProjectId,
                ["Severity"] = evt.Severity
            }
        };

        await _sender.SendMessageAsync(message, ct);
    }

    public async ValueTask DisposeAsync()
    {
        await _sender.DisposeAsync();
        await _client.DisposeAsync();
    }
}

public record PipelineEvent(
    string EventType,    // "PipelineCompleted", "PipelineFailed", "DataQualityAlert"
    string ProjectId,
    string Severity,     // "Info", "Warning", "Error"
    string Message,
    DateTimeOffset Timestamp
);
```

```bash
# Create subscription with SQL filter — only receive errors
az servicebus topic subscription create \
    --resource-group bnbuilders-rg \
    --namespace-name bnbuilders-sb \
    --topic-name pipeline-events \
    --name error-alerts \
    --default-message-time-to-live P7D

az servicebus topic subscription rule create \
    --resource-group bnbuilders-rg \
    --namespace-name bnbuilders-sb \
    --topic-name pipeline-events \
    --subscription-name error-alerts \
    --name ErrorFilter \
    --filter-sql-expression "Severity = 'Error'"

# Create subscription for a specific project
az servicebus topic subscription rule create \
    --resource-group bnbuilders-rg \
    --namespace-name bnbuilders-sb \
    --topic-name pipeline-events \
    --subscription-name project-101-events \
    --name ProjectFilter \
    --filter-sql-expression "ProjectId = '2026-101'"
```

## Common Patterns

### Idempotent Message Processing

```csharp
// Messages may be delivered more than once — processing must be idempotent
public class IdempotentProcessor
{
    private readonly IDbConnection _db;

    public async Task ProcessAsync(ServiceBusReceivedMessage message)
    {
        // Use MessageId as idempotency key
        var messageId = message.MessageId;

        // Check if already processed
        var exists = await _db.ExecuteScalarAsync<bool>(
            "SELECT COUNT(1) FROM ProcessedMessages WHERE MessageId = @MessageId",
            new { MessageId = messageId });

        if (exists)
        {
            // Already processed — skip
            return;
        }

        // Process the message...
        var budget = JsonSerializer.Deserialize<BudgetUpdateMessage>(message.Body.ToString());

        // Record that we processed it (in the same transaction as the business logic)
        await _db.ExecuteAsync(
            "INSERT INTO ProcessedMessages (MessageId, ProcessedAt) VALUES (@MessageId, @Now)",
            new { MessageId = messageId, Now = DateTime.UtcNow });
    }
}
```

### Message Sessions for Ordered Processing

Sessions guarantee FIFO ordering for messages with the same session ID:

```csharp
// Sender — set SessionId to group related messages
var message = new ServiceBusMessage(json)
{
    SessionId = projectId, // All messages for this project are ordered
    Subject = "BudgetUpdate"
};

// Receiver — use session processor
var processor = client.CreateSessionProcessor(queueName, new ServiceBusSessionProcessorOptions
{
    MaxConcurrentSessions = 5,
    AutoCompleteMessages = false
});
```

## Gotchas and Pitfalls

1. **Message size limit** — Standard tier: 256 KB. If your data is larger, store it in Blob
   Storage and send a reference (claim-check pattern).

2. **Lock duration** — Default 30 seconds. If your processing takes longer, the lock expires
   and another receiver picks up the message, causing duplicate processing. Set
   `MaxAutoLockRenewalDuration` appropriately.

3. **Poison messages** — A message that always fails causes an infinite retry loop. Set
   `MaxDeliveryCount` on the queue (default 10) so messages dead-letter after N failures.

4. **Dispose pattern** — `ServiceBusClient`, `ServiceBusSender`, and `ServiceBusProcessor`
   all implement `IAsyncDisposable`. Not disposing them leaks AMQP connections.

5. **Connection string vs RBAC** — Connection strings with `SharedAccessKey` are powerful
   but hard to rotate. Prefer `DefaultAzureCredential` with RBAC roles:
   - Send: "Azure Service Bus Data Sender"
   - Receive: "Azure Service Bus Data Receiver"

6. **Topic subscriptions without filters** — A subscription with no filter receives ALL
   messages on the topic. This may not be what you want — always add explicit filters.

7. **Duplicate detection** — Enable it on the queue with a time window. Service Bus
   de-duplicates based on `MessageId` within that window. But you must set unique
   `MessageId` values — the default is a new GUID per message.

8. **Auto-complete pitfall** — If `AutoCompleteMessages` is true (default), messages are
   completed even if your handler throws. Set it to `false` and complete manually.

## Performance Considerations

- **Batching sends** — `CreateMessageBatchAsync` groups messages into a single AMQP transfer.
  Significantly faster than individual sends for bulk operations.

- **Prefetch** — Set `PrefetchCount` to buffer messages locally. Reduces round trips for
  steady-stream processing. Start with `2 * MaxConcurrentCalls`.

- **Max concurrent calls** — Tune `MaxConcurrentCalls` based on your processing capacity.
  If each message triggers a database write, limit to your connection pool size.

- **Premium tier** — For sustained high throughput (> 1000 messages/second), Premium tier
  provides dedicated resources and predictable performance.

- **Message body format** — Use compact serialization (JSON without indentation, or
  protobuf) to stay within size limits and reduce network transfer time.

## BNBuilders Context

### Architecture with Service Bus

```
Sage Sync Pipeline          Service Bus                 Consumers
─────────────────          ─────────────               ─────────
Budget changes ──► Queue: budget-updates ──► Budget Processor (Azure Function)
                                              └── Updates Azure SQL

Pipeline events ──► Topic: pipeline-events
                    ├── Sub: error-alerts ──► Alert Function → Teams notification
                    ├── Sub: audit-log ──► Audit Logger → Blob Storage
                    └── Sub: powerbi-refresh ──► Refresh Trigger → Power BI API

File uploads ──► Queue: file-processing ──► File Processor
                                             └── Validates, transforms, loads
```

### When to Use Service Bus vs Direct Calls

| Scenario | Approach | Reason |
|----------|----------|--------|
| Sage sync updates budget → update SQL | Service Bus queue | Decouples sync speed from SQL write speed |
| Pipeline fails → send Teams alert | Service Bus topic | Multiple consumers (alert + audit) |
| API call to get project data | Direct HTTP call | Need immediate response |
| Upload file → process it | Service Bus queue | Handles spikes without overloading |
| Power BI refresh after pipeline | Service Bus topic | Decouple pipeline from BI |

## Interview / Senior Dev Questions

1. **Q: When would you choose a Queue over a Topic?**
   A: Use a Queue when only one consumer should process each message (task distribution).
   Use a Topic when multiple consumers need to react to the same event. For example, a
   budget update triggers both a database write (queue pattern) and a notification
   (topic/subscription pattern).

2. **Q: What is the dead-letter queue and why is it important?**
   A: The dead-letter queue (DLQ) holds messages that could not be processed after the
   maximum delivery count. It prevents poison messages from blocking the main queue. You
   should monitor the DLQ and have a process to inspect, fix, and resubmit dead-lettered
   messages.

3. **Q: How do you ensure a message is processed exactly once?**
   A: Service Bus guarantees at-least-once delivery. For exactly-once semantics, you need
   idempotent processing: record the `MessageId` in your database within the same
   transaction as the business operation, and skip messages already recorded.

4. **Q: Explain the claim-check pattern.**
   A: When the message payload exceeds the size limit (256 KB standard), store the full
   data in Blob Storage and send a message containing only the blob reference (URI).
   The receiver downloads the data from Blob Storage. This is common when sending large
   CSV exports or documents through the pipeline.

## Quiz

**Question 1:** What is the main difference between a Service Bus Queue and a Topic?

a) Queues are faster than Topics
b) A Queue delivers to one receiver; a Topic delivers to multiple subscriptions
c) Topics support larger messages
d) Queues are only available in Premium tier

<details>
<summary>Answer</summary>

**b) A Queue delivers to one receiver; a Topic delivers to multiple subscriptions.** Queues
implement point-to-point messaging (one message, one consumer). Topics implement
publish-subscribe (one message, many subscribers). Each subscription gets its own copy.

</details>

**Question 2:** What happens when you set `AutoCompleteMessages = false` and do NOT call
`CompleteMessageAsync`?

a) The message is deleted after the lock expires
b) The message becomes visible again after the lock expires and is redelivered
c) The message is dead-lettered immediately
d) The application crashes

<details>
<summary>Answer</summary>

**b) The message becomes visible again after the lock expires.** With manual completion, you
must explicitly call `CompleteMessageAsync` to remove the message. If you do not, the lock
expires and the message returns to the queue for another delivery attempt.

</details>

**Question 3:** Your message handler sometimes takes 2 minutes to process a message, but
the lock duration is 30 seconds. What should you do?

a) Increase the queue's lock duration to 5 minutes
b) Set `MaxAutoLockRenewalDuration` to a value longer than your processing time
c) Use `AutoCompleteMessages = true` to avoid lock issues
d) Ignore it — Service Bus handles this automatically

<details>
<summary>Answer</summary>

**b) Set `MaxAutoLockRenewalDuration` to a value longer than your processing time.** The
SDK automatically renews the lock in the background as long as `MaxAutoLockRenewalDuration`
has not been reached. Setting it to 5-10 minutes covers most processing scenarios without
changing the queue's global lock duration.

</details>

**Question 4:** How do you prevent duplicate message processing?

a) Service Bus guarantees exactly-once delivery automatically
b) Set unique `MessageId` values and enable duplicate detection on the queue
c) Use `PeekLock` receive mode
d) Process messages in a single thread

<details>
<summary>Answer</summary>

**b) Set unique `MessageId` values and enable duplicate detection.** Duplicate detection
prevents the same message from being enqueued twice within a time window. However, for
end-to-end exactly-once processing, you also need idempotent handlers that track processed
`MessageId` values in your database.

</details>
