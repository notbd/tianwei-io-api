# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install pnpm & only production dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# Copy source and build it
COPY . .
RUN pnpm build

EXPOSE 3001

# Run the server (same as "pnpm start")
CMD ["node", "dist/index.js"]
