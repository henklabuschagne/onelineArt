using System.Data;
using Microsoft.Data.SqlClient;

namespace OneLineArt.Infrastructure.Data;

public interface IDbConnectionFactory
{
    IDbConnection Create();
}

public class SqlServerConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public SqlServerConnectionFactory(string connectionString)
    {
        _connectionString = connectionString;
    }

    public IDbConnection Create() => new SqlConnection(_connectionString);
}
