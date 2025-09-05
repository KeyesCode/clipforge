# ClipForge Deployment Makefile
# Provides easy commands for managing the ClipForge deployment

.PHONY: help build up down restart logs clean status health setup-env backup restore

# Default target
help:
	@echo "ClipForge Deployment Commands:"
	@echo ""
	@echo "Environment Setup:"
	@echo "  setup-env     - Copy .env.example to .env (if doesn't exist)"
	@echo "  check-env     - Validate environment configuration"
	@echo ""
	@echo "Build & Deployment:"
	@echo "  build         - Build all Docker images"
	@echo "  build-no-cache- Build all Docker images without cache"
	@echo "  up            - Start all services"
	@echo "  up-detached   - Start all services in background"
	@echo "  down          - Stop all services"
	@echo "  restart       - Restart all services"
	@echo ""
	@echo "Development:"
	@echo "  up-dev        - Start services with development overrides"
	@echo "  logs          - Show logs from all services"
	@echo "  logs-f        - Follow logs from all services"
	@echo "  logs-service  - Show logs from specific service (make logs-service SERVICE=web)"
	@echo ""
	@echo "Monitoring:"
	@echo "  status        - Show status of all services"
	@echo "  health        - Check health of all services"
	@echo "  ps            - Show running containers"
	@echo ""
	@echo "Database:"
	@echo "  db-migrate    - Run database migrations"
	@echo "  db-seed       - Seed database with test data"
	@echo "  db-reset      - Reset database (WARNING: destroys data)"
	@echo "  db-backup     - Backup database"
	@echo "  db-restore    - Restore database from backup"
	@echo ""
	@echo "Maintenance:"
	@echo "  clean         - Remove stopped containers and unused images"
	@echo "  clean-all     - Remove all containers, images, and volumes"
	@echo "  update        - Pull latest images and restart"
	@echo "  scale         - Scale services (make scale SERVICE=worker REPLICAS=3)"

# Environment setup
setup-env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env file from .env.example"; \
		echo "Please edit .env file with your configuration"; \
	else \
		echo ".env file already exists"; \
	fi

check-env:
	@if [ ! -f .env ]; then \
		echo "ERROR: .env file not found. Run 'make setup-env' first"; \
		exit 1; \
	fi
	@echo "Checking environment configuration..."
	@docker-compose config > /dev/null && echo "Environment configuration is valid"

# Build commands
build: check-env
	@echo "Building all Docker images..."
	docker-compose build

build-no-cache: check-env
	@echo "Building all Docker images without cache..."
	docker-compose build --no-cache

# Service management
up: check-env
	@echo "Starting all services..."
	docker-compose up

up-detached: check-env
	@echo "Starting all services in background..."
	docker-compose up -d

up-dev: check-env
	@echo "Starting services in development mode..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

down:
	@echo "Stopping all services..."
	docker-compose down

restart: down up-detached

# Logging
logs:
	docker-compose logs

logs-f:
	docker-compose logs -f

logs-service:
	@if [ -z "$(SERVICE)" ]; then \
		echo "ERROR: Please specify SERVICE (e.g., make logs-service SERVICE=web)"; \
		exit 1; \
	fi
	docker-compose logs -f $(SERVICE)

# Monitoring
status:
	@echo "Service Status:"
	docker-compose ps

health: check-env
	@echo "Checking service health..."
	@echo "Orchestrator:" && curl -f http://localhost:3002/health || echo "UNHEALTHY"
	@echo "Web UI:" && curl -f http://localhost:3000/api/health || echo "UNHEALTHY"
	@echo "Ingest Service:" && curl -f http://localhost:8001/health || echo "UNHEALTHY"
	@echo "ASR Service:" && curl -f http://localhost:8002/health || echo "UNHEALTHY"
	@echo "Vision Service:" && curl -f http://localhost:8003/health || echo "UNHEALTHY"
	@echo "Scoring Service:" && curl -f http://localhost:8004/health || echo "UNHEALTHY"
	@echo "Render Service:" && curl -f http://localhost:8005/health || echo "UNHEALTHY"

ps:
	docker-compose ps

# Database operations
db-migrate: check-env
	@echo "Running database migrations..."
	docker-compose exec orchestrator npm run typeorm:migration:run

db-seed: check-env
	@echo "Seeding database with test data..."
	docker-compose exec orchestrator npm run seed

db-reset: check-env
	@echo "WARNING: This will destroy all database data!"
	@read -p "Are you sure? (y/N) " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo ""; \
		docker-compose exec postgres dropdb -U clipforge clipforge || true; \
		docker-compose exec postgres createdb -U clipforge clipforge; \
		make db-migrate; \
		make db-seed; \
	else \
		echo ""; \
		echo "Cancelled."; \
	fi

db-backup:
	@echo "Creating database backup..."
	@mkdir -p backups
	docker-compose exec postgres pg_dump -U clipforge clipforge > backups/backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "Backup created in backups/ directory"

db-restore:
	@if [ -z "$(BACKUP)" ]; then \
		echo "ERROR: Please specify BACKUP file (e.g., make db-restore BACKUP=backups/backup_20231201_120000.sql)"; \
		exit 1; \
	fi
	@echo "Restoring database from $(BACKUP)..."
	docker-compose exec -T postgres psql -U clipforge clipforge < $(BACKUP)

# Maintenance
clean:
	@echo "Cleaning up stopped containers and unused images..."
	docker-compose down --remove-orphans
	docker system prune -f

clean-all:
	@echo "WARNING: This will remove all containers, images, and volumes!"
	@read -p "Are you sure? (y/N) " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo ""; \
		docker-compose down -v --remove-orphans; \
		docker system prune -a -f --volumes; \
	else \
		echo ""; \
		echo "Cancelled."; \
	fi

update: check-env
	@echo "Pulling latest images and restarting services..."
	docker-compose pull
	docker-compose up -d

scale: check-env
	@if [ -z "$(SERVICE)" ] || [ -z "$(REPLICAS)" ]; then \
		echo "ERROR: Please specify SERVICE and REPLICAS (e.g., make scale SERVICE=worker REPLICAS=3)"; \
		exit 1; \
	fi
	docker-compose up -d --scale $(SERVICE)=$(REPLICAS)

# Development helpers
shell:
	@if [ -z "$(SERVICE)" ]; then \
		echo "ERROR: Please specify SERVICE (e.g., make shell SERVICE=orchestrator)"; \
		exit 1; \
	fi
	docker-compose exec $(SERVICE) /bin/bash

# Production deployment
deploy-prod: check-env
	@echo "Deploying to production..."
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Monitoring services
up-monitoring:
	@echo "Starting monitoring services..."
	docker-compose --profile monitoring up -d redis-commander pgadmin

down-monitoring:
	@echo "Stopping monitoring services..."
	docker-compose --profile monitoring down

# GPU support check
check-gpu:
	@echo "Checking GPU support..."
	@docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi || echo "GPU support not available"

# Quick commands for common tasks
quick-start: setup-env build up-detached db-migrate
	@echo "ClipForge started successfully!"
	@echo "Web UI: http://localhost:3000"
	@echo "API Docs: http://localhost:3001/api/docs"

quick-stop: down clean
	@echo "ClipForge stopped and cleaned up"