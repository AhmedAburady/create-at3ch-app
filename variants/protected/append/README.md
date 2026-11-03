## Access code

Every page sits behind one shared access code. The right code opens a sealed session cookie (iron-session) for 7 days.

| Setting | |
|---|---|
| `ACCESS_CODE` | The code. Required. |
| `SESSION_SECRET` | Seals the cookie: 32 characters or more, e.g. `openssl rand -base64 32`. Required. Changing it signs every browser out. |
| `TRUST_PROXY_HOPS` | `0` (default) when nothing sits in front of the server. Behind proxies, which entry of `X-Forwarded-For`, counted from the end, is the client: `1` behind one proxy that appends the client, `2` behind Google Cloud's load balancer. Sets the key for the 10-wrong-codes-in-15-minutes limit. |

`bun create` wrote a `.env.local` with a code and a secret for development. A server missing either setting stops at startup and names it.

Protect data where it is served, not only in the route guard: see `AGENTS.md`.
