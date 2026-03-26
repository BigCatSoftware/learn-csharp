# Project 9: Mini Relational Database Engine

*Difficulty: Very Hard — Estimated: 2-3 weeks — Category: Systems Programming*

---

## Project Overview

Build a working relational database engine from scratch in C#. This project takes you through the same foundational layers that power SQLite, PostgreSQL, and SQL Server — page-based storage, B-tree indexing, SQL parsing, and query execution — except you build every piece yourself.

Your engine, **MiniDB**, will store data in a single binary file using fixed 4KB pages. Rows are serialized into a binary format, indexed by B-trees for efficient lookup, and cached in memory through an LRU buffer pool. A write-ahead log (WAL) provides crash recovery guarantees. On top of the storage layer, a hand-written SQL lexer and recursive-descent parser translate a subset of SQL into an AST that a query planner and executor evaluate against the storage engine.

The finished product is an interactive REPL shell (like `sqlite3`) where you type SQL statements and dot-commands, and see real query results printed to the console — backed entirely by your own storage format and query engine.

This is the most technically demanding project in the curriculum. It touches binary I/O, tree data structures, language parsing, memory management, and systems-level thinking. The payoff is deep understanding of what happens beneath every ORM query you will ever write.

---

## Learning Objectives

By completing this project you will:

1. Implement a page-based binary file format with fixed-size pages and a free-list
2. Build a B-tree from scratch supporting insert, search, and in-order traversal
3. Serialize and deserialize structured data to/from raw byte spans
4. Design an LRU buffer pool that caches frequently accessed pages in memory
5. Implement a write-ahead log for crash-safe writes
6. Write a lexer that tokenizes SQL text into a stream of typed tokens
7. Write a recursive-descent parser that produces an abstract syntax tree
8. Build a query planner that chooses between full-table scan and index lookup
9. Execute queries by walking the AST against the storage layer
10. Integrate all layers into an interactive REPL with dot-commands

---

## Prerequisites

Before starting this project, complete these lessons:

| Lesson | Topic | Why You Need It |
|--------|-------|-----------------|
| 10 | Collections | Dictionaries, lists for metadata and buffer pool |
| 16 | File I/O | Binary file reads and writes, FileStream |
| 08 | Pattern Matching | Switch expressions in lexer/parser/executor |
| 05 | Generics | Type-safe B-tree nodes, generic page cache |
| 25 | Spans and Memory | `Span<byte>` for zero-copy page serialization |
| 36 | Unsafe Code | Pointer-based memory for page buffers (optional) |
| 11 | Exception Handling | Custom database exceptions, error recovery |
| 24 | Design Patterns | Strategy pattern (scan vs index), visitor pattern (AST) |

---

## Architecture

```
MiniDB/
├── MiniDB.sln
├── src/
│   ├── MiniDB.Storage/
│   │   ├── MiniDB.Storage.csproj
│   │   ├── Page.cs                  # Fixed 4KB page abstraction
│   │   ├── PageType.cs              # Enum: Data, BTreeInternal, BTreeLeaf, Overflow, FreeList
│   │   ├── Pager.cs                 # File I/O — reads/writes pages by ID
│   │   ├── BufferPool.cs            # LRU cache of pages in memory
│   │   ├── FreeList.cs              # Tracks freed pages for reuse
│   │   ├── RowSerializer.cs         # Serializes rows to/from byte spans
│   │   ├── BTree.cs                 # B-tree insert, search, scan
│   │   ├── BTreeNode.cs             # Internal and leaf node layout
│   │   ├── Table.cs                 # Table metadata + row storage
│   │   ├── TableSchema.cs           # Column definitions, types
│   │   ├── Wal.cs                   # Write-ahead log for crash recovery
│   │   └── DataType.cs              # Supported column types
│   │
│   ├── MiniDB.Sql/
│   │   ├── MiniDB.Sql.csproj
│   │   ├── Lexer/
│   │   │   ├── Token.cs             # Token type + value
│   │   │   ├── TokenType.cs         # All token types
│   │   │   └── SqlLexer.cs          # Tokenizer
│   │   ├── Parser/
│   │   │   ├── Ast.cs               # AST node types
│   │   │   └── SqlParser.cs         # Recursive descent parser
│   │   └── Planner/
│   │       ├── QueryPlan.cs          # Plan node types
│   │       └── QueryPlanner.cs       # Decides scan vs index
│   │
│   ├── MiniDB.Engine/
│   │   ├── MiniDB.Engine.csproj
│   │   ├── Database.cs              # Top-level database facade
│   │   ├── Executor.cs              # Walks plan, returns results
│   │   ├── ResultSet.cs             # Tabular query result
│   │   └── Catalog.cs               # Tracks tables, indexes
│   │
│   └── MiniDB.Repl/
│       ├── MiniDB.Repl.csproj
│       ├── Program.cs               # Entry point
│       ├── ReplLoop.cs              # Read-eval-print loop
│       └── DotCommands.cs           # .tables, .schema, .exit
│
└── tests/
    └── MiniDB.Tests/
        ├── MiniDB.Tests.csproj
        ├── Storage/
        │   ├── PageTests.cs
        │   ├── BTreeTests.cs
        │   ├── BufferPoolTests.cs
        │   ├── RowSerializerTests.cs
        │   └── WalTests.cs
        ├── Sql/
        │   ├── LexerTests.cs
        │   └── ParserTests.cs
        └── Engine/
            ├── ExecutorTests.cs
            └── IntegrationTests.cs
```

---

## Requirements

### Core Requirements

1. **Page-based storage**: All data lives in a single `.minidb` file composed of fixed 4KB pages. Page 0 is a header page storing metadata (page count, root table catalog page, free-list head). Each page has a header byte indicating its type.

2. **Row serialization**: Rows are serialized into contiguous byte sequences within data pages. Support these column types: `INTEGER` (8-byte long), `TEXT` (length-prefixed UTF-8), `REAL` (8-byte double), `BOOLEAN` (1 byte). A null bitmap precedes column data.

3. **B-tree index**: Primary keys are stored in a B+ tree. Internal nodes hold keys and child page IDs. Leaf nodes hold keys and row data (or row pointers). Support insert and search. Minimum order-4 tree.

4. **Buffer pool**: An LRU cache holding up to N pages in memory (configurable, default 256). Pages are loaded on first access and evicted least-recently-used when the pool is full. Dirty pages are flushed on eviction or explicit checkpoint.

5. **SQL lexer**: Tokenize SQL strings into tokens: keywords (`SELECT`, `INSERT`, `CREATE`, `WHERE`, `FROM`, `INTO`, `VALUES`, `UPDATE`, `SET`, `DELETE`, `TABLE`, `INDEX`, `AND`, `OR`, `NOT`), identifiers, integer/real/string literals, operators (`=`, `<>`, `<`, `>`, `<=`, `>=`), symbols (`(`, `)`, `,`, `;`, `*`).

6. **SQL parser**: Recursive-descent parser producing AST nodes for: `CREATE TABLE`, `INSERT INTO ... VALUES`, `SELECT ... FROM ... WHERE`, `UPDATE ... SET ... WHERE`, `DELETE FROM ... WHERE`, `CREATE INDEX`.

7. **Query executor**: Execute parsed statements against the storage layer. `SELECT` returns a `ResultSet` with column names and typed rows. `INSERT`/`UPDATE`/`DELETE` return affected row counts.

8. **REPL**: Interactive loop that reads input, parses, executes, and prints results in a formatted table. Support multi-line statements (terminated by `;`). Support dot-commands: `.tables`, `.schema <table>`, `.exit`, `.help`.

### Extended Requirements

9. **Write-ahead log**: Before modifying a page, write the old page image to a WAL file. On startup, detect incomplete transactions and replay/rollback the WAL. Implement checkpoint to apply WAL to main file.

10. **Query planner**: When a `WHERE` clause filters on an indexed column with `=`, use index lookup instead of full scan. Print the chosen plan with `.explain` dot-command.

11. **CREATE INDEX**: Support creating secondary B-tree indexes on non-primary-key columns. Index entries map column value to primary key.

12. **ORDER BY**: Support `ORDER BY column [ASC|DESC]` in SELECT statements.

### Stretch Requirements

13. **Aggregate functions**: `COUNT(*)`, `SUM(col)`, `AVG(col)`, `MIN(col)`, `MAX(col)`.
14. **LIMIT/OFFSET**: Pagination support in SELECT.
15. **Composite WHERE**: Support `AND`/`OR` with proper precedence in WHERE clauses.
16. **Table joins**: Simple `INNER JOIN ... ON` between two tables.

---

## Technical Guidance

### Page Layout

Think of your database file as an array of 4096-byte blocks. Every read and write operates on whole pages. Design your page header to include at minimum: page type (1 byte), number of cells/rows (2 bytes), free space offset (2 bytes). The remaining bytes hold your cell data.

Consider how SQLite handles overflow: if a row is too large for a single page, the last cell pointer points to an overflow page. You can simplify this by setting a maximum row size (e.g., 2000 bytes) and rejecting larger inserts.

### B-Tree Design

Study how B+ trees differ from B-trees: in a B+ tree, all data lives in leaf nodes, and internal nodes only hold keys and child pointers. This makes range scans efficient because leaf nodes are linked.

Key decisions:
- What is your node order (max keys per node)? Calculate from page size minus header divided by key+pointer size.
- How do you split a full node? Insert into the full node logically, then split at the median — left half stays, right half goes to a new page, median key promotes to parent.
- Leaf nodes should store a "next leaf" pointer for sequential scans.

Do NOT implement delete from the B-tree initially. Mark rows as deleted with a tombstone flag and compact later.

### Lexer Strategy

Your lexer maintains a position cursor into the SQL string. At each step, skip whitespace, then match the longest token starting at the current position. Use `ReadOnlySpan<char>` to avoid allocations during tokenization.

For keywords vs identifiers: first read an alphanumeric word, then check if it matches a keyword set (use a `FrozenDictionary<string, TokenType>` for O(1) lookup). If not a keyword, it is an identifier.

### Parser Strategy

Recursive descent is the most natural parsing approach. Each grammar rule becomes a method:

```
ParseStatement → ParseCreateTable | ParseInsert | ParseSelect | ParseUpdate | ParseDelete
ParseSelect → EXPECT(SELECT) → ParseColumnList → EXPECT(FROM) → ParseIdentifier → ParseWhereClause?
ParseWhereClause → EXPECT(WHERE) → ParseExpression
ParseExpression → ParseComparison (AND|OR ParseComparison)*
```

