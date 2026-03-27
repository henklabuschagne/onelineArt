using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AiController : ControllerBase
{
    private readonly IAiService _ai;
    private readonly ILogger<AiController> _logger;

    public AiController(IAiService ai, ILogger<AiController> logger)
    {
        _ai = ai;
        _logger = logger;
    }

    [HttpPost("generate-image")]
    public async Task<IActionResult> GenerateImage([FromBody] AiImageRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var result = await _ai.GenerateImageAsync(userId, request.Prompt);
            if (!result.Success)
            {
                var statusCode = result.Error?.Contains("rate") == true ? 429 : 400;
                return StatusCode(statusCode, result);
            }
            _logger.LogInformation("AI image generated for user {UserId}", userId);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI generation exception");
            return StatusCode(500, new AiImageResponse(false, Error: $"AI exception: {ex.Message}"));
        }
    }
}
