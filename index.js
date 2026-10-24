#!/usr/bin/env bun
// bun create at3ch-app@latest [my-app]
// Copies the template, names it, installs it and starts a git repository
// unless it is already inside one.
import { existsSync, readdirSync, statSync } from "node:fs";
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

const usage = "Give the app a name: bun create at3ch-app@latest my-app";
const target =
  process.argv[2] ??
  (process.stdin.isTTY ? prompt("App name:", "my-app") : null) ??
  fail(usage);
// A flag is not a name, and would otherwise become a folder called --help.
if (target.startsWith("-")) fail(usage);

const dest = resolve(target);
const name = slug(basename(dest));
if (!name) fail(`"${basename(dest)}" has no a-z or 0-9 to name the app by.`);
// npm's limit; the slug already keeps to its other rules.
if (name.length > 214) fail(`${name.length} characters is over npm's 214.`);
// Characters the app cannot build from; drop each once fixed upstream.
// # ? *: Vite (its checkBadCharactersInPath, vite-plus-core 1.4.0).
// ': TanStack Router's code splitter (router-plugin 1.168.48) puts the path
// in import('...') unescaped.
// \: bun install. Not checked on Windows, where every path has one.
const badChar = dest.match(
  process.platform === "win32" ? /['#?*]/ : /['\\#?*]/,
)?.[0];
if (badChar) {
  fail(
    `${dest} has a ${badChar} in it, which the app cannot build from. Pick a path without it.`,
  );
}
if (existsSync(dest)) {
  if (!statSync(dest).isDirectory()) fail(`${dest} is a file.`);
  if (readdirSync(dest).length > 0) fail(`${dest} is not empty.`);
}

console.log(`\nCreating ${name} in ${dest}`);
await cp(TEMPLATE, dest, { recursive: true }).catch((error) =>
  fail(`Could not write ${dest}: ${error.message}`),
);
// npm drops .gitignore from packages, so the template ships it as gitignore;
// .dockerignore travels the same way to be safe.
await rename(join(dest, "gitignore"), join(dest, ".gitignore"));
await rename(join(dest, "dockerignore"), join(dest, ".dockerignore"));

// The app reads its name from package.json, so no source file carries it.
for (const file of ["package.json", "README.md", "docker.just"]) {
  const path = join(dest, file);
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replaceAll("__APP_NAME__", name));
}

// Async, so a missing command rejects rather than throws.
const run = async (command, output = "inherit") =>
  Bun.spawn(command, { cwd: dest, stdio: ["inherit", output, output] }).exited;

console.log("\nInstalling dependencies");
if ((await run(["bun", "install"])) !== 0) {
  fail(`bun install failed. Fix the cause, then run bun install in ${dest}.`);
}

// The app is whole without git, so git only ever earns a note. Inside
// another repository, a nested one would hide the app's files from it.
const git = (args, output) => run(["git", ...args], output).catch(() => null);
let gitNote = "";
if ((await git(["rev-parse", "--is-inside-work-tree"], "ignore")) === 0) {
  gitNote = "\nIt is inside a git repository, so it has none of its own.\n";
} else if ((await git(["init", "-q"])) !== 0) {
  gitNote = "\n! git init did not run; the app works without it.\n";
}

// Quoted for the shell when the path needs it, e.g. "My Cool App", and
// led by ./ so bash does not read -dash as a flag.
const cdPath = relative(process.cwd(), dest);
const cdSafe = cdPath.startsWith("-") ? `./${cdPath}` : cdPath;
const cdArg = /^[\w./-]+$/.test(cdSafe)
  ? cdSafe
  : `'${cdSafe.replaceAll("'", "'\\''")}'`;
console.log(`
✓ Created ${name}
${gitNote}
Next:
${cdPath ? `\n  cd ${cdArg}` : ""}
  bun run dev      http://localhost:3000
  just             every recipe
`);
