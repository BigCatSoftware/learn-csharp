# Project 8: Personal Finance CLI Tool

*Difficulty: Medium | Estimated: 3-5 days | Category: General Software*

---

## Project Overview

Build a personal finance CLI application that imports bank transaction CSVs, auto-categorizes transactions by merchant keywords, generates monthly spending reports by category, tracks budgets and net worth, and renders beautiful terminal charts using Spectre.Console. Data is stored in SQLite via `Microsoft.Data.Sqlite` with Dapper for data access.

This project is a practical tool you can actually use day-to-day. The auto-categorization engine learns from keyword patterns you define: "STARBUCKS" maps to "Coffee", "SAFEWAY" maps to "Groceries", "SHELL OIL" maps to "Gas". It handles the messiness of real bank exports: inconsistent date formats, duplicate detection, and varying CSV layouts from different banks.

Commands follow a clean verb-noun pattern: `finance import`, `finance report`, `finance budget set`, `finance summary`, `finance networth`. Output uses Spectre.Console for rich terminal rendering: colored tables, bar charts, progress bars during import, and tree views for category breakdowns.

---

## Learning Objectives

- Build a multi-command CLI application with `System.CommandLine`
- Use SQLite with `Microsoft.Data.Sqlite` and Dapper for lightweight relational storage
- Implement keyword-based categorization with configurable rules
- Parse and normalize CSV data from multiple bank formats
- Generate aggregate reports using LINQ and SQL
- Render rich terminal output with Spectre.Console (tables, charts, trees)
- Handle real-world data quality issues (duplicates, date formats, encoding)
- Design a clean domain model with separation between CLI, core logic, and data access
- Export data to CSV and HTML formats
- Write testable code with dependency injection and interfaces

---

## Prerequisites

| Lesson | Topic |
|--------|-------|
| 167 | Dapper |
| 16 | File IO |
| 06 | LINQ |
| 10 | Collections |
| 13 | String Handling |

---

## Architecture

```
Finance.sln
|
+-- src/
|   +-- Finance.Core/                       # Domain models, interfaces, business logic
|   |   +-- Models/
|   |   |   +-- Transaction.cs
|   |   |   +-- Category.cs
|   |   |   +-- Budget.cs
|   |   |   +-- Account.cs
|   |   |   +-- MonthlyReport.cs
|   |   +-- Services/
|   |   |   +-- CategorizationEngine.cs
|   |   |   +-- ReportGenerator.cs
|   |   |   +-- ImportService.cs
|   |   |   +-- BudgetService.cs
|   |   |   +-- NetWorthService.cs
|   |   +-- Interfaces/
|   |   |   +-- ITransactionRepository.cs
|   |   |   +-- ICategoryRepository.cs
|   |   |   +-- IBudgetRepository.cs
|   |   |   +-- IAccountRepository.cs
|   |   +-- Parsers/
|   |   |   +-- ICsvParser.cs
|   |   |   +-- GenericCsvParser.cs
|   |   |   +-- ChaseParser.cs
|   |   |   +-- BankOfAmericaParser.cs
|   |   +-- Export/
|   |   |   +-- CsvExporter.cs
|   |   |   +-- HtmlExporter.cs
|   |   +-- Finance.Core.csproj
|   |
|   +-- Finance.Data/                       # SQLite + Dapper repositories
|   |   +-- SqliteDatabase.cs              # Schema creation and migrations
|   |   +-- Repositories/
|   |   |   +-- TransactionRepository.cs
|   |   |   +-- CategoryRepository.cs
|   |   |   +-- BudgetRepository.cs
|   |   |   +-- AccountRepository.cs
|   |   +-- Finance.Data.csproj
|   |
|   +-- Finance.Cli/                        # CLI entry point and commands
|       +-- Commands/
|       |   +-- ImportCommand.cs
|       |   +-- ReportCommand.cs
|       |   +-- BudgetCommand.cs
|       |   +-- SummaryCommand.cs
|       |   +-- NetWorthCommand.cs
|       |   +-- CategoryCommand.cs
|       |   +-- ExportCommand.cs
|       +-- Rendering/
|       |   +-- TableRenderer.cs
|       |   +-- ChartRenderer.cs
|       |   +-- TreeRenderer.cs
|       +-- Program.cs
|       +-- Finance.Cli.csproj
|
+-- tests/
    +-- Finance.Tests/
        +-- Services/
        |   +-- CategorizationEngineTests.cs
        |   +-- ReportGeneratorTests.cs
        |   +-- ImportServiceTests.cs
        +-- Parsers/
        |   +-- GenericCsvParserTests.cs
        +-- Repositories/
        |   +-- TransactionRepositoryTests.cs
        +-- Finance.Tests.csproj
```

---

## Requirements

### Core Requirements

1. **CSV Import**: Parse bank CSV files and insert transactions into SQLite. Detect and skip duplicate transactions (same date, amount, and description). Support a configurable CSV format (column indices for date, description, amount).
2. **Auto-Categorization**: Categorize transactions by matching merchant descriptions against keyword rules. Rules are stored in SQLite: a category has many keywords, and matching is case-insensitive substring. Uncategorized transactions go to an "Uncategorized" bucket.
3. **Monthly Report**: Display a monthly spending breakdown by category with totals, averages, and comparison to the previous month. Render as a Spectre.Console table with colored amounts (red for over budget, green for under).
4. **Budget Management**: Set monthly budgets per category. When generating reports, show actual vs. budget with a percentage indicator and visual bar.
5. **CLI Interface**: Implement `import`, `report`, `budget set`, `budget list`, `summary`, `category add`, `category list` commands using `System.CommandLine`.

### Extended Requirements

6. **Net Worth Tracking**: Track accounts (checking, savings, credit card, investment) with manual balance updates. Show net worth over time in a Spectre.Console bar chart.
7. **Search and Filter**: Search transactions by description, date range, amount range, or category. Display results in a paged table.
8. **Export**: Export reports to CSV and HTML. HTML export generates a self-contained file with inline CSS for clean formatting.

### Stretch Requirements

9. **Spending Trends**: Show month-over-month spending trends per category as a line chart or sparkline in the terminal.
10. **Recurring Transaction Detection**: Automatically detect recurring transactions (same amount, similar description, regular interval) and flag them.
11. **Multi-Bank Support**: Built-in parsers for specific bank CSV formats (Chase, Bank of America, etc.) with auto-detection based on header row patterns.

---

## Technical Guidance

### SQLite Schema Design

Keep the schema straightforward but well-indexed:

```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    parent_id INTEGER REFERENCES categories(id)
);

CREATE TABLE keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    pattern TEXT NOT NULL,
    UNIQUE(category_id, pattern)
);

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,               -- ISO 8601 format
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    account_id INTEGER REFERENCES accounts(id),
    import_hash TEXT NOT NULL UNIQUE,  -- SHA256 for duplicate detection
    imported_at TEXT NOT NULL
);

CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    monthly_amount REAL NOT NULL,
    effective_from TEXT NOT NULL,
    UNIQUE(category_id, effective_from)
);

CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,                -- checking, savings, credit, investment
    institution TEXT
);

CREATE TABLE account_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    balance REAL NOT NULL,
    as_of TEXT NOT NULL
);
```

Use the `import_hash` column (SHA256 of date + description + amount) to detect duplicates across imports.

### Dapper Usage Patterns

Dapper works naturally with SQLite. Key patterns:

