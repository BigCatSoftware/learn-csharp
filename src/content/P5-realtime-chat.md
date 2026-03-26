# Project 5: Real-Time Chat Application

*Difficulty: Medium-Hard | Estimated: 5-7 days | Category: Web Development*

---

## Project Overview

Build a real-time chat application using ASP.NET Core and SignalR. Users can create and join chat rooms, send direct messages to other users, see who is online, and search through message history. The frontend uses Razor Pages with vanilla JavaScript (no framework) and Bootstrap for responsive styling.

This project exercises your ASP.NET Core skills across the full stack: SignalR for real-time WebSocket communication, ASP.NET Core Identity for authentication, Entity Framework Core for persistence, and Razor Pages for server-rendered UI. You will learn how to manage connection state, broadcast events to specific groups, handle reconnection, and persist messages for history and search.

The application should feel like a lightweight Slack or Discord clone: multiple channels in a sidebar, a message pane with infinite scroll, presence indicators, typing indicators, read receipts, and the ability to attach files to messages.

---

## Learning Objectives

- Configure and use SignalR hubs for bidirectional real-time communication
- Manage user connections, groups, and presence tracking with SignalR
- Implement ASP.NET Core Identity with cookie authentication
- Build responsive Razor Pages UI with Bootstrap
- Persist chat messages in SQL Server using EF Core
- Implement full-text search on message content
- Handle file uploads and serve attachments securely
- Build typing indicators and read receipts using SignalR events
- Structure a multi-project ASP.NET Core solution
- Write integration tests for SignalR hubs

---

## Prerequisites

| Lesson | Topic |
|--------|-------|
| 180 | ASP.NET Core Fundamentals |
| 186 | Razor Pages |
| 183 | Views and Razor Syntax |
| 190 | Authentication and Authorization |
| 191 | Dependency Injection |
| 21 | Entity Framework Core |
| 07 | Async/Await |

---

## Architecture

```
Chat.sln
|
+-- src/
|   +-- Chat.Core/                    # Domain models and interfaces
|   |   +-- Models/
|   |   |   +-- ChatRoom.cs
|   |   |   +-- Message.cs
|   |   |   +-- DirectMessage.cs
|   |   |   +-- FileAttachment.cs
|   |   |   +-- UserPresence.cs
|   |   +-- Interfaces/
|   |   |   +-- IChatRoomService.cs
|   |   |   +-- IMessageService.cs
|   |   |   +-- IPresenceService.cs
|   |   |   +-- IFileStorageService.cs
|   |   +-- Chat.Core.csproj
|   |
|   +-- Chat.Data/                    # EF Core DbContext and repositories
|   |   +-- ChatDbContext.cs
|   |   +-- Migrations/
|   |   +-- Repositories/
|   |   |   +-- ChatRoomRepository.cs
|   |   |   +-- MessageRepository.cs
|   |   +-- Chat.Data.csproj
|   |
|   +-- Chat.Web/                     # ASP.NET Core app with SignalR
|       +-- Hubs/
|       |   +-- ChatHub.cs
|       +-- Pages/
|       |   +-- Index.cshtml / .cs
|       |   +-- Chat.cshtml / .cs
|       |   +-- Account/
|       |       +-- Login.cshtml / .cs
|       |       +-- Register.cshtml / .cs
|       +-- Services/
|       |   +-- ChatRoomService.cs
|       |   +-- MessageService.cs
|       |   +-- PresenceTracker.cs
|       |   +-- LocalFileStorageService.cs
|       +-- wwwroot/
|       |   +-- js/
|       |   |   +-- chat.js
|       |   +-- css/
|       |   |   +-- site.css
|       |   +-- uploads/
|       +-- Program.cs
|       +-- Chat.Web.csproj
|
+-- tests/
    +-- Chat.Tests/
        +-- Hubs/
        |   +-- ChatHubTests.cs
        +-- Services/
        |   +-- MessageServiceTests.cs
        |   +-- PresenceTrackerTests.cs
        +-- Chat.Tests.csproj
```

---

## Requirements

### Core Requirements

1. **Authentication**: Users must register and log in before chatting. Use ASP.NET Core Identity with cookie auth. Display the current user's name in the header.
2. **Chat Rooms**: Users can create rooms, join existing rooms, and leave rooms. A sidebar lists all available rooms with unread message counts.
3. **Real-Time Messaging**: Messages sent in a room appear instantly for all room members via SignalR. Messages display sender name, timestamp, and content.
4. **Message History**: Messages persist to SQL Server. When joining a room, the last 50 messages load from the database. Scrolling up loads older messages (infinite scroll).
5. **User Presence**: Show online/offline indicators next to usernames. Track presence via SignalR connection events.

### Extended Requirements

6. **Direct Messages**: Users can open a private DM conversation with any online user. DMs appear in a separate section of the sidebar.
7. **Typing Indicators**: When a user is typing, other room members see "User is typing..." below the message list.
8. **Message Search**: A search bar filters messages across all rooms the user belongs to, with results linking back to the message in context.
9. **File Attachments**: Users can attach images or documents to messages. Files upload to a local folder and are served via a controller endpoint.

### Stretch Requirements

10. **Read Receipts**: Show checkmarks or "Seen by N" indicators on messages.
11. **Away Status**: Automatically set users to "away" after 5 minutes of inactivity, using a client-side heartbeat.
12. **Responsive Design**: The UI works well on mobile with a collapsible sidebar.

---

## Technical Guidance

### SignalR Hub Design

Your `ChatHub` will be the central piece. Key decisions:

