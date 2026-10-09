/**
 * The production server. `vite preview` is a dev convenience and not
 * something to put in front of anyone.
 *
 * `vite build` emits two halves: `dist/client`, the static assets, and
 * `dist/server/server.js`, the SSR handler. Bun serves the first and hands
 * everything else to the second.
 */
import { join, relative, resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIR = resolve(import.meta.dir, "dist/client");
const SERVER_ENTRY = "./dist/server/server.js";

const app = (await import(SERVER_ENTRY)) as {
	default: { fetch: (request: Request) => Response | Promise<Response> };
};

/**
 * The asset for a request path, or null if it is not one.
 *
 * The path comes off the wire, so it is resolved and measured against the
 * client directory rather than trusted: `%2e%2e%2f` survives URL parsing,
 * which normalises only the `..` it can see.
 */
function assetFor(
	pathname: string,
): { file: Bun.BunFile; path: string } | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	if (decoded.includes("\0")) return null;

	const full = resolve(join(CLIENT_DIR, decoded));
	const rel = relative(CLIENT_DIR, full);
	if (rel === "" || rel.startsWith("..") || rel.includes("\0")) return null;

	return { file: Bun.file(full), path: decoded };
}

Bun.serve({
	port: PORT,
	idleTimeout: 60,
	async fetch(request) {
		const { pathname } = new URL(request.url);

		if (request.method === "GET" || request.method === "HEAD") {
			const asset = assetFor(pathname);
			if (asset && (await asset.file.exists())) {
				// Vite fingerprints what it emits into assets/, so those may be
				// held forever. Everything else in public/ keeps its own name
				// across deploys and must be allowed to change.
				const immutable = asset.path.startsWith("/assets/");
				return new Response(asset.file, {
					headers: {
						"cache-control": immutable
							? "public, max-age=31536000, immutable"
							: "public, max-age=3600",
					},
				});
			}
		}

		return app.default.fetch(request);
	},
	error(error) {
		console.error("server:", error);
		return new Response("Internal Server Error", { status: 500 });
	},
});

console.log(`Listening on http://localhost:${PORT}`);
