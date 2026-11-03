import type { CookieJar } from "iron-session";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  ACCESS_COOKIE,
  accessConfig,
  clientKey,
  codeMatches,
  createAttemptLimiter,
  hasAccess,
  lock,
  unlock,
} from "./access.server";

const CODE = "test-code-2031";
const SECRET = "test-secret-0123456789-abcdefghijkl";
const PRODUCTION = {
  ACCESS_CODE: CODE,
  SESSION_SECRET: SECRET,
  NODE_ENV: "production",
};
const DEVELOPMENT = { ...PRODUCTION, NODE_ENV: "development" };
const COOKIE = `__Host-${ACCESS_COOKIE}`;
const WEEK_S = 7 * 24 * 60 * 60;

type Write = { name: string; value: string; options: object };

/** A browser's cookies for one request, recording what the server writes. */
function browser(cookies: Record<string, string> = {}) {
  const values = new Map(Object.entries(cookies));
  const writes: Write[] = [];
  const jar: CookieJar = {
    read: (name) => values.get(name),
    write: (name, value, options) => {
      writes.push({ name, value, options });
      if (options.maxAge === 0) values.delete(name);
      else values.set(name, value);
    },
  };
  return { jar, values, writes };
}

/** Lets a fresh browser in and returns the sealed cookie value it was given. */
async function unlockedCookie(env = PRODUCTION) {
  const { jar, values } = browser();
  expect(await unlock(CODE, jar, env)).toBe(true);
  const value = values.get(
    env.NODE_ENV === "production" ? COOKIE : ACCESS_COOKIE,
  );
  if (!value) throw new Error("unlock wrote no cookie");
  return value;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("accessConfig", () => {
  it("names a missing ACCESS_CODE", () => {
    expect(() =>
      accessConfig({ ...PRODUCTION, ACCESS_CODE: undefined }),
    ).toThrow(/ACCESS_CODE is not set/);
    expect(() => accessConfig({ ...PRODUCTION, ACCESS_CODE: "   " })).toThrow(
      /ACCESS_CODE is not set/,
    );
  });

  it("names a missing or short SESSION_SECRET", () => {
    expect(() =>
      accessConfig({ ...PRODUCTION, SESSION_SECRET: undefined }),
    ).toThrow(/SESSION_SECRET must be at least 32 characters/);
    expect(() =>
      accessConfig({ ...PRODUCTION, SESSION_SECRET: "x".repeat(31) }),
    ).toThrow(/SESSION_SECRET/);
    expect(() =>
      accessConfig({ ...PRODUCTION, SESSION_SECRET: "x".repeat(32) }),
    ).not.toThrow();
  });

  it("refuses a code too long for unlock to accept", () => {
    expect(() =>
      accessConfig({ ...PRODUCTION, ACCESS_CODE: "x".repeat(201) }),
    ).toThrow("ACCESS_CODE must be at most 200 characters.");
    expect(() =>
      accessConfig({ ...PRODUCTION, ACCESS_CODE: "x".repeat(200) }),
    ).not.toThrow();
  });

  it("names every bad setting in one error", () => {
    expect(() => accessConfig({ NODE_ENV: "production" })).toThrow(
      "ACCESS_CODE is not set, so the app can't open. SESSION_SECRET must be at least 32 characters.",
    );
  });

  it("trims the code", () => {
    expect(
      accessConfig({ ...PRODUCTION, ACCESS_CODE: `  ${CODE} ` }).code,
    ).toBe(CODE);
  });

  it("reads TRUST_PROXY_HOPS, 0 when unset or empty", () => {
    expect(accessConfig(PRODUCTION).proxyHops).toBe(0);
    expect(
      accessConfig({ ...PRODUCTION, TRUST_PROXY_HOPS: "" }).proxyHops,
    ).toBe(0);
    expect(
      accessConfig({ ...PRODUCTION, TRUST_PROXY_HOPS: "2" }).proxyHops,
    ).toBe(2);
    for (const bad of ["-1", "1.5", "11", "two"])
      expect(() =>
        accessConfig({ ...PRODUCTION, TRUST_PROXY_HOPS: bad }),
      ).toThrow(/TRUST_PROXY_HOPS must be a whole number from 0 to 10/);
  });

  it("uses a __Host- cookie in production, HTTPS only", () => {
    const { sessionOptions } = accessConfig(PRODUCTION);
    expect(sessionOptions.cookieName).toBe(COOKIE);
    expect(sessionOptions.ttl).toBe(WEEK_S);
    expect(sessionOptions.cookieOptions).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("uses a plain cookie name without Secure in development", () => {
    const { sessionOptions } = accessConfig(DEVELOPMENT);
    expect(sessionOptions.cookieName).toBe(ACCESS_COOKIE);
    expect(sessionOptions.cookieOptions?.secure).toBe(false);
  });
});

describe("codeMatches", () => {
  it("accepts the code, ignoring surrounding spaces", () => {
    expect(codeMatches(CODE, CODE)).toBe(true);
    expect(codeMatches(` ${CODE}\n`, CODE)).toBe(true);
  });

  it("rejects anything else, including a prefix or another case", () => {
    expect(codeMatches("test-code", CODE)).toBe(false);
    expect(codeMatches(`${CODE}0`, CODE)).toBe(false);
    expect(codeMatches(CODE.toUpperCase(), CODE)).toBe(false);
    expect(codeMatches("", CODE)).toBe(false);
  });
});

describe("the access session", () => {
  it("is closed for a browser with no cookie", async () => {
    const { jar, writes } = browser();
    expect(await hasAccess(jar, PRODUCTION)).toBe(false);
    expect(writes).toEqual([]);
  });

  it("stays closed and writes nothing on a wrong code", async () => {
    const { jar, writes } = browser();
    expect(await unlock("wrong", jar, PRODUCTION)).toBe(false);
    expect(writes).toEqual([]);
    expect(await hasAccess(jar, PRODUCTION)).toBe(false);
  });

  it("opens on the right code with a sealed, HttpOnly, Secure cookie", async () => {
    const { jar, writes } = browser();
    expect(await unlock(CODE, jar, PRODUCTION)).toBe(true);

    expect(writes).toHaveLength(1);
    const [write] = writes;
    expect(write.name).toBe(COOKIE);
    expect(write.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: WEEK_S - 60,
    });
    // Sealed: the session's contents are not readable in the cookie.
    expect(write.value).not.toContain("unlockedAt");

    const later = browser({ [COOKIE]: write.value });
    expect(await hasAccess(later.jar, PRODUCTION)).toBe(true);
  });

  it("rejects a tampered cookie and reports it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const value = await unlockedCookie();
    const tampered = `${value.slice(0, -2)}${value.endsWith("A") ? "BB" : "AA"}`;
    expect(
      await hasAccess(browser({ [COOKIE]: tampered }).jar, PRODUCTION),
    ).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/rejected/));
  });

  it("rejects a cookie sealed with another SESSION_SECRET", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const value = await unlockedCookie({
      ...PRODUCTION,
      SESSION_SECRET: "another-secret-0123456789-abcdefghij",
    });
    expect(await hasAccess(browser({ [COOKIE]: value }).jar, PRODUCTION)).toBe(
      false,
    );
  });

  it("does not accept the development cookie in production", async () => {
    const value = await unlockedCookie(DEVELOPMENT);
    expect(
      await hasAccess(browser({ [ACCESS_COOKIE]: value }).jar, PRODUCTION),
    ).toBe(false);
  });

  it("holds for 7 days, then expires without a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers({ now: new Date("2026-10-28T08:00:00Z") });
    const value = await unlockedCookie();
    const { jar } = browser({ [COOKIE]: value });

    vi.setSystemTime(new Date("2026-11-04T07:50:00Z"));
    expect(await hasAccess(jar, PRODUCTION)).toBe(true);

    // Past the 7-day ttl and iron's 60-second clock skew allowance.
    vi.setSystemTime(new Date("2026-11-04T08:02:00Z"));
    expect(await hasAccess(jar, PRODUCTION)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("closes again when the browser locks", async () => {
    const { jar, values, writes } = browser({
      [COOKIE]: await unlockedCookie(),
    });
    await lock(jar, PRODUCTION);
    expect(writes).toEqual([
      expect.objectContaining({
        name: COOKIE,
        value: "",
        options: expect.objectContaining({ maxAge: 0 }),
      }),
    ]);
    expect(values.has(COOKIE)).toBe(false);
    expect(await hasAccess(jar, PRODUCTION)).toBe(false);
  });

  it("fails with the missing setting rather than staying silently closed", async () => {
    const { jar } = browser();
    await expect(
      hasAccess(jar, { ...PRODUCTION, SESSION_SECRET: "" }),
    ).rejects.toThrow(/SESSION_SECRET/);
    await expect(
      unlock(CODE, jar, { ...PRODUCTION, ACCESS_CODE: "" }),
    ).rejects.toThrow(/ACCESS_CODE/);
  });
});