```csharp
// Query with mapping
var transactions = await connection.QueryAsync<Transaction>(
    "SELECT * FROM transactions WHERE date >= @From AND date <= @To",
    new { From = startDate.ToString("yyyy-MM-dd"), To = endDate.ToString("yyyy-MM-dd") });

// Insert with parameters
await connection.ExecuteAsync(
    "INSERT INTO transactions (date, description, amount, category_id, import_hash, imported_at) " +
    "VALUES (@Date, @Description, @Amount, @CategoryId, @ImportHash, @ImportedAt)",
    transaction);
```

Store dates as ISO 8601 strings in SQLite (`yyyy-MM-dd`). SQLite does not have a native date type, but string comparison works correctly for date ranges with this format.

### Categorization Engine Design

The categorization engine should:
1. Load all keywords from the database at startup (they are small, keep in memory)
2. For each transaction, check if the description contains any keyword (case-insensitive)
3. If multiple keywords match, prefer the longest match (more specific)
4. Return the category ID or null for uncategorized

Consider building a simple trie or just using `string.Contains` with `StringComparison.OrdinalIgnoreCase` — for typical personal finance volumes (thousands of transactions), a linear scan is fast enough.

### Spectre.Console Rendering

Spectre.Console provides rich terminal UI primitives. Key components:

- `Table` for tabular data with colored cells
- `BarChart` for budget vs. actual visualization
- `Tree` for hierarchical category breakdowns
- `Progress` for import progress bars
- `Rule` for section dividers
- `Markup` for inline colored text like `[red]$-500.00[/]`

### Duplicate Detection

Generate a hash for each transaction: `SHA256(date + "|" + description + "|" + amount)`. Before inserting, check if the hash exists. Use SQLite's `INSERT OR IGNORE` with the unique constraint on `import_hash` for efficiency.

---

## Step-by-Step Milestones

### Milestone 1: Project Setup and SQLite Schema (Day 1)

Create the solution structure. Set up `SqliteDatabase` that creates all tables on first run. Add default categories (Groceries, Dining, Gas, Utilities, Entertainment, Shopping, Income, Transfer, Uncategorized) with common keywords. Write a test that verifies the database is created correctly.

### Milestone 2: CSV Parsing and Import (Day 1-2)

Implement `GenericCsvParser` that reads a CSV with configurable column mappings. Implement `ImportService` that parses the CSV, generates import hashes, detects duplicates, and inserts new transactions. Add the `finance import` CLI command with options for `--file`, `--date-column`, `--description-column`, `--amount-column`, `--date-format`. Show a Spectre.Console progress bar during import with a summary (imported, skipped duplicates, errors).

### Milestone 3: Categorization Engine (Day 2)

Implement `CategorizationEngine` that loads keyword rules and categorizes transactions. Add `finance category add` and `finance category list` commands. Run categorization on import and provide a `finance categorize` command to re-categorize all uncategorized transactions. Write tests for keyword matching, longest-match priority, and case insensitivity.

### Milestone 4: Monthly Reports (Day 2-3)

Implement `ReportGenerator` that aggregates transactions by category for a given month. Add the `finance report` command with `--month` and `--year` options (defaults to current month). Render a Spectre.Console table showing category, transaction count, total amount, average amount, and percentage of total spending. Add a bar chart showing the top categories.

### Milestone 5: Budget Management (Day 3-4)

Implement `BudgetService` for setting and querying budgets. Add `finance budget set --category "Dining" --amount 500` and `finance budget list` commands. Enhance the monthly report to show budget vs. actual with colored indicators: green for under budget, yellow for 80-100%, red for over budget. Add a horizontal bar showing the percentage consumed.

### Milestone 6: Summary and Net Worth (Day 4)

Add `finance summary` that shows a dashboard: total income, total expenses, net savings, top 5 spending categories, and any over-budget categories. Implement net worth tracking with `finance networth add --account "Checking" --balance 5000` and `finance networth` to display a bar chart of net worth over time. Use Spectre.Console `BarChart` for visualization.

### Milestone 7: Export and Search (Day 4-5)

Implement `CsvExporter` that writes transactions or reports to CSV. Implement `HtmlExporter` that generates a self-contained HTML report with inline CSS. Add `finance export --format csv --output report.csv` and `finance export --format html --output report.html`. Add search: `finance search --description "coffee" --from 2025-01 --to 2025-06`.

### Milestone 8: Polish and Testing (Day 5)

Write comprehensive tests for the categorization engine, report generator, and CSV parser. Add bank-specific parsers (Chase, BofA) with auto-detection. Add error handling for malformed CSVs. Polish the CLI help text and add examples.

---

## Testing Requirements

### Unit Tests

- **CategorizationEngine**: Test single keyword match, multiple keyword match (longest wins), case insensitivity, no match returns uncategorized, empty description.
- **GenericCsvParser**: Test normal CSV, quoted fields, different date formats, missing columns, empty file, file with only headers.
- **ReportGenerator**: Test aggregation with known data. Verify totals, averages, and percentages. Test empty month (no transactions). Test month with only income.
- **ImportService**: Test duplicate detection (same hash is skipped). Test importing a file with mixed valid and invalid rows.
- **BudgetService**: Test budget creation, retrieval by category and month, budget comparison calculation.

### Integration Tests

- **Full Import-Report Cycle**: Import a known CSV, verify transaction count and categorization, generate a report, and verify the numbers match manual calculations.
- **Database Round-Trip**: Create categories, add keywords, import transactions, query by date range, verify data integrity.
- **Export**: Import data, export to CSV and HTML, verify the exported content matches the source data.

### Test Data

Create a `testdata/` folder with sample CSV files:
- `simple.csv`: 20 clean transactions for basic testing
- `duplicates.csv`: Contains rows that duplicate `simple.csv` entries
- `messy.csv`: Quoted fields, different date formats, missing amounts
- `large.csv`: 10,000 rows for performance testing

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### Finance.Core/Models/Transaction.cs

```csharp
namespace Finance.Core.Models;

public class Transaction
{
    public long Id { get; set; }
    public DateTime Date { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public long? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public long? AccountId { get; set; }
    public string ImportHash { get; set; } = string.Empty;
    public DateTime ImportedAt { get; set; }
}

public class Category
{
    public long Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public long? ParentId { get; set; }
    public List<string> Keywords { get; set; } = new();
}

public class Budget
{
    public long Id { get; set; }
    public long CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public decimal MonthlyAmount { get; set; }
    public string EffectiveFrom { get; set; } = string.Empty;
}

public class Account
{
    public long Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? Institution { get; set; }
}

public class AccountBalance
{
    public long Id { get; set; }
    public long AccountId { get; set; }
    public string? AccountName { get; set; }
    public decimal Balance { get; set; }
    public DateTime AsOf { get; set; }
}

public class MonthlyReport
{
    public int Year { get; set; }
    public int Month { get; set; }
    public List<CategorySummary> Categories { get; set; } = new();
    public decimal TotalIncome { get; set; }
    public decimal TotalExpenses { get; set; }
    public decimal NetSavings { get; set; }
}

public class CategorySummary
{
    public string CategoryName { get; set; } = string.Empty;
    public int TransactionCount { get; set; }
    public decimal Total { get; set; }
    public decimal Average { get; set; }
    public decimal? BudgetAmount { get; set; }
    public decimal? BudgetRemaining { get; set; }
    public double? BudgetPercentUsed { get; set; }
}
```

