# create-at3ch-app

```sh
bun create at3ch-app@latest my-app
```

Run it without a name and it asks for one. You get a TanStack Start app on Bun with:

- Biome, TypeScript 7, the `@/` alias for `src/`
- Tailwind v4 and shadcn on BaseUI (`base-luma`)
- TanStack Query and the React Compiler
- Light, dark and system theme with no flash on load
- A small Bun production server (`server.ts`) and a multi-stage `oven/bun:1.4-slim` Dockerfile
- `just` recipes: `dev`, `check`, `fix`, `build`, `start`, `update`, `docker load`, `docker push`

Release: `just release patch|minor|major`.
