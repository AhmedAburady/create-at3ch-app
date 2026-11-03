---
name: at3ch-app
description: How this create-at3ch-app scaffold is built and how to work in it - layout, commands, conventions, the Bun production server, tests and Docker - and its optional access code (one shared code in front of the app). Use before changing the app's structure, adding pages, server functions or server routes, or adding, changing or explaining the access code, including adding it to an app scaffolded without it.
---

# at3ch-app

A TanStack Start app on Bun, scaffolded by `bun create at3ch-app@latest` (plain) or with `--protected` (behind an access code). Vite+ (Vite 8, Oxlint, Oxfmt, Vitest), Tailwind v4, shadcn on BaseUI, TanStack Query, the React Compiler.

## Layout

| Path | What |
|---|---|
| `src/routes/` | File-based routes; `__root.tsx` is the document shell. `src/routeTree.gen.ts` is generated: never edit it. |
| `src/components/ui/` | shadcn components. Add with `bunx shadcn@latest add <name>`; don't hand-edit. |
| `src/integrations/tanstack-query/` | The QueryClient, provided through the router context. |
| `src/lib/app.ts` | `appName`, read from `package.json`. |
| `src/server.ts` | Start's server entry, only when the app has one (the protected app does). |
| `server.ts` | The production server: Bun serves `dist/client`, hands the rest to Start, and passes the connection's address as request context `clientIp`. |
| `tests/` | `*.http.test.ts` run the production build over HTTP; `tests/env.ts` holds the settings they start it with. Unit tests sit next to the code as `src/**/*.test.ts`. |
| `Dockerfile`, `docker.just` | Multi-stage `oven/bun` image that ships no `node_modules`. |

## Commands

`bun run dev` (:3000) · `bun run check` (format, lint, typecheck) · `bun run fix` · `bun run test` · `bun run build` · `bun run start` · `bun run generate-routes` · `just` lists every recipe.

## Conventions

- Finish with `bun run check` and `bun run test` passing.
- Server-only code lives in `*.server.ts`; server functions in `*.functions.ts`, built with `createServerFn`.
- Read `process.env` inside functions, per request, never at module scope.
- Mutations are POST server functions; a GET never changes anything.
- With no `src/start.ts`, Start guards server functions against cross-site requests itself. Adding one means adding `createCsrfMiddleware()` to it.
- Styling comes from Tailwind and the shadcn theme in `src/styles.css`.

## The access code

Is it installed? Look for `src/server/access.server.ts`.

- Installed: read [references/access-code.md](references/access-code.md) before touching pages, server functions or server routes.
- Not installed and wanted: follow [references/add-access-code.md](references/add-access-code.md).
