#!/usr/bin/env bun
// bun create at3ch-app@latest [my-app] [--protected]
// Copies the template, names it, installs it and starts a git repository
// unless it is already inside one. --protected lays the protected variant
// over the template: one shared access code in front of the whole app.
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import {
  appendFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

const TEMPLATE = join(import.meta.dir, "template");
const VARIANTS = join(import.meta.dir, "variants");

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

const usage = `Give the app a name: bun create at3ch-app@latest my-app

  --protected   put one shared access code in front of the whole app`;

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith("-")));
if (flags.has("--help") || flags.has("-h")) {
  console.log(`\n${usage}\n`);
  process.exit(0);
}
// A flag is not a name, and would otherwise become a folder called --help.
for (const flag of flags)
  if (flag !== "--protected") fail(`Unknown option ${flag}.\n\n${usage}`);
const variant = flags.has("--protected") ? "protected" : null;

const target =
  argv.find((arg) => !arg.startsWith("-")) ??
  (process.stdin.isTTY ? prompt("App name:", "my-app") : null) ??
  fail(usage);
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

console.log(`\nCreating ${name}${variant ? ` (${variant})` : ""} in ${dest}`);
await cp(TEMPLATE, dest, { recursive: true }).catch((error) =>
  fail(`Could not write ${dest}: ${error.message}`),
);

// A variant is the template plus a layer: variants/<name>/files is copied
// over it, each file in variants/<name>/append is added to the end of the
// app's file of the same name, and variant.json says which template files go
// and which packages come.
if (variant) {
  const dir = join(VARIANTS, variant);
  const spec = JSON.parse(await readFile(join(dir, "variant.json"), "utf8"));
  await cp(join(dir, "files"), dest, { recursive: true });
  for (const file of spec.remove ?? []) await rm(join(dest, file));
  const appendDir = join(dir, "append");
  for (const file of await readdir(appendDir, { recursive: true })) {
    const from = join(appendDir, file);
    if (statSync(from).isFile())
      await appendFile(join(dest, file), `\n${await readFile(from, "utf8")}`);
  }

  // Kept in name order, as vp fmt keeps them.
  const manifestPath = join(dest, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const field of ["dependencies", "devDependencies"]) {
    const merged = { ...manifest[field], ...spec[field] };
    manifest[field] = Object.fromEntries(
      Object.keys(merged)
        .sort()
        .map((key) => [key, merged[key]]),
    );
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

// npm drops .gitignore from packages, so the template ships it as gitignore;
// .dockerignore and .env.example travel the same way to be safe.
for (const file of ["gitignore", "dockerignore", "env.example"]) {
  const path = join(dest, file);
  if (existsSync(path)) await rename(path, join(dest, `.${file}`));
}

// The app reads its name from package.json, so no source file carries it.
for (const file of ["package.json", "README.md", "AGENTS.md", "docker.just"]) {
  const path = join(dest, file);
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replaceAll("__APP_NAME__", name));
}

// Agents read AGENTS.md and .agents/skills, Claude Code reads CLAUDE.md and
// .claude/skills: links, so each has one copy. npm does not pack links, so
// they are made here, and copied where links cannot be made (Windows
// without the right to create them).
async function link(target, path) {
  try {
    await symlink(target, path);
  } catch {
    await cp(resolve(dirname(path), target), path, { recursive: true });
  }
}
await mkdir(join(dest, ".claude"), { recursive: true });
await link("../.agents/skills", join(dest, ".claude", "skills"));
await link("AGENTS.md", join(dest, "CLAUDE.md"));

// Async, so a missing command rejects rather than throws.
const run = async (command, output = "inherit") =>
  Bun.spawn(command, { cwd: dest, stdio: ["inherit", output, output] }).exited;

console.log("\nInstalling dependencies");
if ((await run(["bun", "install"])) !== 0) {
  fail(`bun install failed. Fix the cause, then run bun install in ${dest}.`);
}

// Settings to run the protected app locally, in .env.local, which git
// ignores and Bun loads. Production sets its own. Written after the install,
// which has no use for them.
let accessNote = "";
if (variant === "protected") {
  const code = randomBytes(6).toString("base64url");
  await writeFile(
    join(dest, ".env.local"),
    `# Local settings only; see .env.example. Git ignores this file.
ACCESS_CODE=${code}
SESSION_SECRET=${randomBytes(36).toString("base64url")}
`,
  );
  accessNote = `\nAccess code for local development: ${code} (in .env.local)\n`;
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
${gitNote}${accessNote}
Next:
${cdPath ? `\n  cd ${cdArg}` : ""}
  bun run dev      http://localhost:3000
  just             every recipe
`);
