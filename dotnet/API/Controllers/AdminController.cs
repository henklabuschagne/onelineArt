using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "admin")]
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
    public async Task<IActionResult> GetUsers()
    {
        try
        {
            var users = await _admin.GetAllUsersAsync();
            return Ok(new { success = true, data = users });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Admin GetUsers exception");
            return StatusCode(500, new { success = false, error = $"Exception: {ex.Message}" });
        }
    }

    [HttpGet("analytics")]
    public async Task<IActionResult> GetAnalytics()
    {
        try
        {
            var data = await _admin.GetAnalyticsAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Admin GetAnalytics exception");
            return StatusCode(500, new { success = false, error = $"Exception: {ex.Message}" });
        }
    }

    [HttpPost("user/update")]
    public async Task<IActionResult> UpdateUser([FromBody] AdminUpdateUserRequest request)
    {
        try
        {
            await _admin.UpdateUserAsync(request.UserId, request.Updates);
            _logger.LogInformation("Admin {AdminId} updated user {UserId}", GetUserId(), request.UserId);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Admin UpdateUser exception");
            return StatusCode(500, new { success = false, error = $"Exception: {ex.Message}" });
        }
    }

    [HttpPost("user/delete")]
    public async Task<IActionResult> DeleteUser([FromBody] AdminDeleteUserRequest request)
    {
        try
        {
            await _admin.DeleteUserAsync(request.UserId);
            _logger.LogInformation("Admin {AdminId} deleted user {UserId}", GetUserId(), request.UserId);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Admin DeleteUser exception");
            return StatusCode(500, new { success = false, error = $"Exception: {ex.Message}" });
        }
    }

    [Authorize] // Any authenticated user can try — service enforces business rules
    [HttpPost("promote")]
    public async Task<IActionResult> Promote()
    {
        try
        {
            var (success, message) = await _admin.PromoteToAdminAsync(GetUserId());
            if (!success) return StatusCode(403, new { success = false, error = message });
            _logger.LogInformation("User {UserId} promoted to admin", GetUserId());
            return Ok(new { success = true, message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Admin Promote exception");
            return StatusCode(500, new { success = false, error = $"Exception: {ex.Message}" });
        }
    }
}
