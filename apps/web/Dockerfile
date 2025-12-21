# =============================================================================
# Cost Watchdog Web - Production Dockerfile
# =============================================================================
# Multi-stage build optimized for security and minimal image size
# - Pinned base image for reproducibility
# - Next.js standalone output for minimal footprint
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
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Build-time public API base URL (baked into client bundle)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build (Next.js standalone output includes only production deps)
RUN pnpm --filter @cost-watchdog/web build

# Production stage
FROM node:20-alpine@sha256:b5b9467fe7b33aad47f1ec3f6e0646b0f7a378b4c9eb556a30d81a2e5c8f2c3a AS runner

# Install tini for proper signal handling (PID 1 problem)
# wget needed for healthcheck
RUN apk add --no-cache tini wget

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy standalone build (already optimized by Next.js)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Set ownership to non-root user
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Use tini as init to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
