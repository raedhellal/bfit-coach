import { redirect } from "next/navigation";
import { isClientId, readClientOverview } from "@/lib/clientOverview";

/**
 * The overview's status boundary (EV-183 AC5, BUG-139).
 *
 * AC5's last clause asks for **403** on a trainee the coach is not linked to. A page
 * render cannot set a status — and it cannot even redirect once the response has been
 * flushed: with a `loading.tsx` above it, a `redirect()` thrown inside the Suspense
 * boundary degrades to a `<meta http-equiv="refresh">` served with **200**, which is
 * exactly the 200 BUG-139 recorded. The decision therefore has to be made *before* the
 * first byte, which means here, in the layout, above the page's loading boundary — and
 * why `/` moved into the `(roster)` route group: a `loading.tsx` at the app root would
 * flush this response too.
 *
 * The layout redirects to /clients/denied, which `middleware.ts` serves with 403.
 * `/clients/denied` is deliberately outside this `[id]` segment: a denial page *under*
 * it would re-enter this layout, ask the api again and redirect to itself forever.
 *
 * The api call is shared with the page through `readClientOverview` — one request, not
 * two. The cost of deciding the status before flushing is that a cold load of this URL
 * no longer streams a skeleton.
 *
 * perf/coach-fast-routes-no-skeleton: no segment under `[id]` has a `loading.tsx` any
 * more. A committed fallback held every tab change for React's ~300 ms reveal throttle
 * although the pages answer in 50-150 ms, so the old page now stays until the new one is
 * ready, and `NavigationProgress` (root layout) shows a bar if that takes over 400 ms.
 */
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  /**
   * ⛔ No `readCoachMe()` here (perf/coach-parallel-page-reads, 2026-10-01).
   *
   * There used to be a `void readCoachMe()`, so that the header's name was fetched
   * alongside the overview instead of after it. Next renders this layout and the page
   * below it CONCURRENTLY, and every page under `[id]` starts `readCoachMe()` itself, so
   * the page's own call already starts at the same moment as the overview. Measured with
   * an 80 ms delay on every fixture call: the overview's whole api path is 82 ms with
   * three reads, which is one round trip.
   *
   * What the extra call did cost was in prefetches. A `<Link>` to `/clients/{id}` (one
   * per roster row, one per challenge participant) is prefetched on a production build,
   * and that prefetch rendered THIS layout and stopped at `[id]/loading.tsx` above the
   * page. The name was read and then never used: 6 of the roster's 12 background calls
   * with six rows. Since perf/coach-fast-routes-no-skeleton there is no loading boundary
   * under `[id]`, so the prefetch renders nothing at all (Next sends the route tree
   * only). `qa/page-read-budget.spec.ts` counts a prefetch of this route.
   */
  /**
   * BUG-600 — a path segment that is not a UUID is not the id of any trainee, so it gets
   * the answer an unknown id gets (the 403 denial page: no existence oracle either way),
   * WITHOUT an api call. Sent on, the live api's UUID conversion answers
   * `400 INVALID_REQUEST`, which is not a 403, and the coach read « This trainee could not
   * be loaded. » under a 200 for a URL that was never a client's.
   */
  if (!isClientId(params.id)) redirect("/clients/denied");

  const { forbidden } = await readClientOverview(params.id);
  if (forbidden) redirect("/clients/denied");

  return <>{children}</>;
}
