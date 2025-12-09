# =============================================================================
# Cost Watchdog API - Production Dockerfile
# =============================================================================
# Multi-stage build optimized for security and minimal image size
# - Pinned base image for reproducibility
# - Production dependencies only
# - Non-root user
# - Health checks enabled
# =============================================================================

# Build stage
# Pin to specific digest for reproducible builds (node:20-alpine as of 2024-12)
FROM node:20-alpine@sha256:b5b9467fe7b33aad47f1ec3f6e0646b0f7a378b4c9eb556a30d81a2e5c8f2c3a AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
COPY packages/connector-sdk/package.json ./packages/connector-sdk/
COPY packages/connectors/package.json ./packages/connectors/

# Install ALL dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma client
WORKDIR /app/apps/api
RUN pnpm exec prisma generate

# Build all packages
WORKDIR /app
RUN pnpm --filter @cost-watchdog/api build

# Prune dev dependencies after build
RUN pnpm prune --prod

# Production stage
FROM node:20-alpine@sha256:b5b9467fe7b33aad47f1ec3f6e0646b0f7a378b4c9eb556a30d81a2e5c8f2c3a AS runner

# Install tini for proper signal handling (PID 1 problem)
# wget needed for healthcheck
RUN apk add --no-cache tini wget

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Copy only production artifacts (no dev dependencies)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/connector-sdk/dist ./packages/connector-sdk/dist
COPY --from=builder /app/packages/connector-sdk/package.json ./packages/connector-sdk/
COPY --from=builder /app/packages/connectors/dist ./packages/connectors/dist
COPY --from=builder /app/packages/connectors/package.json ./packages/connectors/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# Set ownership to non-root user
RUN chown -R appuser:nodejs /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Switch to non-root user
USER appuser

EXPOSE 3001

WORKDIR /app/apps/api

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Use tini as init to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
