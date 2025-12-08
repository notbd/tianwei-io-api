# syntax=docker/dockerfile:1

# ---- Build stage (with dev dependencies) ----
FROM node:22-alpine AS builder
WORKDIR /app
ENV NODE_ENV=development

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency files first (for caching)
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Now copy source and build
COPY . .
RUN pnpm build

# ---- Runtime stage (only production deps + dist) ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy only package manifests again and install prod deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# Copy build artifacts from builder
COPY --from=builder /app/dist ./dist

# Expose and start server
EXPOSE 3001
CMD ["node", "dist/index.js"]
