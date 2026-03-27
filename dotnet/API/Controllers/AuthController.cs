using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly ILogger<AuthController> _logger;

    public AuthController(IAuthService auth, ILogger<AuthController> logger)
    {
        _auth = auth;
        _logger = logger;
    }

    [HttpPost("signup")]
    public async Task<IActionResult> Signup([FromBody] SignupRequest request)
    {
        try
        {
            var result = await _auth.SignupAsync(request);
            if (!result.Success)
                return BadRequest(result);
            _logger.LogInformation("User signed up: {Email}", request.Email);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Signup exception for {Email}", request.Email);
            return StatusCode(500, new { success = false, error = $"Signup exception: {ex.Message}" });
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        try
        {
            var result = await _auth.LoginAsync(request);
            if (!result.Success)
                return BadRequest(result);
            _logger.LogInformation("User logged in: {Email}", request.Email);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Login exception for {Email}", request.Email);
            return StatusCode(500, new { success = false, error = $"Login exception: {ex.Message}" });
        }
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request)
    {
        try
        {
            var result = await _auth.RefreshAsync(request.RefreshToken);
            if (!result.Success)
                return Unauthorized(result);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Refresh exception");
            return StatusCode(500, new { success = false, error = $"Refresh exception: {ex.Message}" });
        }
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest request)
    {
        try
        {
            await _auth.LogoutAsync(request.RefreshToken);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Logout exception");
            return Ok(new { success = true }); // Don't fail logout
        }
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        try
        {
            var (success, error) = await _auth.ForgotPasswordAsync(request.Email, request.RedirectTo);
            return Ok(new { success = true, message = "If an account exists, a reset email has been sent." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Forgot password exception");
            return StatusCode(500, new { success = false, error = $"Exception: {ex.Message}" });
        }
    }

    [HttpPost("resend-verification")]
    public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationRequest request)
    {
        try
        {
            await _auth.ResendVerificationAsync(request.Email);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Resend verification exception");
            return StatusCode(500, new { success = false, error = $"Exception: {ex.Message}" });
        }
    }

    [HttpPost("confirm-email")]
    public async Task<IActionResult> ConfirmEmail([FromQuery] string token)
    {
        var (success, error) = await _auth.ConfirmEmailAsync(token);
        if (!success)
            return BadRequest(new { success = false, error });
        return Ok(new { success = true });
    }

    [Authorize]
    [HttpPost("update-password")]
    public async Task<IActionResult> UpdatePassword([FromBody] UpdatePasswordRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var (success, error) = await _auth.UpdatePasswordAsync(userId, request.NewPassword);
            return Ok(new { success });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Update password exception");
            return StatusCode(500, new { success = false, error = $"Exception: {ex.Message}" });
        }
    }
}
