namespace IoT.CentralApi.Tests;

public class SmokeTest
{
    [Fact]
    public void Framework_Loads_AndAssertionsWork()
    {
        var sum = 1 + 1;
        sum.Should().Be(2);
    }

    [Theory]
    [InlineData(1, 1, 2)]
    [InlineData(2, 3, 5)]
    [InlineData(0, 0, 0)]
    public void Theory_Works(int a, int b, int expected)
    {
        (a + b).Should().Be(expected);
    }
}