- Use `Groups` to manage chat rooms. When a user joins a room, call `Groups.AddToGroupAsync`. When they send a message, broadcast to the group via `Clients.Group(roomName)`.
- The `OnConnectedAsync` and `OnDisconnectedAsync` overrides are where you track presence. Store the mapping of `ConnectionId -> UserId` in a concurrent dictionary or a dedicated `PresenceTracker` service registered as a singleton.
- For typing indicators, create a hub method like `SendTyping(string roomId)` that broadcasts to the group *except* the caller using `Clients.OthersInGroup`.
- For DMs, you can either use SignalR groups (create a group named after the two user IDs sorted) or use `Clients.User(userId)` which routes to all connections for that user.

### Identity Setup

- Use `AddDefaultIdentity<IdentityUser>()` with `AddEntityFrameworkStores<ChatDbContext>()`.
- The `ChatDbContext` should inherit from `IdentityDbContext` so Identity tables and chat tables live in the same database.
- Configure cookie auth to redirect to `/Account/Login` for unauthenticated requests.

### Message Persistence

- Save messages asynchronously after broadcasting. The user sees the message instantly via SignalR; the save happens in the background. Consider using `IHostedService` or just fire-and-forget with proper error logging.
- For search, use SQL Server's `LIKE` with parameterized queries or, for better performance, consider a full-text index on the `Content` column.

### Client-Side JavaScript

- Use the `@microsoft/signalr` npm package or reference it from a CDN. No bundler needed; just a `<script>` tag.
- The connection setup: `new signalR.HubConnectionBuilder().withUrl("/chatHub").withAutomaticReconnect().build()`.
- Handle reconnection gracefully: on reconnect, rejoin all groups and reload recent messages.

### File Uploads

- Use `IFormFile` in a Razor Page handler or a dedicated controller. Limit file size in configuration.
- Store files in `wwwroot/uploads/` with a GUID filename to avoid collisions. Save the original filename in the database.
- Serve files via a controller that checks authorization before returning the file.

---

## Step-by-Step Milestones

### Milestone 1: Solution Setup and Identity (Day 1)

Create the solution structure with all three projects. Set up `ChatDbContext` inheriting from `IdentityDbContext`. Configure Identity in `Program.cs`. Create the Register and Login Razor Pages. Verify you can register a user and log in. Run migrations to create the database.

### Milestone 2: Chat Room CRUD and UI Shell (Day 1-2)

Create the `ChatRoom` and `Message` EF models. Build the main Chat Razor Page with a Bootstrap layout: sidebar for rooms, main content area for messages. Implement room creation (a simple form or modal) and room listing. No real-time features yet; just server-rendered pages.

### Milestone 3: SignalR Hub and Real-Time Messages (Day 2-3)

Create `ChatHub` with `JoinRoom`, `LeaveRoom`, and `SendMessage` methods. Wire up the JavaScript client to connect to the hub, join a room when clicked in the sidebar, and send/receive messages. Messages should appear instantly for all users in the room. Persist messages to SQL Server on send.

### Milestone 4: Message History and Infinite Scroll (Day 3-4)

Add an API endpoint or Razor Page handler that returns older messages as JSON. On the client, detect when the user scrolls to the top and fetch the next page of messages. Display a loading indicator while fetching.

### Milestone 5: Presence Tracking (Day 4)

Implement `PresenceTracker` as a singleton service with a `ConcurrentDictionary<string, HashSet<string>>` mapping user IDs to connection IDs. Update presence on connect/disconnect. Broadcast presence changes to all clients. Display green/gray dots next to usernames in the sidebar.

### Milestone 6: Direct Messages and Typing Indicators (Day 5)

Add the `DirectMessage` model and DM UI section in the sidebar. Implement DM sending via SignalR using `Clients.User()`. Add typing indicator logic: debounce keystrokes on the client, send a `Typing` event, and display/hide the indicator with a timeout.

### Milestone 7: Search and File Attachments (Day 5-6)

Add a search bar that queries messages via an API endpoint. Display results in a dropdown or dedicated panel. Implement file upload on the message form, store files locally, and display image previews or download links inline in messages.

### Milestone 8: Polish, Read Receipts, and Testing (Day 6-7)

Add read receipt tracking (store last-read message ID per user per room). Write integration tests for the hub using a test server. Write unit tests for services. Polish the UI: responsive layout, error handling, reconnection feedback.

---

## Testing Requirements

### Unit Tests

- **PresenceTracker**: Test adding/removing connections, handling multiple connections per user, and correctly reporting online/offline status.
- **MessageService**: Test message creation, retrieval with pagination, and search filtering.
- **ChatRoomService**: Test room creation, joining, leaving, and listing rooms for a user.

### Integration Tests

- **ChatHub**: Use `WebApplicationFactory` and the SignalR test client to verify:
  - Connecting and joining a room adds the connection to the group
  - Sending a message broadcasts to group members
  - Disconnecting updates presence
  - Messages persist to the database
- **File Upload**: Test uploading a file and retrieving it via the download endpoint.

### Manual Testing Checklist

- [ ] Open two browser windows, log in as different users, and chat in real-time
- [ ] Verify messages persist after page refresh
- [ ] Test presence: close one tab and verify the user shows as offline
- [ ] Search for a message and verify results
- [ ] Upload an image and verify it displays inline
- [ ] Test on mobile viewport for responsive layout

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### Chat.Core/Models/ChatRoom.cs

```csharp
namespace Chat.Core.Models;

public class ChatRoom
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ChatRoomMember> Members { get; set; } = new List<ChatRoomMember>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}

public class ChatRoomMember
{
    public int Id { get; set; }
    public int ChatRoomId { get; set; }
    public string UserId { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public int? LastReadMessageId { get; set; }

    public ChatRoom ChatRoom { get; set; } = null!;
}
```

