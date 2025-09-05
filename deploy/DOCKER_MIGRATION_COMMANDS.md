# Docker Migration Commands Reference

This document contains all the Docker commands used for ClipForge database migrations, with detailed explanations for future reference.

## Prerequisites

Ensure you're in the `deploy` directory where the `docker-compose.yml` file is located:

```bash
cd /path/to/clipforge/deploy
```

## 1. Database Reset and Cleanup

### Stop all services and remove volumes
```bash
# Stop all running containers and remove all volumes (WARNING: destroys all data)
docker compose down -v
```
**Purpose**: Completely resets the database and removes all persistent data. Use this when you need a fresh start or when encountering migration conflicts.

### Verify cleanup
```bash
# Check that all containers and volumes have been removed
docker compose ps
```
**Purpose**: Confirms that the cleanup was successful and no containers are running.

## 2. Start Infrastructure Services

### Start database and Redis first
```bash
# Start only the essential infrastructure services
docker compose up postgres redis -d
```
**Purpose**: Starts PostgreSQL and Redis services in detached mode. Always start these before the orchestrator to ensure proper dependency order.

### Wait for services to be ready
```bash
# Wait for database to be fully initialized
sleep 5
```
**Purpose**: Gives PostgreSQL time to complete its initialization process before starting dependent services.

## 3. Start Orchestrator Service

### Start the orchestrator
```bash
# Start the orchestrator service (NestJS API)
docker compose up orchestrator -d
```
**Purpose**: Starts the main API service that handles database connections and migrations.

### Check service status
```bash
# Verify all services are running and healthy
docker compose ps
```
**Purpose**: Confirms that all required services are running before attempting migrations.

## 4. Database Migration Commands

### Check migration status
```bash
# Check if there are any pending migrations
docker compose exec orchestrator npm run typeorm:migrate
```
**Purpose**: Runs any pending migrations. If no migrations exist, it will show "No migrations are pending".

### Generate new migration
```bash
# Generate a new migration based on entity changes
docker compose exec orchestrator npm run typeorm:generate -- src/migrations/InitialSchema
```
**Purpose**: Creates a new migration file by comparing current entities with the database schema. Replace `InitialSchema` with a descriptive name.

### Run specific migration
```bash
# Run migrations (same as checking status, but explicitly runs them)
docker compose exec orchestrator npm run typeorm:migrate
```
**Purpose**: Executes all pending migrations in the correct order.

## 5. Database Inspection Commands

### List all tables
```bash
# Connect to PostgreSQL and list all tables
docker compose exec postgres psql -U clipforge_user -d clipforge -c "\dt"
```
**Purpose**: Shows all tables in the database to verify migration success.

### Check specific table structure
```bash
# Describe a specific table structure
docker compose exec postgres psql -U clipforge_user -d clipforge -c "\d table_name"
```
**Purpose**: Shows the structure of a specific table including columns, indexes, and constraints.

### View migration history
```bash
# Check which migrations have been applied
docker compose exec postgres psql -U clipforge_user -d clipforge -c "SELECT * FROM migrations ORDER BY timestamp DESC;"
```
**Purpose**: Shows the migration history to track which migrations have been executed.

## 6. Troubleshooting Commands

### View orchestrator logs
```bash
# Check orchestrator service logs for errors
docker compose logs orchestrator
```
**Purpose**: Displays logs from the orchestrator service to diagnose connection or migration issues.

### View recent logs only
```bash
# Show only the last 20 log entries
docker compose logs orchestrator --tail 20
```
**Purpose**: Shows recent log entries without overwhelming output.

### Check environment variables
```bash
# Verify environment variables in the orchestrator container
docker compose exec orchestrator env | grep -E "(DATABASE|POSTGRES)"
```
**Purpose**: Confirms that database connection environment variables are properly set.

### Rebuild orchestrator container
```bash
# Rebuild the orchestrator container after code changes
docker compose build orchestrator
```
**Purpose**: Rebuilds the container when you've made changes to the source code or Dockerfile.

### Restart orchestrator after rebuild
```bash
# Restart the orchestrator with the new build
docker compose up orchestrator -d
```
**Purpose**: Starts the orchestrator with the newly built image.

## 7. Migration File Management

### View migration file content
```bash
# Display the content of a specific migration file
docker compose exec orchestrator cat /app/src/migrations/[migration-filename].ts
```
**Purpose**: Inspects the generated migration file to check for issues like duplicate indexes.

### Edit migration file (if needed)
```bash
# Remove duplicate index statements from migration file
docker compose exec orchestrator sed -i '/CREATE INDEX "IDX_duplicate_name"/N; /CREATE INDEX "IDX_duplicate_name"/d' /app/src/migrations/[filename].ts
```
**Purpose**: Removes duplicate index creation statements that can cause migration failures.

## 8. Complete Migration Workflow

### Full reset and migration process
```bash
# Complete workflow for resetting and migrating database
cd /path/to/clipforge/deploy

# 1. Reset everything
docker compose down -v

# 2. Start infrastructure
docker compose up postgres redis -d
sleep 5

# 3. Start orchestrator
docker compose up orchestrator -d

# 4. Wait for orchestrator to be ready
sleep 10

# 5. Generate migration (if needed)
docker compose exec orchestrator npm run typeorm:generate -- src/migrations/InitialSchema

# 6. Run migration
docker compose exec orchestrator npm run typeorm:migrate

# 7. Verify tables were created
docker compose exec postgres psql -U clipforge_user -d clipforge -c "\dt"
```
**Purpose**: Complete step-by-step process for resetting the database and running migrations from scratch.

## 9. Service Management

### Start all services
```bash
# Start all ClipForge services
docker compose up -d
```
**Purpose**: Starts all services defined in docker-compose.yml in detached mode.

### Stop all services
```bash
# Stop all running services
docker compose down
```
**Purpose**: Stops all services but preserves volumes and data.

### View all service status
```bash
# Check status of all services
docker compose ps
```
**Purpose**: Shows the current status of all services (running, stopped, healthy, etc.).

## 10. Common Issues and Solutions

### Issue: "No migrations are pending"
**Cause**: No migration files exist or all migrations have been applied.
**Solution**: Generate a new migration with `npm run typeorm:generate`

### Issue: "relation already exists"
**Cause**: Duplicate index or table creation in migration file.
**Solution**: Edit the migration file to remove duplicates or reset the database.

### Issue: "connect ECONNREFUSED 127.0.0.1:5432"
**Cause**: Orchestrator trying to connect to localhost instead of postgres container.
**Solution**: Check environment variables and ensure DATABASE_HOST is set to 'postgres'.

### Issue: "password authentication failed"
**Cause**: Wrong database credentials or missing environment variables.
**Solution**: Verify .env file has correct DATABASE_USERNAME and DATABASE_PASSWORD.

## Environment Variables Reference

The following environment variables must be set in the `.env` file:

```env
# Database Configuration
DATABASE_URL=postgresql://clipforge_user:clipforge_secure_password_2024@postgres:5432/clipforge
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USERNAME=clipforge_user
DATABASE_PASSWORD=clipforge_secure_password_2024
DATABASE_NAME=clipforge

# PostgreSQL Configuration
POSTGRES_DB=clipforge
POSTGRES_USER=clipforge_user
POSTGRES_PASSWORD=clipforge_secure_password_2024
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
```

## Notes

- Always run migrations from the `deploy` directory
- Ensure PostgreSQL is healthy before running migrations
- Check logs if migrations fail
- Use `docker compose down -v` with caution as it destroys all data
- Migration files are generated in `/app/src/migrations/` inside the orchestrator container
- The orchestrator service must be running to execute migration commands