Look ahead one token to decide which rule to apply. If the current token does not match what you expect, throw a `ParseException` with the token position for clear error messages.

### Buffer Pool

Use a `Dictionary<int, BufferFrame>` for O(1) page lookup and a doubly-linked list for LRU ordering. When accessing a page, move it to the front of the list. When evicting, remove from the tail. Each `BufferFrame` tracks: page ID, dirty flag, pin count, the actual `byte[]` data.

Consider using `ArrayPool<byte>.Shared` to rent page buffers instead of allocating new arrays for each page.

### Write-Ahead Log

The WAL is a separate file (`.minidb-wal`). Each WAL record contains: transaction ID, page ID, before-image (full 4KB page copy). On checkpoint, replay all committed WAL records to the main file and truncate the WAL.

For simplicity, treat each SQL statement as its own transaction (auto-commit mode).

### Serialization with Spans

`BinaryPrimitives.WriteInt64LittleEndian(span)` and `ReadInt64LittleEndian(span)` are your friends for writing/reading integers without allocations. For strings, write a 2-byte length prefix followed by UTF-8 bytes via `Encoding.UTF8.GetBytes(str, span)`.

---

## Step-by-Step Milestones

### Milestone 1: Page Layer and Pager (Days 1-2)

Define the `Page` struct/class wrapping a `byte[4096]` buffer. Implement `Pager` that opens a file, allocates new pages (appends 4KB to file), reads a page by ID (seeks to `id * 4096`, reads 4096 bytes), and writes a page back. Write page 0 as a header page on database creation. Write tests that create a file, allocate 10 pages, write data to them, close and reopen, and read the data back.

**Deliverable**: `Pager` can create, read, and write pages to a binary file. Tests pass.

### Milestone 2: Row Serialization and Table Storage (Days 3-4)

Define `TableSchema` (list of column definitions with name, type, nullable flag) and `DataType` enum. Implement `RowSerializer` that writes a row (an `object[]` matching the schema) into a `Span<byte>` and reads it back. Store rows sequentially in data pages — each page holds as many rows as fit after the page header. Implement `Table` that uses the `Pager` to allocate data pages and append/read rows.

**Deliverable**: Insert 1000 rows into a table, close/reopen the file, read them all back. Tests verify data integrity.

### Milestone 3: B-Tree Index (Days 5-8)

Implement `BTreeNode` (internal and leaf variants stored in pages) and `BTree` with insert and search operations. Internal nodes store sorted keys and child page IDs. Leaf nodes store sorted key-value pairs (key = primary key, value = page ID + slot offset of the row). Implement node splitting when a node is full. Write extensive tests: insert 10,000 sequential keys, 10,000 random keys, search for each, verify ordering with in-order traversal.

**Deliverable**: B-tree correctly handles splits and supports search. All tests pass.

### Milestone 4: Buffer Pool and WAL (Days 9-10)

Implement `BufferPool` as an LRU cache over the `Pager`. All page access goes through the buffer pool. Track dirty pages and flush them on eviction. Implement `Wal` that logs before-images of pages before modification and supports checkpoint/recovery. Test by inserting data, simulating a crash (kill without flushing), and recovering from the WAL.

**Deliverable**: Buffer pool eviction works correctly. WAL recovery restores database to consistent state.

### Milestone 5: SQL Lexer and Parser (Days 11-13)

Implement `SqlLexer` that tokenizes SQL strings. Test with various SQL statements, including edge cases (string literals with spaces, negative numbers, multi-word keywords like `CREATE TABLE`). Implement `SqlParser` as a recursive-descent parser producing AST nodes. Test that each supported statement type parses correctly and that malformed SQL produces clear error messages.

**Deliverable**: Parser correctly produces ASTs for all supported SQL statements. Error messages include line/column info.

### Milestone 6: Query Executor (Days 14-16)

Implement `Executor` that takes an AST node and a `Database` reference, and executes the statement. `CREATE TABLE` registers the schema in the catalog and allocates storage. `INSERT` serializes the row and inserts into the table and primary key B-tree. `SELECT` scans all rows (or uses B-tree for WHERE on primary key), filters, and returns a `ResultSet`. `UPDATE` and `DELETE` find matching rows and modify/remove them.

**Deliverable**: Can execute a full workflow: CREATE TABLE, INSERT rows, SELECT with WHERE, UPDATE, DELETE. Integration tests pass.

### Milestone 7: Query Planner and Indexes (Days 17-18)

Implement `QueryPlanner` that examines the WHERE clause and available indexes to choose between full scan and index lookup. Implement `CREATE INDEX` that builds a secondary B-tree mapping column values to primary keys. Add `.explain` command that shows the chosen plan without executing.

**Deliverable**: Queries on indexed columns use index lookup. `.explain` shows plan type.

### Milestone 8: REPL Shell (Days 19-21)

Implement the interactive REPL with line editing, multi-line statement support (accumulate lines until `;`), dot-commands (`.tables`, `.schema`, `.exit`, `.help`, `.explain`), and formatted table output with column alignment. Handle errors gracefully — a bad query prints an error and returns to the prompt, never crashes.

**Deliverable**: Fully interactive shell. Can demo creating tables, inserting data, querying with indexes, and using dot-commands.

---

## Testing Requirements

### Unit Tests

- **PageTests**: Page creation, header read/write, boundary conditions (write to last byte of page)
- **RowSerializerTests**: Round-trip all data types, null handling, maximum-size rows, empty strings
- **BTreeTests**: Insert ascending/descending/random keys, search hit/miss, split correctness at multiple levels, large tree (50,000+ keys)
- **BufferPoolTests**: LRU eviction order, dirty page flush, pin/unpin semantics, pool full behavior
- **WalTests**: Log writing, checkpoint, recovery after simulated crash
- **LexerTests**: All token types, string literals with escapes, numbers (int/real/negative), whitespace handling, error on unterminated string
- **ParserTests**: Valid AST for each statement type, error messages for malformed SQL, column lists, WHERE with AND/OR

### Integration Tests

- **Full workflow**: CREATE TABLE, INSERT 10 rows, SELECT all, SELECT with WHERE, UPDATE 3 rows, DELETE 2 rows, verify final state
- **Persistence**: Create and populate a database, close it, reopen, verify all data is intact
- **Large scale**: Insert 100,000 rows, verify B-tree search finds each one, verify full scan returns all
- **Concurrent readers**: Open the same database file from multiple `Database` instances (read-only), verify no corruption

### Performance Benchmarks

- B-tree insert: 100,000 keys in under 5 seconds
- B-tree search: 100,000 lookups in under 2 seconds
- Full table scan: 100,000 rows in under 1 second
- Index lookup: Single row by indexed column in under 1ms

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### MiniDB.Storage/DataType.cs

```csharp
namespace MiniDB.Storage;

public enum DataType : byte
{
    Integer = 1,
    Real = 2,
    Text = 3,
    Boolean = 4
}

public sealed record ColumnDefinition(string Name, DataType Type, bool Nullable = false, bool IsPrimaryKey = false);

public sealed class TableSchema
{
    public string TableName { get; }
    public IReadOnlyList<ColumnDefinition> Columns { get; }
    public int PrimaryKeyIndex { get; }

    public TableSchema(string tableName, IReadOnlyList<ColumnDefinition> columns)
    {
        TableName = tableName;
        Columns = columns;
        PrimaryKeyIndex = columns.ToList().FindIndex(c => c.IsPrimaryKey);
        if (PrimaryKeyIndex < 0)
            throw new ArgumentException("Table must have a primary key column.");
    }

    public int GetColumnIndex(string name) =>
        Columns.ToList().FindIndex(c =>
            c.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
}
```

### MiniDB.Storage/Page.cs

```csharp
using System.Buffers.Binary;

namespace MiniDB.Storage;

public enum PageType : byte
{
    Header = 0,
    Data = 1,
    BTreeInternal = 2,
    BTreeLeaf = 3,
    Overflow = 4,
    FreeList = 5
}

public sealed class Page
{
    public const int PageSize = 4096;
    public const int HeaderSize = 8; // type(1) + cellCount(2) + freeOffset(2) + nextPage(4) overlaps... simplified

    private readonly byte[] _data;
    public int PageId { get; }
    public bool IsDirty { get; set; }

    public Page(int pageId)
    {
        PageId = pageId;
        _data = new byte[PageSize];
        IsDirty = false;
    }

    public Page(int pageId, byte[] data)
    {
        PageId = pageId;
        _data = data;
        IsDirty = false;
    }

    public Span<byte> Data => _data.AsSpan();
    public byte[] RawData => _data;

    public PageType Type
    {
        get => (PageType)_data[0];
        set { _data[0] = (byte)value; IsDirty = true; }
    }

    public ushort CellCount
    {
        get => BinaryPrimitives.ReadUInt16LittleEndian(_data.AsSpan(1, 2));
        set { BinaryPrimitives.WriteUInt16LittleEndian(_data.AsSpan(1, 2), value); IsDirty = true; }
    }

    public ushort FreeOffset
    {
        get => BinaryPrimitives.ReadUInt16LittleEndian(_data.AsSpan(3, 2));
        set { BinaryPrimitives.WriteUInt16LittleEndian(_data.AsSpan(3, 2), value); IsDirty = true; }
    }

    public int NextPageId
    {
        get => BinaryPrimitives.ReadInt32LittleEndian(_data.AsSpan(5, 4));
        set { BinaryPrimitives.WriteInt32LittleEndian(_data.AsSpan(5, 4), value); IsDirty = true; }
    }

    public Span<byte> GetCellData() => _data.AsSpan(HeaderSize);

    public void Clear()
    {
        Array.Clear(_data);
        IsDirty = true;
    }
}
```

### MiniDB.Storage/Pager.cs