### Chat.Core/Models/Message.cs

```csharp
namespace Chat.Core.Models;

public class Message
{
    public int Id { get; set; }
    public int ChatRoomId { get; set; }
    public string SenderId { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public string? AttachmentUrl { get; set; }
    public string? AttachmentFileName { get; set; }

    public ChatRoom ChatRoom { get; set; } = null!;
}

public class DirectMessage
{
    public int Id { get; set; }
    public string SenderId { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string RecipientId { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public bool IsRead { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentFileName { get; set; }
}
```

### Chat.Core/Interfaces/IChatRoomService.cs

```csharp
namespace Chat.Core.Interfaces;

using Chat.Core.Models;

public interface IChatRoomService
{
    Task<ChatRoom> CreateRoomAsync(string name, string description, string userId);
    Task<IReadOnlyList<ChatRoom>> GetAllRoomsAsync();
    Task<IReadOnlyList<ChatRoom>> GetUserRoomsAsync(string userId);
    Task<ChatRoom?> GetRoomAsync(int roomId);
    Task JoinRoomAsync(int roomId, string userId);
    Task LeaveRoomAsync(int roomId, string userId);
    Task<bool> IsMemberAsync(int roomId, string userId);
}

public interface IMessageService
{
    Task<Message> SaveMessageAsync(int roomId, string senderId, string senderName,
        string content, string? attachmentUrl = null, string? attachmentFileName = null);
    Task<IReadOnlyList<Message>> GetMessagesAsync(int roomId, int take = 50, int? beforeId = null);
    Task<IReadOnlyList<Message>> SearchMessagesAsync(string userId, string query);
    Task<DirectMessage> SaveDirectMessageAsync(string senderId, string senderName,
        string recipientId, string content);
    Task<IReadOnlyList<DirectMessage>> GetDirectMessagesAsync(
        string userId1, string userId2, int take = 50, int? beforeId = null);
    Task MarkDirectMessagesReadAsync(string recipientId, string senderId);
    Task UpdateLastReadAsync(int roomId, string userId, int messageId);
}

public interface IPresenceService
{
    Task<bool> UserConnectedAsync(string userId, string connectionId);
    Task<bool> UserDisconnectedAsync(string userId, string connectionId);
    Task<IReadOnlyList<string>> GetOnlineUsersAsync();
    Task<bool> IsOnlineAsync(string userId);
    Task<string[]> GetConnectionsForUserAsync(string userId);
}

public interface IFileStorageService
{
    Task<(string url, string fileName)> SaveFileAsync(Stream stream, string originalFileName);
    string GetFilePath(string url);
}
```

### Chat.Data/ChatDbContext.cs

```csharp
using Chat.Core.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Chat.Data;

public class ChatDbContext : IdentityDbContext<IdentityUser>
{
    public ChatDbContext(DbContextOptions<ChatDbContext> options) : base(options) { }

    public DbSet<ChatRoom> ChatRooms => Set<ChatRoom>();
    public DbSet<ChatRoomMember> ChatRoomMembers => Set<ChatRoomMember>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<DirectMessage> DirectMessages => Set<DirectMessage>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ChatRoom>(e =>
        {
            e.HasKey(r => r.Id);
            e.Property(r => r.Name).HasMaxLength(100).IsRequired();
            e.Property(r => r.Description).HasMaxLength(500);
            e.HasIndex(r => r.Name).IsUnique();
        });

        builder.Entity<ChatRoomMember>(e =>
        {
            e.HasKey(m => m.Id);
            e.HasIndex(m => new { m.ChatRoomId, m.UserId }).IsUnique();
            e.HasOne(m => m.ChatRoom)
                .WithMany(r => r.Members)
                .HasForeignKey(m => m.ChatRoomId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Message>(e =>
        {
            e.HasKey(m => m.Id);
            e.Property(m => m.Content).HasMaxLength(4000).IsRequired();
            e.Property(m => m.SenderName).HasMaxLength(256);
            e.HasIndex(m => m.SentAt);
            e.HasIndex(m => new { m.ChatRoomId, m.SentAt });
            e.HasOne(m => m.ChatRoom)
                .WithMany(r => r.Messages)
                .HasForeignKey(m => m.ChatRoomId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<DirectMessage>(e =>
        {
            e.HasKey(m => m.Id);
            e.Property(m => m.Content).HasMaxLength(4000).IsRequired();
            e.HasIndex(m => new { m.SenderId, m.RecipientId, m.SentAt });
        });
    }
}
```

### Chat.Web/Services/PresenceTracker.cs