describe("clientKey", () => {
  const forwarded = (value: string) =>
    new Headers({ "x-forwarded-for": value });

  it("with no proxy, takes the connection and ignores X-Forwarded-For", () => {
    expect(clientKey(forwarded("6.6.6.6"), "203.0.113.9", 0)).toBe(
      "203.0.113.9",
    );
    expect(clientKey(new Headers(), undefined, 0)).toBe("unknown");
  });

  it("behind one proxy, takes the entry it appended", () => {
    expect(clientKey(forwarded("6.6.6.6, 203.0.113.9"), "10.0.0.1", 1)).toBe(
      "203.0.113.9",
    );
  });

  it("behind a load balancer that appends client and itself, takes the client", () => {
    expect(
      clientKey(forwarded("6.6.6.6, 203.0.113.9 ,34.120.0.1"), "10.0.0.1", 2),
    ).toBe("203.0.113.9");
  });

  it("ignores X-Real-IP, which a client can set", () => {
    const headers = new Headers({
      "x-real-ip": "6.6.6.6",
      "x-forwarded-for": "203.0.113.9",
    });
    expect(clientKey(headers, "10.0.0.1", 1)).toBe("203.0.113.9");
  });

  it("counts a request missing the proxies' entries as one unknown client", () => {
    expect(clientKey(new Headers(), "10.0.0.1", 1)).toBe("unknown");
    expect(clientKey(forwarded("203.0.113.9"), "10.0.0.1", 2)).toBe("unknown");
  });
});

describe("createAttemptLimiter", () => {
  function limiter() {
    let now = 1_000_000;
    const limit = createAttemptLimiter({
      max: 3,
      windowMs: 60_000,
      now: () => now,
    });
    return { limit, advance: (ms: number) => (now += ms) };
  }

  it("allows max failures, then refuses until the window ends", () => {
    const { limit, advance } = limiter();
    for (let i = 0; i < 3; i++) {
      expect(limit.check("a")).toEqual({ allowed: true });
      limit.fail("a");
    }
    expect(limit.check("a")).toEqual({ allowed: false, retryAfterS: 60 });

    advance(45_000);
    expect(limit.check("a")).toEqual({ allowed: false, retryAfterS: 15 });

    advance(15_000);
    expect(limit.check("a")).toEqual({ allowed: true });
  });

  it("counts nothing on a check", () => {
    const { limit } = limiter();
    for (let i = 0; i < 10; i++) limit.check("a");
    expect(limit.check("a")).toEqual({ allowed: true });
  });

  it("counts each client separately", () => {
    const { limit } = limiter();
    for (let i = 0; i < 3; i++) limit.fail("a");
    expect(limit.check("a").allowed).toBe(false);
    expect(limit.check("b")).toEqual({ allowed: true });
  });
});
