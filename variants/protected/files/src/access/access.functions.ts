import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  limitUnlockAttempts,
  noStore,
  requireAccess,
} from "@/access/access.middleware";
import * as access from "@/server/access.server";

/** Whether this browser has been let in, for the route guards. */
export const getAccess = createServerFn().handler(async () => ({
  unlocked: await access.hasAccess(),
}));

/**
 * When this browser was let in. Private, so it checks access itself: the
 * pattern for every server function that serves private data (AGENTS.md).
 */
export const getUnlockedAt = createServerFn()
  .middleware([noStore, requireAccess])
  .handler(async () => (await access.getAccessSession()).unlockedAt);

/** Checks the access code; the right one opens the session. */
export const unlock = createServerFn({ method: "POST" })
  .middleware([limitUnlockAttempts])
  .validator(z.object({ code: z.string().max(200) }))
  .handler(async ({ data, context }) => {
    if (await access.unlock(data.code)) return { ok: true as const };
    access.unlockAttempts.fail(context.clientKey);
    return { ok: false as const, error: "That code isn’t right." };
  });

/** Signs this browser out. */
export const lock = createServerFn({ method: "POST" }).handler(() =>
  access.lock(),
);