```csharp
using Chat.Core.Interfaces;
using System.Collections.Concurrent;

namespace Chat.Web.Services;

public class PresenceTracker : IPresenceService
{
    private readonly ConcurrentDictionary<string, HashSet<string>> _onlineUsers = new();
    private readonly SemaphoreSlim _lock = new(1, 1);

    public Task<bool> UserConnectedAsync(string userId, string connectionId)
    {
        bool isNewUser = false;

        _onlineUsers.AddOrUpdate(
            userId,
            _ =>
            {
                isNewUser = true;
                return new HashSet<string> { connectionId };
            },
            (_, connections) =>
            {
                lock (connections)
                {
                    connections.Add(connectionId);
                }
                return connections;
            });

        return Task.FromResult(isNewUser);
    }

    public Task<bool> UserDisconnectedAsync(string userId, string connectionId)
    {
        if (!_onlineUsers.TryGetValue(userId, out var connections))
            return Task.FromResult(false);

        lock (connections)
        {
            connections.Remove(connectionId);

            if (connections.Count == 0)
            {
                _onlineUsers.TryRemove(userId, out _);
                return Task.FromResult(true);
            }
        }

        return Task.FromResult(false);
    }

    public Task<IReadOnlyList<string>> GetOnlineUsersAsync()
    {
        IReadOnlyList<string> users = _onlineUsers.Keys.ToList();
        return Task.FromResult(users);
    }

    public Task<bool> IsOnlineAsync(string userId)
    {
        return Task.FromResult(_onlineUsers.ContainsKey(userId));
    }

    public Task<string[]> GetConnectionsForUserAsync(string userId)
    {
        if (_onlineUsers.TryGetValue(userId, out var connections))
        {
            lock (connections)
            {
                return Task.FromResult(connections.ToArray());
            }
        }

        return Task.FromResult(Array.Empty<string>());
    }
}
```

### Chat.Web/Services/ChatRoomService.cs

```csharp
using Chat.Core.Interfaces;
using Chat.Core.Models;
using Chat.Data;
using Microsoft.EntityFrameworkCore;

namespace Chat.Web.Services;

public class ChatRoomService : IChatRoomService
{
    private readonly ChatDbContext _db;

    public ChatRoomService(ChatDbContext db)
    {
        _db = db;
    }

    public async Task<ChatRoom> CreateRoomAsync(string name, string description, string userId)
    {
        var room = new ChatRoom
        {
            Name = name,
            Description = description,
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow
        };

        _db.ChatRooms.Add(room);
        await _db.SaveChangesAsync();

        // Auto-join the creator
        _db.ChatRoomMembers.Add(new ChatRoomMember
        {
            ChatRoomId = room.Id,
            UserId = userId,
            JoinedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        return room;
    }

    public async Task<IReadOnlyList<ChatRoom>> GetAllRoomsAsync()
    {
        return await _db.ChatRooms
            .OrderBy(r => r.Name)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<ChatRoom>> GetUserRoomsAsync(string userId)
    {
        return await _db.ChatRoomMembers
            .Where(m => m.UserId == userId)
            .Include(m => m.ChatRoom)
            .Select(m => m.ChatRoom)
            .OrderBy(r => r.Name)
            .ToListAsync();
    }

    public async Task<ChatRoom?> GetRoomAsync(int roomId)
    {
        return await _db.ChatRooms
            .Include(r => r.Members)
            .FirstOrDefaultAsync(r => r.Id == roomId);
    }

    public async Task JoinRoomAsync(int roomId, string userId)
    {
        bool alreadyMember = await _db.ChatRoomMembers
            .AnyAsync(m => m.ChatRoomId == roomId && m.UserId == userId);

        if (!alreadyMember)
        {
            _db.ChatRoomMembers.Add(new ChatRoomMember
            {
                ChatRoomId = roomId,
                UserId = userId,
                JoinedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }
    }

    public async Task LeaveRoomAsync(int roomId, string userId)
    {
        var member = await _db.ChatRoomMembers
            .FirstOrDefaultAsync(m => m.ChatRoomId == roomId && m.UserId == userId);

        if (member is not null)
        {
            _db.ChatRoomMembers.Remove(member);
            await _db.SaveChangesAsync();
        }
    }

    public async Task<bool> IsMemberAsync(int roomId, string userId)
    {
        return await _db.ChatRoomMembers
            .AnyAsync(m => m.ChatRoomId == roomId && m.UserId == userId);
    }
}
```

### Chat.Web/Services/MessageService.cs

```csharp
using Chat.Core.Interfaces;
using Chat.Core.Models;
using Chat.Data;
using Microsoft.EntityFrameworkCore;

namespace Chat.Web.Services;

public class MessageService : IMessageService
{
    private readonly ChatDbContext _db;

    public MessageService(ChatDbContext db)
    {
        _db = db;
    }

    public async Task<Message> SaveMessageAsync(int roomId, string senderId, string senderName,
        string content, string? attachmentUrl = null, string? attachmentFileName = null)
    {
        var message = new Message
        {
            ChatRoomId = roomId,
            SenderId = senderId,
            SenderName = senderName,
            Content = content,
            SentAt = DateTime.UtcNow,
            AttachmentUrl = attachmentUrl,
            AttachmentFileName = attachmentFileName
        };

        _db.Messages.Add(message);
        await _db.SaveChangesAsync();

        return message;
    }

    public async Task<IReadOnlyList<Message>> GetMessagesAsync(
        int roomId, int take = 50, int? beforeId = null)
    {
        var query = _db.Messages
            .Where(m => m.ChatRoomId == roomId);

        if (beforeId.HasValue)
        {
            query = query.Where(m => m.Id < beforeId.Value);
        }

        return await query
            .OrderByDescending(m => m.SentAt)
            .Take(take)
            .OrderBy(m => m.SentAt)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<Message>> SearchMessagesAsync(string userId, string searchQuery)
    {
        var userRoomIds = await _db.ChatRoomMembers
            .Where(m => m.UserId == userId)
            .Select(m => m.ChatRoomId)
            .ToListAsync();

        return await _db.Messages
            .Where(m => userRoomIds.Contains(m.ChatRoomId)
                && EF.Functions.Like(m.Content, $"%{searchQuery}%"))
            .OrderByDescending(m => m.SentAt)
            .Take(50)
            .ToListAsync();
    }

    public async Task<DirectMessage> SaveDirectMessageAsync(
        string senderId, string senderName, string recipientId, string content)
    {
        var dm = new DirectMessage
        {
            SenderId = senderId,
            SenderName = senderName,
            RecipientId = recipientId,
            Content = content,
            SentAt = DateTime.UtcNow,
            IsRead = false
        };

        _db.DirectMessages.Add(dm);
        await _db.SaveChangesAsync();

        return dm;
    }

    public async Task<IReadOnlyList<DirectMessage>> GetDirectMessagesAsync(
        string userId1, string userId2, int take = 50, int? beforeId = null)
    {
        var query = _db.DirectMessages
            .Where(m =>
                (m.SenderId == userId1 && m.RecipientId == userId2) ||
                (m.SenderId == userId2 && m.RecipientId == userId1));

        if (beforeId.HasValue)
        {
            query = query.Where(m => m.Id < beforeId.Value);
        }

        return await query
            .OrderByDescending(m => m.SentAt)
            .Take(take)
            .OrderBy(m => m.SentAt)
            .ToListAsync();
    }

    public async Task MarkDirectMessagesReadAsync(string recipientId, string senderId)
    {
        await _db.DirectMessages
            .Where(m => m.RecipientId == recipientId
                && m.SenderId == senderId
                && !m.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsRead, true));
    }

    public async Task UpdateLastReadAsync(int roomId, string userId, int messageId)
    {
        var member = await _db.ChatRoomMembers
            .FirstOrDefaultAsync(m => m.ChatRoomId == roomId && m.UserId == userId);

        if (member is not null)
        {
            member.LastReadMessageId = messageId;
            await _db.SaveChangesAsync();
        }
    }
}
```