### Finance.Core/Interfaces/ITransactionRepository.cs

```csharp
using Finance.Core.Models;

namespace Finance.Core.Interfaces;

public interface ITransactionRepository
{
    Task<long> InsertAsync(Transaction transaction);
    Task<int> InsertBatchAsync(IEnumerable<Transaction> transactions);
    Task<bool> ExistsByHashAsync(string importHash);
    Task<IReadOnlyList<Transaction>> GetByDateRangeAsync(DateTime from, DateTime to);
    Task<IReadOnlyList<Transaction>> SearchAsync(
        string? description = null, DateTime? from = null, DateTime? to = null,
        decimal? minAmount = null, decimal? maxAmount = null, long? categoryId = null,
        int limit = 100);
    Task UpdateCategoryAsync(long transactionId, long categoryId);
    Task<int> UpdateCategoryBatchAsync(IEnumerable<(long transactionId, long categoryId)> updates);
}

public interface ICategoryRepository
{
    Task<long> InsertAsync(string name, long? parentId = null);
    Task AddKeywordAsync(long categoryId, string pattern);
    Task<IReadOnlyList<Category>> GetAllWithKeywordsAsync();
    Task<Category?> GetByNameAsync(string name);
}

public interface IBudgetRepository
{
    Task SetBudgetAsync(long categoryId, decimal amount, string effectiveFrom);
    Task<IReadOnlyList<Budget>> GetBudgetsAsync(string effectiveMonth);
    Task<Budget?> GetBudgetAsync(long categoryId, string effectiveMonth);
}

public interface IAccountRepository
{
    Task<long> InsertAccountAsync(Account account);
    Task<IReadOnlyList<Account>> GetAllAccountsAsync();
    Task AddBalanceAsync(long accountId, decimal balance, DateTime asOf);
    Task<IReadOnlyList<AccountBalance>> GetBalanceHistoryAsync(long? accountId = null);
    Task<decimal> GetNetWorthAsync(DateTime? asOf = null);
}
```

### Finance.Data/SqliteDatabase.cs

```csharp
using Microsoft.Data.Sqlite;
using Dapper;

namespace Finance.Data;

public class SqliteDatabase
{
    private readonly string _connectionString;

    public SqliteDatabase(string dbPath)
    {
        _connectionString = $"Data Source={dbPath}";
    }

    public string ConnectionString => _connectionString;

    public SqliteConnection CreateConnection() => new(_connectionString);

    public async Task InitializeAsync()
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();

        await conn.ExecuteAsync("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                parent_id INTEGER REFERENCES categories(id)
            );

            CREATE TABLE IF NOT EXISTS keywords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                pattern TEXT NOT NULL COLLATE NOCASE,
                UNIQUE(category_id, pattern)
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL,
                institution TEXT
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                category_id INTEGER REFERENCES categories(id),
                account_id INTEGER REFERENCES accounts(id),
                import_hash TEXT NOT NULL UNIQUE,
                imported_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
            CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(import_hash);

            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL REFERENCES categories(id),
                monthly_amount REAL NOT NULL,
                effective_from TEXT NOT NULL,
                UNIQUE(category_id, effective_from)
            );

            CREATE TABLE IF NOT EXISTS account_balances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                balance REAL NOT NULL,
                as_of TEXT NOT NULL
            );
        """);

        // Seed default categories
        await SeedDefaultCategoriesAsync(conn);
    }

    private static async Task SeedDefaultCategoriesAsync(SqliteConnection conn)
    {
        var existing = await conn.QueryFirstOrDefaultAsync<int>(
            "SELECT COUNT(*) FROM categories");
        if (existing > 0) return;

        var defaults = new Dictionary<string, string[]>
        {
            ["Groceries"] = ["SAFEWAY", "KROGER", "TRADER JOE", "WHOLE FOODS", "COSTCO",
                             "WALMART GROCERY", "TARGET", "ALDI", "FRED MEYER", "QFC"],
            ["Dining"] = ["RESTAURANT", "DOORDASH", "UBER EATS", "GRUBHUB", "MCDONALD",
                          "CHIPOTLE", "SUBWAY", "PIZZA", "TACO BELL", "WENDY"],
            ["Coffee"] = ["STARBUCKS", "DUTCH BROS", "PEET'S COFFEE", "COFFEE"],
            ["Gas"] = ["SHELL", "CHEVRON", "ARCO", "76 GAS", "COSTCO GAS", "EXXON",
                       "BP GAS", "FUEL"],
            ["Utilities"] = ["ELECTRIC", "GAS BILL", "WATER BILL", "COMCAST", "XFINITY",
                             "T-MOBILE", "VERIZON", "AT&T", "INTERNET"],
            ["Entertainment"] = ["NETFLIX", "SPOTIFY", "HULU", "DISNEY+", "AMAZON PRIME",
                                 "STEAM", "PLAYSTATION", "XBOX", "MOVIE", "THEATER"],
            ["Shopping"] = ["AMAZON.COM", "AMAZON MKTPLACE", "BEST BUY", "HOME DEPOT",
                            "LOWES", "IKEA", "NORDSTROM"],
            ["Transportation"] = ["UBER", "LYFT", "PARKING", "METRO", "TRANSIT", "TOLL"],
            ["Health"] = ["PHARMACY", "CVS", "WALGREENS", "DOCTOR", "DENTAL", "HOSPITAL",
                          "MEDICAL"],
            ["Income"] = ["PAYROLL", "DIRECT DEPOSIT", "SALARY", "DIVIDEND", "INTEREST EARNED"],
            ["Transfer"] = ["TRANSFER", "ZELLE", "VENMO", "PAYPAL"],
            ["Uncategorized"] = []
        };

        foreach (var (category, keywords) in defaults)
        {
            var catId = await conn.ExecuteScalarAsync<long>(
                "INSERT INTO categories (name) VALUES (@Name); SELECT last_insert_rowid()",
                new { Name = category });

            foreach (var keyword in keywords)
            {
                await conn.ExecuteAsync(
                    "INSERT OR IGNORE INTO keywords (category_id, pattern) VALUES (@CatId, @Pattern)",
                    new { CatId = catId, Pattern = keyword });
            }
        }
    }
}
```

### Finance.Data/Repositories/TransactionRepository.cs

