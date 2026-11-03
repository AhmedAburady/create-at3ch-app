# create-at3ch-app

```sh
bun create at3ch-app@latest my-app               # the app
bun create at3ch-app@latest my-app --protected   # the app behind an access code
```

Run it without a name and it asks for one. `--help` lists the options. You get a TanStack Start app on Bun with:

- Vite+ (Vite 8, Oxlint, Oxfmt, Vitest): `vp check` formats, lints and typechecks in one pass
- TypeScript 7, the `@/` alias for `src/`
- Tailwind v4 and shadcn on BaseUI (`base-luma`)
- TanStack Query and the React Compiler (native, through Oxc)
- Light, dark and system theme with no flash on load
- A small Bun production server (`server.ts`), HTTP tests against the production build, and a multi-stage `oven/bun:1.4.4-slim` Dockerfile that ships no `node_modules`
- `just` recipes: `dev`, `check`, `fix`, `test`, `build`, `start`, `update`, `docker load`, `docker push`
- For coding agents: `AGENTS.md` (with `CLAUDE.md` linked to it) and the `at3ch-app` skill in `.agents/skills` (linked from `.claude/skills`), which explains the scaffold and how to add the access code later

## Protected

```sh
bun create at3ch-app@latest my-app --protected
```

The same app behind one shared access code: a sealed iron-session cookie, a 401 from every private server function and server route, a rate-limited unlock, and an `AGENTS.md` that keeps new endpoints behind the code. The gate is plain shadcn (`Field`, `Input`, `Button`). It writes a `.env.local` with a code for development; production sets `ACCESS_CODE` and `SESSION_SECRET`.

The variant is `variants/protected/`: `files/` is copied over the template, each file in `append/` is added to the end of the app's file of the same name (`README.md`, `AGENTS.md`), and `variant.json` lists the template files it removes and the packages it adds. An app made without `--protected` can take it later: the skill's `references/add-access-code.md` walks an agent through it.

## Maintaining

- `just test-variants`: generate every variant into a temporary folder and run `check`, `test` and `build` on each. Run it before every release.
- `just release patch|minor|major`: bump, publish and push.
