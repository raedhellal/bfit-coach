import { InviteNotFoundView } from "@/components/invite/InviteNotFound";

/**
 * BUG-678 — the CONCRETE page every `/i/<token>/<anything>` is rewritten to, with **404**,
 * by `middleware.ts`. Never linked; a direct visit is rewritten onto itself with 404 too.
 *
 * Why a page of its own and not a rewrite of the deep path onto itself (EV-337k's first cut):
 * that rewrite could only be served by the DYNAMIC route `/i/[token]/[...rest]`, which
 * `next start` resolves and Vercel did not — production at 46eb8b7 answered `/i/tok/extra`
 * with `x-matched-path: /_not-found`, the root 404 under the root (Evoli Pro) head, while
 * `/i`, a concrete route rewritten the same way, matched `/i`. A static segment under `/i`
 * is matched on both, and inherits the `/i` head (`src/app/i/layout.tsx`): Evoli Fit title,
 * `/i` icons, the invitation's description.
 *
 * The name cannot shadow an invitation: b-fit-api's invite tokens are 43 characters of
 * base64url (`InviteTokens.java`), and "no-invitation" is 13.
 */
export const dynamic = "force-dynamic";

export default function NoInvitation() {
  return <InviteNotFoundView />;
}
