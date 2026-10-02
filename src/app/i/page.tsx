import { InviteNotFoundView } from "@/components/invite/InviteNotFound";

/**
 * EV-337k — `/i` alone is not an invitation. Served **404** by `middleware.ts` (a rewrite onto
 * itself with `status: 404`, as /clients/denied gets its 403) and drawn here, server-side,
 * under the `/i` head (`src/app/i/layout.tsx`): the trainee mark, title and icons from the
 * first byte. Not `notFound()`: Next sends that as an empty-bodied error shell (QA PB-1).
 */
export const dynamic = "force-dynamic";

export default function InviteIndex() {
  return <InviteNotFoundView />;
}
