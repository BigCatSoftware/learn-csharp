# Project 3: Interpreter for a Simple Language

*Difficulty: Hard — Estimated: 1-2 weeks — Category: Programming Languages*

---

## Project Overview

Build a tree-walking interpreter for **Lox**, a simple dynamically typed scripting language
inspired by [Crafting Interpreters](https://craftinginterpreters.com) by Robert Nystrom.
You will implement every stage of language execution: scanning source text into tokens,
parsing tokens into an abstract syntax tree, and walking that tree to execute the program.

**Language features to implement:**

| Feature | Example |
|---|---|
| Variables | `var x = 10; var name = "Tiger";` |
| Arithmetic | `1 + 2 * 3 / (4 - 1)` — proper precedence |
| Comparison & logic | `x > 5 and y <= 10 or !done` |
| Strings | `"hello" + " world"` — concatenation |
| Booleans & nil | `true`, `false`, `nil` |
| Print statement | `print "hello world";` |
| If/else | `if (x > 0) { print "pos"; } else { print "neg"; }` |
| While loop | `while (x > 0) { x = x - 1; }` |
| For loop | `for (var i = 0; i < 10; i = i + 1) { print i; }` |
| Functions | `fun add(a, b) { return a + b; }` |
| Closures | Functions capture their enclosing environment |
| Classes | `class Dog { init(name) { this.name = name; } bark() { print "woof"; } }` |
| Inheritance | `class Puppy < Dog { ... }` — single inheritance with `super` |
| Comments | `// single line` and `/* multi-line */` |

**Components you will build:**

1. **Lexer/Scanner** — Converts source string into a stream of tokens
2. **Recursive Descent Parser** — Converts tokens into AST nodes
3. **AST Node Types** — Expression and statement node hierarchy
4. **Tree-Walking Interpreter** — Evaluates AST nodes recursively
5. **Environment** — Scoped variable storage supporting closures
6. **Error Reporter** — Syntax and runtime errors with line numbers
7. **REPL** — Interactive read-eval-print loop
8. **File Runner** — Execute `.lox` source files

This is the most intellectually demanding project in the set. It touches parsing theory,
tree data structures, scope chains, dynamic dispatch, and recursion — all skills that make
you a better programmer regardless of what you build day-to-day.

---

## Learning Objectives

- **Lexical analysis**: Understand how source text becomes tokens. Implement a state-machine scanner that handles string literals, numbers, identifiers, and keywords.
- **Recursive descent parsing**: Build a top-down parser where each grammar rule is a method. Understand operator precedence through grammar stratification.
- **Abstract syntax trees**: Design a node hierarchy using C# records and pattern matching. Use the visitor pattern or direct pattern matching for tree walking.
- **Scope and environments**: Implement lexical scoping with an environment chain. Understand closures as functions that capture their defining environment.
- **Dynamic typing in a static language**: Represent Lox values as `object?` in C#. Use runtime type checking and pattern matching for dispatch.
- **Error recovery**: Report multiple errors per parse instead of stopping at the first one. Synchronize the parser to a known state after an error.

---

## Prerequisites

| Lesson | Why |
|---|---|
| [Pattern Matching (08)](08-pattern-matching.md) | Switch expressions, type patterns — used extensively in the interpreter |
| [Classes and Objects (03)](03-classes-and-objects.md) | Designing the AST node hierarchy |
| [Delegates and Events (12)](12-delegates-and-events.md) | Lox functions as callable objects |
| [Design Patterns (24)](24-design-patterns.md) | Visitor pattern for AST traversal |
| [Iterators and Yield (26)](26-iterators-and-yield.md) | Lazy token generation in the scanner |

---

## Architecture

```
LoxInterpreter/
├── LoxInterpreter.sln
├── src/
│   ├── Lox.Core/
│   │   ├── Lox.Core.csproj
│   │   ├── Scanning/
│   │   │   ├── Token.cs              # Token record (type, lexeme, literal, line)
│   │   │   ├── TokenType.cs          # Enum of all token types
│   │   │   └── Scanner.cs            # Lexer: string → Token[]
│   │   ├── Parsing/
│   │   │   ├── Ast/
│   │   │   │   ├── Expr.cs           # Expression node hierarchy
│   │   │   │   └── Stmt.cs           # Statement node hierarchy
│   │   │   └── Parser.cs             # Recursive descent parser
│   │   ├── Interpreting/
│   │   │   ├── Interpreter.cs        # Tree-walking evaluator
│   │   │   ├── Environment.cs        # Scoped variable storage
│   │   │   ├── LoxCallable.cs        # Interface for callable values
│   │   │   ├── LoxFunction.cs        # User-defined functions
│   │   │   ├── LoxClass.cs           # Class objects
│   │   │   ├── LoxInstance.cs        # Class instances
│   │   │   └── NativeFunctions.cs    # Built-in functions (clock, etc.)
│   │   ├── Errors/
│   │   │   ├── LoxError.cs           # Base error type
│   │   │   ├── ScanError.cs          # Lexer errors
│   │   │   ├── ParseError.cs         # Parser errors
│   │   │   ├── RuntimeError.cs       # Interpreter runtime errors
│   │   │   └── ErrorReporter.cs      # Collects and formats errors
│   │   └── Resolver.cs               # Static variable resolution pass
│   ├── Lox.Repl/
│   │   ├── Lox.Repl.csproj
│   │   └── Program.cs                # REPL + file execution entry point
│   └── Lox.Samples/
│       ├── fibonacci.lox
│       ├── closures.lox
│       ├── classes.lox
│       └── inheritance.lox
└── tests/
    └── Lox.Tests/
        ├── Lox.Tests.csproj
        ├── ScannerTests.cs
        ├── ParserTests.cs
        ├── InterpreterTests.cs
        ├── EnvironmentTests.cs
        ├── ClosureTests.cs
        └── EndToEndTests.cs
```

**Key design decisions:**
- **Records for AST nodes**: `abstract record Expr` with nested record types. Pattern matching in C# makes the visitor pattern optional.
- **Environment chain**: Each `Environment` has a reference to its enclosing scope. Variable lookup walks the chain outward. Closures capture the environment at definition time.
- **`object?` for values**: Lox is dynamically typed, so all values are `object?` in C#. Numbers are `double`, strings are `string`, booleans are `bool`, nil is `null`.

---

## Requirements

### Core (Must Have)

1. **Scanner** — Tokenize all Lox tokens: single-char (`(`, `)`, `+`, `-`, etc.), two-char (`!=`, `==`, `>=`, `<=`), literals (strings, numbers), identifiers, keywords (`var`, `if`, `else`, `while`, `for`, `fun`, `return`, `class`, `print`, `and`, `or`, `true`, `false`, `nil`, `this`, `super`).
2. **Parser** — Recursive descent for: expression statements, print, var declarations, assignment, blocks, if/else, while, for, function declarations, return, class declarations. Proper operator precedence (unary > factor > term > comparison > equality > logic).
3. **Interpreter** — Evaluate all expressions and execute all statements. Type checking at runtime (e.g., can not add number + string unless one is concatenation).
4. **Environment** — Lexical scoping with `Define`, `Get`, `Set`, `GetAt` (for resolved variables). Enclosed environments for blocks and function calls.
5. **Functions** — User-defined with `fun`, closures, recursion. Built-in `clock()` for timing.
6. **REPL** — Interactive mode: type expressions and see results, type statements and execute them.
7. **File execution** — `dotnet run -- script.lox` reads and executes a file.
8. **Error reporting** — Syntax errors with line numbers, runtime errors with line numbers, multiple errors reported per parse.

### Extended (Should Have)

9. **Classes** — `class` declarations, `init` constructor, `this`, methods, property access with dot notation.
10. **Inheritance** — Single inheritance with `<`, `super` keyword for calling parent methods.
11. **Variable resolver** — Static analysis pass that resolves variable bindings before interpretation (Crafting Interpreters chapter 11). Catches "variable used before definition" errors.
12. **Multi-line comments** — `/* ... */` with nesting support.

### Stretch (Nice to Have)

13. **Break and continue** in loops.
14. **Lambda expressions** — `var add = fun(a, b) { return a + b; };`
15. **Arrays** — `var a = [1, 2, 3]; print a[0];`
16. **String interpolation** — `"hello ${name}"`
17. **Static methods** — `class Math { class square(x) { return x * x; } }`

---

## Technical Guidance

### The Scanner

The scanner is a loop over the source string with a `current` position pointer. Each
iteration, examine the current character and produce a token. For two-character tokens like
`!=`, peek ahead one character. For strings, advance until the closing `"`. For numbers,
consume digits and an optional decimal point.

Think about: How do you distinguish an identifier like `orchid` from a keyword like `or`?
(Hint: scan the whole identifier, then check a keyword lookup table.)

### Recursive Descent Parsing

Each grammar rule becomes a method. Start from the lowest-precedence rule at the top:

```
program     → declaration* EOF
declaration → classDecl | funDecl | varDecl | statement
statement   → exprStmt | printStmt | block | ifStmt | whileStmt | forStmt | returnStmt
expression  → assignment
assignment  → IDENTIFIER "=" assignment | logic_or
logic_or    → logic_and ("or" logic_and)*
logic_and   → equality ("and" equality)*
equality    → comparison (("!=" | "==") comparison)*
comparison  → term ((">" | ">=" | "<" | "<=") term)*
term        → factor (("+" | "-") factor)*
factor      → unary (("*" | "/") unary)*
unary       → ("!" | "-") unary | call
call        → primary ("(" arguments? ")" | "." IDENTIFIER)*
primary     → NUMBER | STRING | "true" | "false" | "nil" | "(" expression ")"
              | IDENTIFIER | "this" | "super" "." IDENTIFIER
```

Each method calls the next-higher-precedence method for its operands. Binary operators loop
to handle left-associativity: `1 + 2 + 3` parses as `(1 + 2) + 3`.

Think about: Why is assignment right-associative? How do you parse `a.b.c = 5` vs.
`a.b.c + 5`?

### The Environment Chain

```
Global Env:  { clock → <native fn>, ... }
    ↑
Function Env: { a → 10, b → 20 }
    ↑
Block Env:   { temp → 30 }
```

Each environment stores a `Dictionary<string, object?>` and a reference to the enclosing
environment. `Get("x")` checks the current dictionary, then walks up the chain. For
closures, the function object stores a reference to the environment it was defined in —
when called, its body executes in a new environment whose parent is that captured environment
(not the current call site).

### Representing Lox Values in C#

| Lox Type | C# Type |
|---|---|
| Number | `double` |
| String | `string` |
| Boolean | `bool` |
| Nil | `null` |
| Function | `LoxFunction` (implements `ILoxCallable`) |
| Class | `LoxClass` (implements `ILoxCallable`) |
| Instance | `LoxInstance` |

Use pattern matching everywhere: `value is double d`, `value is string s`, `value is ILoxCallable fn`.

---

## Step by Step Milestones

### Milestone 1: Scanner (3-4 hours)
Implement the full scanner. Write tests for every token type. Test edge cases: unterminated
strings, unexpected characters, multi-line input, keywords vs. identifiers. Get a clean
token stream from source code.

### Milestone 2: Expression AST and Parser (4-5 hours)
Define the expression AST nodes (Binary, Unary, Literal, Grouping). Implement expression
parsing with full precedence. Write tests that parse expressions and verify the AST
structure. Print the AST as an S-expression for debugging: `(+ 1 (* 2 3))`.

### Milestone 3: Expression Interpreter (2-3 hours)
Evaluate expression ASTs. Handle type errors (e.g., `"hello" - 5` should error). Write
tests for arithmetic, comparison, string concatenation, truthiness. Get the REPL working
for expressions.

### Milestone 4: Statements and State (3-4 hours)
Add print, expression statements, var declarations, assignment, blocks. Implement the
Environment class. Test scoping: inner block shadows outer variable, inner block accesses
outer variable, variable not found error.

### Milestone 5: Control Flow (2-3 hours)
Add if/else, while, for. Desugar `for` into `while` in the parser (or execute directly).
Write tests: fibonacci iterative, fizzbuzz, nested loops. At this point you can write
real programs.

### Milestone 6: Functions and Closures (4-5 hours)
Add function declarations, call expressions, return statements. Implement `LoxFunction`
that captures its defining environment. Test recursion (fibonacci recursive), closures
(counter factory), nested functions. Add native `clock()` function.

### Milestone 7: Classes and Inheritance (4-5 hours)
Add class declarations, constructors (`init`), `this`, methods, property access/set.
Then add inheritance with `<` and `super`. Test method dispatch, constructor chaining,
overriding. This is the most complex milestone.

### Milestone 8: Polish (2-3 hours)
Add the variable resolver (static analysis pass). Improve error messages. Write sample
programs. Add multi-line comments. Write a comprehensive README with language documentation.

---

## Testing Requirements

### Scanner Tests

- Every token type produces correct `TokenType`, `Lexeme`, and `Literal`.
- Multi-token sequences parse correctly: `var x = 10 + 20;` produces 7 tokens + EOF.
- Strings with escapes (stretch): `"hello\nworld"`.
- Numbers: integers, decimals, leading dot (error), trailing dot (error).
- Keywords vs. identifiers: `orchid` is IDENTIFIER, `or` is OR.
- Error cases: unterminated string, unexpected character.

### Parser Tests

- Precedence: `1 + 2 * 3` parses as `(+ 1 (* 2 3))`.
- Associativity: `1 - 2 - 3` parses as `(- (- 1 2) 3)` (left-assoc).
- Grouping: `(1 + 2) * 3` parses as `(* (group (+ 1 2)) 3)`.
- Statements: var declarations, print, blocks, if/else, while, for, function, class.
- Error recovery: missing semicolon reports error and continues parsing.

### Interpreter Tests

- Arithmetic: `2 + 3` evaluates to `5.0`. Division: `7 / 2` is `3.5`.
- String concat: `"hello" + " " + "world"` evaluates to `"hello world"`.
- Truthiness: `nil` and `false` are falsy, everything else is truthy.
- Variables: define, access, assign, scope shadowing.
- Functions: call with args, recursion, closures.
- Classes: construct, access property, call method, inheritance.
- Runtime errors: type mismatch, undefined variable, wrong arity.

### End-to-End Tests

Run complete Lox programs and verify output. Capture `print` output into a string buffer
and assert against expected output.

```csharp
[Theory]
[InlineData("print 1 + 2;", "3")]
[InlineData("var x = 10; print x * 2;", "20")]
[InlineData("fun fib(n) { if (n <= 1) return n; return fib(n-1) + fib(n-2); } print fib(10);", "55")]
public void EndToEnd(string source, string expectedOutput) { ... }
```

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### Token.cs and TokenType.cs

```csharp
namespace Lox.Core.Scanning;

/// <summary>
/// A token produced by the scanner.
/// </summary>
/// <param name="Type">The classification of this token.</param>
/// <param name="Lexeme">The raw source text of this token.</param>
/// <param name="Literal">The parsed literal value (for numbers and strings).</param>
/// <param name="Line">The 1-based line number where this token appears.</param>
public sealed record Token(TokenType Type, string Lexeme, object? Literal, int Line)
{
    public override string ToString() =>
        $"{Type} {Lexeme} {Literal?.ToString() ?? "null"}";
}

public enum TokenType
{
    // Single-character tokens
    LeftParen, RightParen, LeftBrace, RightBrace,
    Comma, Dot, Minus, Plus, Semicolon, Slash, Star,

    // One or two character tokens
    Bang, BangEqual,
    Equal, EqualEqual,
    Greater, GreaterEqual,
    Less, LessEqual,

    // Literals
    Identifier, String, Number,

    // Keywords
    And, Class, Else, False, Fun, For, If, Nil, Or,
    Print, Return, Super, This, True, Var, While,

    Eof
}
```

### Scanner.cs — Complete Lexer

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Lox.Core.Scanning;

/// <summary>
/// Scans source text into a list of tokens.
/// Reports errors via the provided error callback.
/// </summary>
public sealed class Scanner
{
    private readonly string _source;
    private readonly List<Token> _tokens = new();
    private readonly Action<int, string> _onError;

    private int _start;
    private int _current;
    private int _line = 1;

    private static readonly Dictionary<string, TokenType> Keywords = new()
    {
        ["and"]    = TokenType.And,
        ["class"]  = TokenType.Class,
        ["else"]   = TokenType.Else,
        ["false"]  = TokenType.False,
        ["for"]    = TokenType.For,
        ["fun"]    = TokenType.Fun,
        ["if"]     = TokenType.If,
        ["nil"]    = TokenType.Nil,
        ["or"]     = TokenType.Or,
        ["print"]  = TokenType.Print,
        ["return"] = TokenType.Return,
        ["super"]  = TokenType.Super,
        ["this"]   = TokenType.This,
        ["true"]   = TokenType.True,
        ["var"]    = TokenType.Var,
        ["while"]  = TokenType.While,
    };

    public Scanner(string source, Action<int, string>? onError = null)
    {
        _source = source ?? throw new ArgumentNullException(nameof(source));
        _onError = onError ?? ((line, msg) => { });
    }

    /// <summary>Scans all tokens from the source. Always ends with EOF.</summary>
    public List<Token> ScanTokens()
    {
        while (!IsAtEnd())
        {
            _start = _current;
            ScanToken();
        }
        _tokens.Add(new Token(TokenType.Eof, "", null, _line));
        return _tokens;
    }

    private void ScanToken()
    {
        char c = Advance();
        switch (c)
        {
            case '(': AddToken(TokenType.LeftParen); break;
            case ')': AddToken(TokenType.RightParen); break;
            case '{': AddToken(TokenType.LeftBrace); break;
            case '}': AddToken(TokenType.RightBrace); break;
            case ',': AddToken(TokenType.Comma); break;
            case '.': AddToken(TokenType.Dot); break;
            case '-': AddToken(TokenType.Minus); break;
            case '+': AddToken(TokenType.Plus); break;
            case ';': AddToken(TokenType.Semicolon); break;
            case '*': AddToken(TokenType.Star); break;
            case '!': AddToken(Match('=') ? TokenType.BangEqual : TokenType.Bang); break;
            case '=': AddToken(Match('=') ? TokenType.EqualEqual : TokenType.Equal); break;
            case '<': AddToken(Match('=') ? TokenType.LessEqual : TokenType.Less); break;
            case '>': AddToken(Match('=') ? TokenType.GreaterEqual : TokenType.Greater); break;
            case '/':
                if (Match('/'))
                {
                    // Single-line comment — consume until end of line
                    while (!IsAtEnd() && Peek() != '\n') Advance();
                }
                else if (Match('*'))
                {
                    // Multi-line comment
                    BlockComment();
                }
                else
                {
                    AddToken(TokenType.Slash);
                }
                break;
            case ' ':
            case '\r':
            case '\t':
                // Whitespace — skip
                break;
            case '\n':
                _line++;
                break;
            case '"': ScanString(); break;
            default:
                if (IsDigit(c))
                    ScanNumber();
                else if (IsAlpha(c))
                    ScanIdentifier();
                else
                    _onError(_line, $"Unexpected character: '{c}'");
                break;
        }
    }

    private void ScanString()
    {
        while (!IsAtEnd() && Peek() != '"')
        {
            if (Peek() == '\n') _line++;
            Advance();
        }

        if (IsAtEnd())
        {
            _onError(_line, "Unterminated string.");
            return;
        }

        Advance(); // Consume closing "
        string value = _source[(_start + 1)..(_current - 1)];
        AddToken(TokenType.String, value);
    }

    private void ScanNumber()
    {
        while (!IsAtEnd() && IsDigit(Peek())) Advance();

        if (!IsAtEnd() && Peek() == '.' && IsDigit(PeekNext()))
        {
            Advance(); // Consume '.'
            while (!IsAtEnd() && IsDigit(Peek())) Advance();
        }

        double value = double.Parse(
            _source[_start.._current], CultureInfo.InvariantCulture);
        AddToken(TokenType.Number, value);
    }

    private void ScanIdentifier()
    {
        while (!IsAtEnd() && IsAlphaNumeric(Peek())) Advance();

        string text = _source[_start.._current];
        var type = Keywords.GetValueOrDefault(text, TokenType.Identifier);
        AddToken(type);
    }

    private void BlockComment()
    {
        int depth = 1;
        while (!IsAtEnd() && depth > 0)
        {
            if (Peek() == '/' && PeekNext() == '*')
            {
                Advance(); Advance();
                depth++;
            }
            else if (Peek() == '*' && PeekNext() == '/')
            {
                Advance(); Advance();
                depth--;
            }
            else
            {
                if (Peek() == '\n') _line++;
                Advance();
            }
        }

        if (depth > 0)
            _onError(_line, "Unterminated block comment.");
    }

    private char Advance() => _source[_current++];
    private char Peek() => IsAtEnd() ? '\0' : _source[_current];
    private char PeekNext() => _current + 1 >= _source.Length ? '\0' : _source[_current + 1];
    private bool IsAtEnd() => _current >= _source.Length;
    private bool Match(char expected)
    {
        if (IsAtEnd() || _source[_current] != expected) return false;
        _current++;
        return true;
    }

    private static bool IsDigit(char c) => c >= '0' && c <= '9';
    private static bool IsAlpha(char c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_';
    private static bool IsAlphaNumeric(char c) => IsAlpha(c) || IsDigit(c);

    private void AddToken(TokenType type, object? literal = null)
    {
        string lexeme = _source[_start.._current];
        _tokens.Add(new Token(type, lexeme, literal, _line));
    }
}
```

### Expr.cs — Expression AST Nodes

```csharp
using Lox.Core.Scanning;

namespace Lox.Core.Parsing.Ast;

/// <summary>Base type for all expression AST nodes.</summary>
public abstract record Expr
{
    /// <summary>Binary operation: left op right</summary>
    public sealed record Binary(Expr Left, Token Op, Expr Right) : Expr;

    /// <summary>Unary operation: op operand</summary>
    public sealed record Unary(Token Op, Expr Operand) : Expr;

    /// <summary>Literal value: number, string, bool, nil</summary>
    public sealed record Literal(object? Value) : Expr;

    /// <summary>Parenthesized expression</summary>
    public sealed record Grouping(Expr Expression) : Expr;

    /// <summary>Variable access</summary>
    public sealed record Variable(Token Name) : Expr;

    /// <summary>Variable assignment</summary>
    public sealed record Assign(Token Name, Expr Value) : Expr;

    /// <summary>Logical and/or (short-circuit)</summary>
    public sealed record Logical(Expr Left, Token Op, Expr Right) : Expr;

    /// <summary>Function/method call</summary>
    public sealed record Call(Expr Callee, Token Paren, List<Expr> Arguments) : Expr;

    /// <summary>Property access: obj.property</summary>
    public sealed record Get(Expr Object, Token Name) : Expr;

    /// <summary>Property set: obj.property = value</summary>
    public sealed record Set(Expr Object, Token Name, Expr Value) : Expr;

    /// <summary>this keyword</summary>
    public sealed record This(Token Keyword) : Expr;

    /// <summary>super.method</summary>
    public sealed record Super(Token Keyword, Token Method) : Expr;
}
```

### Stmt.cs — Statement AST Nodes

```csharp
using Lox.Core.Scanning;

namespace Lox.Core.Parsing.Ast;

/// <summary>Base type for all statement AST nodes.</summary>
public abstract record Stmt
{
    /// <summary>Expression statement: expr;</summary>
    public sealed record ExpressionStmt(Expr Expression) : Stmt;

    /// <summary>Print statement: print expr;</summary>
    public sealed record Print(Expr Expression) : Stmt;

    /// <summary>Variable declaration: var name = initializer;</summary>
    public sealed record VarDecl(Token Name, Expr? Initializer) : Stmt;

    /// <summary>Block: { statements }</summary>
    public sealed record Block(List<Stmt> Statements) : Stmt;

    /// <summary>If/else: if (cond) then else? elseBody</summary>
    public sealed record If(Expr Condition, Stmt ThenBranch, Stmt? ElseBranch) : Stmt;

    /// <summary>While loop: while (cond) body</summary>
    public sealed record While(Expr Condition, Stmt Body) : Stmt;

    /// <summary>Function declaration: fun name(params) { body }</summary>
    public sealed record Function(Token Name, List<Token> Params, List<Stmt> Body) : Stmt;

    /// <summary>Return statement: return expr?;</summary>
    public sealed record Return(Token Keyword, Expr? Value) : Stmt;

    /// <summary>Class declaration: class Name &lt; Superclass { methods }</summary>
    public sealed record ClassDecl(
        Token Name,
        Expr.Variable? Superclass,
        List<Stmt.Function> Methods) : Stmt;
}
```

### Interpreter.cs — Tree-Walking Evaluator (Core Methods)

```csharp
using System;
using System.Collections.Generic;
using Lox.Core.Parsing.Ast;
using Lox.Core.Scanning;

namespace Lox.Core.Interpreting;

/// <summary>
/// Tree-walking interpreter. Evaluates expressions and executes statements
/// by recursively visiting AST nodes.
/// </summary>
public sealed class Interpreter
{
    private readonly Environment _globals = new();
    private Environment _environment;
    private readonly Dictionary<Expr, int> _locals = new();
    private readonly Action<string> _output;

    public Interpreter(Action<string>? output = null)
    {
        _output = output ?? Console.WriteLine;
        _environment = _globals;

        // Native functions
        _globals.Define("clock", new NativeClock());
    }

    /// <summary>Stores a resolved variable's scope depth.</summary>
    public void Resolve(Expr expr, int depth) => _locals[expr] = depth;

    /// <summary>Interprets a list of statements (a full program).</summary>
    public void Interpret(List<Stmt> statements)
    {
        foreach (var stmt in statements)
            Execute(stmt);
    }

    /// <summary>Executes a single statement.</summary>
    private void Execute(Stmt stmt)
    {
        switch (stmt)
        {
            case Stmt.ExpressionStmt s:
                Evaluate(s.Expression);
                break;

            case Stmt.Print s:
                var val = Evaluate(s.Expression);
                _output(Stringify(val));
                break;

            case Stmt.VarDecl s:
                object? initializer = s.Initializer != null
                    ? Evaluate(s.Initializer) : null;
                _environment.Define(s.Name.Lexeme, initializer);
                break;

            case Stmt.Block s:
                ExecuteBlock(s.Statements, new Environment(_environment));
                break;

            case Stmt.If s:
                if (IsTruthy(Evaluate(s.Condition)))
                    Execute(s.ThenBranch);
                else if (s.ElseBranch != null)
                    Execute(s.ElseBranch);
                break;

            case Stmt.While s:
                while (IsTruthy(Evaluate(s.Condition)))
                    Execute(s.Body);
                break;

            case Stmt.Function s:
                var function = new LoxFunction(s, _environment, false);
                _environment.Define(s.Name.Lexeme, function);
                break;

            case Stmt.Return s:
                object? returnValue = s.Value != null ? Evaluate(s.Value) : null;
                throw new ReturnException(returnValue);

            case Stmt.ClassDecl s:
                ExecuteClassDecl(s);
                break;

            default:
                throw new RuntimeError(null, $"Unknown statement type: {stmt.GetType().Name}");
        }
    }

    /// <summary>Evaluates an expression and returns its value.</summary>
    private object? Evaluate(Expr expr)
    {
        return expr switch
        {
            Expr.Literal e => e.Value,

            Expr.Grouping e => Evaluate(e.Expression),

            Expr.Unary e => EvaluateUnary(e),

            Expr.Binary e => EvaluateBinary(e),

            Expr.Variable e =>
                _locals.TryGetValue(e, out int dist)
                    ? _environment.GetAt(dist, e.Name.Lexeme)
                    : _globals.Get(e.Name),

            Expr.Assign e =>
                EvaluateAssign(e),

            Expr.Logical e =>
                EvaluateLogical(e),

            Expr.Call e =>
                EvaluateCall(e),

            Expr.Get e =>
                EvaluateGet(e),

            Expr.Set e =>
                EvaluateSet(e),

            Expr.This e =>
                _locals.TryGetValue(e, out int d)
                    ? _environment.GetAt(d, "this")
                    : throw new RuntimeError(e.Keyword, "Cannot use 'this' here."),

            Expr.Super e =>
                EvaluateSuper(e),

            _ => throw new RuntimeError(null, $"Unknown expression type: {expr.GetType().Name}")
        };
    }

    private object? EvaluateUnary(Expr.Unary expr)
    {
        var right = Evaluate(expr.Operand);
        return expr.Op.Type switch
        {
            TokenType.Minus => -(double)CheckNumber(expr.Op, right),
            TokenType.Bang  => !IsTruthy(right),
            _ => null
        };
    }

    private object? EvaluateBinary(Expr.Binary expr)
    {
        var left = Evaluate(expr.Left);
        var right = Evaluate(expr.Right);

        return expr.Op.Type switch
        {
            TokenType.Plus when left is double l && right is double r => l + r,
            TokenType.Plus when left is string l && right is string r => l + r,
            TokenType.Plus => throw new RuntimeError(expr.Op,
                "Operands must be two numbers or two strings."),

            TokenType.Minus        => CheckNumbers(expr.Op, left, right, (l, r) => l - r),
            TokenType.Star         => CheckNumbers(expr.Op, left, right, (l, r) => l * r),
            TokenType.Slash        => CheckNumbers(expr.Op, left, right, (l, r) => l / r),
            TokenType.Greater      => CheckNumbers(expr.Op, left, right, (l, r) => l > r),
            TokenType.GreaterEqual => CheckNumbers(expr.Op, left, right, (l, r) => l >= r),
            TokenType.Less         => CheckNumbers(expr.Op, left, right, (l, r) => l < r),
            TokenType.LessEqual    => CheckNumbers(expr.Op, left, right, (l, r) => l <= r),
            TokenType.EqualEqual   => IsEqual(left, right),
            TokenType.BangEqual    => !IsEqual(left, right),
            _ => null
        };
    }

    private object? EvaluateAssign(Expr.Assign expr)
    {
        var value = Evaluate(expr.Value);
        if (_locals.TryGetValue(expr, out int dist))
            _environment.SetAt(dist, expr.Name.Lexeme, value);
        else
            _globals.Set(expr.Name, value);
        return value;
    }

    private object? EvaluateLogical(Expr.Logical expr)
    {
        var left = Evaluate(expr.Left);
        // Short-circuit
        if (expr.Op.Type == TokenType.Or)
            return IsTruthy(left) ? left : Evaluate(expr.Right);
        else
            return !IsTruthy(left) ? left : Evaluate(expr.Right);
    }

    private object? EvaluateCall(Expr.Call expr)
    {
        var callee = Evaluate(expr.Callee);
        var args = new List<object?>();
        foreach (var arg in expr.Arguments)
            args.Add(Evaluate(arg));

        if (callee is not ILoxCallable function)
            throw new RuntimeError(expr.Paren, "Can only call functions and classes.");

        if (args.Count != function.Arity)
            throw new RuntimeError(expr.Paren,
                $"Expected {function.Arity} arguments but got {args.Count}.");

        return function.Call(this, args);
    }

    private object? EvaluateGet(Expr.Get expr)
    {
        var obj = Evaluate(expr.Object);
        if (obj is LoxInstance instance)
            return instance.Get(expr.Name);
        throw new RuntimeError(expr.Name, "Only instances have properties.");
    }

    private object? EvaluateSet(Expr.Set expr)
    {
        var obj = Evaluate(expr.Object);
        if (obj is not LoxInstance instance)
            throw new RuntimeError(expr.Name, "Only instances have fields.");
        var value = Evaluate(expr.Value);
        instance.Set(expr.Name, value);
        return value;
    }

    private object? EvaluateSuper(Expr.Super expr)
    {
        int distance = _locals[expr];
        var superclass = (LoxClass)_environment.GetAt(distance, "super")!;
        var instance = (LoxInstance)_environment.GetAt(distance - 1, "this")!;
        var method = superclass.FindMethod(expr.Method.Lexeme)
            ?? throw new RuntimeError(expr.Method,
                $"Undefined property '{expr.Method.Lexeme}'.");
        return method.Bind(instance);
    }

    private void ExecuteClassDecl(Stmt.ClassDecl stmt)
    {
        LoxClass? superclass = null;
        if (stmt.Superclass != null)
        {
            var sc = Evaluate(stmt.Superclass);
            if (sc is not LoxClass)
                throw new RuntimeError(stmt.Superclass.Name, "Superclass must be a class.");
            superclass = (LoxClass)sc;
        }

        _environment.Define(stmt.Name.Lexeme, null);

        if (superclass != null)
        {
            _environment = new Environment(_environment);
            _environment.Define("super", superclass);
        }

        var methods = new Dictionary<string, LoxFunction>();
        foreach (var method in stmt.Methods)
        {
            bool isInit = method.Name.Lexeme == "init";
            methods[method.Name.Lexeme] = new LoxFunction(method, _environment, isInit);
        }

        var klass = new LoxClass(stmt.Name.Lexeme, superclass, methods);

        if (superclass != null)
            _environment = _environment.Enclosing!;

        _environment.Set(stmt.Name, klass);
    }

    /// <summary>Executes a block with a new environment scope.</summary>
    public void ExecuteBlock(List<Stmt> statements, Environment env)
    {
        var previous = _environment;
        try
        {
            _environment = env;
            foreach (var stmt in statements)
                Execute(stmt);
        }
        finally
        {
            _environment = previous;
        }
    }

    // --- Helper Methods ---

    private static bool IsTruthy(object? value) =>
        value switch
        {
            null => false,
            bool b => b,
            _ => true
        };

    private static bool IsEqual(object? a, object? b) =>
        (a, b) switch
        {
            (null, null) => true,
            (null, _) => false,
            _ => a.Equals(b)
        };

    private static object CheckNumber(Token op, object? operand) =>
        operand is double d ? d
        : throw new RuntimeError(op, "Operand must be a number.");

    private static object CheckNumbers<TResult>(
        Token op, object? left, object? right, Func<double, double, TResult> func) =>
        left is double l && right is double r
            ? (object)func(l, r)!
            : throw new RuntimeError(op, "Operands must be numbers.");

    private static string Stringify(object? value) =>
        value switch
        {
            null => "nil",
            bool b => b ? "true" : "false",
            double d => d.ToString("G"),
            _ => value.ToString()!
        };
}

/// <summary>Thrown by return statements to unwind the call stack.</summary>
public sealed class ReturnException : Exception
{
    public object? Value { get; }
    public ReturnException(object? value) => Value = value;
}

/// <summary>Runtime error with source location.</summary>
public sealed class RuntimeError : Exception
{
    public Token? Token { get; }
    public RuntimeError(Token? token, string message) : base(message) => Token = token;
}
```

### Environment.cs

```csharp
using System.Collections.Generic;
using Lox.Core.Scanning;

namespace Lox.Core.Interpreting;

/// <summary>
/// Stores variable bindings for a lexical scope.
/// Links to an enclosing environment for scope chains.
/// </summary>
public sealed class Environment
{
    private readonly Dictionary<string, object?> _values = new();
    public Environment? Enclosing { get; }

    public Environment(Environment? enclosing = null) => Enclosing = enclosing;

    public void Define(string name, object? value) => _values[name] = value;

    public object? Get(Token name)
    {
        if (_values.TryGetValue(name.Lexeme, out var value))
            return value;
        if (Enclosing != null)
            return Enclosing.Get(name);
        throw new RuntimeError(name, $"Undefined variable '{name.Lexeme}'.");
    }

    public void Set(Token name, object? value)
    {
        if (_values.ContainsKey(name.Lexeme))
        {
            _values[name.Lexeme] = value;
            return;
        }
        if (Enclosing != null)
        {
            Enclosing.Set(name, value);
            return;
        }
        throw new RuntimeError(name, $"Undefined variable '{name.Lexeme}'.");
    }

    public object? GetAt(int distance, string name)
    {
        var env = Ancestor(distance);
        return env._values.GetValueOrDefault(name);
    }

    public void SetAt(int distance, string name, object? value) =>
        Ancestor(distance)._values[name] = value;

    private Environment Ancestor(int distance)
    {
        var env = this;
        for (int i = 0; i < distance; i++)
            env = env.Enclosing!;
        return env;
    }
}
```

### LoxFunction.cs, LoxClass.cs, LoxInstance.cs

```csharp
using System.Collections.Generic;
using Lox.Core.Parsing.Ast;

namespace Lox.Core.Interpreting;

public interface ILoxCallable
{
    int Arity { get; }
    object? Call(Interpreter interpreter, List<object?> arguments);
}

public sealed class LoxFunction : ILoxCallable
{
    private readonly Stmt.Function _declaration;
    private readonly Environment _closure;
    private readonly bool _isInitializer;

    public LoxFunction(Stmt.Function declaration, Environment closure, bool isInit)
    {
        _declaration = declaration;
        _closure = closure;
        _isInitializer = isInit;
    }

    public int Arity => _declaration.Params.Count;

    public object? Call(Interpreter interpreter, List<object?> arguments)
    {
        var env = new Environment(_closure);
        for (int i = 0; i < _declaration.Params.Count; i++)
            env.Define(_declaration.Params[i].Lexeme, arguments[i]);

        try
        {
            interpreter.ExecuteBlock(_declaration.Body, env);
        }
        catch (ReturnException ret)
        {
            if (_isInitializer) return _closure.GetAt(0, "this");
            return ret.Value;
        }

        if (_isInitializer) return _closure.GetAt(0, "this");
        return null;
    }

    public LoxFunction Bind(LoxInstance instance)
    {
        var env = new Environment(_closure);
        env.Define("this", instance);
        return new LoxFunction(_declaration, env, _isInitializer);
    }

    public override string ToString() => $"<fn {_declaration.Name.Lexeme}>";
}

public sealed class LoxClass : ILoxCallable
{
    public string Name { get; }
    public LoxClass? Superclass { get; }
    private readonly Dictionary<string, LoxFunction> _methods;

    public LoxClass(string name, LoxClass? superclass, Dictionary<string, LoxFunction> methods)
    {
        Name = name;
        Superclass = superclass;
        _methods = methods;
    }

    public int Arity => FindMethod("init")?.Arity ?? 0;

    public object? Call(Interpreter interpreter, List<object?> arguments)
    {
        var instance = new LoxInstance(this);
        var init = FindMethod("init");
        init?.Bind(instance).Call(interpreter, arguments);
        return instance;
    }

    public LoxFunction? FindMethod(string name)
    {
        if (_methods.TryGetValue(name, out var method))
            return method;
        return Superclass?.FindMethod(name);
    }

    public override string ToString() => $"<class {Name}>";
}

public sealed class LoxInstance
{
    private readonly LoxClass _klass;
    private readonly Dictionary<string, object?> _fields = new();

    public LoxInstance(LoxClass klass) => _klass = klass;

    public object? Get(Scanning.Token name)
    {
        if (_fields.TryGetValue(name.Lexeme, out var value))
            return value;
        var method = _klass.FindMethod(name.Lexeme);
        if (method != null) return method.Bind(this);
        throw new RuntimeError(name, $"Undefined property '{name.Lexeme}'.");
    }

    public void Set(Scanning.Token name, object? value) =>
        _fields[name.Lexeme] = value;

    public override string ToString() => $"<instance {_klass.Name}>";
}

public sealed class NativeClock : ILoxCallable
{
    public int Arity => 0;
    public object? Call(Interpreter interpreter, List<object?> arguments) =>
        (double)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0;
    public override string ToString() => "<native fn clock>";
}
```

</details>

---

## What to Show Off

### In Your Portfolio

- **Live demo**: Record a terminal session showing the REPL in action. Show fibonacci, closures, and class inheritance running live.
- **Language reference**: Write a short doc describing Lox syntax. Show you can communicate language design.
- **Architecture walkthrough**: Blog post or README section showing the pipeline: Source -> Tokens -> AST -> Evaluation.

### In Interviews

- **"Walk me through how `var x = 1 + 2 * 3;` executes"** — Scanner produces tokens [Var, Identifier("x"), Equal, Number(1), Plus, Number(2), Star, Number(3), Semicolon]. Parser builds: VarDecl("x", Binary(Literal(1), +, Binary(Literal(2), *, Literal(3)))). Interpreter evaluates inner Binary first (2*3=6), then outer (1+6=7), defines x=7.
- **"How do closures work?"** — When a function is defined, it captures the current Environment. When called, a new Environment is created with the captured one as parent. This means the function can access variables from its defining scope even after that scope has exited.
- **"What was the hardest part?"** — Probably class inheritance + `super`. The environment manipulation for binding `this` and looking up `super` requires careful tracking of scope distances.
- **"How would you add feature X?"** — Demonstrate extensibility by discussing how you would add arrays (new Expr types, new runtime representation) or a standard library.

### Key Talking Points for a DE Role

- "Building an interpreter taught me to think about data transformation pipelines — source text is transformed through multiple stages, each consuming the output of the previous one."
- "The parser's error recovery strategy is similar to error handling in ETL pipelines — you want to process as much as possible and report all errors, not fail on the first one."

---

## Stretch Goals

1. **Bytecode compiler + VM** — Instead of tree-walking, compile to bytecodes and execute on a stack-based VM. This is Part III of Crafting Interpreters (in C, but can be done in C#).
2. **Standard library** — Add built-in functions: `len(string)`, `substr`, `parseInt`, `readLine`, `write` (no newline), `type(value)`.
3. **Arrays and for-in** — Add array literals `[1, 2, 3]`, indexing `a[0]`, `push`/`pop` methods, and `for (var x in arr)` syntax.
4. **Error handling** — Add `try`/`catch`/`throw` with a Lox error type.
5. **Module system** — `import "utils.lox"` to load and execute another file, making its top-level functions available.
