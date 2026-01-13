#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Stock Battle Royale - Docker Deployment${NC}"
echo "========================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}No .env file found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${RED}IMPORTANT: Edit .env and set secure passwords and secrets!${NC}"
    echo -e "${YELLOW}Required changes:${NC}"
    echo "  - POSTGRES_PASSWORD"
    echo "  - JWT_SECRET (generate with: openssl rand -base64 32)"
    echo "  - OLLAMA_BASE_URL (if using external Ollama)"
    echo ""
    read -p "Press Enter after editing .env, or Ctrl+C to exit..."
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Determine docker-compose command
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo -e "${GREEN}Building Docker images...${NC}"
$COMPOSE_CMD build

echo -e "${GREEN}Starting services...${NC}"
$COMPOSE_CMD up -d

echo -e "${GREEN}Waiting for database to be ready...${NC}"
sleep 5

echo -e "${GREEN}Checking service status...${NC}"
$COMPOSE_CMD ps

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Access the application:"
echo "  Frontend: http://localhost"
echo "  Backend:  http://localhost:3000"
echo ""
echo "Useful commands:"
echo "  View logs:         $COMPOSE_CMD logs -f"
echo "  Stop services:     $COMPOSE_CMD down"
echo "  Restart services:  $COMPOSE_CMD restart"
echo ""
echo -e "${YELLOW}Remember to:${NC}"
echo "  1. Ensure Ollama is running and accessible"
echo "  2. Check backend logs: $COMPOSE_CMD logs backend"
echo "  3. Register a user at http://localhost"
