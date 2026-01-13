# Environment Variables Reference

This document describes all environment variables used in Stock Battle Royale and how they affect the Docker deployment.

## Quick Reference

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `POSTGRES_USER` | `postgres` | No | PostgreSQL username |
| `POSTGRES_PASSWORD` | `example` | **YES** | PostgreSQL password (⚠️ CHANGE IN PRODUCTION) |
| `POSTGRES_DB` | `stock_battle_royale` | No | PostgreSQL database name |
| `POSTGRES_PORT` | `5432` | No | PostgreSQL port on host machine |
| `PORT` | `3000` | No | Backend API port inside container |
| `BACKEND_PORT` | `3000` | No | Backend API port on host machine |
| `CLIENT_PORT` | `80` | No | Frontend port on host machine |
| `JWT_SECRET` | `change-this-in-production` | **YES** | JWT signing secret (⚠️ CHANGE IN PRODUCTION) |
| `NODE_ENV` | `production` | No | Node.js environment mode |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | **YES** | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2` | No | Ollama model name |
| `BOT_EXECUTION_INTERVAL` | `30000` | No | Bot execution interval (milliseconds) |

## Detailed Configuration

### Database Variables

#### `POSTGRES_USER`
- **Default**: `postgres`
- **Used by**: `db` service
- **Description**: PostgreSQL superuser name
- **Example**: `POSTGRES_USER=sbr_admin`

#### `POSTGRES_PASSWORD` ⚠️
- **Default**: `example`
- **Used by**: `db` service, `backend` service
- **Description**: PostgreSQL password
- **Security**: **MUST be changed in production!**
- **Example**: `POSTGRES_PASSWORD=super_secure_password_123`

#### `POSTGRES_DB`
- **Default**: `stock_battle_royale`
- **Used by**: `db` service, `backend` service
- **Description**: Name of the PostgreSQL database to create
- **Example**: `POSTGRES_DB=sbr_production`

#### `POSTGRES_PORT`
- **Default**: `5432`
- **Used by**: Port mapping in `docker-compose.yml`
- **Description**: Port on **host machine** to expose PostgreSQL
- **Format**: `${POSTGRES_PORT}:5432`
- **Example**: `POSTGRES_PORT=5433` (if 5432 is already in use)
- **Note**: Container always uses 5432 internally

#### `DATABASE_URL`
- **Auto-constructed**: Yes (for Docker)
- **Format**: `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public`
- **Used by**: `backend` service for Prisma
- **Note**: Only set manually for local development outside Docker

---

### Application Ports

#### `PORT`
- **Default**: `3000`
- **Used by**: `backend` service (internal)
- **Description**: Port the Express server listens on **inside the container**
- **Example**: `PORT=3000`
- **Note**: Usually no need to change unless you have internal conflicts

#### `BACKEND_PORT`
- **Default**: `3000`
- **Used by**: Port mapping in `docker-compose.yml`
- **Description**: Port on **host machine** to access backend API
- **Format**: `${BACKEND_PORT}:${PORT}`
- **Example**: `BACKEND_PORT=8080` → Access API at `http://localhost:8080`

#### `CLIENT_PORT`
- **Default**: `80`
- **Used by**: Port mapping in `docker-compose.yml`
- **Description**: Port on **host machine** to access frontend
- **Format**: `${CLIENT_PORT}:80`
- **Example**: `CLIENT_PORT=8080` → Access UI at `http://localhost:8080`
- **Note**: Container always uses 80 (Nginx default)

---

### Security Configuration

#### `JWT_SECRET` ⚠️
- **Default**: `change-this-in-production`
- **Used by**: `backend` service
- **Description**: Secret key for signing JWT authentication tokens
- **Security**: **MUST be changed in production!**
- **Generate**: `openssl rand -base64 32`
- **Example**: `JWT_SECRET=K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=`
- **Impact**: Changing this invalidates all existing JWT tokens (users must log in again)

#### `NODE_ENV`
- **Default**: `production`
- **Used by**: `backend` service
- **Description**: Node.js environment mode
- **Options**: `development`, `production`, `test`
- **Impact**: Affects logging, error messages, performance optimizations

---

### Ollama Configuration

#### `OLLAMA_BASE_URL` ⚠️
- **Default**: `http://host.docker.internal:11434`
- **Used by**: `backend` service
- **Description**: URL to Ollama server for AI trading bots
- **Required**: Must be set correctly for bots to work

**Configuration Options**:

1. **Ollama on Host Machine** (Default)
   ```env
   OLLAMA_BASE_URL=http://host.docker.internal:11434
   ```
   - Use when Ollama runs on your computer
   - Docker Desktop translates `host.docker.internal` to host IP

2. **External Ollama Server**
   ```env
   OLLAMA_BASE_URL=http://192.168.1.100:11434
   ```
   - Use when Ollama runs on different machine
   - Replace with actual IP address

3. **Ollama in Docker Network**
   ```env
   OLLAMA_BASE_URL=http://ollama:11434
   ```
   - Use when Ollama runs in same docker-compose
   - Requires Ollama service in `docker-compose.yml`

4. **Local Development (No Docker)**
   ```env
   OLLAMA_BASE_URL=http://localhost:11434
   ```
   - Use when running backend outside Docker

