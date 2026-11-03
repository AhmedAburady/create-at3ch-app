import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { createDefaultSerovalPlugins } from "@tanstack/router-core/ssr/client";
import { fromCrossJSON, toJSONAsync } from "seroval";

import { APP_DIR } from "./server";

/** Calling the built server's server functions the way the browser does. */

/** Server function ids by name, from the built server's function resolver. */
export async function serverFnIds() {
  const dir = join(APP_DIR, "dist/server");
  const ids: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true })) {
    if (!entry.endsWith(".js")) continue;
    const source = await readFile(join(dir, entry), "utf8");
    for (const [, id, name] of source.matchAll(
      /"([a-f0-9]{64})"\s*:\s*\{[^}]*?functionName\s*:\s*"(\w+?)_createServerFn_handler"/g,
    ))
      ids[name] = id;
  }
  return ids;
}

export type Call = {
  cookie?: string;
  /** The client, as the proxy in front forwards it in X-Forwarded-For. */
  ip?: string;
  /** Sec-Fetch-Site, which browsers send; null to leave it out. */
  site?: string | null;
  headers?: Record<string, string>;
};

/** Calls a server function as the app's browser code would. */
export async function callServerFn(
  url: string,
  id: string,
  {
    method = "POST",
    data,
    ...call
  }: Call & { method?: "GET" | "POST"; data?: unknown },
) {
  const headers: Record<string, string> = {
    "x-tsr-serverFn": "true",
    accept: "application/json",
    "x-forwarded-for": call.ip ?? "192.0.2.1",
    ...(call.cookie && { cookie: call.cookie }),
    ...(call.site !== null && { "sec-fetch-site": call.site ?? "same-origin" }),
    ...call.headers,
  };
  // Encoded as Start's client does: GET carries ?payload=, POST a JSON body.
  let path = `/_serverFn/${id}`;
  let body: BodyInit | undefined;
  const payload =
    data === undefined
      ? undefined
      : JSON.stringify(await toJSONAsync({ data }));
  if (method === "GET") {
    if (payload) path += `?${new URLSearchParams({ payload })}`;
  } else if (payload) {
    headers["content-type"] = "application/json";
    body = payload;
  }
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body,
    redirect: "manual",
  });
  const text = await response.text();
  return {
    response,
    text,
    /** What the function returned; throws if it threw. */
    value: () => {
      const reply = decode(text);
      if ("error" in reply) throw reply.error;
      return reply.result;
    },
    /** The message of what the function threw. */
    error: () => {
      const reply = decode(text);
      if (!("error" in reply)) throw new Error(`no error in: ${text}`);
      return reply.error instanceof Error
        ? reply.error.message
        : String(reply.error);
    },
  };
}

/**
 * A server function's reply, decoded as Start's client decodes it: with the
 * router's seroval plugins, since the app adds no serialization adapters.
 */
function decode(text: string) {
  return fromCrossJSON(JSON.parse(text), {
    refs: new Map(),
    plugins: createDefaultSerovalPlugins(),
  }) as { result: unknown } | { error: unknown };
}

/** The name=value part of a Set-Cookie header. */
export function cookieOf(response: Response) {
  return response.headers.get("set-cookie")?.split(";")[0];
}
