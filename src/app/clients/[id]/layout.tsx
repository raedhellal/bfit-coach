import { redirect } from "next/navigation";
import { readClientOverview, readCoachMe } from "@/lib/clientOverview";

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
 * no longer streams the skeleton; an in-app navigation still shows `loading.tsx`, which
 * is where a coach actually sees it.
 */
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  // Started, not awaited: the header's name is fetched alongside the overview instead
  // of after it. The page awaits the same cached promise.
  void readCoachMe();

  const { forbidden } = await readClientOverview(params.id);
  if (forbidden) redirect("/clients/denied");

  return <>{children}</>;
}
