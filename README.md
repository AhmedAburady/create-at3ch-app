# create-at3ch-app

```sh
bun create at3ch-app@latest my-app
```

Run it without a name and it asks for one. You get a TanStack Start app on Bun with:

- Vite+ (Vite 8, Oxlint, Oxfmt, Vitest): `vp check` formats, lints and typechecks in one pass
- TypeScript 7, the `@/` alias for `src/`
- Tailwind v4 and shadcn on BaseUI (`base-luma`)
- TanStack Query and the React Compiler (native, through Oxc)
- Light, dark and system theme with no flash on load
- A small Bun production server (`server.ts`), HTTP tests against the production build, and a multi-stage `oven/bun:1.4-slim` Dockerfile that ships no `node_modules`
- `just` recipes: `dev`, `check`, `fix`, `test`, `build`, `start`, `update`, `docker load`, `docker push`

Release: `just release patch|minor|major`.
