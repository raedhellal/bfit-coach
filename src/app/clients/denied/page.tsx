import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";

/**
 * /clients/denied — the trainee-not-on-your-roster page, served with **403**
 * (EV-183 AC5, BUG-139).
 *
 * The status is set by `middleware.ts`, which rewrites this exact path with
 * `status: 403`; a page render has no way to set one itself. `/clients/[id]`'s layout
 * redirects here when b-fit-api answers 403 for the id, so the status a crawler or a
 * monitor sees now matches the api's answer instead of reporting a denial as success.
 *
 * It sits beside the `[id]` segment rather than inside it because a denial page under
 * `[id]` would re-enter that layout, ask the api again and redirect to itself. It also
 * carries no id, which costs nothing: the sentence is the same for every id and this
 * page never looks one up.
 *
 * It makes **no** call for the trainee: it never had one to make. The api answers 403
 * identically for a foreign id, a revoked link and an id that never existed
 * (ADR-0012 D4), so there is nothing to look up and nothing to disclose — which is
 * also why the route being reachable for any id at all costs nothing. `getMe` is for
 * the header only, exactly as on the overview itself.
 */
export const dynamic = "force-dynamic";

export default async function ClientDeniedPage() {
  const me = await readCoachMe();
  return (
    <CoachShell coachName={me?.displayName}>
      <ClientNotice message={copy.client.notFound} />
    </CoachShell>
  );
}
