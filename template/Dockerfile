# syntax=docker/dockerfile:1

# TanStack Start built by Vite+, served by Bun (server.ts).
FROM oven/bun:1.4-slim AS build
WORKDIR /app

# Dependencies, cached while package.json and the lockfile are unchanged.
COPY --link bun.lock package.json ./
RUN bun install --frozen-lockfile

# Build: vp build emits dist/client and dist/server/server.js. VITE_ values
# are public and inlined into the bundle, so they would arrive here as build
# arguments; secrets never do, they only arrive at runtime.
COPY . .
ENV NODE_ENV=production CI=1
RUN rm -rf dist .tanstack node_modules/.vite && bun run build

# Runtime: bun and the built app. The server bundle carries its dependencies
# (ssr.noExternal), so no node_modules.
FROM oven/bun:1.4-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY --link server.ts package.json ./
USER bun
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
