import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { getAccess } from "@/access/access.functions";
import { AccessGate } from "@/components/access-gate";

/**
 * Where to go once in: a path on this site, never another one. Browsers read
 * a backslash as a slash, so `/\evil.example` would leave the site too.
 */
const searchSchema = z.object({
  redirect: z
    .string()
    .regex(/^\/(?!\/)(?!.*\\)/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/access")({
  validateSearch: searchSchema,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  // Already in: straight on to where the browser was going.
  beforeLoad: async ({ search }) => {
    if ((await getAccess()).unlocked)
      throw redirect({ href: search.redirect ?? "/" });
  },
  component: Access,
});

function Access() {
  const { redirect: target } = Route.useSearch();
  return <AccessGate target={target} />;
}
