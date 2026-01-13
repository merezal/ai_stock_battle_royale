# Docker Deployment Guide

This guide explains how to deploy Stock Battle Royale using Docker and Docker Compose.

## Prerequisites

- Docker (version 20.10 or later)
- Docker Compose (version 2.0 or later)
- An Ollama server (can be running on the host machine or remotely)

## Quick Start

### 1. Configure Environment Variables

Copy the example environment file and customize it:

```bash
cp .env.example .env
```

Edit `.env` and update the following critical values:

```env
# Set a secure password for PostgreSQL
POSTGRES_PASSWORD=your-secure-password-here

# Generate a secure JWT secret
# Use: openssl rand -base64 32
JWT_SECRET=your-generated-jwt-secret-here

# Configure Ollama connection
# For Ollama on host machine:
OLLAMA_BASE_URL=http://host.docker.internal:11434

# For Ollama on a remote server:
OLLAMA_BASE_URL=http://192.168.1.100:11434

# For Ollama in the same Docker network:
OLLAMA_BASE_URL=http://ollama:11434
```

### 2. Build and Start Services

```bash
# Build and start all services
docker-compose up -d

# Or build first, then start
docker-compose build
docker-compose up -d
```

### 3. Initialize the Database

The database will be automatically initialized on first startup. The backend service runs Prisma migrations automatically.

### 4. Access the Application

- **Frontend**: http://localhost (or http://localhost:80)
- **Backend API**: http://localhost:3000
- **PostgreSQL**: localhost:5432

## Services

### 1. PostgreSQL Database (`db`)
- Image: `postgres:16-alpine`
- Port: `5432` (configurable via `POSTGRES_PORT`)
- Data persisted in `postgres_data` volume
- Health checks enabled

### 2. Backend API (`backend`)
- Built from `./Dockerfile`
- Port: `3000` (configurable via `BACKEND_PORT`)
- Depends on `db` service
- Auto-runs migrations on startup
- Connects to external Ollama server

### 3. Frontend Client (`client`)
- Built from `./client/Dockerfile`
- Port: `80` (configurable via `CLIENT_PORT`)
- Served by Nginx
- Proxies `/api/*` requests to backend

## Configuration Options

### Port Mapping

Change ports in `.env`:

```env
POSTGRES_PORT=5432
BACKEND_PORT=3000
CLIENT_PORT=80
```

### Ollama Configuration

#### Option 1: Ollama on Host Machine (Recommended for Development)

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

This uses Docker's special DNS name that resolves to the host machine.

#### Option 2: External Ollama Server

```env
OLLAMA_BASE_URL=http://192.168.1.100:11434
```

Replace with your Ollama server's IP address and port.

#### Option 3: Ollama in Docker (Advanced)

Add to `docker-compose.yml`:

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    networks:
      - app-network

volumes:
  ollama_data:
```

Then set:
```env
OLLAMA_BASE_URL=http://ollama:11434
```

### Bot Execution Interval

Adjust how frequently bots execute (in milliseconds):

```env
BOT_EXECUTION_INTERVAL=30000  # 30 seconds
```

## Common Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f client
docker-compose logs -f db
```

### Restart a Service
```bash
docker-compose restart backend
```

### Rebuild After Code Changes
```bash
docker-compose build backend
docker-compose up -d backend
```

### Reset Database (WARNING: Deletes all data)
```bash
docker-compose down -v
docker-compose up -d
```

### Run Prisma Commands
```bash
# Generate Prisma client
docker-compose exec backend npx prisma generate

# Run migrations
docker-compose exec backend npx prisma migrate deploy

# Open Prisma Studio
docker-compose exec backend npx prisma studio
```

## Production Deployment

### Security Checklist

1. ✅ Change `POSTGRES_PASSWORD` to a strong password
2. ✅ Generate a secure `JWT_SECRET` using `openssl rand -base64 32`
3. ✅ Use HTTPS (set up reverse proxy with Let's Encrypt)
4. ✅ Set `NODE_ENV=production` (already configured)
5. ✅ Restrict PostgreSQL port exposure (remove from `ports:` if not needed externally)
6. ✅ Configure firewall rules
7. ✅ Set up automated backups for `postgres_data` volume

### Recommended Production Setup

1. **Use a reverse proxy** (Nginx, Traefik, or Caddy) for HTTPS
2. **Don't expose PostgreSQL** port publicly
3. **Use Docker secrets** for sensitive environment variables
4. **Set up monitoring** (Prometheus, Grafana)
5. **Configure backups** for the database volume

### Example Production `.env`

```env
POSTGRES_USER=sbr_prod
POSTGRES_PASSWORD=<VERY-SECURE-PASSWORD>
POSTGRES_DB=stock_battle_royale_prod
POSTGRES_PORT=5432  # Don't expose publicly

BACKEND_PORT=3000
CLIENT_PORT=80

JWT_SECRET=<GENERATED-WITH-OPENSSL>
OLLAMA_BASE_URL=http://ollama.internal:11434
BOT_EXECUTION_INTERVAL=30000
```

## Troubleshooting

### Backend Can't Connect to Database

Check database health:
```bash
docker-compose logs db
```

Verify connection string in backend logs:
```bash
docker-compose logs backend | grep -i database
```

### Backend Can't Reach Ollama

Test from within the backend container:
```bash
docker-compose exec backend wget -O- http://host.docker.internal:11434/api/version
```

If using external Ollama, ensure:
1. Ollama is running and accessible
2. Firewall allows connections
3. Ollama is bound to `0.0.0.0`, not just `localhost`

### Frontend Shows 502 Bad Gateway

Check if backend is running:
```bash
docker-compose ps backend
docker-compose logs backend
```

### Database Migration Fails

Manually run migrations:
```bash
docker-compose exec backend npx prisma migrate deploy
```

Or reset and migrate:
```bash
docker-compose down -v
docker-compose up -d
```

## Volume Management

### Backup Database

```bash
docker-compose exec db pg_dump -U postgres stock_battle_royale > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker-compose exec -T db psql -U postgres stock_battle_royale
```

### Clean Up Volumes

```bash
# Remove all volumes (WARNING: Deletes all data)
docker-compose down -v

# Remove specific volume
docker volume rm stock-battle-royale_postgres_data
```

## Scaling (Advanced)

To run multiple backend instances:

```yaml
services:
  backend:
    # ... existing config
    deploy:
      replicas: 3
```

Then use a load balancer (Nginx, HAProxy) in front of the backend instances.

## Support

For issues or questions:
1. Check the logs: `docker-compose logs`
2. Verify environment variables: `docker-compose config`
3. Ensure all prerequisites are met
4. Review the troubleshooting section above
