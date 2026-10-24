import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { APP_DIR, build, get, type Server, startServer } from "./server";

/**
 * The production build behind server.ts, request by request: the page
 * rendered on the server, the 404 page, and what may be cached for how long.
 */

let server: Server;
let name: string;

beforeAll(async () => {
  const manifest = await readFile(join(APP_DIR, "package.json"), "utf8");
  name = (JSON.parse(manifest) as { name: string }).name;
  await build();
  server = await startServer();
});

afterAll(() => server?.stop());

describe("pages", () => {
  it("renders the home page on the server", async () => {
    const response = await get(server.url, "/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const page = await response.text();
    expect(page).toContain(`<title>${name}</title>`);
    expect(page).toContain(`>${name}</h1>`);
  });

  it("answers an unknown path with the 404 page", async () => {
    const response = await get(server.url, "/no-such-page");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Page not found");
  });
});

describe("assets", () => {
  it("lets browsers keep fingerprinted assets forever", async () => {
    const page = await (await get(server.url, "/")).text();
    const asset = /\/assets\/[\w.-]+\.(?:js|css)/.exec(page)?.[0];
    if (!asset) throw new Error("the home page links no /assets/ file");
    const response = await get(server.url, asset);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("never serves a file from outside dist/client", async () => {
    const response = await get(server.url, "/%2e%2e%2f%2e%2e%2fserver.ts");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Bun.serve");
  });
});
