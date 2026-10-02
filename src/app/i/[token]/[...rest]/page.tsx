import { InviteNotFoundView } from "@/components/invite/InviteNotFound";

/**
 * EV-337k — `/i/<token>/<anything>` (a mangled or extended invite link) is not an invitation. Served **404** by `middleware.ts` (a rewrite onto
 * itself with `status: 404`, as /clients/denied gets its 403) and drawn here, server-side,
 * under the `/i` head (`src/app/i/layout.tsx`): the trainee mark, title and icons from the
 * first byte. Not `notFound()`: Next sends that as an empty-bodied error shell (QA PB-1).
 * The token is never printed: this route renders nothing of the URL.
 */
export const dynamic = "force-dynamic";

export default function InviteSubpath() {
  return <InviteNotFoundView />;
}
