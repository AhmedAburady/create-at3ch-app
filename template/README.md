# __APP_NAME__

TanStack Start on Bun: Biome, Tailwind v4, shadcn (BaseUI), TanStack Query, React Compiler, light/dark/system theme.

```sh
bun run dev         # http://localhost:3000
just check          # biome + tsc
just fix            # biome --write + tsc
just docker load    # build the image locally
just docker push    # build for amd64 and push (IMAGE=registry/path)
```

Production is `bun run build`, then `bun run server.ts`: Bun serves `dist/client` and hands everything else to TanStack Start. The `Dockerfile` does the same on `oven/bun:1.4-slim`.
