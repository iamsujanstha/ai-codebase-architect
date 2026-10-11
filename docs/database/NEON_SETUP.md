# Neon PostgreSQL Setup Guide

**Cloud Provider:** Neon (Serverless PostgreSQL)  
**Project:** mute-poetry-36023339  
**Branch:** production

---

## 🚀 Step-by-Step Setup

### Step 1: Login to Neon

```bash
# Already installed neon CLI
neon login
```

This will open browser for authentication.

---

### Step 2: Link Project

```bash
cd /Users/mac/Developer/AI/ai-codebase-architect

neon link --project-id mute-poetry-36023339 --branch production -y
```

This connects your local project to Neon cloud project.

---

### Step 3: Get Connection String

```bash
neon connection-string
```

Example output:
```
postgres://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
```

---

### Step 4: Install PostgreSQL Client for Node.js

```bash
cd backend
npm install pg @types/pg
npm install typeorm @nestjs/typeorm
```

**Why both:**
- `pg`: Raw PostgreSQL driver (for learning SQL)
- `typeorm`: ORM for production code (similar to Mongoose)

---

### Step 5: Create `.env` Variables

Add to `backend/.env`:
```env
# PostgreSQL (Neon)
POSTGRES_URL="postgres://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require"
POSTGRES_HOST="ep-xxx.us-east-2.aws.neon.tech"
POSTGRES_PORT="5432"
POSTGRES_USER="user"
POSTGRES_PASSWORD="password"
POSTGRES_DB="dbname"
POSTGRES_SSL="true"

# Dual-write mode (for migration)
DATABASE_MODE="dual-write"  # Options: mongodb-only, dual-write, postgres-only
```

---

### Step 6: Create Database Module

**backend/src/database/database.module.ts:**
```typescript
import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('POSTGRES_URL'),
        ssl: config.get('POSTGRES_SSL') === 'true' ? { rejectUnauthorized: false } : false,
        synchronize: false, // Never auto-sync in production
        logging: config.get('NODE_ENV') === 'development',
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
      }),
    }),
  ],
})
export class DatabaseModule {}
```

---

### Step 7: Create Initial Migration

```bash
cd backend

# Create migration directory
mkdir -p src/database/migrations

# Create first migration
npx typeorm migration:create src/database/migrations/InitialSchema
```

Edit the migration file (see POSTGRESQL_MIGRATION_GUIDE.md for schema).

---

### Step 8: Run Migration

```bash
# Set connection string
export POSTGRES_URL="your-connection-string"

# Run migration
npx typeorm migration:run -d src/database/data-source.ts
```

---

## 🧪 Test Connection

Create `backend/src/database/postgres-health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class PostgresHealthController {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  @Get('postgres')
  async checkPostgres() {
    const result = await this.dataSource.query('SELECT NOW()');
    return {
      status: 'ok',
      database: 'postgres',
      timestamp: result[0].now,
    };
  }
}
```

Test:
```bash
curl http://localhost:3000/health/postgres
```

---

## 📊 Neon Dashboard

Access your Neon dashboard at: https://console.neon.tech/app/projects/mute-poetry-36023339

Features:
- **SQL Editor:** Run queries in browser
- **Branches:** Create git-like branches (dev, staging, prod)
- **Monitoring:** Query performance, connection stats
- **Backups:** Automatic daily backups

---

## 🎯 Next Steps

1. ✅ Login to Neon
2. ✅ Link project
3. ✅ Get connection string
4. ✅ Install dependencies
5. ✅ Configure environment variables
6. ✅ Create database module
7. ✅ Run initial migration
8. ⏳ Create entity classes (User, Product, Order)
9. ⏳ Implement dual-write pattern
10. ⏳ Backfill MongoDB data

---

## 🔧 Troubleshooting

### Connection Refused
```
Error: connect ECONNREFUSED
```
**Fix:** Check firewall, ensure Neon project is active, verify connection string.

### SSL Error
```
Error: self signed certificate
```
**Fix:** Add `ssl: { rejectUnauthorized: false }` to TypeORM config.

### Migration Failed
```
Error: relation "users" already exists
```
**Fix:** Drop tables or use `IF NOT EXISTS` in migration.

---

## 📚 Useful Neon Commands

```bash
# List projects
neon projects list

# List branches
neon branches list

# Create new branch (like git branch)
neon branches create --name staging

# Get connection string for specific branch
neon connection-string --branch staging

# Monitor queries
neon monitor

# View logs
neon logs
```

---

**Status:** Ready to execute  
**Next:** Run Neon login and link project
