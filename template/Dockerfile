# syntax=docker/dockerfile:1

# TanStack Start built by Vite, served by Bun (server.ts).
FROM oven/bun:1.4-slim AS base
WORKDIR /app

# Dependencies, cached while package.json and the lockfile are unchanged.
FROM base AS deps
COPY --link bun.lock package.json ./
RUN bun install --frozen-lockfile

# Build: vite build emits dist/client and dist/server/server.js. VITE_ values
# are public and inlined into the bundle, so they would arrive here as build
# arguments; secrets never do, they only arrive at runtime.
FROM deps AS build
COPY . .
ENV NODE_ENV=production CI=1
RUN rm -rf dist .tanstack node_modules/.vite && bun run build && bun run typecheck

# Production dependencies only: no vite, no biome, no typescript.
FROM base AS prod-deps
COPY --link bun.lock package.json ./
RUN bun install --frozen-lockfile --production

# Runtime: bun, the built app and its production dependencies.
FROM base AS runner
ENV NODE_ENV=production PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --link server.ts package.json ./
USER bun
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