### Chat.Web/Services/LocalFileStorageService.cs

```csharp
using Chat.Core.Interfaces;

namespace Chat.Web.Services;

public class LocalFileStorageService : IFileStorageService
{
    private readonly string _uploadPath;

    public LocalFileStorageService(IWebHostEnvironment env)
    {
        _uploadPath = Path.Combine(env.WebRootPath, "uploads");
        Directory.CreateDirectory(_uploadPath);
    }

    public async Task<(string url, string fileName)> SaveFileAsync(
        Stream stream, string originalFileName)
    {
        var extension = Path.GetExtension(originalFileName);
        var storedName = $"{Guid.NewGuid()}{extension}";
        var filePath = Path.Combine(_uploadPath, storedName);

        await using var fileStream = File.Create(filePath);
        await stream.CopyToAsync(fileStream);

        var url = $"/uploads/{storedName}";
        return (url, originalFileName);
    }

    public string GetFilePath(string url)
    {
        var fileName = Path.GetFileName(url);
        return Path.Combine(_uploadPath, fileName);
    }
}
```

### Chat.Web/Hubs/ChatHub.cs

```csharp
using Chat.Core.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace Chat.Web.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly IMessageService _messageService;
    private readonly IChatRoomService _roomService;
    private readonly IPresenceService _presenceService;
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(
        IMessageService messageService,
        IChatRoomService roomService,
        IPresenceService presenceService,
        ILogger<ChatHub> logger)
    {
        _messageService = messageService;
        _roomService = roomService;
        _presenceService = presenceService;
        _logger = logger;
    }

    private string UserId => Context.User!.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private string UserName => Context.User!.Identity!.Name!;

    public override async Task OnConnectedAsync()
    {
        var isNew = await _presenceService.UserConnectedAsync(UserId, Context.ConnectionId);

        if (isNew)
        {
            await Clients.Others.SendAsync("UserOnline", UserId, UserName);
        }

        // Rejoin all rooms the user is a member of
        var rooms = await _roomService.GetUserRoomsAsync(UserId);
        foreach (var room in rooms)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"room-{room.Id}");
        }

        // Send the current online users list to the connecting client
        var onlineUsers = await _presenceService.GetOnlineUsersAsync();
        await Clients.Caller.SendAsync("OnlineUsers", onlineUsers);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var isFullyOffline = await _presenceService.UserDisconnectedAsync(
            UserId, Context.ConnectionId);

        if (isFullyOffline)
        {
            await Clients.Others.SendAsync("UserOffline", UserId, UserName);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinRoom(int roomId)
    {
        await _roomService.JoinRoomAsync(roomId, UserId);
        await Groups.AddToGroupAsync(Context.ConnectionId, $"room-{roomId}");

        var messages = await _messageService.GetMessagesAsync(roomId);
        await Clients.Caller.SendAsync("RoomHistory", roomId, messages);

        await Clients.Group($"room-{roomId}").SendAsync(
            "UserJoinedRoom", roomId, UserId, UserName);

        _logger.LogInformation("User {User} joined room {Room}", UserName, roomId);
    }

    public async Task LeaveRoom(int roomId)
    {
        await _roomService.LeaveRoomAsync(roomId, UserId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"room-{roomId}");

        await Clients.Group($"room-{roomId}").SendAsync(
            "UserLeftRoom", roomId, UserId, UserName);
    }

    public async Task SendMessage(int roomId, string content,
        string? attachmentUrl = null, string? attachmentFileName = null)
    {
        if (string.IsNullOrWhiteSpace(content) && string.IsNullOrWhiteSpace(attachmentUrl))
            return;

        var isMember = await _roomService.IsMemberAsync(roomId, UserId);
        if (!isMember)
        {
            await Clients.Caller.SendAsync("Error", "You are not a member of this room.");
            return;
        }

        var message = await _messageService.SaveMessageAsync(
            roomId, UserId, UserName, content, attachmentUrl, attachmentFileName);

        await Clients.Group($"room-{roomId}").SendAsync("ReceiveMessage", new
        {
            message.Id,
            message.ChatRoomId,
            message.SenderId,
            message.SenderName,
            message.Content,
            message.SentAt,
            message.AttachmentUrl,
            message.AttachmentFileName
        });
    }

    public async Task SendDirectMessage(string recipientId, string content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return;

        var dm = await _messageService.SaveDirectMessageAsync(
            UserId, UserName, recipientId, content);

        var dmPayload = new
        {
            dm.Id,
            dm.SenderId,
            dm.SenderName,
            dm.RecipientId,
            dm.Content,
            dm.SentAt
        };

        // Send to recipient
        await Clients.User(recipientId).SendAsync("ReceiveDirectMessage", dmPayload);
        // Echo back to sender
        await Clients.Caller.SendAsync("ReceiveDirectMessage", dmPayload);
    }

    public async Task SendTyping(int roomId)
    {
        await Clients.OthersInGroup($"room-{roomId}").SendAsync(
            "UserTyping", roomId, UserId, UserName);
    }

    public async Task MarkRead(int roomId, int messageId)
    {
        await _messageService.UpdateLastReadAsync(roomId, UserId, messageId);
        await Clients.OthersInGroup($"room-{roomId}").SendAsync(
            "MessageRead", roomId, messageId, UserId);
    }

    public async Task LoadMoreMessages(int roomId, int beforeId)
    {
        var messages = await _messageService.GetMessagesAsync(roomId, 50, beforeId);
        await Clients.Caller.SendAsync("MoreMessages", roomId, messages);
    }
}
```

