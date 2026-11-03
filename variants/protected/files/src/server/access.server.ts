import { createHash, timingSafeEqual } from "node:crypto";

import { getCookie, setCookie } from "@tanstack/react-start/server";
import {
  type CookieJar,
  getIronSession,
  type SessionOptions,
} from "iron-session";
import { z } from "zod";

import { appName } from "@/lib/app";

/**
 * The app's gate: one shared access code (ACCESS_CODE). The right code opens
 * an iron-session cookie session, sealed with SESSION_SECRET. Changing
 * SESSION_SECRET signs every browser out. Env is read on each call, never at
 * module scope; src/server.ts also checks it once at startup, so a server
 * missing a setting stops with an error naming it.
 */

/** What the session holds: when this browser was let in. */
export type AccessSession = { unlockedAt: number };

type Env = Record<string, string | undefined>;

const SESSION_TTL_S = 7 * 24 * 60 * 60;

/** The cookie's name; production adds the `__Host-` prefix. */
export const ACCESS_COOKIE = `${appName}-access`;

const accessEnvSchema = z.object({
  ACCESS_CODE: z
    .string({ error: "ACCESS_CODE is not set, so the app can't open." })
    .trim()
    .min(1, "ACCESS_CODE is not set, so the app can't open.")
    // unlock() refuses longer attempts, so a longer code could never open it.
    .max(200, "ACCESS_CODE must be at most 200 characters."),
  SESSION_SECRET: z
    .string({ error: "SESSION_SECRET must be at least 32 characters." })
    .min(32, "SESSION_SECRET must be at least 32 characters."),
  TRUST_PROXY_HOPS: z.coerce
    .number({ error: "TRUST_PROXY_HOPS must be a whole number from 0 to 10." })
    .int("TRUST_PROXY_HOPS must be a whole number from 0 to 10.")
    .min(0, "TRUST_PROXY_HOPS must be a whole number from 0 to 10.")
    .max(10, "TRUST_PROXY_HOPS must be a whole number from 0 to 10.")
    .default(0),
  NODE_ENV: z.string().optional(),
});

/** The gate's settings from the environment, or one error naming each bad one. */
export function accessConfig(env: Env = process.env) {
  const parsed = accessEnvSchema.safeParse({
    ...env,
    // An empty value means the default, as in .env.example.
    TRUST_PROXY_HOPS: env.TRUST_PROXY_HOPS || undefined,
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  const {
    ACCESS_CODE: code,
    SESSION_SECRET: secret,
    TRUST_PROXY_HOPS: proxyHops,
    NODE_ENV,
  } = parsed.data;

  const production = NODE_ENV === "production";
  const sessionOptions: SessionOptions = {
    // __Host- binds the cookie to this exact origin. Browsers only accept it
    // over HTTPS, so local development uses a plain name.
    cookieName: production ? `__Host-${ACCESS_COOKIE}` : ACCESS_COOKIE,
    password: secret,
    ttl: SESSION_TTL_S,
    cookieOptions: {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
    },
    onUnsealError: (reason) => {
      if (reason !== "expired")
        console.warn(`access: rejected a session cookie (${reason})`);
    },
  };
  return { code, proxyHops, sessionOptions };
}

/** Start's cookie helpers for the current request, as iron-session's jar. */
const requestCookies: CookieJar = {
  read: (name) => getCookie(name),
  write: (name, value, options) => setCookie(name, value, options),
};

export function getAccessSession(
  cookies: CookieJar = requestCookies,
  env: Env = process.env,
) {
  return getIronSession<AccessSession>(
    cookies,
    accessConfig(env).sessionOptions,
  );
}

/** Whether this browser has been let in. */
export async function hasAccess(
  cookies: CookieJar = requestCookies,
  env: Env = process.env,
) {
  const session = await getAccessSession(cookies, env);
  return typeof session.unlockedAt === "number";
}

/** Compares in constant time, whatever the lengths. */
export function codeMatches(attempt: string, code: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(attempt.trim()), digest(code));
}

/** Lets this browser in if the code is right. */
export async function unlock(
  attempt: string,
  cookies: CookieJar = requestCookies,
  env: Env = process.env,
) {
  if (!codeMatches(attempt, accessConfig(env).code)) return false;
  const session = await getAccessSession(cookies, env);
  session.unlockedAt = Date.now();
  await session.save();
  return true;
}

/** Signs this browser out. A copy of the cookie elsewhere stays valid. */
export async function lock(
  cookies: CookieJar = requestCookies,
  env: Env = process.env,
) {
  (await getAccessSession(cookies, env)).destroy();
}

/**
 * Who is asking, for the unlock rate limit. With nothing in front of the
 * server (`proxyHops` 0) that is the connection's address, which the client
 * cannot forge. Behind proxies it is the X-Forwarded-For entry `proxyHops`
 * from the end: each proxy appends the address it saw, so entries before
 * that one came from the client and can be forged. Without either, every
 * request counts as one client.
 */
export function clientKey(
  headers: Headers,
  connectionIp: string | undefined,
  proxyHops: number,
) {
  if (proxyHops === 0) return connectionIp || "unknown";
  const hops = headers.get("x-forwarded-for")?.split(",") ?? [];
  return (hops.length >= proxyHops && hops.at(-proxyHops)?.trim()) || "unknown";
}

export type Attempt =
  | { allowed: true }
  | { allowed: false; retryAfterS: number };

/**
 * At most `max` failures per key in each window of `windowMs`, which starts
 * at the key's first failure. `check` counts nothing; `fail` counts one.
 */
export function createAttemptLimiter({
  max,
  windowMs,
  now = Date.now,
}: {
  max: number;
  windowMs: number;
  now?: () => number;
}) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  const current = (key: string, at: number) => {
    const window = windows.get(key);
    return window && window.resetAt > at ? window : undefined;
  };
  return {
    check(key: string): Attempt {
      const at = now();
      const window = current(key, at);
      if (!window || window.count < max) return { allowed: true };
      return {
        allowed: false,
        retryAfterS: Math.ceil((window.resetAt - at) / 1000),
      };
    },
    fail(key: string) {
      const at = now();
      // Forget finished windows before the map can grow without bound.
      if (windows.size > 10_000)
        for (const [stale, window] of windows)
          if (window.resetAt <= at) windows.delete(stale);

      const window = current(key, at);
      if (window) window.count += 1;
      else windows.set(key, { count: 1, resetAt: at + windowMs });
    },
  };
}

/** 10 wrong codes per client in 15 minutes, in this server's memory. */
export const unlockAttempts = createAttemptLimiter({
  max: 10,
  windowMs: 15 * 60 * 1000,
});