```csharp
namespace MiniDB.Storage;

public sealed class Pager : IDisposable
{
    private readonly FileStream _stream;
    private int _pageCount;

    public int PageCount => _pageCount;
    public string FilePath { get; }

    public Pager(string filePath, bool createNew = false)
    {
        FilePath = filePath;

        if (createNew && File.Exists(filePath))
            File.Delete(filePath);

        _stream = new FileStream(filePath, FileMode.OpenOrCreate, FileAccess.ReadWrite,
            FileShare.Read, Page.PageSize, FileOptions.RandomAccess);

        _pageCount = (int)(_stream.Length / Page.PageSize);

        if (_pageCount == 0 && createNew)
            InitializeHeaderPage();
    }

    private void InitializeHeaderPage()
    {
        var header = AllocatePage();
        header.Type = PageType.Header;
        // Store page count at offset 16 in header page
        WritePage(header);
    }

    public Page AllocatePage()
    {
        var page = new Page(_pageCount);
        page.FreeOffset = Page.HeaderSize;
        _pageCount++;
        return page;
    }

    public Page ReadPage(int pageId)
    {
        if (pageId < 0 || pageId >= _pageCount)
            throw new ArgumentOutOfRangeException(nameof(pageId),
                $"Page {pageId} out of range [0, {_pageCount}).");

        var data = new byte[Page.PageSize];
        _stream.Seek((long)pageId * Page.PageSize, SeekOrigin.Begin);
        _stream.ReadExactly(data);
        return new Page(pageId, data);
    }

    public void WritePage(Page page)
    {
        _stream.Seek((long)page.PageId * Page.PageSize, SeekOrigin.Begin);
        _stream.Write(page.RawData);
        _stream.Flush();
        page.IsDirty = false;
    }

    public void Dispose()
    {
        _stream.Flush();
        _stream.Dispose();
    }
}
```

### MiniDB.Storage/BufferPool.cs

```csharp
namespace MiniDB.Storage;

public sealed class BufferPool : IDisposable
{
    private sealed class BufferFrame
    {
        public Page Page { get; set; } = null!;
        public int PinCount { get; set; }
        public LinkedListNode<int>? LruNode { get; set; }
    }

    private readonly Pager _pager;
    private readonly int _capacity;
    private readonly Dictionary<int, BufferFrame> _frames;
    private readonly LinkedList<int> _lruList; // pageId from LRU tail to MRU head

    public BufferPool(Pager pager, int capacity = 256)
    {
        _pager = pager;
        _capacity = capacity;
        _frames = new Dictionary<int, BufferFrame>(capacity);
        _lruList = new LinkedList<int>();
    }

    public Page FetchPage(int pageId)
    {
        if (_frames.TryGetValue(pageId, out var frame))
        {
            PromoteToMru(frame);
            frame.PinCount++;
            return frame.Page;
        }

        if (_frames.Count >= _capacity)
            EvictOne();

        var page = _pager.ReadPage(pageId);
        frame = new BufferFrame { Page = page, PinCount = 1 };
        frame.LruNode = _lruList.AddFirst(pageId);
        _frames[pageId] = frame;
        return page;
    }

    public Page AllocateNewPage()
    {
        if (_frames.Count >= _capacity)
            EvictOne();

        var page = _pager.AllocatePage();
        var frame = new BufferFrame { Page = page, PinCount = 1 };
        frame.LruNode = _lruList.AddFirst(page.PageId);
        _frames[page.PageId] = frame;
        page.IsDirty = true;
        return page;
    }

    public void UnpinPage(int pageId)
    {
        if (_frames.TryGetValue(pageId, out var frame) && frame.PinCount > 0)
            frame.PinCount--;
    }

    public void FlushAll()
    {
        foreach (var frame in _frames.Values)
        {
            if (frame.Page.IsDirty)
                _pager.WritePage(frame.Page);
        }
    }

    private void PromoteToMru(BufferFrame frame)
    {
        if (frame.LruNode is not null)
        {
            _lruList.Remove(frame.LruNode);
            frame.LruNode = _lruList.AddFirst(frame.Page.PageId);
        }
    }

    private void EvictOne()
    {
        var node = _lruList.Last;
        while (node is not null)
        {
            var frame = _frames[node.Value];
            if (frame.PinCount == 0)
            {
                if (frame.Page.IsDirty)
                    _pager.WritePage(frame.Page);

                _frames.Remove(node.Value);
                _lruList.Remove(node);
                return;
            }
            node = node.Previous;
        }
        throw new InvalidOperationException("Buffer pool is full and all pages are pinned.");
    }

    public void Dispose()
    {
        FlushAll();
    }
}
```

### MiniDB.Storage/RowSerializer.cs

```csharp
using System.Buffers.Binary;
using System.Text;

namespace MiniDB.Storage;

public static class RowSerializer
{
    public static int Serialize(object?[] row, TableSchema schema, Span<byte> dest)
    {
        int offset = 0;

        // Null bitmap: 1 bit per column, packed into bytes
        int bitmapBytes = (schema.Columns.Count + 7) / 8;
        Span<byte> bitmap = dest.Slice(offset, bitmapBytes);
        bitmap.Clear();

        for (int i = 0; i < schema.Columns.Count; i++)
        {
            if (row[i] is null)
                bitmap[i / 8] |= (byte)(1 << (i % 8));
        }
        offset += bitmapBytes;

        // Column values
        for (int i = 0; i < schema.Columns.Count; i++)
        {
            if (row[i] is null) continue;

            switch (schema.Columns[i].Type)
            {
                case DataType.Integer:
                    BinaryPrimitives.WriteInt64LittleEndian(dest.Slice(offset, 8), Convert.ToInt64(row[i]));
                    offset += 8;
                    break;

                case DataType.Real:
                    BinaryPrimitives.WriteDoubleLittleEndian(dest.Slice(offset, 8), Convert.ToDouble(row[i]));
                    offset += 8;
                    break;

                case DataType.Boolean:
                    dest[offset] = (byte)((bool)row[i]! ? 1 : 0);
                    offset += 1;
                    break;

                case DataType.Text:
                    string text = (string)row[i]!;
                    int byteCount = Encoding.UTF8.GetByteCount(text);
                    BinaryPrimitives.WriteUInt16LittleEndian(dest.Slice(offset, 2), (ushort)byteCount);
                    offset += 2;
                    Encoding.UTF8.GetBytes(text.AsSpan(), dest.Slice(offset, byteCount));
                    offset += byteCount;
                    break;
            }
        }

        return offset;
    }

    public static (object?[] Row, int BytesRead) Deserialize(ReadOnlySpan<byte> src, TableSchema schema)
    {
        var row = new object?[schema.Columns.Count];
        int offset = 0;

        int bitmapBytes = (schema.Columns.Count + 7) / 8;
        ReadOnlySpan<byte> bitmap = src.Slice(offset, bitmapBytes);
        offset += bitmapBytes;

        for (int i = 0; i < schema.Columns.Count; i++)
        {
            bool isNull = (bitmap[i / 8] & (1 << (i % 8))) != 0;
            if (isNull)
            {
                row[i] = null;
                continue;
            }

            switch (schema.Columns[i].Type)
            {
                case DataType.Integer:
                    row[i] = BinaryPrimitives.ReadInt64LittleEndian(src.Slice(offset, 8));
                    offset += 8;
                    break;

                case DataType.Real:
                    row[i] = BinaryPrimitives.ReadDoubleLittleEndian(src.Slice(offset, 8));
                    offset += 8;
                    break;

                case DataType.Boolean:
                    row[i] = src[offset] != 0;
                    offset += 1;
                    break;

                case DataType.Text:
                    int len = BinaryPrimitives.ReadUInt16LittleEndian(src.Slice(offset, 2));
                    offset += 2;
                    row[i] = Encoding.UTF8.GetString(src.Slice(offset, len));
                    offset += len;
                    break;
            }
        }

        return (row, offset);
    }
}
```

### MiniDB.Storage/BTree.cs

