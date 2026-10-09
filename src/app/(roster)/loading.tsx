import { CoachShell } from "@/components/shell/CoachShell";
import { Card, PageHead, Skeleton } from "@/components/ui/kit";
import { getCopy } from "@/lib/i18n/server";
import { readCoachIdentity } from "@/lib/session";

/**
 * Explicit loading state for the roster's server fetch (route-level Suspense).
 *
 * BUG-667 (roster half) — drawn INSIDE the shell. The shell is drawn by each page, not by a
 * layout, so a loading state without it took the sidebar, top bar and tab bar away for the
 * whole load and put them back with the content. Now the navigation stays on screen and its
 * links work while the roster loads; only the content area changes when the data lands.
 *
 * The coach's name comes from the identity cookie (`readCoachIdentity`, EV-342k): no api
 * read, so the fallback stays instant. Absent cookie, no name, as on the error page.
 *
 * `faultSeam={false}`: this is the fallback, not the page. The roster page's own
 * `CoachShell` carries BUG-704's render-error seam; firing it here too would spend
 * `evoli_fixture_render_error=once` on the skeleton and hand the page a healthy render.
 */
export default function Loading() {
  const copy = getCopy();
  return (
    <CoachShell coachName={readCoachIdentity()?.displayName} section="roster" faultSeam={false}>
      <PageHead title={copy.roster.title} sub={copy.roster.subtitle} />
      <Card style={{ marginBottom: 18 }} pad={18}>
        <Skeleton w={210} h={13} />
        <Skeleton h={6} r={99} style={{ marginTop: 10 }} />
      </Card>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton h={18} />
          <Skeleton h={18} w="80%" />
          <Skeleton h={18} w="60%" />
        </div>
      </Card>
    </CoachShell>
  );
}
