using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AdminController : ControllerBase
{
    private readonly IAdminService _admin;
    private readonly ILogger<AdminController> _logger;

    public AdminController(IAdminService admin, ILogger<AdminController> logger)
    {
        _admin = admin;
        _logger = logger;
    }

    private Guid GetUserId() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("users")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetUsers([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var users = await _admin.GetAllUsersAsync(page, pageSize);
        return Ok(new ApiResponse<List<UserProfileDto>>(true, users));
    }

    [HttpGet("analytics")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetAnalytics()
    {
        var analytics = await _admin.GetAnalyticsAsync();
        return Ok(new ApiResponse<AdminAnalyticsDto>(true, analytics));
    }

    [HttpPost("user/update")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateUser([FromBody] AdminUpdateUserRequest request)
    {
        try
        {
            await _admin.UpdateUserAsync(request);
            return Ok(new ApiResponse(true, "User updated"));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new ApiResponse(false, Error: ex.Message));
        }
    }

    [HttpPost("user/delete")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> DeleteUser([FromBody] AdminDeleteUserRequest request)
    {
        await _admin.DeleteUserAsync(request.UserId);
        return Ok(new ApiResponse(true, "User deleted"));
    }

    [HttpPost("promote")]
    public async Task<IActionResult> PromoteToAdmin()
    {
        var result = await _admin.PromoteToAdminAsync(GetUserId());
        return result.Success ? Ok(result) : StatusCode(403, result);
    }
}