```csharp
using System.Buffers.Binary;

namespace MiniDB.Storage;

/// <summary>
/// A B+ tree stored in pages. Order is calculated from page size.
/// Keys are long (8 bytes). Values in leaf nodes are (pageId, slotIndex) pairs.
/// </summary>
public sealed class BTree
{
    // Internal node layout after page header:
    //   keyCount(2) | childPageId(4) | [key(8) childPageId(4)]...
    // Leaf node layout after page header:
    //   keyCount(2) | nextLeafPageId(4) | [key(8) valuePageId(4) valueSlot(2)]...

    private const int InternalEntrySize = 8 + 4;   // key + child pointer
    private const int LeafEntrySize = 8 + 4 + 2;   // key + page id + slot
    private const int MetaSize = 2 + 4;             // keyCount + next/first child

    public static int MaxInternalKeys => (Page.PageSize - Page.HeaderSize - MetaSize - 4) / InternalEntrySize;
    public static int MaxLeafKeys => (Page.PageSize - Page.HeaderSize - MetaSize) / LeafEntrySize;

    private readonly BufferPool _pool;
    private int _rootPageId;

    public int RootPageId => _rootPageId;

    public BTree(BufferPool pool, int rootPageId = -1)
    {
        _pool = pool;

        if (rootPageId < 0)
        {
            var root = _pool.AllocateNewPage();
            root.Type = PageType.BTreeLeaf;
            root.CellCount = 0;
            root.FreeOffset = Page.HeaderSize;
            WriteLeafNextPointer(root, -1);
            _rootPageId = root.PageId;
            _pool.UnpinPage(root.PageId);
        }
        else
        {
            _rootPageId = rootPageId;
        }
    }

    public (int PageId, int Slot)? Search(long key)
    {
        return SearchNode(_rootPageId, key);
    }

    private (int PageId, int Slot)? SearchNode(int pageId, long key)
    {
        var page = _pool.FetchPage(pageId);
        try
        {
            if (page.Type == PageType.BTreeLeaf)
                return SearchLeaf(page, key);

            // Internal node: find the child to descend into
            int keyCount = ReadKeyCount(page);
            int childPageId = ReadInternalFirstChild(page);

            int entryOffset = Page.HeaderSize + MetaSize;
            for (int i = 0; i < keyCount; i++)
            {
                long nodeKey = BinaryPrimitives.ReadInt64LittleEndian(
                    page.Data.Slice(entryOffset, 8));

                if (key < nodeKey)
                    return SearchNode(childPageId, key);

                childPageId = BinaryPrimitives.ReadInt32LittleEndian(
                    page.Data.Slice(entryOffset + 8, 4));
                entryOffset += InternalEntrySize;
            }

            return SearchNode(childPageId, key);
        }
        finally
        {
            _pool.UnpinPage(pageId);
        }
    }

    private (int PageId, int Slot)? SearchLeaf(Page leaf, long key)
    {
        int keyCount = ReadKeyCount(leaf);
        int offset = Page.HeaderSize + MetaSize;

        for (int i = 0; i < keyCount; i++)
        {
            long leafKey = BinaryPrimitives.ReadInt64LittleEndian(leaf.Data.Slice(offset, 8));
            if (leafKey == key)
            {
                int valPage = BinaryPrimitives.ReadInt32LittleEndian(leaf.Data.Slice(offset + 8, 4));
                int valSlot = BinaryPrimitives.ReadUInt16LittleEndian(leaf.Data.Slice(offset + 12, 2));
                return (valPage, valSlot);
            }
            if (leafKey > key)
                return null;

            offset += LeafEntrySize;
        }

        return null;
    }

    public void Insert(long key, int valuePageId, int valueSlot)
    {
        var result = InsertIntoNode(_rootPageId, key, valuePageId, valueSlot);

        if (result is not null)
        {
            // Root was split — create a new root
            var newRoot = _pool.AllocateNewPage();
            newRoot.Type = PageType.BTreeInternal;
            WriteKeyCount(newRoot, 1);
            WriteInternalFirstChild(newRoot, _rootPageId);

            int offset = Page.HeaderSize + MetaSize;
            BinaryPrimitives.WriteInt64LittleEndian(newRoot.Data.Slice(offset, 8), result.Value.SplitKey);
            BinaryPrimitives.WriteInt32LittleEndian(newRoot.Data.Slice(offset + 8, 4), result.Value.NewPageId);

            _rootPageId = newRoot.PageId;
            _pool.UnpinPage(newRoot.PageId);
        }
    }

    private record struct SplitResult(long SplitKey, int NewPageId);

    private SplitResult? InsertIntoNode(int pageId, long key, int valPageId, int valSlot)
    {
        var page = _pool.FetchPage(pageId);
        try
        {
            if (page.Type == PageType.BTreeLeaf)
                return InsertIntoLeaf(page, key, valPageId, valSlot);

            // Internal node: find child and recurse
            int keyCount = ReadKeyCount(page);
            int childPageId = ReadInternalFirstChild(page);
            int entryOffset = Page.HeaderSize + MetaSize;
            int childIndex = 0;

            for (int i = 0; i < keyCount; i++)
            {
                long nodeKey = BinaryPrimitives.ReadInt64LittleEndian(page.Data.Slice(entryOffset, 8));
                if (key < nodeKey)
                    break;

                childPageId = BinaryPrimitives.ReadInt32LittleEndian(page.Data.Slice(entryOffset + 8, 4));
                entryOffset += InternalEntrySize;
                childIndex = i + 1;
            }

            var childResult = InsertIntoNode(childPageId, key, valPageId, valSlot);
            if (childResult is null)
                return null;

            // Insert the promoted key into this internal node
            return InsertIntoInternal(page, childIndex, childResult.Value.SplitKey,
                childResult.Value.NewPageId);
        }
        finally
        {
            _pool.UnpinPage(pageId);
        }
    }

    private SplitResult? InsertIntoLeaf(Page leaf, long key, int valPageId, int valSlot)
    {
        int keyCount = ReadKeyCount(leaf);

        // Find insertion position
        int insertPos = 0;
        int offset = Page.HeaderSize + MetaSize;
        for (int i = 0; i < keyCount; i++)
        {
            long existing = BinaryPrimitives.ReadInt64LittleEndian(leaf.Data.Slice(offset, 8));
            if (existing == key)
                throw new InvalidOperationException($"Duplicate primary key: {key}");
            if (existing > key)
                break;
            insertPos++;
            offset += LeafEntrySize;
        }

        if (keyCount < MaxLeafKeys)
        {
            // Room in this leaf — shift entries right and insert
            ShiftLeafEntriesRight(leaf, insertPos, keyCount);
            WriteLeafEntry(leaf, insertPos, key, valPageId, valSlot);
            WriteKeyCount(leaf, keyCount + 1);
            leaf.IsDirty = true;
            return null;
        }

        // Leaf is full — split
        return SplitLeaf(leaf, insertPos, key, valPageId, valSlot);
    }

    private SplitResult SplitLeaf(Page leaf, int insertPos, long key, int valPageId, int valSlot)
    {
        int totalKeys = ReadKeyCount(leaf) + 1;
        int splitPoint = totalKeys / 2;

        // Collect all entries including the new one
        var entries = new (long Key, int PageId, int Slot)[totalKeys];
        int src = 0;
        int keyCount = totalKeys - 1;

        for (int i = 0; i < totalKeys; i++)
        {
            if (i == insertPos)
            {
                entries[i] = (key, valPageId, valSlot);
            }
            else
            {
                int off = Page.HeaderSize + MetaSize + src * LeafEntrySize;
                entries[i] = (
                    BinaryPrimitives.ReadInt64LittleEndian(leaf.Data.Slice(off, 8)),
                    BinaryPrimitives.ReadInt32LittleEndian(leaf.Data.Slice(off + 8, 4)),
                    BinaryPrimitives.ReadUInt16LittleEndian(leaf.Data.Slice(off + 12, 2))
                );
                src++;
            }
        }

        // Allocate new leaf
        var newLeaf = _pool.AllocateNewPage();
        newLeaf.Type = PageType.BTreeLeaf;

        // Link leaves: newLeaf.next = leaf.next; leaf.next = newLeaf
        int oldNext = ReadLeafNextPointer(leaf);
        WriteLeafNextPointer(newLeaf, oldNext);
        WriteLeafNextPointer(leaf, newLeaf.PageId);

        // Write left half to original leaf
        WriteKeyCount(leaf, splitPoint);
        for (int i = 0; i < splitPoint; i++)
            WriteLeafEntry(leaf, i, entries[i].Key, entries[i].PageId, entries[i].Slot);
        leaf.IsDirty = true;

        // Write right half to new leaf
        int rightCount = totalKeys - splitPoint;
        WriteKeyCount(newLeaf, rightCount);
        for (int i = 0; i < rightCount; i++)
            WriteLeafEntry(newLeaf, i, entries[splitPoint + i].Key,
                entries[splitPoint + i].PageId, entries[splitPoint + i].Slot);
        newLeaf.IsDirty = true;

        long splitKey = entries[splitPoint].Key;
        int newPageId = newLeaf.PageId;
        _pool.UnpinPage(newLeaf.PageId);

        return new SplitResult(splitKey, newPageId);
    }

    private SplitResult? InsertIntoInternal(Page node, int afterChildIndex, long newKey, int newChildPageId)
    {
        int keyCount = ReadKeyCount(node);

        if (keyCount < MaxInternalKeys)
        {
            // Shift entries right from afterChildIndex
            int insertOffset = Page.HeaderSize + MetaSize + afterChildIndex * InternalEntrySize;
            int endOffset = Page.HeaderSize + MetaSize + keyCount * InternalEntrySize;

            // Shift
            for (int i = endOffset - 1; i >= insertOffset; i--)
                node.Data[i + InternalEntrySize] = node.Data[i];

            BinaryPrimitives.WriteInt64LittleEndian(node.Data.Slice(insertOffset, 8), newKey);
            BinaryPrimitives.WriteInt32LittleEndian(node.Data.Slice(insertOffset + 8, 4), newChildPageId);
            WriteKeyCount(node, keyCount + 1);
            node.IsDirty = true;
            return null;
        }

        // Internal node is full — split
        return SplitInternal(node, afterChildIndex, newKey, newChildPageId);
    }

    private SplitResult SplitInternal(Page node, int insertPos, long newKey, int newChildPageId)
    {
        int totalKeys = ReadKeyCount(node) + 1;
        int splitPoint = totalKeys / 2;

        // Gather all key-child pairs
        var keys = new long[totalKeys];
        var children = new int[totalKeys + 1];
        children[0] = ReadInternalFirstChild(node);

        int src = 0;
        for (int i = 0; i < totalKeys; i++)
        {
            if (i == insertPos)
            {
                keys[i] = newKey;
                children[i + 1] = newChildPageId;
            }
            else
            {
                int off = Page.HeaderSize + MetaSize + src * InternalEntrySize;
                keys[i] = BinaryPrimitives.ReadInt64LittleEndian(node.Data.Slice(off, 8));
                children[i + 1] = BinaryPrimitives.ReadInt32LittleEndian(node.Data.Slice(off + 8, 4));
                src++;
            }
        }

        // Key at splitPoint promotes up; left gets [0..splitPoint-1], right gets [splitPoint+1..end]
        long promoteKey = keys[splitPoint];

        // Rewrite left node
        WriteInternalFirstChild(node, children[0]);
        WriteKeyCount(node, splitPoint);
        for (int i = 0; i < splitPoint; i++)
        {
            int off = Page.HeaderSize + MetaSize + i * InternalEntrySize;
            BinaryPrimitives.WriteInt64LittleEndian(node.Data.Slice(off, 8), keys[i]);
            BinaryPrimitives.WriteInt32LittleEndian(node.Data.Slice(off + 8, 4), children[i + 1]);
        }
        node.IsDirty = true;

        // Create right node
        var newNode = _pool.AllocateNewPage();
        newNode.Type = PageType.BTreeInternal;
        int rightCount = totalKeys - splitPoint - 1;
        WriteKeyCount(newNode, rightCount);
        WriteInternalFirstChild(newNode, children[splitPoint + 1]);
        for (int i = 0; i < rightCount; i++)
        {
            int off = Page.HeaderSize + MetaSize + i * InternalEntrySize;
            BinaryPrimitives.WriteInt64LittleEndian(newNode.Data.Slice(off, 8), keys[splitPoint + 1 + i]);
            BinaryPrimitives.WriteInt32LittleEndian(newNode.Data.Slice(off + 8, 4),
                children[splitPoint + 2 + i]);
        }
        newNode.IsDirty = true;

        int newPageId = newNode.PageId;
        _pool.UnpinPage(newNode.PageId);
        return new SplitResult(promoteKey, newPageId);
    }

    /// <summary>Scan all leaf entries in key order.</summary>
    public IEnumerable<(long Key, int PageId, int Slot)> ScanAll()
    {
        // Find leftmost leaf
        int pageId = _rootPageId;
        while (true)
        {
            var page = _pool.FetchPage(pageId);
            if (page.Type == PageType.BTreeLeaf)
            {
                _pool.UnpinPage(pageId);
                break;
            }
            int child = ReadInternalFirstChild(page);
            _pool.UnpinPage(pageId);
            pageId = child;
        }

        // Walk leaf chain
        while (pageId >= 0)
        {
            var leaf = _pool.FetchPage(pageId);
            int count = ReadKeyCount(leaf);
            for (int i = 0; i < count; i++)
            {
                int off = Page.HeaderSize + MetaSize + i * LeafEntrySize;
                long k = BinaryPrimitives.ReadInt64LittleEndian(leaf.Data.Slice(off, 8));
                int p = BinaryPrimitives.ReadInt32LittleEndian(leaf.Data.Slice(off + 8, 4));
                int s = BinaryPrimitives.ReadUInt16LittleEndian(leaf.Data.Slice(off + 12, 2));
                yield return (k, p, s);
            }
            int next = ReadLeafNextPointer(leaf);
            _pool.UnpinPage(pageId);
            pageId = next;
        }
    }

    // --- Helper methods for reading/writing node fields ---

    private static int ReadKeyCount(Page p) =>
        BinaryPrimitives.ReadUInt16LittleEndian(p.Data.Slice(Page.HeaderSize, 2));

    private static void WriteKeyCount(Page p, int count) =>
        BinaryPrimitives.WriteUInt16LittleEndian(p.Data.Slice(Page.HeaderSize, 2), (ushort)count);

    private static int ReadInternalFirstChild(Page p) =>
        BinaryPrimitives.ReadInt32LittleEndian(p.Data.Slice(Page.HeaderSize + 2, 4));

    private static void WriteInternalFirstChild(Page p, int childId) =>
        BinaryPrimitives.WriteInt32LittleEndian(p.Data.Slice(Page.HeaderSize + 2, 4), childId);

    private static int ReadLeafNextPointer(Page p) =>
        BinaryPrimitives.ReadInt32LittleEndian(p.Data.Slice(Page.HeaderSize + 2, 4));

    private static void WriteLeafNextPointer(Page p, int nextId) =>
        BinaryPrimitives.WriteInt32LittleEndian(p.Data.Slice(Page.HeaderSize + 2, 4), nextId);

    private static void WriteLeafEntry(Page p, int index, long key, int pageId, int slot)
    {
        int off = Page.HeaderSize + MetaSize + index * LeafEntrySize;
        BinaryPrimitives.WriteInt64LittleEndian(p.Data.Slice(off, 8), key);
        BinaryPrimitives.WriteInt32LittleEndian(p.Data.Slice(off + 8, 4), pageId);
        BinaryPrimitives.WriteUInt16LittleEndian(p.Data.Slice(off + 12, 2), (ushort)slot);
    }

    private static void ShiftLeafEntriesRight(Page p, int fromIndex, int currentCount)
    {
        for (int i = currentCount - 1; i >= fromIndex; i--)
        {
            int srcOff = Page.HeaderSize + MetaSize + i * LeafEntrySize;
            int dstOff = srcOff + LeafEntrySize;
            p.Data.Slice(srcOff, LeafEntrySize).CopyTo(p.Data.Slice(dstOff, LeafEntrySize));
        }
    }
}
```

