# Dependency Injection

*Loosely coupled, testable code*

Dependency Injection (DI) is a design pattern where objects receive their dependencies from an external source rather than creating them internally. It's a core pattern in modern C# and is built into ASP.NET Core.

## The Problem

Without DI, classes create their own dependencies:

```csharp
// Tightly coupled - hard to test and change
public class OrderService
{
    private readonly SqlDatabase _db = new SqlDatabase("connection-string");
    private readonly SmtpEmailSender _email = new SmtpEmailSender();
    private readonly StripePayment _payment = new StripePayment("api-key");

    public void PlaceOrder(Order order)
    {
        _payment.Charge(order.Total);
        _db.Save(order);
        _email.Send(order.CustomerEmail, "Order confirmed!");
    }
}
```

## The Solution

Define abstractions and inject implementations:

```csharp
// Define contracts
public interface IDatabase
{
    void Save<T>(T entity);
    T? GetById<T>(int id);
}

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body);
}

public interface IPaymentProcessor
{
    Task<PaymentResult> ChargeAsync(decimal amount, string token);
}

// Class depends on abstractions
public class OrderService
{
    private readonly IDatabase _db;
    private readonly IEmailSender _email;
    private readonly IPaymentProcessor _payment;

    public OrderService(
        IDatabase db,
        IEmailSender email,
        IPaymentProcessor payment)
    {
        _db = db;
        _email = email;
        _payment = payment;
    }

    public async Task PlaceOrderAsync(Order order)
    {
        var result = await _payment.ChargeAsync(order.Total, order.PaymentToken);
        if (!result.Success) throw new PaymentFailedException(result.Error);

        _db.Save(order);
        await _email.SendAsync(order.CustomerEmail, "Order Confirmed",
            $"Your order #{order.Id} has been placed!");
    }
}
```

> **Tip:** Depend on abstractions (interfaces), not concrete implementations. This makes your code testable, flexible, and follows the Dependency Inversion Principle.

## Microsoft.Extensions.DependencyInjection

The built-in DI container in .NET:

```csharp
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();

// Register services with different lifetimes
services.AddSingleton<ICache, RedisCache>();       // One instance forever
services.AddScoped<IDatabase, SqlDatabase>();       // One per scope/request
services.AddTransient<IEmailSender, SmtpSender>();  // New instance every time

// Register the service that uses them
services.AddScoped<OrderService>();

// Build the container
var provider = services.BuildServiceProvider();

// Resolve a service
var orderService = provider.GetRequiredService<OrderService>();
// Dependencies are automatically injected!
```

## Service Lifetimes

| Lifetime | Created | Disposed | Use For |
|----------|---------|----------|---------|
| **Singleton** | Once | App shutdown | Caches, configuration, stateless services |
| **Scoped** | Per scope/request | End of scope | Database contexts, per-request state |
| **Transient** | Every time | When scope ends | Lightweight, stateless services |

> **Warning:** Never inject a scoped service into a singleton — the scoped service would live forever (captive dependency). The runtime will throw an exception if you enable scope validation.

## ASP.NET Core DI

```csharp
var builder = WebApplication.CreateBuilder(args);

// Register services
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddSingleton<ICacheService, RedisCacheService>();
builder.Services.AddHttpClient<IWeatherClient, WeatherClient>();

var app = builder.Build();

// Controllers automatically get dependencies via constructor injection
public class OrderController : ControllerBase
{
    private readonly IOrderService _orderService;

    public OrderController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    [HttpPost]
    public async Task<IActionResult> Create(OrderRequest request)
    {
        var order = await _orderService.PlaceOrderAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
    }
}
```

## Testing with DI

```csharp
public class OrderServiceTests
{
    [Fact]
    public async Task PlaceOrder_ChargesPayment_And_SavesOrder()
    {
        // Arrange - create test doubles
        var mockDb = new Mock<IDatabase>();
        var mockEmail = new Mock<IEmailSender>();
        var mockPayment = new Mock<IPaymentProcessor>();
        mockPayment
            .Setup(p => p.ChargeAsync(It.IsAny<decimal>(), It.IsAny<string>()))
            .ReturnsAsync(new PaymentResult { Success = true });

        var service = new OrderService(
            mockDb.Object, mockEmail.Object, mockPayment.Object);

        var order = new Order { Total = 99.99m, PaymentToken = "tok_123" };

        // Act
        await service.PlaceOrderAsync(order);

        // Assert
        mockPayment.Verify(p => p.ChargeAsync(99.99m, "tok_123"), Times.Once);
        mockDb.Verify(d => d.Save(order), Times.Once);
        mockEmail.Verify(e => e.SendAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()),
            Times.Once);
    }
}
```

> **Important:** DI isn't just about testing — it fundamentally improves your architecture by making dependencies explicit, enforcing separation of concerns, and making it easy to swap implementations.
