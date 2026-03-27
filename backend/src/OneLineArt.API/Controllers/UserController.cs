using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UserController : ControllerBase
{
    private readonly IUserService _users;
    private readonly ILogger<UserController> _logger;

    public UserController(IUserService users, ILogger<UserController> logger)
    {
        _users = users;
        _logger = logger;
    }

    private Guid GetUserId() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        try
        {
            var dashboard = await _users.GetDashboardAsync(GetUserId());
            return Ok(new ApiResponse<UserDashboardDto>(true, dashboard));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user profile");
            return StatusCode(500, new ApiResponse(false, Error: ex.Message));
        }
    }

    [HttpPost("deduct")]
    public async Task<IActionResult> DeductCredits([FromBody] DeductCreditsRequest request)
    {
        try
        {
            var result = await _users.DeductCreditsAsync(GetUserId(), request.Type);
            return Ok(new ApiResponse<DeductCreditsResponse>(true, result));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse(false, Error: ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deducting credits");
            return StatusCode(500, new ApiResponse(false, Error: ex.Message));
        }
    }
}
