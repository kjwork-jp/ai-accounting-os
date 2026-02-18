FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.5 --activate
WORKDIR /app

# Copy worker package files
COPY worker/package.json worker/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# Copy worker source and shared types
COPY worker/tsconfig.json ./
COPY worker/src/ ./src/

# Healthcheck: worker process is alive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "tsx" > /dev/null || exit 1

CMD ["pnpm", "start"]
