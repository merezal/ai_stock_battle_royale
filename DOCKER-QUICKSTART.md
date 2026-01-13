# Docker Quick Start Guide

## First Time Setup

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Edit .env and set:
#    - POSTGRES_PASSWORD
#    - JWT_SECRET (generate with: openssl rand -base64 32)
#    - OLLAMA_BASE_URL (e.g., http://host.docker.internal:11434)
nano .env

# 3. Run deployment script
./deploy.sh

# Or manually:
docker-compose build
docker-compose up -d
```

## Essential Commands

### Start/Stop

```bash
# Start all services
docker-compose up -d

# Stop all services (keeps data)
docker-compose down

# Stop and remove all data (⚠️ DANGER)
docker-compose down -v
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

### Service Management

```bash
# Restart a service
docker-compose restart backend

# Rebuild after code changes
docker-compose build backend
docker-compose up -d backend

# Check service status
docker-compose ps
```

### Database Operations

```bash
# Run Prisma migrations
docker-compose exec backend npx prisma migrate deploy

# Generate Prisma client
docker-compose exec backend npx prisma generate

# Open Prisma Studio
docker-compose exec backend npx prisma studio

# Backup database
docker-compose exec db pg_dump -U postgres stock_battle_royale > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T db psql -U postgres stock_battle_royale
```

### Troubleshooting

```bash
# Check backend can reach Ollama
docker-compose exec backend wget -O- http://host.docker.internal:11434/api/version

# Check database connection
docker-compose exec backend npx prisma db pull

# View backend environment
docker-compose exec backend env | grep -E "DATABASE|OLLAMA|JWT"

# Shell into backend
docker-compose exec backend sh

# Shell into database
docker-compose exec db psql -U postgres -d stock_battle_royale
```

## Configuration

### Ollama Setup Options

**Option 1: Ollama on Host (Recommended)**
```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

**Option 2: External Ollama Server**
```env
OLLAMA_BASE_URL=http://192.168.1.100:11434
```

**Option 3: Ollama in Docker**
Add to docker-compose.yml, then:
```env
OLLAMA_BASE_URL=http://ollama:11434
```

### Port Configuration

Default ports (change in `.env`):
- Frontend: 80 → `CLIENT_PORT=8080`
- Backend: 3000 → `BACKEND_PORT=3001`
- PostgreSQL: 5432 → `POSTGRES_PORT=5433`

### Access URLs

- Frontend: http://localhost
- Backend API: http://localhost:3000
- PostgreSQL: localhost:5432

## Common Issues

### Backend can't connect to database
```bash
docker-compose logs db
docker-compose restart backend
```

### Frontend shows 502
```bash
docker-compose logs backend
docker-compose restart backend
```

### Ollama connection fails
1. Ensure Ollama is running: `ollama list`
2. Test from host: `curl http://localhost:11434/api/version`
3. Check backend logs: `docker-compose logs backend | grep -i ollama`

### Port already in use
```bash
# Change port in .env
CLIENT_PORT=8080
BACKEND_PORT=3001

# Restart
docker-compose down
docker-compose up -d
```

## Development Mode

For hot-reload during development:

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Production Checklist

- [ ] Set secure `POSTGRES_PASSWORD`
- [ ] Generate secure `JWT_SECRET`: `openssl rand -base64 32`
- [ ] Configure Ollama URL correctly
- [ ] Don't expose PostgreSQL port publicly
- [ ] Set up HTTPS with reverse proxy
- [ ] Configure automated database backups
- [ ] Monitor logs and set up alerts

## Backup Strategy

### Manual Backup
```bash
# Create backup directory
mkdir -p backups

# Backup database
docker-compose exec db pg_dump -U postgres stock_battle_royale > backups/backup-$(date +%Y%m%d-%H%M%S).sql
```

### Automated Backup (cron)
```bash
# Add to crontab (crontab -e)
0 2 * * * cd /path/to/stock-battle-royale && docker-compose exec -T db pg_dump -U postgres stock_battle_royale > backups/backup-$(date +\%Y\%m\%d).sql
```

## Complete Reset

⚠️ **WARNING: This deletes ALL data**

```bash
docker-compose down -v
docker-compose up -d
```

## Getting Help

1. Check logs: `docker-compose logs`
2. Verify config: `docker-compose config`
3. Check service health: `docker-compose ps`
4. Review DEPLOYMENT.md for detailed troubleshooting
