using System.Data;
using Dapper;
using OneLineArt.Core.Entities;
using OneLineArt.Core.Interfaces;
using OneLineArt.Infrastructure.Data;

namespace OneLineArt.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
    private readonly IDbConnectionFactory _db;
    public UserRepository(IDbConnectionFactory db) => _db = db;

    public async Task<User?> GetByIdAsync(Guid id)
    {
        using var conn = _db.Create();
        return await conn.QueryFirstOrDefaultAsync<User>(
            "sp_GetUserById", new { UserId = id }, commandType: CommandType.StoredProcedure);
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        using var conn = _db.Create();
        return await conn.QueryFirstOrDefaultAsync<User>(
            "sp_GetUserByEmail", new { Email = email }, commandType: CommandType.StoredProcedure);
    }

    public async Task<User?> GetByRefreshTokenAsync(string refreshToken)
    {
        using var conn = _db.Create();
        return await conn.QueryFirstOrDefaultAsync<User>(
            "sp_GetUserByRefreshToken", new { RefreshToken = refreshToken }, commandType: CommandType.StoredProcedure);
    }

    public async Task<Guid> CreateAsync(string email, string passwordHash, string name, string role, string emailConfirmToken)
    {
        using var conn = _db.Create();
        var p = new DynamicParameters();
        p.Add("Email", email);
        p.Add("PasswordHash", passwordHash);
        p.Add("Name", name);
        p.Add("Role", role);
        p.Add("EmailConfirmToken", emailConfirmToken);
        p.Add("UserId", dbType: DbType.Guid, direction: ParameterDirection.Output);
        await conn.ExecuteAsync("sp_CreateUser", p, commandType: CommandType.StoredProcedure);
        return p.Get<Guid>("UserId");
    }

    public async Task SetRefreshTokenAsync(Guid userId, string refreshToken, DateTime expiry)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_SetRefreshToken",
            new { UserId = userId, RefreshToken = refreshToken, Expiry = expiry },
            commandType: CommandType.StoredProcedure);
    }

    public async Task ClearRefreshTokenAsync(Guid userId)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_ClearRefreshToken", new { UserId = userId }, commandType: CommandType.StoredProcedure);
    }

    public async Task<bool> ConfirmEmailAsync(string token)
    {
        using var conn = _db.Create();
        var result = await conn.QueryFirstOrDefaultAsync<int>(
            "sp_ConfirmEmail", new { Token = token }, commandType: CommandType.StoredProcedure);
        return result > 0;
    }

    public async Task<bool> SetPasswordResetTokenAsync(string email, string token, DateTime expiry)
    {
        using var conn = _db.Create();
        var result = await conn.QueryFirstOrDefaultAsync<int>(
            "sp_SetPasswordResetToken", new { Email = email, Token = token, Expiry = expiry },
            commandType: CommandType.StoredProcedure);
        return result > 0;
    }

    public async Task<bool> ResetPasswordAsync(string token, string passwordHash)
    {
        using var conn = _db.Create();
        var result = await conn.QueryFirstOrDefaultAsync<int>(
            "sp_ResetPassword", new { Token = token, PasswordHash = passwordHash },
            commandType: CommandType.StoredProcedure);
        return result > 0;
    }

    public async Task UpdatePasswordAsync(Guid userId, string passwordHash)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_UpdatePassword",
            new { UserId = userId, PasswordHash = passwordHash },
            commandType: CommandType.StoredProcedure);
    }

    public async Task<bool> SetNewEmailConfirmTokenAsync(string email, string token)
    {
        using var conn = _db.Create();
        var result = await conn.QueryFirstOrDefaultAsync<int>(
            "sp_SetNewEmailConfirmToken", new { Email = email, Token = token },
            commandType: CommandType.StoredProcedure);
        return result > 0;
    }

    public async Task<int> CountAdminsAsync()
    {
        using var conn = _db.Create();
        return await conn.QueryFirstAsync<int>(
            "sp_CountAdmins", commandType: CommandType.StoredProcedure);
    }

    public async Task PromoteToAdminAsync(Guid userId)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_PromoteToAdmin", new { UserId = userId },
            commandType: CommandType.StoredProcedure);
    }

    public async Task DeleteAsync(Guid userId)
    {
        using var conn = _db.Create();
        await conn.ExecuteAsync("sp_AdminDeleteUser", new { UserId = userId },
            commandType: CommandType.StoredProcedure);
    }
}
