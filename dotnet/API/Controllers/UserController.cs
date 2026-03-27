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
    private readonly IUserService _userService;
    private readonly ILogger<UserController> _logger;

    public UserController(IUserService userService, ILogger<UserController> logger)
    {
        _userService = userService;
        _logger = logger;
    }

    private Guid GetUserId() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        try
        {
            var result = await _userService.GetProfileAsync(GetUserId());
            return result.Success ? Ok(result) : BadRequest(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetProfile exception for user {UserId}", GetUserId());
            return StatusCode(500, new { success = false, error = $"Profile exception: {ex.Message}" });
        }
    }

    [HttpPost("deduct")]
    public async Task<IActionResult> DeductCredits([FromBody] DeductRequest request)
    {
        try
        {
            var userId = GetUserId();
            var (success, error, credits) = await _userService.DeductCreditsAsync(userId, request.Type);
            if (!success)
                return BadRequest(new { success = false, error, credits });
            return Ok(new { success = true, credits });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "DeductCredits exception");
            return StatusCode(500, new { success = false, error = $"Deduct exception: {ex.Message}" });
        }
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory()
    {
        try
        {
            var transactions = await _userService.GetHistoryAsync(GetUserId());
            return Ok(new { success = true, data = new { transactions } });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetHistory exception");
            return StatusCode(500, new { success = false, error = $"History exception: {ex.Message}" });
        }
    }

    [HttpPost("cancel-subscription")]
    public async Task<IActionResult> CancelSubscription()
    {
        try
        {
            var (success, error, subscription) = await _userService.CancelSubscriptionAsync(GetUserId());
            if (!success)
                return BadRequest(new { success = false, error });
            _logger.LogInformation("Subscription cancelled for user {UserId}", GetUserId());
            return Ok(new { success = true, subscription });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CancelSubscription exception");
            return StatusCode(500, new { success = false, error = $"Cancel exception: {ex.Message}" });
        }
    }
}
