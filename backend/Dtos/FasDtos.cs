namespace IoT.CentralApi.Dtos;

public record FasCategoryDto(
    int Id,
    string CategoryCode,
    string CategoryName,
    string? Description
);