```csharp
using Dapper;
using Finance.Core.Interfaces;
using Finance.Core.Models;

namespace Finance.Data.Repositories;

public class TransactionRepository : ITransactionRepository
{
    private readonly SqliteDatabase _db;

    public TransactionRepository(SqliteDatabase db) => _db = db;

    public async Task<long> InsertAsync(Transaction transaction)
    {
        await using var conn = _db.CreateConnection();
        return await conn.ExecuteScalarAsync<long>("""
            INSERT OR IGNORE INTO transactions
                (date, description, amount, category_id, account_id, import_hash, imported_at)
            VALUES
                (@Date, @Description, @Amount, @CategoryId, @AccountId, @ImportHash, @ImportedAt);
            SELECT last_insert_rowid()
            """, new
        {
            Date = transaction.Date.ToString("yyyy-MM-dd"),
            transaction.Description,
            transaction.Amount,
            transaction.CategoryId,
            transaction.AccountId,
            transaction.ImportHash,
            ImportedAt = transaction.ImportedAt.ToString("yyyy-MM-ddTHH:mm:ss")
        });
    }

    public async Task<int> InsertBatchAsync(IEnumerable<Transaction> transactions)
    {
        await using var conn = _db.CreateConnection();
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        int count = 0;
        foreach (var t in transactions)
        {
            var affected = await conn.ExecuteAsync("""
                INSERT OR IGNORE INTO transactions
                    (date, description, amount, category_id, account_id, import_hash, imported_at)
                VALUES
                    (@Date, @Description, @Amount, @CategoryId, @AccountId, @ImportHash, @ImportedAt)
                """, new
            {
                Date = t.Date.ToString("yyyy-MM-dd"),
                t.Description,
                t.Amount,
                t.CategoryId,
                t.AccountId,
                t.ImportHash,
                ImportedAt = t.ImportedAt.ToString("yyyy-MM-ddTHH:mm:ss")
            }, transaction: tx);

            count += affected;
        }

        await tx.CommitAsync();
        return count;
    }

    public async Task<bool> ExistsByHashAsync(string importHash)
    {
        await using var conn = _db.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM transactions WHERE import_hash = @Hash",
            new { Hash = importHash }) > 0;
    }

    public async Task<IReadOnlyList<Transaction>> GetByDateRangeAsync(DateTime from, DateTime to)
    {
        await using var conn = _db.CreateConnection();
        var results = await conn.QueryAsync<Transaction>("""
            SELECT t.*, c.name AS CategoryName
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.date >= @From AND t.date <= @To
            ORDER BY t.date DESC
            """, new
        {
            From = from.ToString("yyyy-MM-dd"),
            To = to.ToString("yyyy-MM-dd")
        });
        return results.ToList();
    }

    public async Task<IReadOnlyList<Transaction>> SearchAsync(
        string? description, DateTime? from, DateTime? to,
        decimal? minAmount, decimal? maxAmount, long? categoryId, int limit)
    {
        await using var conn = _db.CreateConnection();
        var sql = """
            SELECT t.*, c.name AS CategoryName
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE 1=1
            """;

        var parameters = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(description))
        {
            sql += " AND t.description LIKE @Desc";
            parameters.Add("Desc", $"%{description}%");
        }
        if (from.HasValue)
        {
            sql += " AND t.date >= @From";
            parameters.Add("From", from.Value.ToString("yyyy-MM-dd"));
        }
        if (to.HasValue)
        {
            sql += " AND t.date <= @To";
            parameters.Add("To", to.Value.ToString("yyyy-MM-dd"));
        }
        if (minAmount.HasValue)
        {
            sql += " AND t.amount >= @MinAmt";
            parameters.Add("MinAmt", minAmount.Value);
        }
        if (maxAmount.HasValue)
        {
            sql += " AND t.amount <= @MaxAmt";
            parameters.Add("MaxAmt", maxAmount.Value);
        }
        if (categoryId.HasValue)
        {
            sql += " AND t.category_id = @CatId";
            parameters.Add("CatId", categoryId.Value);
        }

        sql += " ORDER BY t.date DESC LIMIT @Limit";
        parameters.Add("Limit", limit);

        var results = await conn.QueryAsync<Transaction>(sql, parameters);
        return results.ToList();
    }

    public async Task UpdateCategoryAsync(long transactionId, long categoryId)
    {
        await using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "UPDATE transactions SET category_id = @CatId WHERE id = @Id",
            new { CatId = categoryId, Id = transactionId });
    }

    public async Task<int> UpdateCategoryBatchAsync(
        IEnumerable<(long transactionId, long categoryId)> updates)
    {
        await using var conn = _db.CreateConnection();
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        int count = 0;
        foreach (var (tid, cid) in updates)
        {
            count += await conn.ExecuteAsync(
                "UPDATE transactions SET category_id = @CatId WHERE id = @Id",
                new { CatId = cid, Id = tid }, transaction: tx);
        }

        await tx.CommitAsync();
        return count;
    }
}
```

### Finance.Core/Services/CategorizationEngine.cs

```csharp
using Finance.Core.Interfaces;
using Finance.Core.Models;

namespace Finance.Core.Services;

public class CategorizationEngine
{
    private readonly List<(long categoryId, string pattern)> _rules = new();

    public async Task LoadRulesAsync(ICategoryRepository categoryRepo)
    {
        _rules.Clear();
        var categories = await categoryRepo.GetAllWithKeywordsAsync();

        foreach (var cat in categories)
        {
            foreach (var keyword in cat.Keywords)
            {
                _rules.Add((cat.Id, keyword));
            }
        }

        // Sort by pattern length descending so longer (more specific) matches win
        _rules.Sort((a, b) => b.pattern.Length.CompareTo(a.pattern.Length));
    }

    public long? Categorize(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
            return null;

        foreach (var (categoryId, pattern) in _rules)
        {
            if (description.Contains(pattern, StringComparison.OrdinalIgnoreCase))
            {
                return categoryId;
            }
        }

        return null;
    }

    public IReadOnlyList<(long transactionId, long categoryId)> CategorizeAll(
        IEnumerable<Transaction> transactions)
    {
        var updates = new List<(long, long)>();

        foreach (var t in transactions)
        {
            var catId = Categorize(t.Description);
            if (catId.HasValue)
            {
                updates.Add((t.Id, catId.Value));
            }
        }

        return updates;
    }
}
```

### Finance.Core/Services/ReportGenerator.cs

```csharp
using Finance.Core.Interfaces;
using Finance.Core.Models;

namespace Finance.Core.Services;

public class ReportGenerator
{
    private readonly ITransactionRepository _transactionRepo;
    private readonly IBudgetRepository _budgetRepo;

    public ReportGenerator(ITransactionRepository transactionRepo, IBudgetRepository budgetRepo)
    {
        _transactionRepo = transactionRepo;
        _budgetRepo = budgetRepo;
    }

    public async Task<MonthlyReport> GenerateMonthlyReportAsync(int year, int month)
    {
        var from = new DateTime(year, month, 1);
        var to = from.AddMonths(1).AddDays(-1);

        var transactions = await _transactionRepo.GetByDateRangeAsync(from, to);
        var budgets = await _budgetRepo.GetBudgetsAsync(from.ToString("yyyy-MM"));

        var report = new MonthlyReport { Year = year, Month = month };

        // Group by category
        var grouped = transactions
            .GroupBy(t => t.CategoryName ?? "Uncategorized")
            .OrderByDescending(g => Math.Abs(g.Sum(t => t.Amount)));

        foreach (var group in grouped)
        {
            var total = group.Sum(t => t.Amount);
            var budget = budgets.FirstOrDefault(b =>
                b.CategoryName?.Equals(group.Key, StringComparison.OrdinalIgnoreCase) == true);

            var summary = new CategorySummary
            {
                CategoryName = group.Key,
                TransactionCount = group.Count(),
                Total = total,
                Average = group.Count() > 0 ? total / group.Count() : 0,
                BudgetAmount = budget?.MonthlyAmount,
                BudgetRemaining = budget is not null ? budget.MonthlyAmount - Math.Abs(total) : null,
                BudgetPercentUsed = budget is not null && budget.MonthlyAmount > 0
                    ? (double)(Math.Abs(total) / budget.MonthlyAmount) * 100
                    : null
            };

            report.Categories.Add(summary);
        }

        report.TotalIncome = transactions.Where(t => t.Amount > 0).Sum(t => t.Amount);
        report.TotalExpenses = transactions.Where(t => t.Amount < 0).Sum(t => t.Amount);
        report.NetSavings = report.TotalIncome + report.TotalExpenses;

        return report;
    }
}
```

