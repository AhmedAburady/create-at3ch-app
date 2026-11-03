import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { sealData } from "iron-session";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { CODE, SECRET } from "./env";
import { APP_DIR, build, get, type Server, startServer } from "./server";
import { type Call, callServerFn, cookieOf, serverFnIds } from "./server-fn";

/**
 * The gate against the production build, request by request: endpoints
 * called directly while locked, cross-site writes, the session cookie's
 * flags, locking, the unlock rate limit and cache headers.
 */

/** The gate's code field, on any page that draws the gate. */
const GATE = 'name="code"';

let server: Server;
let ids: Record<string, string>;
let cookieName: string;
let lastIp = 0;

/** A client of its own, so the unlock rate limit never spans tests. */
function client() {
  lastIp += 1;
  return `198.51.100.${lastIp}`;
}

function call(
  name: string,
  options: Call & { data?: unknown; method?: "GET" | "POST" } = {},
) {
  const id = ids[name];
  if (!id) throw new Error(`no server function named ${name} in the build`);
  return callServerFn(server.url, id, options);
}

/** Unlocks as a fresh client and returns the session cookie it was given. */
async function unlocked() {
  const { response } = await call("unlock", {
    ip: client(),
    data: { code: CODE },
  });
  const cookie = cookieOf(response);
  if (!cookie?.startsWith(`${cookieName}=`))
    throw new Error("unlock set no cookie");
  return cookie;
}

beforeAll(async () => {
  const manifest = await readFile(join(APP_DIR, "package.json"), "utf8");
  cookieName = `__Host-${(JSON.parse(manifest) as { name: string }).name}-access`;
  await build();
  ids = await serverFnIds();
  server = await startServer();
});

afterAll(() => server?.stop());

describe("locked", () => {
  it("answers the home page with the gate in place, never cached", async () => {
    // Link previews (WhatsApp, Slack, Teams) show nothing for a redirect.
    const response = await get(server.url, "/");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toContain(GATE);
  });

  it("serves the access page, never cached", async () => {
    const response = await get(server.url, "/access");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toContain(GATE);
  });

  it("refuses a private server function with a 401, not cached", async () => {
    const { response, text } = await call("getUnlockedAt", { method: "GET" });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(text).toContain("Locked");
  });

  it("reports the browser as locked", async () => {
    const { value } = await call("getAccess", { method: "GET" });
    expect(value()).toEqual({ unlocked: false });
  });
});

describe("unlocking", () => {
  it("rejects a wrong code without a cookie", async () => {
    const { response, value } = await call("unlock", {
      ip: client(),
      data: { code: "wrong" },
    });
    expect(response.status).toBe(200);
    expect(value()).toEqual({ ok: false, error: "That code isn’t right." });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an over-long code before checking it", async () => {
    const { response, error } = await call("unlock", {
      ip: client(),
      data: { code: "x".repeat(201) },
    });
    expect(error()).toContain("too_big");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sets a __Host- session cookie: HttpOnly, Secure, Lax, 7 days", async () => {
    const { response, value } = await call("unlock", {
      ip: client(),
      data: { code: ` ${CODE} ` },
    });
    expect(value()).toEqual({ ok: true });
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toMatch(new RegExp(`^${cookieName}=Fe26\\.2\\*`));
    expect(header).toMatch(/; HttpOnly/i);
    expect(header).toMatch(/; Secure/i);
    expect(header).toMatch(/; SameSite=Lax/i);
    expect(header).toMatch(/; Path=\//i);
    expect(header).toMatch(/; Max-Age=604740/i);
    expect(header).not.toMatch(/; Domain=/i);
  });
});

describe("unlocked", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await unlocked();
  });

  it("serves the home page, never cached", async () => {
    const response = await get(server.url, "/", cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain(GATE);
  });

  it("answers the private server function", async () => {
    const { response, value } = await call("getUnlockedAt", {
      method: "GET",
      cookie,
    });
    expect(response.status).toBe(200);
    expect(value()).toEqual(expect.any(Number));
  });

  it("sends the access page on to where the browser was going", async () => {
    const response = await get(server.url, "/access?redirect=%2F", cookie);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/");
  });

  // Browsers read a backslash as a slash, so /\evil.example is //evil.example.
  it.each(["//evil.example", "/\\evil.example", "https://evil.example"])(
    "never redirects off the site, given %s",
    async (target) => {
      // Follow every hop: the router first drops the invalid redirect value.
      const hops: string[] = [];
      let path = `/access?redirect=${encodeURIComponent(target)}`;
      for (;;) {
        const response = await get(server.url, path, cookie);
        const location = response.headers.get("location");
        if (!location) break;
        hops.push(location);
        expect(hops.length).toBeLessThan(5);
        path = location;
      }
      expect(hops.at(-1)).toBe("/");
      for (const hop of hops) expect(hop).toMatch(/^\/(?![/\\])/);
    },
  );
});

describe("a cookie the server did not seal", () => {
  it("is refused when tampered with", async () => {
    const cookie = await unlocked();
    const tampered = `${cookie.slice(0, -2)}${cookie.endsWith("A") ? "BB" : "AA"}`;
    const { response } = await call("getUnlockedAt", {
      method: "GET",
      cookie: tampered,
    });
    expect(response.status).toBe(401);
  });

  it("is refused when sealed with another secret", async () => {
    const forged = await sealData(
      { unlockedAt: Date.now() },
      { password: "attacker-secret-0123456789-abcdefgh", ttl: 3600 },
    );
    const { response } = await call("getUnlockedAt", {
      method: "GET",
      cookie: `${cookieName}=${forged}`,
    });
    expect(response.status).toBe(401);
  });
});