### MiniDB.Sql/Lexer/TokenType.cs

```csharp
namespace MiniDB.Sql.Lexer;

public enum TokenType
{
    // Keywords
    Select, From, Where, Insert, Into, Values,
    Update, Set, Delete, Create, Table, Index, On,
    And, Or, Not, Order, By, Asc, Desc,
    Integer, Real, Text, Boolean,
    Null, True, False, Primary, Key,
    Limit, Offset,

    // Identifiers and literals
    Identifier,
    IntegerLiteral,
    RealLiteral,
    StringLiteral,

    // Operators
    Equal,         // =
    NotEqual,      // <> or !=
    LessThan,      // <
    GreaterThan,   // >
    LessEqual,     // <=
    GreaterEqual,  // >=
    Star,          // *

    // Symbols
    LeftParen,
    RightParen,
    Comma,
    Semicolon,
    Dot,

    // Control
    Eof,
    Error
}
```

### MiniDB.Sql/Lexer/Token.cs

```csharp
namespace MiniDB.Sql.Lexer;

public readonly record struct Token(TokenType Type, string Value, int Position)
{
    public override string ToString() => $"{Type}({Value}) @{Position}";
}
```

### MiniDB.Sql/Lexer/SqlLexer.cs

```csharp
using System.Collections.Frozen;

namespace MiniDB.Sql.Lexer;

public sealed class SqlLexer
{
    private static readonly FrozenDictionary<string, TokenType> Keywords =
        new Dictionary<string, TokenType>(StringComparer.OrdinalIgnoreCase)
        {
            ["SELECT"] = TokenType.Select,
            ["FROM"] = TokenType.From,
            ["WHERE"] = TokenType.Where,
            ["INSERT"] = TokenType.Insert,
            ["INTO"] = TokenType.Into,
            ["VALUES"] = TokenType.Values,
            ["UPDATE"] = TokenType.Update,
            ["SET"] = TokenType.Set,
            ["DELETE"] = TokenType.Delete,
            ["CREATE"] = TokenType.Create,
            ["TABLE"] = TokenType.Table,
            ["INDEX"] = TokenType.Index,
            ["ON"] = TokenType.On,
            ["AND"] = TokenType.And,
            ["OR"] = TokenType.Or,
            ["NOT"] = TokenType.Not,
            ["ORDER"] = TokenType.Order,
            ["BY"] = TokenType.By,
            ["ASC"] = TokenType.Asc,
            ["DESC"] = TokenType.Desc,
            ["INTEGER"] = TokenType.Integer,
            ["REAL"] = TokenType.Real,
            ["TEXT"] = TokenType.Text,
            ["BOOLEAN"] = TokenType.Boolean,
            ["NULL"] = TokenType.Null,
            ["TRUE"] = TokenType.True,
            ["FALSE"] = TokenType.False,
            ["PRIMARY"] = TokenType.Primary,
            ["KEY"] = TokenType.Key,
            ["LIMIT"] = TokenType.Limit,
            ["OFFSET"] = TokenType.Offset,
        }.ToFrozenDictionary();

    private readonly string _sql;
    private int _pos;

    public SqlLexer(string sql)
    {
        _sql = sql;
        _pos = 0;
    }

    public List<Token> Tokenize()
    {
        var tokens = new List<Token>();

        while (_pos < _sql.Length)
        {
            SkipWhitespace();
            if (_pos >= _sql.Length) break;

            char c = _sql[_pos];
            int start = _pos;

            Token token = c switch
            {
                '(' => MakeSingle(TokenType.LeftParen),
                ')' => MakeSingle(TokenType.RightParen),
                ',' => MakeSingle(TokenType.Comma),
                ';' => MakeSingle(TokenType.Semicolon),
                '.' => MakeSingle(TokenType.Dot),
                '*' => MakeSingle(TokenType.Star),
                '=' => MakeSingle(TokenType.Equal),
                '<' => ReadLessOperator(),
                '>' => ReadGreaterOperator(),
                '!' => ReadBangOperator(),
                '\'' => ReadStringLiteral(),
                _ when char.IsLetter(c) || c == '_' => ReadIdentifierOrKeyword(),
                _ when char.IsDigit(c) || (c == '-' && _pos + 1 < _sql.Length && char.IsDigit(_sql[_pos + 1]))
                    => ReadNumber(),
                _ => new Token(TokenType.Error, c.ToString(), start)
            };

            tokens.Add(token);
            if (token.Type == TokenType.Error)
                break;
        }

        tokens.Add(new Token(TokenType.Eof, "", _pos));
        return tokens;
    }

    private void SkipWhitespace()
    {
        while (_pos < _sql.Length && char.IsWhiteSpace(_sql[_pos]))
            _pos++;
    }

    private Token MakeSingle(TokenType type)
    {
        var token = new Token(type, _sql[_pos].ToString(), _pos);
        _pos++;
        return token;
    }

    private Token ReadLessOperator()
    {
        int start = _pos;
        _pos++;
        if (_pos < _sql.Length)
        {
            if (_sql[_pos] == '=') { _pos++; return new Token(TokenType.LessEqual, "<=", start); }
            if (_sql[_pos] == '>') { _pos++; return new Token(TokenType.NotEqual, "<>", start); }
        }
        return new Token(TokenType.LessThan, "<", start);
    }

    private Token ReadGreaterOperator()
    {
        int start = _pos;
        _pos++;
        if (_pos < _sql.Length && _sql[_pos] == '=')
        {
            _pos++;
            return new Token(TokenType.GreaterEqual, ">=", start);
        }
        return new Token(TokenType.GreaterThan, ">", start);
    }

    private Token ReadBangOperator()
    {
        int start = _pos;
        _pos++;
        if (_pos < _sql.Length && _sql[_pos] == '=')
        {
            _pos++;
            return new Token(TokenType.NotEqual, "!=", start);
        }
        return new Token(TokenType.Error, "!", start);
    }

    private Token ReadStringLiteral()
    {
        int start = _pos;
        _pos++; // skip opening quote
        var sb = new System.Text.StringBuilder();

        while (_pos < _sql.Length)
        {
            if (_sql[_pos] == '\'' && _pos + 1 < _sql.Length && _sql[_pos + 1] == '\'')
            {
                sb.Append('\'');
                _pos += 2;
            }
            else if (_sql[_pos] == '\'')
            {
                _pos++;
                return new Token(TokenType.StringLiteral, sb.ToString(), start);
            }
            else
            {
                sb.Append(_sql[_pos]);
                _pos++;
            }
        }

        return new Token(TokenType.Error, "Unterminated string literal", start);
    }

    private Token ReadIdentifierOrKeyword()
    {
        int start = _pos;
        while (_pos < _sql.Length && (char.IsLetterOrDigit(_sql[_pos]) || _sql[_pos] == '_'))
            _pos++;

        string word = _sql[start.._pos];

        if (Keywords.TryGetValue(word, out var keywordType))
            return new Token(keywordType, word, start);

        return new Token(TokenType.Identifier, word, start);
    }

    private Token ReadNumber()
    {
        int start = _pos;
        if (_sql[_pos] == '-') _pos++;

        while (_pos < _sql.Length && char.IsDigit(_sql[_pos]))
            _pos++;

        if (_pos < _sql.Length && _sql[_pos] == '.')
        {
            _pos++;
            while (_pos < _sql.Length && char.IsDigit(_sql[_pos]))
                _pos++;
            return new Token(TokenType.RealLiteral, _sql[start.._pos], start);
        }

        return new Token(TokenType.IntegerLiteral, _sql[start.._pos], start);
    }
}
```