### Finance.Core/Services/ImportService.cs

```csharp
using Finance.Core.Interfaces;
using Finance.Core.Models;
using Finance.Core.Parsers;
using System.Security.Cryptography;
using System.Text;

namespace Finance.Core.Services;

public class ImportResult
{
    public int TotalRows { get; set; }
    public int Imported { get; set; }
    public int Duplicates { get; set; }
    public int Errors { get; set; }
    public List<string> ErrorMessages { get; set; } = new();
}

public class ImportService
{
    private readonly ITransactionRepository _transactionRepo;
    private readonly CategorizationEngine _categorizer;

    public ImportService(ITransactionRepository transactionRepo, CategorizationEngine categorizer)
    {
        _transactionRepo = transactionRepo;
        _categorizer = categorizer;
    }

    public async Task<ImportResult> ImportFileAsync(
        string filePath, ICsvParser parser, long? accountId = null)
    {
        var result = new ImportResult();
        var transactions = new List<Transaction>();

        await foreach (var parsed in parser.ParseAsync(filePath))
        {
            result.TotalRows++;

            if (parsed.Error is not null)
            {
                result.Errors++;
                result.ErrorMessages.Add($"Row {result.TotalRows}: {parsed.Error}");
                continue;
            }

            var hash = ComputeHash(parsed.Date, parsed.Description!, parsed.Amount);

            if (await _transactionRepo.ExistsByHashAsync(hash))
            {
                result.Duplicates++;
                continue;
            }

            var categoryId = _categorizer.Categorize(parsed.Description!);

            transactions.Add(new Transaction
            {
                Date = parsed.Date,
                Description = parsed.Description!,
                Amount = parsed.Amount,
                CategoryId = categoryId,
                AccountId = accountId,
                ImportHash = hash,
                ImportedAt = DateTime.UtcNow
            });
        }

        if (transactions.Count > 0)
        {
            result.Imported = await _transactionRepo.InsertBatchAsync(transactions);
        }

        return result;
    }

    private static string ComputeHash(DateTime date, string description, decimal amount)
    {
        var input = $"{date:yyyy-MM-dd}|{description}|{amount:F2}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes);
    }
}
```

### Finance.Core/Parsers/GenericCsvParser.cs

```csharp
using System.Globalization;
using System.Runtime.CompilerServices;

namespace Finance.Core.Parsers;

public record ParsedTransaction(
    DateTime Date, string? Description, decimal Amount, string? Error);

public interface ICsvParser
{
    IAsyncEnumerable<ParsedTransaction> ParseAsync(string filePath,
        CancellationToken ct = default);
}

public class CsvParserOptions
{
    public int DateColumn { get; set; }
    public int DescriptionColumn { get; set; } = 1;
    public int AmountColumn { get; set; } = 2;
    public string DateFormat { get; set; } = "MM/dd/yyyy";
    public bool HasHeader { get; set; } = true;
    public char Delimiter { get; set; } = ',';
    public bool NegateAmounts { get; set; }
}

public class GenericCsvParser : ICsvParser
{
    private readonly CsvParserOptions _options;

    public GenericCsvParser(CsvParserOptions? options = null)
    {
        _options = options ?? new CsvParserOptions();
    }

    public async IAsyncEnumerable<ParsedTransaction> ParseAsync(
        string filePath, [EnumeratorCancellation] CancellationToken ct = default)
    {
        using var reader = new StreamReader(filePath);
        int lineNum = 0;

        while (!reader.EndOfStream)
        {
            ct.ThrowIfCancellationRequested();
            var line = await reader.ReadLineAsync(ct);
            lineNum++;

            if (line is null) break;
            if (lineNum == 1 && _options.HasHeader) continue;
            if (string.IsNullOrWhiteSpace(line)) continue;

            var fields = ParseCsvLine(line, _options.Delimiter);

            var maxRequired = Math.Max(_options.DateColumn,
                Math.Max(_options.DescriptionColumn, _options.AmountColumn));

            if (fields.Length <= maxRequired)
            {
                yield return new ParsedTransaction(default, null, 0,
                    $"Not enough columns (got {fields.Length}, need {maxRequired + 1})");
                continue;
            }

            // Parse date
            if (!DateTime.TryParseExact(fields[_options.DateColumn].Trim(),
                _options.DateFormat, CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var date))
            {
                // Try common formats as fallback
                if (!DateTime.TryParse(fields[_options.DateColumn].Trim(),
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
                {
                    yield return new ParsedTransaction(default, null, 0,
                        $"Cannot parse date '{fields[_options.DateColumn]}'");
                    continue;
                }
            }

            // Parse description
            var description = fields[_options.DescriptionColumn].Trim();

            // Parse amount
            var amountStr = fields[_options.AmountColumn].Trim()
                .Replace("$", "").Replace(",", "").Trim('"');
            if (!decimal.TryParse(amountStr, NumberStyles.Number | NumberStyles.AllowLeadingSign,
                CultureInfo.InvariantCulture, out var amount))
            {
                yield return new ParsedTransaction(default, null, 0,
                    $"Cannot parse amount '{fields[_options.AmountColumn]}'");
                continue;
            }

            if (_options.NegateAmounts)
                amount = -amount;

            yield return new ParsedTransaction(date, description, amount, null);
        }
    }

    internal static string[] ParseCsvLine(string line, char delimiter)
    {
        var fields = new List<string>();
        var current = new StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];

            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < line.Length && line[i + 1] == '"')
                    {
                        current.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    current.Append(c);
                }
            }
            else if (c == '"')
            {
                inQuotes = true;
            }
            else if (c == delimiter)
            {
                fields.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }

        fields.Add(current.ToString());
        return fields.ToArray();
    }

    // StringBuilder field needed for ParseCsvLine
    private class StringBuilder
    {
        private readonly System.Text.StringBuilder _sb = new();
        public void Append(char c) => _sb.Append(c);
        public override string ToString() => _sb.ToString();
        public void Clear() => _sb.Clear();
    }
}
```

### Finance.Core/Export/CsvExporter.cs

