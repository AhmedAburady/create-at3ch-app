
## Access: protect data where it is served

This app sits behind an access code. The data boundary is the security boundary ([TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/authentication-server-primitives#protect-data-first)): a route guard is UX, not authorization.

- Every server function that reads or changes private data lists `requireAccess`, with `noStore` first when it returns private data: `.middleware([noStore, requireAccess])`.
- Every server route lists `requireAccessRoute` in its `server.middleware`.
- `beforeLoad` in `src/routes/_protected.tsx` protects nothing. Pages that need the code go under `src/routes/_protected/`; that alone does not protect what they load.
- Every new endpoint gets a test in `tests/access.http.test.ts` that calls it locked and expects a 401.

How the gate works, and its settings: the skill's `references/access-code.md`.
