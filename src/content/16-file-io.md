# File I/O

*Reading and writing files in C#*

C# provides comprehensive APIs for working with files and the filesystem through the `System.IO` namespace.

## Reading Files

```csharp
// Read entire file at once
string content = File.ReadAllText("data.txt");
string[] lines = File.ReadAllLines("data.txt");
byte[] bytes = File.ReadAllBytes("image.png");

// Async versions (preferred)
string content = await File.ReadAllTextAsync("data.txt");
string[] lines = await File.ReadAllLinesAsync("data.txt");

// Read line by line (memory efficient for large files)
await foreach (var line in File.ReadLinesAsync("large-file.txt"))
{
    ProcessLine(line);
}
```

## Writing Files

```csharp
// Write entire file
File.WriteAllText("output.txt", "Hello, World!");
File.WriteAllLines("output.txt", new[] { "Line 1", "Line 2" });
await File.WriteAllTextAsync("output.txt", content);

// Append to file
File.AppendAllText("log.txt", $"{DateTime.Now}: Event occurred\n");
await File.AppendAllTextAsync("log.txt", message);
```

## StreamReader and StreamWriter

For more control and better memory usage:

```csharp
// Reading with StreamReader
using var reader = new StreamReader("data.txt", Encoding.UTF8);
while (await reader.ReadLineAsync() is string line)
{
    Console.WriteLine(line);
}

// Writing with StreamWriter
using var writer = new StreamWriter("output.txt", append: false, Encoding.UTF8);
await writer.WriteLineAsync("First line");
await writer.WriteLineAsync("Second line");
await writer.FlushAsync();
```

> **Tip:** Always use `using` statements with streams. This ensures the file handle is released promptly, even if an exception occurs.

## File and Directory Operations

```csharp
// File operations
bool exists = File.Exists("data.txt");
File.Copy("source.txt", "dest.txt", overwrite: true);
File.Move("old.txt", "new.txt");
File.Delete("temp.txt");
FileInfo info = new FileInfo("data.txt");
Console.WriteLine($"Size: {info.Length} bytes, Modified: {info.LastWriteTime}");

// Directory operations
Directory.CreateDirectory("output/reports");
bool dirExists = Directory.Exists("output");
string[] files = Directory.GetFiles(".", "*.txt");
string[] dirs = Directory.GetDirectories(".");
Directory.Delete("temp", recursive: true);
```

## Path Operations

```csharp
// Path manipulation (cross-platform safe)
string path = Path.Combine("home", "user", "documents", "file.txt");
string dir = Path.GetDirectoryName(path)!;     // "home/user/documents"
string file = Path.GetFileName(path);           // "file.txt"
string name = Path.GetFileNameWithoutExtension(path); // "file"
string ext = Path.GetExtension(path);           // ".txt"
string full = Path.GetFullPath("./data.txt");   // Absolute path
string temp = Path.GetTempPath();               // System temp directory
string tempFile = Path.GetTempFileName();       // Create temp file
```

> **Important:** Always use `Path.Combine()` instead of string concatenation for paths. It handles platform-specific path separators (/ vs \\) automatically.

## Working with JSON Files

```csharp
using System.Text.Json;

// Serialize to file
var config = new AppConfig
{
    Theme = "dark",
    FontSize = 14,
    RecentFiles = new[] { "file1.cs", "file2.cs" }
};

var options = new JsonSerializerOptions { WriteIndented = true };
string json = JsonSerializer.Serialize(config, options);
await File.WriteAllTextAsync("config.json", json);

// Deserialize from file
string jsonText = await File.ReadAllTextAsync("config.json");
var loaded = JsonSerializer.Deserialize<AppConfig>(jsonText);

// Stream-based (memory efficient for large files)
await using var stream = File.OpenRead("large-data.json");
var data = await JsonSerializer.DeserializeAsync<List<Record>>(stream);
```

## File Watching

Monitor files for changes:

```csharp
using var watcher = new FileSystemWatcher("./config")
{
    Filter = "*.json",
    NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName,
    EnableRaisingEvents = true
};

watcher.Changed += (s, e) => Console.WriteLine($"Changed: {e.FullPath}");
watcher.Created += (s, e) => Console.WriteLine($"Created: {e.FullPath}");
watcher.Deleted += (s, e) => Console.WriteLine($"Deleted: {e.FullPath}");
watcher.Renamed += (s, e) => Console.WriteLine($"Renamed: {e.OldName} → {e.Name}");

Console.ReadLine(); // Keep watching
```

> **Note:** `FileSystemWatcher` can raise duplicate events. Use a debounce mechanism (e.g., a short timer) to handle this in production code.
