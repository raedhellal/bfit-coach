import { InviteNotFoundView } from "@/components/invite/InviteNotFound";

/**
 * EV-337k — `/i/<token>/<anything>` (a mangled or extended invite link) is not an invitation.
 *
 * BUG-678: middleware no longer serves these paths from here. It rewrites them, with **404**,
 * to the concrete `/i/no-invitation` (`src/app/i/no-invitation/page.tsx`), because Vercel did
 * not resolve this DYNAMIC route for a rewrite onto the same URL and served the root Pro 404
 * instead. This page stays as the backstop: if a request ever reached it without that
 * rewrite, it would still draw the trainee view under the `/i` head, never the Pro 404 (only
 * the status would be wrong). Not `notFound()`: Next sends that as an empty-bodied error
 * shell (QA PB-1). The token is never printed: this route renders nothing of the URL.
 */
export const dynamic = "force-dynamic";

export default function InviteSubpath() {
  return <InviteNotFoundView />;
}