```csharp
using Finance.Core.Models;
using System.Text;

namespace Finance.Core.Export;

public class CsvExporter
{
    public async Task ExportTransactionsAsync(
        IReadOnlyList<Transaction> transactions, string outputPath)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Date,Description,Amount,Category");

        foreach (var t in transactions)
        {
            sb.AppendLine($"{t.Date:yyyy-MM-dd}," +
                $"\"{t.Description.Replace("\"", "\"\"")}\"," +
                $"{t.Amount:F2}," +
                $"\"{t.CategoryName ?? "Uncategorized"}\"");
        }

        await File.WriteAllTextAsync(outputPath, sb.ToString());
    }

    public async Task ExportReportAsync(MonthlyReport report, string outputPath)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Category,Transactions,Total,Average,Budget,Remaining,%Used");

        foreach (var cat in report.Categories)
        {
            sb.AppendLine($"\"{cat.CategoryName}\"," +
                $"{cat.TransactionCount}," +
                $"{cat.Total:F2}," +
                $"{cat.Average:F2}," +
                $"{cat.BudgetAmount?.ToString("F2") ?? ""}," +
                $"{cat.BudgetRemaining?.ToString("F2") ?? ""}," +
                $"{cat.BudgetPercentUsed?.ToString("F1") ?? ""}");
        }

        sb.AppendLine();
        sb.AppendLine($"Total Income,{report.TotalIncome:F2}");
        sb.AppendLine($"Total Expenses,{report.TotalExpenses:F2}");
        sb.AppendLine($"Net Savings,{report.NetSavings:F2}");

        await File.WriteAllTextAsync(outputPath, sb.ToString());
    }
}

public class HtmlExporter
{
    public async Task ExportReportAsync(MonthlyReport report, string outputPath)
    {
        var sb = new StringBuilder();
        sb.AppendLine("<!DOCTYPE html><html><head><meta charset=\"utf-8\">");
        sb.AppendLine($"<title>Finance Report - {report.Year}-{report.Month:D2}</title>");
        sb.AppendLine("<style>");
        sb.AppendLine("body{font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem}");
        sb.AppendLine("table{width:100%;border-collapse:collapse;margin:1rem 0}");
        sb.AppendLine("th,td{padding:8px 12px;text-align:right;border-bottom:1px solid #ddd}");
        sb.AppendLine("th{background:#f5f5f5;text-align:left}");
        sb.AppendLine("td:first-child{text-align:left}");
        sb.AppendLine(".negative{color:#dc3545} .positive{color:#28a745}");
        sb.AppendLine(".over-budget{background:#fff3cd}");
        sb.AppendLine(".summary{display:flex;gap:2rem;margin:1rem 0}");
        sb.AppendLine(".summary div{padding:1rem;border-radius:8px;background:#f8f9fa;flex:1}");
        sb.AppendLine("</style></head><body>");

        sb.AppendLine($"<h1>Monthly Report: {report.Year}-{report.Month:D2}</h1>");

        // Summary cards
        sb.AppendLine("<div class=\"summary\">");
        sb.AppendLine($"<div><strong>Income</strong><br><span class=\"positive\">${report.TotalIncome:N2}</span></div>");
        sb.AppendLine($"<div><strong>Expenses</strong><br><span class=\"negative\">${Math.Abs(report.TotalExpenses):N2}</span></div>");
        var savingsClass = report.NetSavings >= 0 ? "positive" : "negative";
        sb.AppendLine($"<div><strong>Net</strong><br><span class=\"{savingsClass}\">${report.NetSavings:N2}</span></div>");
        sb.AppendLine("</div>");

        // Category table
        sb.AppendLine("<table><thead><tr>");
        sb.AppendLine("<th>Category</th><th>Count</th><th>Total</th><th>Avg</th>");
        sb.AppendLine("<th>Budget</th><th>Remaining</th><th>% Used</th></tr></thead><tbody>");

        foreach (var cat in report.Categories)
        {
            var rowClass = cat.BudgetPercentUsed > 100 ? " class=\"over-budget\"" : "";
            var amtClass = cat.Total < 0 ? "negative" : "positive";
            sb.AppendLine($"<tr{rowClass}>");
            sb.AppendLine($"<td>{cat.CategoryName}</td>");
            sb.AppendLine($"<td>{cat.TransactionCount}</td>");
            sb.AppendLine($"<td class=\"{amtClass}\">${cat.Total:N2}</td>");
            sb.AppendLine($"<td>${cat.Average:N2}</td>");
            sb.AppendLine($"<td>{(cat.BudgetAmount.HasValue ? $"${cat.BudgetAmount:N2}" : "-")}</td>");
            sb.AppendLine($"<td>{(cat.BudgetRemaining.HasValue ? $"${cat.BudgetRemaining:N2}" : "-")}</td>");
            sb.AppendLine($"<td>{(cat.BudgetPercentUsed.HasValue ? $"{cat.BudgetPercentUsed:F1}%" : "-")}</td>");
            sb.AppendLine("</tr>");
        }

        sb.AppendLine("</tbody></table></body></html>");
        await File.WriteAllTextAsync(outputPath, sb.ToString());
    }
}
```

### Finance.Cli/Program.cs

