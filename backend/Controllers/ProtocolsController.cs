using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/protocols")]
public class ProtocolsController(IEnumerable<IProtocolAdapter> adapters) : ControllerBase
{
    [HttpGet]
    public IActionResult GetAll()
    {
        var list = adapters.Select(a => new ProtocolDto(
            Id: a.ProtocolId,
            DisplayName: a.DisplayName,
            SupportsDiscovery: a.SupportsDiscovery,
            SupportsLivePolling: a.SupportsLivePolling,
            ConfigSchema: MapSchema(a.GetConfigSchema())
        )).ToList();

        return Ok(list);
    }

    [HttpGet("{protocolId}")]
    public IActionResult GetOne(string protocolId)
    {
        var adapter = adapters.FirstOrDefault(a => a.ProtocolId == protocolId);
        if (adapter == null)
            return NotFound(new ErrorResponse("not_found", $"協議 '{protocolId}' 不存在"));

        return Ok(new ProtocolDto(
            Id: adapter.ProtocolId,
            DisplayName: adapter.DisplayName,
            SupportsDiscovery: adapter.SupportsDiscovery,
            SupportsLivePolling: adapter.SupportsLivePolling,
            ConfigSchema: MapSchema(adapter.GetConfigSchema())
        ));
    }

    private static ConfigSchemaDto MapSchema(ConfigSchema schema) => new(
        Fields: schema.Fields.Select(f => new ConfigFieldDto(
            Name: f.Name,
            Type: f.Type,
            Label: f.Label,
            Required: f.Required,
            DefaultValue: f.DefaultValue,
            Placeholder: f.Placeholder,
            Options: f.Options,
            Min: f.Min,
            Max: f.Max,
            HelpText: f.HelpText
        )).ToList()
    );
}
