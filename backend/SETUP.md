# OneLineArt .NET Backend Setup

## Prerequisites
- .NET 8 SDK
- SQL Server (LocalDB, Express, or full)
- Stripe CLI (for webhook testing)

## Quick Start

```bash
cd backend

# Restore packages
dotnet restore

# Update connection string in src/OneLineArt.API/appsettings.json

# Run SQL scripts to create database
sqlcmd -S localhost -d master -Q "CREATE DATABASE OneLineArt"
sqlcmd -S localhost -d OneLineArt -i sql/001_CreateTables.sql
sqlcmd -S localhost -d OneLineArt -i sql/002_SeedData.sql
sqlcmd -S localhost -d OneLineArt -i sql/003_StoredProcedures.sql

# OR use EF Core migrations (auto-creates from DbContext)
cd src/OneLineArt.API
dotnet ef migrations add InitialCreate
dotnet ef database update

# Run the API
dotnet run --project src/OneLineArt.API
# API available at https://localhost:7001
# Swagger UI at https://localhost:7001/swagger
```

## Frontend Configuration

In `/src/app/config.ts`, change:
```ts
export const API_MODE: ApiMode = 'dotnet';
export const DOTNET_API_URL = 'https://localhost:7001/api';
```

## API Modes
- `mock` — All data in localStorage, no backend needed
- `supabase` — Current Supabase backend (default)
- `dotnet` — .NET backend with SQL Server

## Stripe Setup
1. Add your Stripe keys to `appsettings.json`
2. For local webhook testing: `stripe listen --forward-to https://localhost:7001/api/Stripe/webhook`
3. Add the webhook signing secret to `appsettings.json`

## Project Structure
```
backend/
  src/
    OneLineArt.Core/          # Entities, DTOs, Interfaces
    OneLineArt.Infrastructure/ # EF Core, Repositories, Services
    OneLineArt.API/            # Controllers, Program.cs
  sql/
    001_CreateTables.sql       # Database schema
    002_SeedData.sql           # Default pricing data
    003_StoredProcedures.sql   # Stored procedures
```
