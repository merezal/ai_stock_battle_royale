# Client Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Accept API URL as build argument
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Build the application
RUN npm run build

# Production stage - serve with Node
FROM node:20-alpine

WORKDIR /app

# Install serve globally to serve static files
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Default port (can be overridden at runtime)
ENV PORT=80

# Expose the port
ARG PORT=80
EXPOSE ${PORT}

# Serve the built app on the specified port
CMD ["sh", "-c", "serve -s dist -l $PORT"]