#### `OLLAMA_MODEL`
- **Default**: `llama3.2`
- **Used by**: `backend` service
- **Description**: Name of the Ollama model to use for AI bots
- **Examples**: `llama3.2`, `llama3.1`, `mistral`, `codellama`
- **Check available**: Run `ollama list` on Ollama server

---

### Bot Configuration

#### `BOT_EXECUTION_INTERVAL`
- **Default**: `30000`
- **Used by**: `backend` service
- **Description**: How often (in milliseconds) to check for and execute active bots
- **Format**: Milliseconds
- **Examples**:
  - `15000` = 15 seconds (faster, more resource-intensive)
  - `30000` = 30 seconds (default)
  - `60000` = 1 minute (slower, less resource-intensive)
- **Recommended**: 15000-60000 (15 sec to 1 min)

---

## Port Mapping Explained

Understanding how ports work in Docker:

### Format: `HOST_PORT:CONTAINER_PORT`

```yaml
ports:
  - "${BACKEND_PORT:-3000}:${PORT:-3000}"
```

This means:
- **Left side** (`BACKEND_PORT`): Port on your host machine (your computer)
- **Right side** (`PORT`): Port inside the Docker container
- **Access**: You connect to `localhost:BACKEND_PORT` from outside Docker

### Example Scenarios

**Scenario 1: Default ports (all services)**
```env
BACKEND_PORT=3000
CLIENT_PORT=80
POSTGRES_PORT=5432
```
- Frontend: http://localhost
- Backend: http://localhost:3000
- Database: localhost:5432

**Scenario 2: Port 80 is in use**
```env
CLIENT_PORT=8080
```
- Frontend: http://localhost:8080
- Backend: http://localhost:3000
- Database: localhost:5432

**Scenario 3: Multiple instances on same host**
```env
# Instance 1 (in .env)
BACKEND_PORT=3000
CLIENT_PORT=80
POSTGRES_PORT=5432

# Instance 2 (in separate directory with different .env)
BACKEND_PORT=3001
CLIENT_PORT=8080
POSTGRES_PORT=5433
```

---

## Docker Compose Variable Usage

### How Variables are Used

1. **Port Mappings**
   ```yaml
   ports:
     - "${BACKEND_PORT:-3000}:${PORT:-3000}"
   ```
   - Uses `BACKEND_PORT` from .env, defaults to 3000 if not set
   - Format: `${VAR_NAME:-default_value}`

2. **Environment Variables**
   ```yaml
   environment:
     OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
   ```
   - Passes environment variable to container
   - Uses value from .env, defaults if not set

3. **Constructed Values**
   ```yaml
   environment:
     DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
   ```
   - Combines multiple variables
   - Creates connection string automatically

---

## Common Configuration Examples

### Production Deployment

```env
# Database
POSTGRES_USER=sbr_prod
POSTGRES_PASSWORD=<SECURE_PASSWORD_HERE>
POSTGRES_DB=stock_battle_royale_prod
POSTGRES_PORT=5432  # Don't expose publicly - use firewall

# Ports
BACKEND_PORT=3000
CLIENT_PORT=80

# Security
JWT_SECRET=<GENERATED_WITH_OPENSSL>
NODE_ENV=production

# Ollama
OLLAMA_BASE_URL=http://ollama.internal.company.com:11434
OLLAMA_MODEL=llama3.2

# Bot
BOT_EXECUTION_INTERVAL=30000
```

### Development (Multiple Instances)

```env
# Instance 1 - Default ports
POSTGRES_PORT=5432
BACKEND_PORT=3000
CLIENT_PORT=80

# Instance 2 - Alternate ports
POSTGRES_PORT=5433
BACKEND_PORT=3001
CLIENT_PORT=8080
```

### Local Development (No Port Conflicts)

```env
POSTGRES_PORT=5433  # Avoid conflict with local PostgreSQL
BACKEND_PORT=3001   # Avoid conflict with other apps
CLIENT_PORT=8080    # Avoid conflict with nginx/apache
```

---

## Validation

Test your configuration:

```bash
# Check what docker-compose will use
docker-compose config

# Check specific variable
docker-compose config | grep OLLAMA_BASE_URL

# Check all environment variables in backend
docker-compose exec backend env | sort
```

---

## Troubleshooting

### Port Already in Use

**Error**: `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Solution**: Change the port in `.env`
```env
BACKEND_PORT=3001  # Or any available port
```

### Can't Connect to Ollama

**Check 1**: Verify Ollama is running
```bash
curl http://localhost:11434/api/version
```

**Check 2**: Test from inside container
```bash
docker-compose exec backend wget -O- $OLLAMA_BASE_URL/api/version
```

**Fix**: Update `OLLAMA_BASE_URL` in `.env` based on your setup

### Database Connection Failed

**Check**: Verify DATABASE_URL construction
```bash
docker-compose config | grep DATABASE_URL
```

**Common issues**:
- Wrong password in `POSTGRES_PASSWORD`
- Database name doesn't match `POSTGRES_DB`
- Database not healthy (check: `docker-compose ps db`)

---

## Security Checklist

- [ ] Changed `POSTGRES_PASSWORD` from default
- [ ] Generated secure `JWT_SECRET` with `openssl rand -base64 32`
- [ ] Set `NODE_ENV=production`
- [ ] Don't commit `.env` file to git (use `.env.example`)
- [ ] Don't expose `POSTGRES_PORT` publicly in production
- [ ] Use HTTPS in production (reverse proxy)
- [ ] Restrict Ollama access if exposed to network
