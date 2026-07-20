# Multi-stage Dockerfile for Portkey MCP Server
# Supports both stdio (default) and HTTP transport modes

# ============================================
# Stage 1: Builder
# ============================================
FROM node:24.18-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS builder

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
FROM node:24.18-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 mcpgroup && \
    adduser -u 1001 -G mcpgroup -s /bin/sh -D mcpuser

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies, then remove package-manager tooling from the
# runtime image. The server executes with node directly and never needs npm/npx.
RUN npm ci --omit=dev && \
    npm cache clean --force && \
    rm -rf /usr/local/lib/node_modules/npm && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx

# Copy built files from builder stage
COPY --from=builder /app/build ./build

# Set ownership to non-root user
RUN chown -R mcpuser:mcpgroup /app

# Environment variables
ENV NODE_ENV=production
ENV MCP_TRANSPORT=stdio
ENV MCP_PORT=3000
ENV MCP_HOST=0.0.0.0
ENV RATE_LIMIT_SINGLE_PROCESS=true

# Expose HTTP port (used when MCP_TRANSPORT=http)
EXPOSE 3000

# Health check for HTTP mode
# Only effective when MCP_TRANSPORT=http
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD if [ "$MCP_TRANSPORT" = "http" ]; then \
        node -e "const port=process.env.PORT||process.env.MCP_PORT||3000; require('http').get('http://127.0.0.1:' + port + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"; \
    else \
        exit 0; \
    fi

# Switch to non-root user
USER mcpuser

# Default command
# - MCP_TRANSPORT=stdio -> node build/index.js
# - MCP_TRANSPORT=http  -> node build/server.js
CMD ["sh", "-c", "if [ \"$MCP_TRANSPORT\" = \"http\" ]; then exec node build/server.js; else exec node build/index.js; fi"]