```csharp
using Finance.Core.Export;
using Finance.Core.Interfaces;
using Finance.Core.Parsers;
using Finance.Core.Services;
using Finance.Data;
using Finance.Data.Repositories;
using Spectre.Console;
using System.CommandLine;

var dbPath = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
    ".finance", "finance.db");
Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);

var db = new SqliteDatabase(dbPath);
await db.InitializeAsync();

var transactionRepo = new TransactionRepository(db);
var categoryRepo = new CategoryRepository(db);
var budgetRepo = new BudgetRepository(db);
var accountRepo = new AccountRepository(db);
var categorizer = new CategorizationEngine();
await categorizer.LoadRulesAsync(categoryRepo);

var rootCommand = new RootCommand("Personal Finance CLI Tool");

// --- Import Command ---
var importCmd = new Command("import", "Import bank transactions from CSV");
var fileArg = new Argument<FileInfo>("file", "CSV file to import");
var dateColOpt = new Option<int>("--date-column", () => 0, "Date column index");
var descColOpt = new Option<int>("--desc-column", () => 1, "Description column index");
var amtColOpt = new Option<int>("--amount-column", () => 2, "Amount column index");
var dateFmtOpt = new Option<string>("--date-format", () => "MM/dd/yyyy", "Date format");
var negateOpt = new Option<bool>("--negate", () => false, "Negate amounts");

importCmd.AddArgument(fileArg);
importCmd.AddOption(dateColOpt);
importCmd.AddOption(descColOpt);
importCmd.AddOption(amtColOpt);
importCmd.AddOption(dateFmtOpt);
importCmd.AddOption(negateOpt);

importCmd.SetHandler(async (file, dateCol, descCol, amtCol, dateFmt, negate) =>
{
    if (!file.Exists)
    {
        AnsiConsole.MarkupLine("[red]File not found.[/]");
        return;
    }

    var parser = new GenericCsvParser(new CsvParserOptions
    {
        DateColumn = dateCol,
        DescriptionColumn = descCol,
        AmountColumn = amtCol,
        DateFormat = dateFmt,
        NegateAmounts = negate
    });

    var importService = new ImportService(transactionRepo, categorizer);

    var result = await AnsiConsole.Status()
        .Spinner(Spinner.Known.Dots)
        .StartAsync("Importing transactions...",
            async _ => await importService.ImportFileAsync(file.FullName, parser));

    var table = new Table().Border(TableBorder.Rounded);
    table.AddColumn("Metric");
    table.AddColumn("Count");
    table.AddRow("Total Rows", result.TotalRows.ToString("N0"));
    table.AddRow("[green]Imported[/]", result.Imported.ToString("N0"));
    table.AddRow("[yellow]Duplicates[/]", result.Duplicates.ToString("N0"));
    table.AddRow("[red]Errors[/]", result.Errors.ToString("N0"));

    AnsiConsole.Write(table);

    foreach (var err in result.ErrorMessages.Take(10))
    {
        AnsiConsole.MarkupLine($"  [red]{Markup.Escape(err)}[/]");
    }
}, fileArg, dateColOpt, descColOpt, amtColOpt, dateFmtOpt, negateOpt);

// --- Report Command ---
var reportCmd = new Command("report", "Generate monthly spending report");
var monthOpt = new Option<int?>("--month", "Month (1-12), defaults to current");
var yearOpt = new Option<int?>("--year", "Year, defaults to current");

reportCmd.AddOption(monthOpt);
reportCmd.AddOption(yearOpt);

reportCmd.SetHandler(async (month, year) =>
{
    var m = month ?? DateTime.Now.Month;
    var y = year ?? DateTime.Now.Year;

    var generator = new ReportGenerator(transactionRepo, budgetRepo);
    var report = await generator.GenerateMonthlyReportAsync(y, m);

    AnsiConsole.Write(new Rule($"[bold]Monthly Report: {y}-{m:D2}[/]").LeftJustified());
    AnsiConsole.WriteLine();

    // Summary
    var summaryTable = new Table().Border(TableBorder.Rounded);
    summaryTable.AddColumn("").Width(20);
    summaryTable.AddColumn("Amount").RightAligned();
    summaryTable.AddRow("[green]Income[/]", $"[green]${report.TotalIncome:N2}[/]");
    summaryTable.AddRow("[red]Expenses[/]", $"[red]${Math.Abs(report.TotalExpenses):N2}[/]");
    var netColor = report.NetSavings >= 0 ? "green" : "red";
    summaryTable.AddRow($"[bold]Net[/]", $"[{netColor}]${report.NetSavings:N2}[/]");
    AnsiConsole.Write(summaryTable);
    AnsiConsole.WriteLine();

    // Category breakdown
    var catTable = new Table().Border(TableBorder.Rounded);
    catTable.AddColumn("Category");
    catTable.AddColumn("Count").RightAligned();
    catTable.AddColumn("Total").RightAligned();
    catTable.AddColumn("Budget").RightAligned();
    catTable.AddColumn("Status");

    foreach (var cat in report.Categories)
    {
        var totalStr = cat.Total < 0
            ? $"[red]${cat.Total:N2}[/]"
            : $"[green]${cat.Total:N2}[/]";

        var budgetStr = cat.BudgetAmount.HasValue
            ? $"${cat.BudgetAmount:N2}" : "-";

        string status;
        if (cat.BudgetPercentUsed is null)
            status = "-";
        else if (cat.BudgetPercentUsed > 100)
            status = $"[red]{cat.BudgetPercentUsed:F0}% OVER[/]";
        else if (cat.BudgetPercentUsed > 80)
            status = $"[yellow]{cat.BudgetPercentUsed:F0}%[/]";
        else
            status = $"[green]{cat.BudgetPercentUsed:F0}%[/]";

        catTable.AddRow(cat.CategoryName, cat.TransactionCount.ToString(),
            totalStr, budgetStr, status);
    }

    AnsiConsole.Write(catTable);

    // Bar chart for top spending categories
    var expenseCategories = report.Categories
        .Where(c => c.Total < 0)
        .OrderBy(c => c.Total)
        .Take(8);

    var chart = new BarChart().Label("[bold]Top Spending Categories[/]").Width(60);
    foreach (var cat in expenseCategories)
    {
        chart.AddItem(cat.CategoryName, Math.Abs((double)cat.Total), Color.Red);
    }
    AnsiConsole.Write(chart);

}, monthOpt, yearOpt);

// --- Budget Commands ---
var budgetCmd = new Command("budget", "Manage budgets");
var budgetSetCmd = new Command("set", "Set a monthly budget");
var budgetCatOpt = new Option<string>("--category", "Category name") { IsRequired = true };
var budgetAmtOpt = new Option<decimal>("--amount", "Monthly budget amount") { IsRequired = true };

budgetSetCmd.AddOption(budgetCatOpt);
budgetSetCmd.AddOption(budgetAmtOpt);

budgetSetCmd.SetHandler(async (categoryName, amount) =>
{
    var category = await categoryRepo.GetByNameAsync(categoryName);
    if (category is null)
    {
        AnsiConsole.MarkupLine($"[red]Category '{Markup.Escape(categoryName)}' not found.[/]");
        return;
    }

    var effectiveFrom = DateTime.Now.ToString("yyyy-MM");
    await budgetRepo.SetBudgetAsync(category.Id, amount, effectiveFrom);
    AnsiConsole.MarkupLine($"[green]Budget set: {Markup.Escape(categoryName)} = ${amount:N2}/month[/]");
}, budgetCatOpt, budgetAmtOpt);

var budgetListCmd = new Command("list", "List all budgets");
budgetListCmd.SetHandler(async () =>
{
    var budgets = await budgetRepo.GetBudgetsAsync(DateTime.Now.ToString("yyyy-MM"));
    var table = new Table().Border(TableBorder.Rounded);
    table.AddColumn("Category");
    table.AddColumn("Monthly Amount").RightAligned();

    foreach (var b in budgets)
        table.AddRow(b.CategoryName ?? "?", $"${b.MonthlyAmount:N2}");

    AnsiConsole.Write(table);
});

budgetCmd.AddCommand(budgetSetCmd);
budgetCmd.AddCommand(budgetListCmd);

// --- Summary Command ---
var summaryCmd = new Command("summary", "Show financial dashboard");
summaryCmd.SetHandler(async () =>
{
    var now = DateTime.Now;
    var generator = new ReportGenerator(transactionRepo, budgetRepo);
    var report = await generator.GenerateMonthlyReportAsync(now.Year, now.Month);

    AnsiConsole.Write(new FigletText("Finance").Color(Color.Blue));
    AnsiConsole.Write(new Rule($"[bold]{now:MMMM yyyy}[/]"));
    AnsiConsole.WriteLine();

    var panel = new Table().Border(TableBorder.HeavyEdge);
    panel.AddColumn("").Width(25);
    panel.AddColumn("").RightAligned().Width(15);

    panel.AddRow("[green bold]Total Income[/]", $"[green]${report.TotalIncome:N2}[/]");
    panel.AddRow("[red bold]Total Expenses[/]", $"[red]${Math.Abs(report.TotalExpenses):N2}[/]");
    panel.AddRow(new Rule(), new Rule());
    var nc = report.NetSavings >= 0 ? "green" : "red";
    panel.AddRow($"[{nc} bold]Net Savings[/]", $"[{nc} bold]${report.NetSavings:N2}[/]");

    AnsiConsole.Write(panel);
    AnsiConsole.WriteLine();

    // Over-budget alerts
    var overBudget = report.Categories
        .Where(c => c.BudgetPercentUsed > 100)
        .ToList();

    if (overBudget.Count > 0)
    {
        AnsiConsole.MarkupLine("[red bold]Over Budget:[/]");
        foreach (var cat in overBudget)
        {
            AnsiConsole.MarkupLine($"  [red]* {cat.CategoryName}: " +
                $"${Math.Abs(cat.Total):N2} / ${cat.BudgetAmount:N2} " +
                $"({cat.BudgetPercentUsed:F0}%)[/]");
        }
    }
});

// --- Category Command ---
var categoryCmd = new Command("category", "Manage categories");
var catAddCmd = new Command("add", "Add a keyword to a category");
var catNameOpt = new Option<string>("--name", "Category name") { IsRequired = true };
var keywordOpt = new Option<string>("--keyword", "Keyword pattern") { IsRequired = true };

catAddCmd.AddOption(catNameOpt);
catAddCmd.AddOption(keywordOpt);

catAddCmd.SetHandler(async (name, keyword) =>
{
    var category = await categoryRepo.GetByNameAsync(name);
    if (category is null)
    {
        var id = await categoryRepo.InsertAsync(name);
        await categoryRepo.AddKeywordAsync(id, keyword);
        AnsiConsole.MarkupLine($"[green]Created category '{Markup.Escape(name)}' with keyword '{Markup.Escape(keyword)}'[/]");
    }
    else
    {
        await categoryRepo.AddKeywordAsync(category.Id, keyword);
        AnsiConsole.MarkupLine($"[green]Added keyword '{Markup.Escape(keyword)}' to '{Markup.Escape(name)}'[/]");
    }
}, catNameOpt, keywordOpt);

var catListCmd = new Command("list", "List all categories and keywords");
catListCmd.SetHandler(async () =>
{
    var categories = await categoryRepo.GetAllWithKeywordsAsync();
    var tree = new Tree("[bold]Categories[/]");

    foreach (var cat in categories.OrderBy(c => c.Name))
    {
        var node = tree.AddNode($"[bold]{Markup.Escape(cat.Name)}[/]");
        foreach (var kw in cat.Keywords)
        {
            node.AddNode($"[grey]{Markup.Escape(kw)}[/]");
        }
    }

    AnsiConsole.Write(tree);
});

categoryCmd.AddCommand(catAddCmd);
categoryCmd.AddCommand(catListCmd);

// --- Export Command ---
var exportCmd = new Command("export", "Export data to CSV or HTML");
var formatOpt = new Option<string>("--format", () => "csv", "Output format (csv or html)");
var outputOpt = new Option<string>("--output", "Output file path") { IsRequired = true };

exportCmd.AddOption(monthOpt);
exportCmd.AddOption(yearOpt);
exportCmd.AddOption(formatOpt);
exportCmd.AddOption(outputOpt);

exportCmd.SetHandler(async (month, year, format, output) =>
{
    var m = month ?? DateTime.Now.Month;
    var y = year ?? DateTime.Now.Year;

    var generator = new ReportGenerator(transactionRepo, budgetRepo);
    var report = await generator.GenerateMonthlyReportAsync(y, m);

    if (format.Equals("html", StringComparison.OrdinalIgnoreCase))
    {
        var exporter = new HtmlExporter();
        await exporter.ExportReportAsync(report, output);
    }
    else
    {
        var exporter = new CsvExporter();
        await exporter.ExportReportAsync(report, output);
    }

    AnsiConsole.MarkupLine($"[green]Exported to {Markup.Escape(output)}[/]");
}, monthOpt, yearOpt, formatOpt, outputOpt);

// --- Net Worth Command ---
var nwCmd = new Command("networth", "Track net worth");
var nwAddCmd = new Command("add", "Add or update an account balance");
var nwAccOpt = new Option<string>("--account", "Account name") { IsRequired = true };
var nwBalOpt = new Option<decimal>("--balance", "Current balance") { IsRequired = true };
var nwTypeOpt = new Option<string>("--type", () => "checking",
    "Account type (checking, savings, credit, investment)");

nwAddCmd.AddOption(nwAccOpt);
nwAddCmd.AddOption(nwBalOpt);
nwAddCmd.AddOption(nwTypeOpt);

nwAddCmd.SetHandler(async (accountName, balance, type) =>
{
    var accounts = await accountRepo.GetAllAccountsAsync();
    var account = accounts.FirstOrDefault(a =>
        a.Name.Equals(accountName, StringComparison.OrdinalIgnoreCase));

    long accountId;
    if (account is null)
    {
        accountId = await accountRepo.InsertAccountAsync(new Finance.Core.Models.Account
        {
            Name = accountName,
            Type = type
        });
    }
    else
    {
        accountId = account.Id;
    }

    await accountRepo.AddBalanceAsync(accountId, balance, DateTime.Now);
    AnsiConsole.MarkupLine($"[green]Recorded: {Markup.Escape(accountName)} = ${balance:N2}[/]");
}, nwAccOpt, nwBalOpt, nwTypeOpt);

var nwShowCmd = new Command("show", "Show net worth summary");
nwShowCmd.SetHandler(async () =>
{
    var netWorth = await accountRepo.GetNetWorthAsync();
    var accounts = await accountRepo.GetAllAccountsAsync();

    AnsiConsole.Write(new Rule("[bold]Net Worth[/]"));

    var table = new Table().Border(TableBorder.Rounded);
    table.AddColumn("Account");
    table.AddColumn("Type");
    table.AddColumn("Balance").RightAligned();

    foreach (var acct in accounts)
    {
        var history = await accountRepo.GetBalanceHistoryAsync(acct.Id);
        var latest = history.OrderByDescending(b => b.AsOf).FirstOrDefault();
        var bal = latest?.Balance ?? 0;
        var color = bal >= 0 ? "green" : "red";
        table.AddRow(acct.Name, acct.Type, $"[{color}]${bal:N2}[/]");
    }

    table.AddRow(new Rule(), new Rule(), new Rule());
    var nwColor = netWorth >= 0 ? "green" : "red";
    table.AddRow("[bold]Total[/]", "", $"[{nwColor} bold]${netWorth:N2}[/]");

    AnsiConsole.Write(table);
});

nwCmd.AddCommand(nwAddCmd);
nwCmd.AddCommand(nwShowCmd);

// --- Wire up commands ---
rootCommand.AddCommand(importCmd);
rootCommand.AddCommand(reportCmd);
rootCommand.AddCommand(budgetCmd);
rootCommand.AddCommand(summaryCmd);
rootCommand.AddCommand(categoryCmd);
rootCommand.AddCommand(exportCmd);
rootCommand.AddCommand(nwCmd);

return await rootCommand.InvokeAsync(args);
```

