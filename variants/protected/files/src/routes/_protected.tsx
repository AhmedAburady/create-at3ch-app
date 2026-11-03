import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";

import { getAccess } from "@/access/access.functions";
import { AccessGate } from "@/components/access-gate";

/**
 * Every page that needs the code sits under this pathless layout. Its guard
 * is route UX, not the security boundary: it spares a locked browser a page
 * of failed calls, while each server function and server route checks access
 * itself (AGENTS.md). Locked, the home page draws the gate in place and
 * answers 200, since link previews (WhatsApp, Slack, Teams) show nothing for
 * a redirect; every other page goes on to the access page.
 */
export const Route = createFileRoute("/_protected")({
  // Pages behind the code are private: never kept by a proxy or the browser.
  headers: () => ({ "Cache-Control": "private, no-store" }),
  beforeLoad: async ({ location }) => {
    // A check that fails counts as locked: the gate then shows why on unlock.
    const unlocked = await getAccess().then(
      (access) => access.unlocked,
      () => false,
    );
    if (unlocked || location.pathname === "/") return { unlocked };
    throw redirect({ to: "/access", search: { redirect: location.href } });
  },
  component: Protected,
});

function Protected() {
  const { unlocked } = Route.useRouteContext();
  const href = useLocation({ select: (location) => location.href });
  return unlocked ? <Outlet /> : <AccessGate target={href} />;
}
