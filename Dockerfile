# Multi-stage Dockerfile for Portkey MCP Server
# Supports both stdio (default) and HTTP transport modes

# ============================================
# Stage 1: Builder
# ============================================
FROM node:24.12-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build the TypeScript code
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:24.12-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 mcpgroup && \
    adduser -u 1001 -G mcpgroup -s /bin/sh -D mcpuser

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/build ./build

# Set ownership to non-root user
RUN chown -R mcpuser:mcpgroup /app

# Environment variables
ENV NODE_ENV=production
ENV MCP_TRANSPORT=stdio
ENV MCP_PORT=3000
ENV MCP_HOST=0.0.0.0

# Expose HTTP port (used when MCP_TRANSPORT=http)
EXPOSE 3000

# Health check for HTTP mode
# Only effective when MCP_TRANSPORT=http
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD if [ "$MCP_TRANSPORT" = "http" ]; then \
        node -e "require('http').get('http://127.0.0.1:' + (process.env.MCP_PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"; \
    else \
        exit 0; \
    fi

# Switch to non-root user
USER mcpuser

# Default command (stdio mode)
# Override with 'node build/server.js' for HTTP mode
CMD ["node", "build/index.js"]