describe("cross-site requests", () => {
  it("cannot unlock from another site", async () => {
    const { response } = await call("unlock", {
      ip: client(),
      site: "cross-site",
      data: { code: CODE },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("cannot unlock without any origin information", async () => {
    const { response } = await call("unlock", {
      ip: client(),
      site: null,
      data: { code: CODE },
    });
    expect(response.status).toBe(403);
  });

  it("can unlock from the app's own origin", async () => {
    const { response } = await call("unlock", {
      ip: client(),
      site: null,
      headers: { origin: server.url },
      data: { code: CODE },
    });
    expect(response.status).toBe(200);
    expect(cookieOf(response)).toMatch(new RegExp(`^${cookieName}=`));
  });

  it("cannot lock with a valid session from another site", async () => {
    const { response } = await call("lock", {
      cookie: await unlocked(),
      site: "cross-site",
    });
    expect(response.status).toBe(403);
  });
});

describe("locking", () => {
  it("clears the cookie, and the browser is locked out again", async () => {
    const cookie = await unlocked();
    const { response } = await call("lock", { cookie });
    expect(response.status).toBe(200);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toMatch(new RegExp(`^${cookieName}=;`));
    expect(header).toMatch(/; Max-Age=0/i);
    // The browser now sends no cookie.
    expect(await (await get(server.url, "/")).text()).toContain(GATE);
  });

  it("does not revoke a copy of the cookie: sessions are stateless", async () => {
    const cookie = await unlocked();
    await call("lock", { cookie });
    // Rotate SESSION_SECRET to revoke copies.
    const { response } = await call("getUnlockedAt", {
      method: "GET",
      cookie,
    });
    expect(response.status).toBe(200);
  });
});

describe("rate limiting unlock", () => {
  it("allows 10 wrong codes per client in 15 minutes, then answers 429", async () => {
    const ip = client();
    for (let i = 0; i < 10; i++) {
      const { response } = await call("unlock", {
        ip,
        data: { code: `no-${i}` },
      });
      expect(response.status).toBe(200);
    }
    const { response, text } = await call("unlock", {
      ip,
      data: { code: "no" },
    });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(890);
    expect(text).toContain("Too many tries. Try again in 15 minutes.");

    // The right code waits too, and another client is unaffected.
    const right = await call("unlock", { ip, data: { code: CODE } });
    expect(right.response.status).toBe(429);
    expect(right.response.headers.get("set-cookie")).toBeNull();
    const other = await call("unlock", { ip: client(), data: { code: CODE } });
    expect(other.response.status).toBe(200);
  });

  it("keys on the proxy's entry, so forged earlier entries do not reset it", async () => {
    const ip = client();
    const forged = (n: number) => ({ "x-forwarded-for": `10.0.0.${n}, ${ip}` });
    for (let i = 0; i < 10; i++)
      await call("unlock", { headers: forged(i), data: { code: `no-${i}` } });
    const { response } = await call("unlock", {
      headers: forged(99),
      data: { code: CODE },
    });
    expect(response.status).toBe(429);
  });

  it("counts only wrong codes, so unlocking never uses up tries", async () => {
    const ip = client();
    for (let i = 0; i < 12; i++) {
      const { response } = await call("unlock", { ip, data: { code: CODE } });
      expect(response.status).toBe(200);
    }
    const wrong = await call("unlock", { ip, data: { code: "no" } });
    expect(wrong.response.status).toBe(200);
  });
});

describe("with nothing in front of the server (TRUST_PROXY_HOPS=0)", () => {
  let direct: Server;
  beforeAll(async () => {
    direct = await startServer({ ACCESS_CODE: CODE, SESSION_SECRET: SECRET });
  });
  afterAll(() => direct?.stop());

  it("keys on the connection, so X-Forwarded-For cannot reset the limit", async () => {
    const id = ids.unlock;
    if (!id) throw new Error("no unlock in the build");
    const attempt = (n: number, code: string) =>
      callServerFn(direct.url, id, {
        headers: { "x-forwarded-for": `10.2.2.${n}` },
        data: { code },
      });
    for (let i = 0; i < 10; i++)
      expect((await attempt(i, `no-${i}`)).response.status).toBe(200);
    expect((await attempt(99, CODE)).response.status).toBe(429);
  });
});

describe("missing settings", () => {
  it("stop the server at startup, naming SESSION_SECRET", async () => {
    await expect(startServer({ ACCESS_CODE: CODE })).rejects.toThrow(
      /SESSION_SECRET must be at least 32 characters/,
    );
  });

  it("stop the server at startup, naming both when both are missing", async () => {
    await expect(startServer({})).rejects.toThrow(
      /ACCESS_CODE is not set, so the app can't open\. SESSION_SECRET must be at least 32 characters\./,
    );
  });

  it("stop the server at startup on a bad TRUST_PROXY_HOPS", async () => {
    await expect(
      startServer({
        ACCESS_CODE: CODE,
        SESSION_SECRET: SECRET,
        TRUST_PROXY_HOPS: "-1",
      }),
    ).rejects.toThrow(/TRUST_PROXY_HOPS must be a whole number from 0 to 10/);
  });
});