### Chat.Web/Program.cs

```csharp
using Chat.Core.Interfaces;
using Chat.Data;
using Chat.Web.Hubs;
using Chat.Web.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<ChatDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Identity
builder.Services.AddDefaultIdentity<IdentityUser>(options =>
    {
        options.Password.RequireDigit = true;
        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = false;
        options.SignIn.RequireConfirmedAccount = false;
    })
    .AddEntityFrameworkStores<ChatDbContext>();

builder.Services.ConfigureApplicationCookie(options =>
{
    options.LoginPath = "/Account/Login";
    options.LogoutPath = "/Account/Logout";
    options.Events.OnRedirectToLogin = context =>
    {
        // For SignalR, return 401 instead of redirect
        if (context.Request.Path.StartsWithSegments("/chatHub"))
        {
            context.Response.StatusCode = 401;
            return Task.CompletedTask;
        }
        context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
});

// Services
builder.Services.AddSingleton<IPresenceService, PresenceTracker>();
builder.Services.AddScoped<IChatRoomService, ChatRoomService>();
builder.Services.AddScoped<IMessageService, MessageService>();
builder.Services.AddSingleton<IFileStorageService, LocalFileStorageService>();

// SignalR
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 512 * 1024; // 512 KB
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
});

builder.Services.AddRazorPages();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapRazorPages();
app.MapHub<ChatHub>("/chatHub");

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ChatDbContext>();
    await db.Database.MigrateAsync();
}

await app.RunAsync();
```

### Chat.Web/Pages/Chat.cshtml (Razor Page with JS Client)