### MiniDB.Sql/Parser/Ast.cs

```csharp
namespace MiniDB.Sql.Parser;

public abstract record AstNode;

// Statements
public sealed record CreateTableNode(
    string TableName,
    List<ColumnDefNode> Columns) : AstNode;

public sealed record ColumnDefNode(
    string Name,
    string TypeName,
    bool Nullable,
    bool IsPrimaryKey);

public sealed record InsertNode(
    string TableName,
    List<string>? ColumnNames,
    List<List<ExprNode>> ValueRows) : AstNode;

public sealed record SelectNode(
    List<SelectColumnNode> Columns,
    string TableName,
    ExprNode? WhereClause,
    OrderByNode? OrderBy,
    int? Limit,
    int? Offset) : AstNode;

public sealed record SelectColumnNode(string Name, bool IsStar);

public sealed record OrderByNode(string ColumnName, bool Descending);

public sealed record UpdateNode(
    string TableName,
    List<AssignmentNode> Assignments,
    ExprNode? WhereClause) : AstNode;

public sealed record AssignmentNode(string ColumnName, ExprNode Value);

public sealed record DeleteNode(
    string TableName,
    ExprNode? WhereClause) : AstNode;

public sealed record CreateIndexNode(
    string IndexName,
    string TableName,
    string ColumnName) : AstNode;

// Expressions
public abstract record ExprNode : AstNode;

public sealed record BinaryExprNode(ExprNode Left, string Operator, ExprNode Right) : ExprNode;
public sealed record ColumnRefNode(string ColumnName) : ExprNode;
public sealed record IntegerLiteralNode(long Value) : ExprNode;
public sealed record RealLiteralNode(double Value) : ExprNode;
public sealed record StringLiteralNode(string Value) : ExprNode;
public sealed record BoolLiteralNode(bool Value) : ExprNode;
public sealed record NullLiteralNode() : ExprNode;
```

### MiniDB.Sql/Parser/SqlParser.cs

```csharp
using MiniDB.Sql.Lexer;

namespace MiniDB.Sql.Parser;

public sealed class SqlParser
{
    private readonly List<Token> _tokens;
    private int _pos;

    public SqlParser(List<Token> tokens)
    {
        _tokens = tokens;
        _pos = 0;
    }

    public AstNode Parse()
    {
        var stmt = Current.Type switch
        {
            TokenType.Select => ParseSelect(),
            TokenType.Insert => ParseInsert(),
            TokenType.Create => ParseCreate(),
            TokenType.Update => ParseUpdate(),
            TokenType.Delete => ParseDelete(),
            _ => throw Error($"Unexpected token '{Current.Value}', expected a statement keyword")
        };

        if (Current.Type == TokenType.Semicolon) Advance();
        return stmt;
    }

    private Token Current => _pos < _tokens.Count
        ? _tokens[_pos]
        : new Token(TokenType.Eof, "", -1);

    private Token Advance()
    {
        var tok = Current;
        _pos++;
        return tok;
    }

    private Token Expect(TokenType type)
    {
        if (Current.Type != type)
            throw Error($"Expected {type}, got {Current.Type} ('{Current.Value}')");
        return Advance();
    }

    private ParseException Error(string message) =>
        new($"Parse error at position {Current.Position}: {message}");

    // --- SELECT ---
    private AstNode ParseSelect()
    {
        Expect(TokenType.Select);
        var columns = ParseSelectColumns();
        Expect(TokenType.From);
        string table = Expect(TokenType.Identifier).Value;

        ExprNode? where = null;
        if (Current.Type == TokenType.Where)
        {
            Advance();
            where = ParseExpression();
        }

        OrderByNode? orderBy = null;
        if (Current.Type == TokenType.Order)
        {
            Advance();
            Expect(TokenType.By);
            string col = Expect(TokenType.Identifier).Value;
            bool desc = false;
            if (Current.Type == TokenType.Desc) { desc = true; Advance(); }
            else if (Current.Type == TokenType.Asc) Advance();
            orderBy = new OrderByNode(col, desc);
        }

        int? limit = null, offset = null;
        if (Current.Type == TokenType.Limit)
        {
            Advance();
            limit = int.Parse(Expect(TokenType.IntegerLiteral).Value);
        }
        if (Current.Type == TokenType.Offset)
        {
            Advance();
            offset = int.Parse(Expect(TokenType.IntegerLiteral).Value);
        }

        return new SelectNode(columns, table, where, orderBy, limit, offset);
    }

    private List<SelectColumnNode> ParseSelectColumns()
    {
        var cols = new List<SelectColumnNode>();
        if (Current.Type == TokenType.Star)
        {
            cols.Add(new SelectColumnNode("*", true));
            Advance();
            return cols;
        }

        do
        {
            if (cols.Count > 0) Expect(TokenType.Comma);
            string name = Expect(TokenType.Identifier).Value;
            cols.Add(new SelectColumnNode(name, false));
        } while (Current.Type == TokenType.Comma);

        return cols;
    }

    // --- INSERT ---
    private AstNode ParseInsert()
    {
        Expect(TokenType.Insert);
        Expect(TokenType.Into);
        string table = Expect(TokenType.Identifier).Value;

        List<string>? columns = null;
        if (Current.Type == TokenType.LeftParen)
        {
            Advance();
            columns = [];
            do
            {
                if (columns.Count > 0) Expect(TokenType.Comma);
                columns.Add(Expect(TokenType.Identifier).Value);
            } while (Current.Type == TokenType.Comma);
            Expect(TokenType.RightParen);
        }

        Expect(TokenType.Values);
        var valueRows = new List<List<ExprNode>>();
        do
        {
            if (valueRows.Count > 0) Expect(TokenType.Comma);
            Expect(TokenType.LeftParen);
            var row = new List<ExprNode>();
            do
            {
                if (row.Count > 0) Expect(TokenType.Comma);
                row.Add(ParseExpression());
            } while (Current.Type == TokenType.Comma);
            Expect(TokenType.RightParen);
            valueRows.Add(row);
        } while (Current.Type == TokenType.Comma);

        return new InsertNode(table, columns, valueRows);
    }

    // --- CREATE TABLE / CREATE INDEX ---
    private AstNode ParseCreate()
    {
        Expect(TokenType.Create);
        if (Current.Type == TokenType.Index)
            return ParseCreateIndex();

        Expect(TokenType.Table);
        string name = Expect(TokenType.Identifier).Value;
        Expect(TokenType.LeftParen);

        var columns = new List<ColumnDefNode>();
        do
        {
            if (columns.Count > 0) Expect(TokenType.Comma);
            string colName = Expect(TokenType.Identifier).Value;
            string typeName = Advance().Value; // type keyword

            bool pk = false;
            bool nullable = true;
            while (Current.Type is TokenType.Primary or TokenType.Not or TokenType.Null)
            {
                if (Current.Type == TokenType.Primary)
                {
                    Advance(); Expect(TokenType.Key);
                    pk = true; nullable = false;
                }
                else if (Current.Type == TokenType.Not)
                {
                    Advance(); Expect(TokenType.Null);
                    nullable = false;
                }
                else break;
            }

            columns.Add(new ColumnDefNode(colName, typeName, nullable, pk));
        } while (Current.Type == TokenType.Comma);

        Expect(TokenType.RightParen);
        return new CreateTableNode(name, columns);
    }

    private AstNode ParseCreateIndex()
    {
        Expect(TokenType.Index);
        string indexName = Expect(TokenType.Identifier).Value;
        Expect(TokenType.On);
        string tableName = Expect(TokenType.Identifier).Value;
        Expect(TokenType.LeftParen);
        string columnName = Expect(TokenType.Identifier).Value;
        Expect(TokenType.RightParen);
        return new CreateIndexNode(indexName, tableName, columnName);
    }

    // --- UPDATE ---
    private AstNode ParseUpdate()
    {
        Expect(TokenType.Update);
        string table = Expect(TokenType.Identifier).Value;
        Expect(TokenType.Set);

        var assignments = new List<AssignmentNode>();
        do
        {
            if (assignments.Count > 0) Expect(TokenType.Comma);
            string col = Expect(TokenType.Identifier).Value;
            Expect(TokenType.Equal);
            var val = ParseExpression();
            assignments.Add(new AssignmentNode(col, val));
        } while (Current.Type == TokenType.Comma);

        ExprNode? where = null;
        if (Current.Type == TokenType.Where)
        {
            Advance();
            where = ParseExpression();
        }

        return new UpdateNode(table, assignments, where);
    }

    // --- DELETE ---
    private AstNode ParseDelete()
    {
        Expect(TokenType.Delete);
        Expect(TokenType.From);
        string table = Expect(TokenType.Identifier).Value;

        ExprNode? where = null;
        if (Current.Type == TokenType.Where)
        {
            Advance();
            where = ParseExpression();
        }

        return new DeleteNode(table, where);
    }

    // --- Expressions ---
    private ExprNode ParseExpression() => ParseOr();

    private ExprNode ParseOr()
    {
        var left = ParseAnd();
        while (Current.Type == TokenType.Or)
        {
            Advance();
            var right = ParseAnd();
            left = new BinaryExprNode(left, "OR", right);
        }
        return left;
    }

    private ExprNode ParseAnd()
    {
        var left = ParseComparison();
        while (Current.Type == TokenType.And)
        {
            Advance();
            var right = ParseComparison();
            left = new BinaryExprNode(left, "AND", right);
        }
        return left;
    }

    private ExprNode ParseComparison()
    {
        var left = ParsePrimary();
        string? op = Current.Type switch
        {
            TokenType.Equal => "=",
            TokenType.NotEqual => "<>",
            TokenType.LessThan => "<",
            TokenType.GreaterThan => ">",
            TokenType.LessEqual => "<=",
            TokenType.GreaterEqual => ">=",
            _ => null
        };

        if (op is null) return left;
        Advance();
        var right = ParsePrimary();
        return new BinaryExprNode(left, op, right);
    }

    private ExprNode ParsePrimary()
    {
        var token = Current;
        return token.Type switch
        {
            TokenType.IntegerLiteral => IntLit(),
            TokenType.RealLiteral => RealLit(),
            TokenType.StringLiteral => StrLit(),
            TokenType.True => BoolLit(true),
            TokenType.False => BoolLit(false),
            TokenType.Null => NullLit(),
            TokenType.Identifier => ColRef(),
            TokenType.LeftParen => Grouped(),
            _ => throw Error($"Unexpected token '{token.Value}' in expression")
        };

        ExprNode IntLit() { Advance(); return new IntegerLiteralNode(long.Parse(token.Value)); }
        ExprNode RealLit() { Advance(); return new RealLiteralNode(double.Parse(token.Value)); }
        ExprNode StrLit() { Advance(); return new StringLiteralNode(token.Value); }
        ExprNode BoolLit(bool v) { Advance(); return new BoolLiteralNode(v); }
        ExprNode NullLit() { Advance(); return new NullLiteralNode(); }
        ExprNode ColRef() { Advance(); return new ColumnRefNode(token.Value); }
        ExprNode Grouped() { Advance(); var e = ParseExpression(); Expect(TokenType.RightParen); return e; }
    }
}

public sealed class ParseException : Exception
{
    public ParseException(string message) : base(message) { }
}
```

