# Multi-stage build for optimized Next.js production
# Stage 1: Dependencies - Install all dependencies
FROM node:22-alpine AS deps

# Install libc6-compat for Next.js compatibility
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install dependencies (both production and dev for build)
RUN npm ci --prefer-offline --no-audit

# Stage 2: Builder - Build Next.js application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Set build-time environment variable
# This will be overridden at runtime via docker-compose
ENV NEXT_PUBLIC_API_URL=http://backend:8000

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application with turbopack
RUN npm run build

# Stage 3: Runner - Production runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Change ownership to non-root user
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Run Next.js in production mode
CMD ["node", "server.js"]