```html
@page
@model Chat.Web.Pages.ChatModel
@{
    ViewData["Title"] = "Chat";
}

<div class="container-fluid vh-100 d-flex flex-column p-0">
    <nav class="navbar navbar-dark bg-dark px-3">
        <span class="navbar-brand">Chat App</span>
        <div class="d-flex align-items-center">
            <span class="text-light me-3">@User.Identity!.Name</span>
            <form method="post" asp-page="/Account/Logout">
                <button class="btn btn-outline-light btn-sm">Logout</button>
            </form>
        </div>
    </nav>

    <div class="d-flex flex-grow-1 overflow-hidden">
        <!-- Sidebar -->
        <div id="sidebar" class="bg-secondary text-white p-3"
             style="width: 260px; overflow-y: auto;">
            <h6>Rooms</h6>
            <ul id="roomList" class="list-unstyled"></ul>
            <button class="btn btn-sm btn-outline-light w-100 mt-2"
                    data-bs-toggle="modal" data-bs-target="#createRoomModal">
                + New Room
            </button>
            <hr />
            <h6>Direct Messages</h6>
            <ul id="dmList" class="list-unstyled"></ul>
            <hr />
            <h6>Online Users</h6>
            <ul id="onlineList" class="list-unstyled"></ul>
        </div>

        <!-- Main chat area -->
        <div class="flex-grow-1 d-flex flex-column">
            <div id="chatHeader" class="p-3 border-bottom bg-light">
                <strong id="currentRoomName">Select a room to start chatting</strong>
                <input type="text" id="searchBox" class="form-control form-control-sm mt-1"
                       placeholder="Search messages..." style="max-width: 300px;" />
            </div>

            <div id="messageArea" class="flex-grow-1 overflow-auto p-3"
                 style="display: flex; flex-direction: column-reverse;">
                <div id="messages"></div>
            </div>

            <div id="typingIndicator" class="px-3 text-muted small" style="height: 20px;">
            </div>

            <div id="messageForm" class="p-3 border-top" style="display: none;">
                <form id="sendForm" class="d-flex gap-2">
                    <input type="file" id="fileInput" class="d-none" />
                    <button type="button" id="attachBtn"
                            class="btn btn-outline-secondary">
                        <i class="bi bi-paperclip"></i> File
                    </button>
                    <input type="text" id="messageInput"
                           class="form-control" placeholder="Type a message..."
                           autocomplete="off" />
                    <button type="submit" class="btn btn-primary">Send</button>
                </form>
                <div id="filePreview" class="mt-1 small text-muted"></div>
            </div>
        </div>
    </div>
</div>

<!-- Create Room Modal -->
<div class="modal fade" id="createRoomModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Create Room</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="text" id="newRoomName" class="form-control mb-2"
                       placeholder="Room name" />
                <input type="text" id="newRoomDesc" class="form-control"
                       placeholder="Description (optional)" />
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" id="createRoomBtn">
                    Create
                </button>
            </div>
        </div>
    </div>
</div>

@section Scripts {
<script src="https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js">
</script>
<script>
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/chatHub")
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .build();

    let currentRoomId = null;
    let typingTimeout = null;
    const onlineUsers = new Set();

    // --- Connection Lifecycle ---
    connection.onreconnecting(() => {
        document.getElementById("chatHeader").classList.add("bg-warning");
    });

    connection.onreconnected(async () => {
        document.getElementById("chatHeader").classList.remove("bg-warning");
        if (currentRoomId) {
            await connection.invoke("JoinRoom", currentRoomId);
        }
    });

    // --- Receive Handlers ---
    connection.on("ReceiveMessage", (msg) => {
        appendMessage(msg);
        if (currentRoomId === msg.chatRoomId) {
            connection.invoke("MarkRead", msg.chatRoomId, msg.id);
        }
    });

    connection.on("RoomHistory", (roomId, messages) => {
        const container = document.getElementById("messages");
        container.innerHTML = "";
        messages.forEach(m => appendMessage(m));
        scrollToBottom();
    });

    connection.on("MoreMessages", (roomId, messages) => {
        const container = document.getElementById("messages");
        messages.reverse().forEach(m => {
            container.insertAdjacentHTML("afterbegin", buildMessageHtml(m));
        });
    });

    connection.on("UserTyping", (roomId, userId, userName) => {
        if (roomId === currentRoomId) {
            const el = document.getElementById("typingIndicator");
            el.textContent = `${userName} is typing...`;
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => { el.textContent = ""; }, 3000);
        }
    });

    connection.on("UserOnline", (userId, userName) => {
        onlineUsers.add(userId);
        refreshOnlineList();
    });

    connection.on("UserOffline", (userId) => {
        onlineUsers.delete(userId);
        refreshOnlineList();
    });

    connection.on("OnlineUsers", (users) => {
        users.forEach(u => onlineUsers.add(u));
        refreshOnlineList();
    });

    connection.on("ReceiveDirectMessage", (dm) => {
        if (currentRoomId === `dm-${dm.senderId}` ||
            currentRoomId === `dm-${dm.recipientId}`) {
            appendMessage({
                senderName: dm.senderName,
                content: dm.content,
                sentAt: dm.sentAt
            });
        }
    });

    connection.on("MessageRead", (roomId, messageId, userId) => {
        const el = document.querySelector(`[data-msg-id="${messageId}"] .read-receipt`);
        if (el) el.textContent = "seen";
    });

    // --- UI Actions ---
    function appendMessage(msg) {
        document.getElementById("messages").insertAdjacentHTML("beforeend",
            buildMessageHtml(msg));
        scrollToBottom();
    }

    function buildMessageHtml(msg) {
        const time = new Date(msg.sentAt).toLocaleTimeString();
        let attachment = "";
        if (msg.attachmentUrl) {
            const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(msg.attachmentUrl);
            attachment = isImage
                ? `<br/><img src="${msg.attachmentUrl}" class="img-thumbnail mt-1"
                       style="max-width:300px" />`
                : `<br/><a href="${msg.attachmentUrl}" target="_blank">
                       ${msg.attachmentFileName || "Download"}</a>`;
        }
        return `<div class="mb-2" data-msg-id="${msg.id || ''}">
                    <strong>${msg.senderName}</strong>
                    <small class="text-muted ms-2">${time}</small>
                    <span class="read-receipt text-muted small ms-2"></span>
                    <div>${escapeHtml(msg.content)}${attachment}</div>
                </div>`;
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function scrollToBottom() {
        const area = document.getElementById("messageArea");
        area.scrollTop = area.scrollHeight;
    }

    function refreshOnlineList() {
        const list = document.getElementById("onlineList");
        list.innerHTML = "";
        onlineUsers.forEach(uid => {
            list.insertAdjacentHTML("beforeend",
                `<li class="mb-1 cursor-pointer" onclick="openDm('${uid}')">
                    <span class="text-success me-1">&#9679;</span>${uid}
                 </li>`);
        });
    }

    async function joinRoom(roomId, roomName) {
        currentRoomId = roomId;
        document.getElementById("currentRoomName").textContent = roomName;
        document.getElementById("messageForm").style.display = "block";
        document.getElementById("messages").innerHTML = "";
        await connection.invoke("JoinRoom", roomId);
    }

    async function openDm(userId) {
        currentRoomId = `dm-${userId}`;
        document.getElementById("currentRoomName").textContent = `DM: ${userId}`;
        document.getElementById("messageForm").style.display = "block";
        document.getElementById("messages").innerHTML = "";
    }

    // --- Form Handlers ---
    document.getElementById("sendForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("messageInput");
        const content = input.value.trim();
        if (!content && !pendingFile) return;

        if (typeof currentRoomId === "number") {
            await connection.invoke("SendMessage", currentRoomId, content, null, null);
        } else if (typeof currentRoomId === "string" &&
                   currentRoomId.startsWith("dm-")) {
            const recipientId = currentRoomId.substring(3);
            await connection.invoke("SendDirectMessage", recipientId, content);
        }
        input.value = "";
    });

    document.getElementById("messageInput").addEventListener("input", () => {
        if (typeof currentRoomId === "number") {
            connection.invoke("SendTyping", currentRoomId);
        }
    });

    document.getElementById("createRoomBtn").addEventListener("click", async () => {
        const name = document.getElementById("newRoomName").value.trim();
        const desc = document.getElementById("newRoomDesc").value.trim();
        if (!name) return;
        const response = await fetch("/Chat?handler=CreateRoom", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "RequestVerificationToken":
                    document.querySelector('input[name="__RequestVerificationToken"]').value
            },
            body: JSON.stringify({ name, description: desc })
        });
        if (response.ok) {
            location.reload();
        }
    });

    // Infinite scroll
    document.getElementById("messageArea").addEventListener("scroll", async function () {
        if (this.scrollTop === 0 && typeof currentRoomId === "number") {
            const firstMsg = document.querySelector("#messages [data-msg-id]");
            if (firstMsg) {
                const firstId = parseInt(firstMsg.dataset.msgId);
                await connection.invoke("LoadMoreMessages", currentRoomId, firstId);
            }
        }
    });

    // Search
    let searchTimeout;
    document.getElementById("searchBox").addEventListener("input", function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const query = this.value.trim();
            if (query.length < 3) return;
            const response = await fetch(`/Chat?handler=Search&q=${
                encodeURIComponent(query)}`);
            if (response.ok) {
                const results = await response.json();
                const container = document.getElementById("messages");
                container.innerHTML = "<h6>Search Results</h6>";
                results.forEach(m => appendMessage(m));
            }
        }, 500);
    });

    // --- Start ---
    connection.start().catch(err => console.error(err));

    // Load rooms on page load
    fetch("/Chat?handler=Rooms")
        .then(r => r.json())
        .then(rooms => {
            const list = document.getElementById("roomList");
            rooms.forEach(room => {
                list.insertAdjacentHTML("beforeend",
                    `<li class="mb-1 cursor-pointer p-1 rounded hover-bg"
                         onclick="joinRoom(${room.id}, '${room.name}')">
                        # ${room.name}
                    </li>`);
            });
        });
</script>
}
```

