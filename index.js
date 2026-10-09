#!/usr/bin/env bun
// bun create at3ch-app@latest [my-app]
// Copies the template, names it, installs it and starts a git repository.
import { existsSync, readdirSync } from "node:fs";
import { cp, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const TEMPLATE = join(import.meta.dir, "template");

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

// "My App" -> "my-app"
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const target =
  process.argv[2] ??
  (process.stdin.isTTY ? prompt("App name:", "my-app") : null) ??
  fail("Give the app a name: bun create at3ch-app@latest my-app");

const dest = resolve(target);
const name = slug(basename(dest));
if (!name) fail("Give the app a name: bun create at3ch-app@latest my-app");
if (existsSync(dest) && readdirSync(dest).length > 0) {
  fail(`${dest} already exists and is not empty.`);
}

console.log(`\nCreating ${name} in ${dest}`);
await cp(TEMPLATE, dest, { recursive: true });
// npm drops .gitignore from packages, so the template ships it as gitignore;
// .dockerignore travels the same way to be safe.
await rename(join(dest, "gitignore"), join(dest, ".gitignore"));
await rename(join(dest, "dockerignore"), join(dest, ".dockerignore"));

for (const file of [
  "package.json",
  "README.md",
  "docker.just",
  "src/routes/__root.tsx",
  "src/routes/index.tsx",
]) {
  const path = join(dest, file);
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replaceAll("__APP_NAME__", name));
}

const run = (command) =>
  Bun.spawn(command, { cwd: dest, stdio: ["inherit", "inherit", "inherit"] })
    .exited;

console.log("\nInstalling dependencies");
if ((await run(["bun", "install"])) !== 0) fail("bun install failed.");

await run(["git", "init", "-q"]);

const cdPath = relative(process.cwd(), dest);
console.log(`
✓ Created ${name}

Next:
${cdPath ? `\n  cd ${cdPath}` : ""}
  bun run dev      http://localhost:3000
  just             every recipe
`);
