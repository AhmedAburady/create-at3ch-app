import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runs the production build the way the image does, `bun run server.ts`,
 * and calls it the way a browser does.
 */

export const APP_DIR = fileURLToPath(new URL("..", import.meta.url));

/** Builds dist/ for production. */
export async function build() {
  const child = spawn("bun", ["--bun", "vp", "build"], {
    cwd: APP_DIR,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = collect(child);
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`vp build failed:\n${output()}`);
}

function collect(child: ChildProcess) {
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));
  return () => output;
}

export type Server = {
  url: string;
  log: () => string;
  stop: () => Promise<void>;
};

/**
 * Starts the built server with only the given settings. It runs from an
 * empty directory so Bun loads no .env file, and inherits nothing but PATH.
 * It takes a port the system picks and says which, so no other process can
 * take it first.
 */
export async function startServer(
  env: Record<string, string> = {},
): Promise<Server> {
  const cwd = await mkdtemp(join(tmpdir(), "app-http-"));
  const child = spawn("bun", ["run", join(APP_DIR, "server.ts")], {
    cwd,
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "production",
      PORT: "0",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = collect(child);
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    await rm(cwd, { recursive: true, force: true });
  };

  for (let tries = 0; ; tries++) {
    if (child.exitCode !== null)
      throw new Error(`server exited early:\n${log()}`);
    const port = /Listening on http:\/\/localhost:(\d+)/.exec(log())?.[1];
    try {
      if (!port) throw new Error("not listening yet");
      const url = `http://127.0.0.1:${port}`;
      await fetch(url);
      return { url, log, stop };
    } catch {
      if (tries > 100) {
        await stop();
        throw new Error(`server did not start:\n${log()}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/** Fetches a page or asset without following redirects. */
export function get(url: string, path: string) {
  return fetch(`${url}${path}`, { redirect: "manual" });
}
