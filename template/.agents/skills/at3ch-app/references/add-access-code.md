# Adding the access code to a plain app

The `--protected` scaffold is the plain template plus a layer, `variants/protected` in the create-at3ch-app package. Adding the code later means applying that layer by hand: copy what the app lacks, merge what it has changed. Read [access-code.md](access-code.md) first.

## 1. Get the layer

```sh
dir=$(bash .agents/skills/at3ch-app/scripts/fetch-protected-variant.sh)
```

`$dir/variant.json` lists the packages to add and the template files the layer removes; `$dir/files/` is copied over the app; `$dir/append/` is added to the end of the app's files of the same name.

## 2. Packages

Add each entry of `variant.json` at its version: `dependencies` with `bun add`, `devDependencies` with `bun add -d`. Then `bunx shadcn@latest add input field`, which the gate uses.

## 3. Files the app does not have: copy

`src/server/access.server.ts` and its test, `src/access/`, `src/components/access-gate.tsx`, `src/routes/_protected.tsx`, `src/routes/access.tsx`, `tests/access.http.test.ts`, `tests/server-fn.ts`, and `env.example` as `.env.example`. Skip `src/components/ui/`: step 2 made those. Skip `src/routeTree.gen.ts`: it is regenerated in step 6.

## 4. Files the app has: merge, never overwrite

- **Pages**: move each page that needs the code under `src/routes/_protected/` and change its route id to match, e.g. `src/routes/index.tsx` becomes `src/routes/_protected/index.tsx` with `createFileRoute("/_protected/")`. The layer's `_protected/index.tsx` shows the Lock button and a protected read; take what fits, keep the app's page.
- **`src/server.ts`**: if the app has none, copy it. Otherwise add its `Register` declaration and the startup `accessConfig()` call.
- **`server.ts`** (project root): its `fetch` must pass `{ context: { clientIp: bun.requestIP(request)?.address } }` to Start. Older scaffolds call `app.default.fetch(request)` alone; take the template's version of that part.
- **`tests/env.ts`**: use the layer's (`CODE`, `SECRET`, `TEST_ENV`). If the app has no `tests/env.ts`, also make `startServer` in `tests/server.ts` default to `TEST_ENV` and give `get` an optional `cookie`, as the layer's tests expect.
- **`AGENTS.md`, `README.md`**: add `$dir/append/<file>` to the end.

## 5. Protect the data

Every existing server function that reads or changes private data gets `.middleware([noStore, requireAccess])`; every server route gets `requireAccessRoute`. Search for `createServerFn` and `server:` in `src/`. Add a test per endpoint that calls it locked and expects 401.

## 6. Settings and checks

Put `ACCESS_CODE` and a 32+ character `SESSION_SECRET` (`openssl rand -base64 32`) in `.env.local`, and in production's environment. Then `bun run generate-routes`, `bun run check`, `bun run test`.
