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
            return Ok(new ApiResponse<AuthResponse>(true, result));
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning("Signup failed: {Error}", ex.Message);
            return BadRequest(new ApiResponse(false, Error: ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Signup exception");
            return StatusCode(500, new ApiResponse(false, Error: "Internal server error"));
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        try
        {
            var result = await _auth.LoginAsync(request);
            return Ok(new ApiResponse<AuthResponse>(true, result));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new ApiResponse(false, Error: ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Login exception");
            return StatusCode(500, new ApiResponse(false, Error: "Internal server error"));
        }
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request)
    {
        try
        {
            var result = await _auth.RefreshTokenAsync(request.RefreshToken);
            return Ok(new ApiResponse<AuthResponse>(true, result));
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Token refresh failed: {Error}", ex.Message);
            return Unauthorized(new ApiResponse(false, Error: "Invalid refresh token"));
        }
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshTokenRequest request)
    {
        await _auth.RevokeTokenAsync(request.RefreshToken);
        return Ok(new ApiResponse(true, "Logged out"));
    }
}
