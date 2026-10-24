import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

// Generated, vendored or not ours to touch: left out of lint and format.
const ignorePatterns = [
  ".agents/**",
  ".claude/**",
  "dist/**",
  ".tanstack/**",
  "src/routeTree.gen.ts",
  "src/components/ui/**",
  "**/*.md",
];

const config = defineConfig(({ command }) => ({
  // The built server carries its dependencies, so production needs no
  // node_modules. Dev keeps Vite's default externals.
  ssr: command === "build" ? { noExternal: true } : undefined,
  // Bundling them puts Start's runtime in shared chunks that import each
  // other; source execution order keeps a module from running before its
  // imports have.
  environments: {
    ssr: {
      build: { rolldownOptions: { output: { strictExecutionOrder: true } } },
    },
  },
  // TanStack Devtools already pipes the browser's console to the terminal
  // and the server's back to the browser. Vite's own forwarding, on by
  // default when a coding agent starts the server, would feed those two
  // into each other: one browser error echoes between them without end.
  server: { forwardConsole: false },
  resolve: { tsconfigPaths: true },
  // The React Compiler runs natively through oxc-transform-react, not Babel.
  plugins: lazyPlugins(() => [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact({ compiler: true }),
  ]),
  // `vp check` formats, lints and, with typeCheck, typechecks in one pass.
  lint: {
    plugins: ["eslint", "typescript", "unicorn", "oxc", "react", "jsx-a11y"],
    categories: {
      correctness: "error",
    },
    env: {
      builtin: true,
      browser: true,
    },
    ignorePatterns,
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    printWidth: 80,
    ignorePatterns,
    sortImports: true,
    sortTailwindcss: {
      stylesheet: "./src/styles.css",
      functions: ["cn", "cva"],
    },
  },
  test: {
    projects: [
      {
        // Server modules in Node; the app's plugins are not needed, only
        // its `@/` paths.
        extends: false,
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // The production build, started per test file and called over HTTP.
        extends: false,
        test: {
          name: "http",
          include: ["tests/**/*.http.test.ts"],
          environment: "node",
          testTimeout: 20_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
}));

export default config;
