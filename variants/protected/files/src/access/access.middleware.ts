import { createMiddleware } from "@tanstack/react-start";
import {
  getRequest,
  setResponseHeader,
  setResponseStatus,
} from "@tanstack/react-start/server";

import {
  accessConfig,
  clientKey,
  hasAccess,
  unlockAttempts,
} from "@/server/access.server";

/**
 * The data boundary. Every server function that reads or changes private
 * data lists `requireAccess`, every server route `requireAccessRoute`: the
 * route guard in src/routes/_protected.tsx only spares a locked browser a
 * page of failed calls. See AGENTS.md.
 */

/** For server functions: a 401 when this browser is locked. */
export const requireAccess = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    if (!(await hasAccess())) {
      setResponseStatus(401);
      throw new Error("Locked: enter the access code.");
    }
    return next();
  },
);

/** For server routes: a 401 when this browser is locked. */
export const requireAccessRoute = createMiddleware().server(
  async ({ next }) => {
    if (!(await hasAccess()))
      return new Response("Locked: enter the access code.", { status: 401 });
    return next();
  },
);

/**
 * For server functions that answer private data: never kept by the browser
 * or a proxy. First in the list, so a rejection carries it too.
 */
export const noStore = createMiddleware({ type: "function" }).server(
  ({ next }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return next();
  },
);

/**
 * For unlock: a 429 once this client has had 10 wrong codes in 15 minutes.
 * Passes on the client's key, so the handler can count a wrong code.
 */
export const limitUnlockAttempts = createMiddleware({
  type: "function",
}).server(({ next, context }) => {
  const key = clientKey(
    getRequest().headers,
    context.clientIp,
    accessConfig().proxyHops,
  );
  const attempt = unlockAttempts.check(key);
  if (!attempt.allowed) {
    setResponseStatus(429);
    setResponseHeader("Retry-After", String(attempt.retryAfterS));
    const minutes = Math.ceil(attempt.retryAfterS / 60);
    throw new Error(
      `Too many tries. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }
  return next({ context: { clientKey: key } });
});
