# Delegates and Events

*First-class functions and the observer pattern*

Delegates are type-safe function pointers — they let you pass methods as arguments, store them in variables, and invoke them dynamically. Events build on delegates to implement the observer pattern.

## Delegates

```csharp
// Define a delegate type
delegate int MathOperation(int a, int b);

// Methods that match the signature
int Add(int a, int b) => a + b;
int Multiply(int a, int b) => a * b;

// Use the delegate
MathOperation operation = Add;
int result = operation(3, 4);  // 7

operation = Multiply;
result = operation(3, 4);      // 12
```

## Built-in Delegate Types

You rarely need custom delegates — .NET provides generic ones:

```csharp
// Func<T, TResult> - has return value
Func<int, int, int> add = (a, b) => a + b;
Func<string, int> length = s => s.Length;
Func<bool> isReady = () => true;

// Action<T> - no return value (void)
Action<string> log = message => Console.WriteLine(message);
Action<int, int> printSum = (a, b) => Console.WriteLine(a + b);

// Predicate<T> - returns bool (same as Func<T, bool>)
Predicate<int> isEven = n => n % 2 == 0;
```

> **Tip:** Use `Func<>` and `Action<>` instead of defining custom delegate types. They're widely understood and reduce boilerplate.

## Lambda Expressions

Lambdas are anonymous functions — concise syntax for creating delegates:

```csharp
// Expression lambda (single expression)
Func<int, int> square = x => x * x;

// Statement lambda (multiple statements)
Func<int, int> factorial = n =>
{
    int result = 1;
    for (int i = 2; i <= n; i++)
        result *= i;
    return result;
};

// Lambda with LINQ
var adults = people.Where(p => p.Age >= 18)
                   .OrderBy(p => p.Name)
                   .Select(p => p.Name);

// Capturing variables (closure)
int threshold = 10;
Func<int, bool> isAboveThreshold = n => n > threshold;
threshold = 20; // Changes what the lambda checks!
```

> **Warning:** Be careful with captured variables in closures. The lambda captures the *variable*, not the *value* — so changes to the variable after the lambda is created will affect the lambda's behavior.

## Higher-Order Functions

Functions that take or return other functions:

```csharp
// Function that takes a function
List<T> Filter<T>(IEnumerable<T> items, Func<T, bool> predicate)
{
    var result = new List<T>();
    foreach (var item in items)
        if (predicate(item))
            result.Add(item);
    return result;
}

// Function that returns a function
Func<int, bool> CreateRangeChecker(int min, int max)
    => value => value >= min && value <= max;

var isValidAge = CreateRangeChecker(0, 150);
Console.WriteLine(isValidAge(25));  // true
Console.WriteLine(isValidAge(200)); // false
```

## Events

Events implement the observer pattern — publishers notify subscribers:

```csharp
public class StockTicker
{
    // Declare an event
    public event EventHandler<StockChangedEventArgs>? PriceChanged;

    private decimal _price;
    public decimal Price
    {
        get => _price;
        set
        {
            var oldPrice = _price;
            _price = value;
            // Raise the event
            PriceChanged?.Invoke(this, new StockChangedEventArgs
            {
                Symbol = Symbol,
                OldPrice = oldPrice,
                NewPrice = value
            });
        }
    }

    public string Symbol { get; }
    public StockTicker(string symbol, decimal price)
        => (Symbol, _price) = (symbol, price);
}

public class StockChangedEventArgs : EventArgs
{
    public string Symbol { get; init; }
    public decimal OldPrice { get; init; }
    public decimal NewPrice { get; init; }
    public decimal Change => NewPrice - OldPrice;
}
```

```csharp
// Subscribe to events
var ticker = new StockTicker("MSFT", 350m);

ticker.PriceChanged += (sender, e) =>
    Console.WriteLine($"{e.Symbol}: {e.OldPrice:C} → {e.NewPrice:C} ({e.Change:+0.00;-0.00})");

ticker.Price = 355m;  // MSFT: $350.00 → $355.00 (+5.00)
ticker.Price = 348m;  // MSFT: $355.00 → $348.00 (-7.00)
```

## Multicast Delegates

Delegates can hold references to multiple methods:

```csharp
Action<string> logger = Console.WriteLine;
logger += message => File.AppendAllText("log.txt", message + "\n");
logger += message => Debug.WriteLine(message);

logger("Something happened");  // Calls all three!

// Unsubscribe
logger -= Console.WriteLine;
```

> **Important:** Always unsubscribe from events when you're done with them, especially in long-lived applications. Failing to do so causes memory leaks because the event publisher holds a reference to the subscriber, preventing garbage collection.