### Chat.Web/Pages/Chat.cshtml.cs

```csharp
using Chat.Core.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Security.Claims;

namespace Chat.Web.Pages;

[Authorize]
public class ChatModel : PageModel
{
    private readonly IChatRoomService _roomService;
    private readonly IMessageService _messageService;
    private readonly IFileStorageService _fileStorage;

    public ChatModel(
        IChatRoomService roomService,
        IMessageService messageService,
        IFileStorageService fileStorage)
    {
        _roomService = roomService;
        _messageService = messageService;
        _fileStorage = fileStorage;
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    public void OnGet() { }

    public async Task<IActionResult> OnGetRoomsAsync()
    {
        var rooms = await _roomService.GetAllRoomsAsync();
        return new JsonResult(rooms.Select(r => new { r.Id, r.Name, r.Description }));
    }

    public async Task<IActionResult> OnGetSearchAsync(string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 3)
            return new JsonResult(Array.Empty<object>());

        var results = await _messageService.SearchMessagesAsync(UserId, q);
        return new JsonResult(results.Select(m => new
        {
            m.Id, m.SenderName, m.Content, m.SentAt, m.ChatRoomId
        }));
    }

    public async Task<IActionResult> OnPostCreateRoomAsync([FromBody] CreateRoomRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest();

        var room = await _roomService.CreateRoomAsync(request.Name, request.Description ?? "", UserId);
        return new JsonResult(new { room.Id, room.Name });
    }

    public async Task<IActionResult> OnPostUploadAsync(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest();

        if (file.Length > 10 * 1024 * 1024) // 10 MB limit
            return BadRequest("File too large.");

        await using var stream = file.OpenReadStream();
        var (url, fileName) = await _fileStorage.SaveFileAsync(stream, file.FileName);

        return new JsonResult(new { url, fileName });
    }

    public record CreateRoomRequest(string Name, string? Description);
}
```

</details>

---

## What to Show Off

### Portfolio Presentation

- Demo the app with two browser windows side by side showing real-time messages appearing instantly. This is the "wow factor" moment.
- Show the architecture diagram: how SignalR manages WebSocket connections, how messages flow from client to hub to database and back out to other clients.
- Walk through the presence tracking system: how you handle multiple tabs, reconnection, and graceful degradation.

### Interview Talking Points

- **Real-time architecture**: Explain the difference between polling, long-polling, Server-Sent Events, and WebSockets, and why SignalR abstracts over these.
- **Concurrency**: Discuss how `PresenceTracker` uses `ConcurrentDictionary` and why a singleton service with thread-safe collections is appropriate for tracking connections.
- **Scalability**: Discuss what would need to change for multiple server instances (Redis backplane for SignalR, distributed presence via Redis, file storage in blob storage).
- **Security**: Explain how you prevent unauthorized access to rooms, sanitize message content to prevent XSS, and validate file uploads.

---

## Stretch Goals

1. **Redis Backplane**: Add `Microsoft.AspNetCore.SignalR.StackExchangeRedis` so the app scales horizontally across multiple server instances. Move presence tracking to Redis.
2. **Message Reactions**: Let users react to messages with emoji. Store reactions in a separate table and broadcast reaction events via SignalR.
3. **Markdown Rendering**: Parse message content as Markdown on the client using a library like `marked.js`. Support code blocks, bold, italic, and links.
4. **Push Notifications**: Integrate browser push notifications for messages received while the tab is in the background, using the Notifications API.
5. **Message Editing and Deletion**: Allow users to edit or delete their own messages within a time window. Broadcast the edit/delete event so all clients update in real-time.