### MiniDB.Engine/Database.cs

```csharp
using MiniDB.Sql.Lexer;
using MiniDB.Sql.Parser;
using MiniDB.Storage;

namespace MiniDB.Engine;

public sealed class Database : IDisposable
{
    private readonly Pager _pager;
    private readonly BufferPool _pool;
    private readonly Catalog _catalog;
    private readonly Executor _executor;

    public Catalog Catalog => _catalog;

    public Database(string path, bool createNew = false)
    {
        _pager = new Pager(path, createNew);
        _pool = new BufferPool(_pager);
        _catalog = new Catalog(_pool);
        _executor = new Executor(_catalog, _pool);
    }

    public ResultSet Execute(string sql)
    {
        var tokens = new SqlLexer(sql).Tokenize();
        var ast = new SqlParser(tokens).Parse();
        return _executor.Execute(ast);
    }

    public void Dispose()
    {
        _pool.FlushAll();
        _pool.Dispose();
        _pager.Dispose();
    }
}
```

### MiniDB.Engine/Catalog.cs

```csharp
using MiniDB.Storage;

namespace MiniDB.Engine;

public sealed class Catalog
{
    private readonly BufferPool _pool;
    private readonly Dictionary<string, TableInfo> _tables = new(StringComparer.OrdinalIgnoreCase);

    public Catalog(BufferPool pool)
    {
        _pool = pool;
    }

    public void RegisterTable(string name, TableSchema schema)
    {
        var btree = new BTree(_pool);
        var info = new TableInfo(schema, btree, new List<object?[]>());
        _tables[name] = info;
    }

    public TableInfo GetTable(string name) =>
        _tables.TryGetValue(name, out var info)
            ? info
            : throw new InvalidOperationException($"Table '{name}' does not exist.");

    public bool TableExists(string name) => _tables.ContainsKey(name);

    public IEnumerable<string> TableNames => _tables.Keys;

    public IReadOnlyDictionary<string, TableInfo> Tables => _tables;
}

public sealed class TableInfo
{
    public TableSchema Schema { get; }
    public BTree PrimaryIndex { get; }
    public List<object?[]> Rows { get; } // In-memory row store (simplified)
    public Dictionary<string, BTree> SecondaryIndexes { get; } = new(StringComparer.OrdinalIgnoreCase);

    public TableInfo(TableSchema schema, BTree primaryIndex, List<object?[]> rows)
    {
        Schema = schema;
        PrimaryIndex = primaryIndex;
        Rows = rows;
    }
}
```

### MiniDB.Engine/ResultSet.cs

```csharp
namespace MiniDB.Engine;

public sealed class ResultSet
{
    public string[] ColumnNames { get; }
    public List<object?[]> Rows { get; }
    public int AffectedRows { get; }
    public string? Message { get; }

    public ResultSet(string[] columnNames, List<object?[]> rows)
    {
        ColumnNames = columnNames;
        Rows = rows;
        AffectedRows = rows.Count;
    }

    public ResultSet(int affectedRows, string message)
    {
        ColumnNames = [];
        Rows = [];
        AffectedRows = affectedRows;
        Message = message;
    }

    public string ToFormattedTable()
    {
        if (Message is not null)
            return Message;

        if (ColumnNames.Length == 0)
            return "(empty result)";

        // Calculate column widths
        int[] widths = new int[ColumnNames.Length];
        for (int i = 0; i < ColumnNames.Length; i++)
            widths[i] = ColumnNames[i].Length;

        foreach (var row in Rows)
        {
            for (int i = 0; i < row.Length && i < widths.Length; i++)
            {
                int len = (row[i]?.ToString() ?? "NULL").Length;
                if (len > widths[i]) widths[i] = len;
            }
        }

        var sb = new System.Text.StringBuilder();

        // Header
        for (int i = 0; i < ColumnNames.Length; i++)
        {
            if (i > 0) sb.Append(" | ");
            sb.Append(ColumnNames[i].PadRight(widths[i]));
        }
        sb.AppendLine();

        // Separator
        for (int i = 0; i < ColumnNames.Length; i++)
        {
            if (i > 0) sb.Append("-+-");
            sb.Append(new string('-', widths[i]));
        }
        sb.AppendLine();

        // Rows
        foreach (var row in Rows)
        {
            for (int i = 0; i < ColumnNames.Length; i++)
            {
                if (i > 0) sb.Append(" | ");
                string val = row[i]?.ToString() ?? "NULL";
                sb.Append(val.PadRight(widths[i]));
            }
            sb.AppendLine();
        }

        sb.Append($"({Rows.Count} row{(Rows.Count == 1 ? "" : "s")})");
        return sb.ToString();
    }
}
```

### MiniDB.Engine/Executor.cs

