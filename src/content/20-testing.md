# Testing in C#

*Writing reliable, maintainable tests*

Testing is essential for building confidence in your code. C# has excellent testing frameworks and a strong culture of automated testing.

## Unit Test Basics (xUnit)

```csharp
using Xunit;

public class CalculatorTests
{
    private readonly Calculator _calc = new();

    [Fact]
    public void Add_TwoPositiveNumbers_ReturnsSum()
    {
        // Arrange
        int a = 3, b = 4;

        // Act
        int result = _calc.Add(a, b);

        // Assert
        Assert.Equal(7, result);
    }

    [Fact]
    public void Divide_ByZero_ThrowsException()
    {
        Assert.Throws<DivideByZeroException>(() => _calc.Divide(10, 0));
    }
}
```

## Parameterized Tests

```csharp
public class StringValidatorTests
{
    [Theory]
    [InlineData("alice@example.com", true)]
    [InlineData("bob@test.org", true)]
    [InlineData("not-an-email", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsValidEmail_ReturnsExpected(string? email, bool expected)
    {
        var result = StringValidator.IsValidEmail(email);
        Assert.Equal(expected, result);
    }

    [Theory]
    [MemberData(nameof(GetPasswordTestCases))]
    public void IsStrongPassword_ReturnsExpected(string password, bool expected)
    {
        Assert.Equal(expected, StringValidator.IsStrongPassword(password));
    }

    public static IEnumerable<object[]> GetPasswordTestCases()
    {
        yield return new object[] { "Str0ng!Pass", true };
        yield return new object[] { "weak", false };
        yield return new object[] { "NoSpecialChar1", false };
    }
}
```

## Mocking with Moq

```csharp
using Moq;

public class OrderServiceTests
{
    [Fact]
    public async Task PlaceOrder_ValidOrder_SavesAndNotifies()
    {
        // Arrange
        var mockRepo = new Mock<IOrderRepository>();
        var mockNotifier = new Mock<INotificationService>();

        var service = new OrderService(mockRepo.Object, mockNotifier.Object);
        var order = new Order { Id = 1, Total = 99.99m };

        // Act
        await service.PlaceOrderAsync(order);

        // Assert
        mockRepo.Verify(r => r.SaveAsync(order), Times.Once);
        mockNotifier.Verify(n => n.SendAsync(
            It.Is<string>(msg => msg.Contains("Order #1"))),
            Times.Once);
    }

    [Fact]
    public async Task GetOrder_NotFound_ReturnsNull()
    {
        var mockRepo = new Mock<IOrderRepository>();
        mockRepo.Setup(r => r.GetByIdAsync(999))
                .ReturnsAsync((Order?)null);

        var service = new OrderService(mockRepo.Object, Mock.Of<INotificationService>());

        var result = await service.GetOrderAsync(999);

        Assert.Null(result);
    }
}
```

> **Tip:** Only mock external dependencies (database, HTTP, file system). Don't mock the class under test or its internal logic — that makes tests brittle and tied to implementation details.

## Testing Async Code

```csharp
[Fact]
public async Task FetchData_ReturnsDataFromApi()
{
    // Arrange
    var handler = new MockHttpMessageHandler(
        new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"name": "Alice"}""")
        });

    var client = new HttpClient(handler);
    var service = new ApiService(client);

    // Act
    var user = await service.GetUserAsync("alice");

    // Assert
    Assert.NotNull(user);
    Assert.Equal("Alice", user.Name);
}

[Fact]
public async Task ProcessItems_WithCancellation_StopsGracefully()
{
    var cts = new CancellationTokenSource();
    var service = new ProcessingService();

    cts.CancelAfter(TimeSpan.FromMilliseconds(100));

    await Assert.ThrowsAsync<OperationCanceledException>(
        () => service.ProcessAllAsync(cts.Token));
}
```

## Assertion Patterns

```csharp
// Basic assertions
Assert.Equal(expected, actual);
Assert.NotEqual(unexpected, actual);
Assert.True(condition);
Assert.False(condition);
Assert.Null(obj);
Assert.NotNull(obj);

// Collection assertions
Assert.Empty(collection);
Assert.Single(collection);
Assert.Contains(item, collection);
Assert.All(collection, item => Assert.True(item > 0));

// String assertions
Assert.StartsWith("Hello", greeting);
Assert.Contains("World", greeting);
Assert.Matches(@"\d{3}-\d{4}", phoneNumber);

// Type assertions
Assert.IsType<NotFoundException>(exception);
Assert.IsAssignableFrom<Exception>(error);

// Exception assertions
var ex = Assert.Throws<ArgumentException>(() => DoSomething(null));
Assert.Equal("Value cannot be null", ex.Message);
```

## Test Organization

```csharp
// Shared setup with IClassFixture
public class DatabaseTests : IClassFixture<DatabaseFixture>
{
    private readonly DatabaseFixture _fixture;

    public DatabaseTests(DatabaseFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public void CanQueryUsers()
    {
        var users = _fixture.Db.Users.ToList();
        Assert.NotEmpty(users);
    }
}

public class DatabaseFixture : IDisposable
{
    public AppDbContext Db { get; }

    public DatabaseFixture()
    {
        Db = new AppDbContext(/* in-memory options */);
        Db.Users.Add(new User("Test User"));
        Db.SaveChanges();
    }

    public void Dispose() => Db.Dispose();
}
```

> **Important:** Good tests are fast, independent, repeatable, and self-validating. Each test should test one thing, have a descriptive name, and not depend on other tests running first.

## Test Naming Convention

```csharp
// Pattern: MethodName_Scenario_ExpectedBehavior
[Fact] public void Add_TwoPositiveNumbers_ReturnsSum() { }
[Fact] public void Withdraw_InsufficientFunds_ThrowsException() { }
[Fact] public void GetUser_NonexistentId_ReturnsNull() { }
[Fact] public void IsValid_EmptyString_ReturnsFalse() { }
```
