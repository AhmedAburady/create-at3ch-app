# The access code

One shared code in front of the whole app. Not user accounts: everyone who has the code gets the same access.

## The rule

The data boundary is the security boundary ([TanStack Start: Protect Data First](https://tanstack.com/start/latest/docs/framework/react/guide/authentication-server-primitives#protect-data-first)). Server functions and server routes are API endpoints anyone can call directly, so each one that reads or changes private data checks access itself:

```ts
export const getNotes = createServerFn()
  .middleware([noStore, requireAccess]) // noStore first, so a 401 carries it too
  .handler(() => db.notes.findMany());
```

Server routes list `requireAccessRoute` in `server.middleware`. The guard in `src/routes/_protected.tsx` is route UX only: it shows the gate and spares a locked browser failed calls.

## Files

| File | Role |
|---|---|
| `src/server/access.server.ts` | Settings (zod), the iron-session cookie, `hasAccess`, `unlock`, `lock`, the client key and the attempt limiter. |
| `src/access/access.middleware.ts` | `requireAccess` (401 from server functions), `requireAccessRoute` (401 from server routes), `noStore`, `limitUnlockAttempts`. |
| `src/access/access.functions.ts` | `getAccess`, `unlock` (POST, rate-limited), `lock`, and `getUnlockedAt`, the example of a protected function. |
| `src/routes/_protected.tsx` | Pathless layout over every page that needs the code. Locked: `/` draws the gate in place (200, so link previews work), other pages redirect to `/access?redirect=…`. |
| `src/routes/access.tsx` | The gate page; `redirect` only accepts a path on this site. |
| `src/components/access-gate.tsx` | The form: shadcn `Field`, `Input`, `Button`. |
| `src/server.ts` | Checks the settings at startup and types the request context. |
| `tests/access.http.test.ts`, `src/server/access.server.test.ts` | The gate against the production build, and its parts. |

## Behaviour

- The right code seals `{ unlockedAt }` into an iron-session cookie with `SESSION_SECRET`, for 7 days: `__Host-<app>-access` in production (HttpOnly, Secure, SameSite=Lax, Path=/), `<app>-access` in development.
- Sessions are stateless. `lock` clears this browser's cookie; a copy stays valid until it expires. Rotate `SESSION_SECRET` to sign everyone out.
- Unlock allows 10 wrong codes per client per 15 minutes, in the server's memory (per instance, reset on restart). The client is the connection's address when `TRUST_PROXY_HOPS=0`, else the `X-Forwarded-For` entry that many from the end: 1 behind one proxy that appends the client, 2 behind Google Cloud's load balancer. A wrong value lets clients forge their key or puts everyone in one bucket.
- Pages under `_protected` and `/access` answer `Cache-Control: private, no-store`.

## Settings

`ACCESS_CODE` (required, at most 200 characters), `SESSION_SECRET` (required, 32+ characters), `TRUST_PROXY_HOPS` (default 0). `.env.local` holds development values; `.env.example` documents them. A server missing one stops at startup and names it.

## Changing it

- A new page that needs the code: put it under `src/routes/_protected/`. That alone protects nothing it loads.
- A new private server function or server route: add the middleware above, and a test in `tests/access.http.test.ts` that calls it locked and expects 401.
- A public page: put it outside `_protected`, and give it no private data.