```csharp
using MiniDB.Sql.Parser;
using MiniDB.Storage;

namespace MiniDB.Engine;

public sealed class Executor
{
    private readonly Catalog _catalog;
    private readonly BufferPool _pool;

    public Executor(Catalog catalog, BufferPool pool)
    {
        _catalog = catalog;
        _pool = pool;
    }

    public ResultSet Execute(AstNode node) => node switch
    {
        CreateTableNode ct => ExecuteCreateTable(ct),
        InsertNode ins => ExecuteInsert(ins),
        SelectNode sel => ExecuteSelect(sel),
        UpdateNode upd => ExecuteUpdate(upd),
        DeleteNode del => ExecuteDelete(del),
        CreateIndexNode ci => ExecuteCreateIndex(ci),
        _ => throw new InvalidOperationException($"Unknown AST node type: {node.GetType().Name}")
    };

    private ResultSet ExecuteCreateTable(CreateTableNode ct)
    {
        if (_catalog.TableExists(ct.TableName))
            throw new InvalidOperationException($"Table '{ct.TableName}' already exists.");

        var columns = ct.Columns.Select(c => new ColumnDefinition(
            c.Name,
            ParseDataType(c.TypeName),
            c.Nullable,
            c.IsPrimaryKey
        )).ToList();

        var schema = new TableSchema(ct.TableName, columns);
        _catalog.RegisterTable(ct.TableName, schema);
        return new ResultSet(0, $"Table '{ct.TableName}' created.");
    }

    private ResultSet ExecuteInsert(InsertNode ins)
    {
        var table = _catalog.GetTable(ins.TableName);
        int inserted = 0;

        foreach (var valueRow in ins.ValueRows)
        {
            var row = new object?[table.Schema.Columns.Count];

            for (int i = 0; i < valueRow.Count; i++)
            {
                int colIndex = ins.ColumnNames is not null
                    ? table.Schema.GetColumnIndex(ins.ColumnNames[i])
                    : i;

                row[colIndex] = EvaluateLiteral(valueRow[i], table.Schema.Columns[colIndex].Type);
            }

            long pk = Convert.ToInt64(row[table.Schema.PrimaryKeyIndex]);
            int rowIndex = table.Rows.Count;
            table.Rows.Add(row);

            // Insert into primary B-tree (pageId=0 as placeholder, slot=rowIndex)
            table.PrimaryIndex.Insert(pk, 0, rowIndex);

            // Update secondary indexes
            foreach (var (colName, index) in table.SecondaryIndexes)
            {
                int ci = table.Schema.GetColumnIndex(colName);
                if (row[ci] is not null)
                    index.Insert(Convert.ToInt64(row[ci]), 0, rowIndex);
            }

            inserted++;
        }

        return new ResultSet(inserted, $"Inserted {inserted} row{(inserted == 1 ? "" : "s")}.");
    }

    private ResultSet ExecuteSelect(SelectNode sel)
    {
        var table = _catalog.GetTable(sel.TableName);

        // Determine output columns
        List<int> colIndexes;
        string[] colNames;

        if (sel.Columns.Count == 1 && sel.Columns[0].IsStar)
        {
            colIndexes = Enumerable.Range(0, table.Schema.Columns.Count).ToList();
            colNames = table.Schema.Columns.Select(c => c.Name).ToArray();
        }
        else
        {
            colIndexes = sel.Columns.Select(c => table.Schema.GetColumnIndex(c.Name)).ToList();
            colNames = sel.Columns.Select(c => c.Name).ToArray();
        }

        // Scan rows and apply WHERE filter
        var results = new List<object?[]>();

        foreach (var row in table.Rows)
        {
            if (row is null) continue; // tombstone
            if (sel.WhereClause is not null && !EvaluateWhere(sel.WhereClause, row, table.Schema))
                continue;

            var projected = new object?[colIndexes.Count];
            for (int i = 0; i < colIndexes.Count; i++)
                projected[i] = row[colIndexes[i]];

            results.Add(projected);
        }

        // ORDER BY
        if (sel.OrderBy is not null)
        {
            int orderIdx = colIndexes.IndexOf(table.Schema.GetColumnIndex(sel.OrderBy.ColumnName));
            if (orderIdx < 0) orderIdx = 0;

            results.Sort((a, b) =>
            {
                var va = a[orderIdx] as IComparable;
                var vb = b[orderIdx] as IComparable;
                if (va is null && vb is null) return 0;
                if (va is null) return -1;
                if (vb is null) return 1;
                int cmp = va.CompareTo(vb);
                return sel.OrderBy.Descending ? -cmp : cmp;
            });
        }

        // OFFSET / LIMIT
        if (sel.Offset.HasValue)
            results = results.Skip(sel.Offset.Value).ToList();
        if (sel.Limit.HasValue)
            results = results.Take(sel.Limit.Value).ToList();

        return new ResultSet(colNames, results);
    }

    private ResultSet ExecuteUpdate(UpdateNode upd)
    {
        var table = _catalog.GetTable(upd.TableName);
        int updated = 0;

        for (int i = 0; i < table.Rows.Count; i++)
        {
            var row = table.Rows[i];
            if (row is null) continue;
            if (upd.WhereClause is not null && !EvaluateWhere(upd.WhereClause, row, table.Schema))
                continue;

            foreach (var assign in upd.Assignments)
            {
                int colIdx = table.Schema.GetColumnIndex(assign.ColumnName);
                row[colIdx] = EvaluateLiteral(assign.Value, table.Schema.Columns[colIdx].Type);
            }
            updated++;
        }

        return new ResultSet(updated, $"Updated {updated} row{(updated == 1 ? "" : "s")}.");
    }

    private ResultSet ExecuteDelete(DeleteNode del)
    {
        var table = _catalog.GetTable(del.TableName);
        int deleted = 0;

        for (int i = table.Rows.Count - 1; i >= 0; i--)
        {
            var row = table.Rows[i];
            if (row is null) continue;
            if (del.WhereClause is not null && !EvaluateWhere(del.WhereClause, row, table.Schema))
                continue;

            table.Rows[i] = null!; // tombstone
            deleted++;
        }

        return new ResultSet(deleted, $"Deleted {deleted} row{(deleted == 1 ? "" : "s")}.");
    }

    private ResultSet ExecuteCreateIndex(CreateIndexNode ci)
    {
        var table = _catalog.GetTable(ci.TableName);
        int colIdx = table.Schema.GetColumnIndex(ci.ColumnName);
        if (colIdx < 0)
            throw new InvalidOperationException($"Column '{ci.ColumnName}' not found.");

        var index = new BTree(_pool);
        table.SecondaryIndexes[ci.ColumnName] = index;

        // Backfill existing rows
        for (int i = 0; i < table.Rows.Count; i++)
        {
            var row = table.Rows[i];
            if (row is not null && row[colIdx] is not null)
                index.Insert(Convert.ToInt64(row[colIdx]), 0, i);
        }

        return new ResultSet(0, $"Index '{ci.IndexName}' created on {ci.TableName}({ci.ColumnName}).");
    }

    private bool EvaluateWhere(ExprNode expr, object?[] row, TableSchema schema) => expr switch
    {
        BinaryExprNode { Operator: "AND" } b =>
            EvaluateWhere(b.Left, row, schema) && EvaluateWhere(b.Right, row, schema),

        BinaryExprNode { Operator: "OR" } b =>
            EvaluateWhere(b.Left, row, schema) || EvaluateWhere(b.Right, row, schema),

        BinaryExprNode bin => EvaluateComparison(bin, row, schema),

        _ => throw new InvalidOperationException($"Cannot evaluate expression: {expr}")
    };

    private bool EvaluateComparison(BinaryExprNode bin, object?[] row, TableSchema schema)
    {
        var left = ResolveValue(bin.Left, row, schema);
        var right = ResolveValue(bin.Right, row, schema);

        if (left is null || right is null)
            return bin.Operator == "=" ? (left is null && right is null) : false;

        int cmp = Comparer<object>.Default.Compare(left, right);

        return bin.Operator switch
        {
            "=" => cmp == 0,
            "<>" => cmp != 0,
            "<" => cmp < 0,
            ">" => cmp > 0,
            "<=" => cmp <= 0,
            ">=" => cmp >= 0,
            _ => throw new InvalidOperationException($"Unknown operator: {bin.Operator}")
        };
    }

    private object? ResolveValue(ExprNode expr, object?[] row, TableSchema schema) => expr switch
    {
        ColumnRefNode col => row[schema.GetColumnIndex(col.ColumnName)],
        IntegerLiteralNode i => i.Value,
        RealLiteralNode r => r.Value,
        StringLiteralNode s => s.Value,
        BoolLiteralNode b => b.Value,
        NullLiteralNode => null,
        _ => throw new InvalidOperationException($"Cannot resolve value: {expr}")
    };

    private object? EvaluateLiteral(ExprNode expr, DataType targetType) => expr switch
    {
        IntegerLiteralNode i => i.Value,
        RealLiteralNode r => r.Value,
        StringLiteralNode s => s.Value,
        BoolLiteralNode b => b.Value,
        NullLiteralNode => null,
        _ => throw new InvalidOperationException($"Cannot evaluate literal: {expr}")
    };

    private static DataType ParseDataType(string name) =>
        name.ToUpperInvariant() switch
        {
            "INTEGER" or "INT" => DataType.Integer,
            "REAL" or "FLOAT" or "DOUBLE" => DataType.Real,
            "TEXT" or "VARCHAR" or "STRING" => DataType.Text,
            "BOOLEAN" or "BOOL" => DataType.Boolean,
            _ => throw new InvalidOperationException($"Unknown data type: {name}")
        };
}
```

### MiniDB.Repl/Program.cs

```csharp
using MiniDB.Engine;

namespace MiniDB.Repl;

public static class Program
{
    public static void Main(string[] args)
    {
        string dbPath = args.Length > 0 ? args[0] : "minidb.db";
        bool isNew = !File.Exists(dbPath);

        using var db = new Database(dbPath, isNew);
        var repl = new ReplLoop(db);
        repl.Run();
    }
}
```

### MiniDB.Repl/ReplLoop.cs

```csharp
using MiniDB.Engine;

namespace MiniDB.Repl;

public sealed class ReplLoop
{
    private readonly Database _db;
    private bool _running = true;

    public ReplLoop(Database db) => _db = db;

    public void Run()
    {
        Console.WriteLine("MiniDB v0.1 — Type .help for commands, SQL statements end with ;");
        Console.WriteLine();

        var buffer = new System.Text.StringBuilder();

        while (_running)
        {
            Console.Write(buffer.Length == 0 ? "minidb> " : "   ...> ");
            string? line = Console.ReadLine();
            if (line is null) break;

            string trimmed = line.Trim();

            if (buffer.Length == 0 && trimmed.StartsWith('.'))
            {
                HandleDotCommand(trimmed);
                continue;
            }

            buffer.AppendLine(line);

            if (trimmed.EndsWith(';'))
            {
                string sql = buffer.ToString().Trim();
                buffer.Clear();

                try
                {
                    var result = _db.Execute(sql);
                    Console.WriteLine(result.ToFormattedTable());
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error: {ex.Message}");
                }
                Console.WriteLine();
            }
        }
    }

    private void HandleDotCommand(string cmd)
    {
        var parts = cmd.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        string command = parts[0].ToLowerInvariant();

        switch (command)
        {
            case ".exit" or ".quit":
                _running = false;
                Console.WriteLine("Goodbye.");
                break;

            case ".tables":
                foreach (var name in _db.Catalog.TableNames)
                    Console.WriteLine(name);
                break;

            case ".schema":
                if (parts.Length < 2)
                {
                    foreach (var (name, info) in _db.Catalog.Tables)
                        PrintSchema(name, info);
                }
                else
                {
                    var info = _db.Catalog.GetTable(parts[1]);
                    PrintSchema(parts[1], info);
                }
                break;

            case ".help":
                Console.WriteLine(".tables           List all tables");
                Console.WriteLine(".schema [table]   Show CREATE TABLE statement");
                Console.WriteLine(".exit             Exit MiniDB");
                Console.WriteLine(".help             Show this help");
                break;

            default:
                Console.WriteLine($"Unknown command: {command}");
                break;
        }
        Console.WriteLine();
    }

    private static void PrintSchema(string name, TableInfo info)
    {
        Console.Write($"CREATE TABLE {name} (");
        for (int i = 0; i < info.Schema.Columns.Count; i++)
        {
            if (i > 0) Console.Write(", ");
            var col = info.Schema.Columns[i];
            Console.Write($"{col.Name} {col.Type}");
            if (col.IsPrimaryKey) Console.Write(" PRIMARY KEY");
            else if (!col.Nullable) Console.Write(" NOT NULL");
        }
        Console.WriteLine(");");
    }
}
```

</details>

---

## What to Show Off

### Portfolio Presentation

- **GitHub README**: Include architecture diagrams showing the layer stack (REPL -> Parser -> Executor -> Storage). Show example REPL sessions with real queries. Explain your B-tree implementation with visual splits.
- **Blog post idea**: "I Built a Database From Scratch in C#" — walks through the storage format, B-tree splits, and SQL parsing. This is unusual enough to stand out.
- **Demo video**: Record a terminal session creating tables, inserting data, running queries, and showing how indexes speed up lookups.

### Interview Talking Points

- "I implemented a B+ tree with node splitting and leaf chaining for sequential scans."
- "My SQL parser uses recursive descent with one-token lookahead — the same technique used in production databases."
- "The buffer pool uses LRU eviction with pin counting to prevent evicting in-use pages."
- "I used `Span<byte>` and `BinaryPrimitives` for zero-allocation page serialization."
- Discuss trade-offs: why fixed-size pages, why B+ tree over B-tree, why recursive descent over parser generators.

### Code Quality Signals

- Separation of concerns across four projects (Storage, Sql, Engine, Repl)
- Extensive unit tests at every layer
- Binary-level file format documentation in comments
- Error messages that include SQL position for debugging

---

## Stretch Goals

1. **Transaction support**: Implement `BEGIN`, `COMMIT`, `ROLLBACK` with WAL-based undo logging. Track modified pages per transaction and roll back by restoring before-images on abort.

2. **EXPLAIN QUERY PLAN**: Print the query execution plan showing whether a full scan or index lookup will be used, estimated row counts, and which index is selected.

3. **Simple JOIN**: Implement `SELECT ... FROM a INNER JOIN b ON a.col = b.col` using nested-loop join. This is a major feature — adds join planning and multi-table row resolution.

4. **Persistence of schema**: Store table and index metadata in reserved pages (a system catalog table) so the database can be closed and reopened without re-creating tables.

5. **Concurrent read access**: Implement reader-writer locking so multiple threads can read simultaneously while writes are exclusive. Use `ReaderWriterLockSlim` on the buffer pool.
