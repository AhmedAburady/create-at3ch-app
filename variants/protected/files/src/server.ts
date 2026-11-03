import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { accessConfig } from "@/server/access.server";

import type { RequestContext } from "../server";

// What ../server.ts passes with each request, typed for middleware.
declare module "@tanstack/react-router" {
  interface Register {
    server: { requestContext: RequestContext };
  }
}

// Start's server entry. A server missing ACCESS_CODE or SESSION_SECRET stops
// here, naming them, rather than serve an app nobody can open.
accessConfig();

export default createServerEntry({
  fetch(request, opts) {
    return handler.fetch(request, opts);
  },
});