</details>

---

## What to Show Off

### Portfolio Presentation

- Demo the full workflow live: import a CSV, show the auto-categorization, generate a report with colored Spectre.Console output, set a budget, and show the over/under indicators.
- Show the SQLite database schema and explain why you chose SQLite + Dapper over EF Core for a CLI tool (lightweight, zero server, fast startup).
- Walk through the categorization engine and explain the longest-match-first strategy.
- Export an HTML report and open it in a browser to show the clean formatting.

### Interview Talking Points

- **Data quality**: Discuss how you handle duplicate detection with hashing, malformed CSV rows, and inconsistent date formats. These are real-world data engineering problems.
- **Design decisions**: Explain the separation between Core, Data, and CLI layers. Discuss why you used interfaces for repositories (testability, swappability).
- **Dapper vs. EF Core**: Articulate when each is appropriate. For a CLI tool with simple queries, Dapper gives you full SQL control with less overhead.
- **User experience**: Discuss how Spectre.Console transforms a CLI from a wall of text into an interactive, visual tool.

---

## Stretch Goals

1. **Spending Trend Charts**: Add a `finance trend --category "Dining" --months 6` command that shows a month-over-month bar chart of spending in that category using Spectre.Console.
2. **Recurring Transaction Detection**: Scan transactions to find recurring patterns (similar description and amount appearing monthly). Flag them and show a summary: "Netflix $15.99 monthly since Jan 2025".
3. **Multi-Bank Parsers**: Add dedicated parsers for Chase (`ChaseParser`) and Bank of America (`BankOfAmericaParser`) CSV formats with auto-detection based on the header row. Add a `--bank` option to the import command.
4. **Interactive Categorization**: When uncategorized transactions are found, prompt the user interactively using `Spectre.Console.Prompt` to select a category and optionally add a keyword rule.
5. **Encrypted Database**: Use SQLCipher (via `SQLitePCLRaw.bundle_sqlcipher`) to encrypt the SQLite database, prompting for a password on first use.
