import { ReloadButton } from "@/components/shell/ReloadButton";
import { Logo } from "@/components/ui/brand";
import { Card } from "@/components/ui/kit";
import { getCopy } from "@/lib/i18n/server";

/**
 * /unavailable — served with **503** by `middleware.ts`, as a rewrite, when a page load's
 * (a GET or HEAD's — a write gets a bare 503 and never this page, staff round 4)
 * session rotation got no verdict from b-fit-api: the call threw, answered 5xx, or
 * answered 429 from the api's per-IP refresh throttle (staff round 3 on EV-278c).
 *
 * None of those means the session ended, so middleware kept the cookies and this page
 * says exactly that, and offers a reload of the URL still in the address bar. It makes
 * no api call: the api is what just failed, and the session it would need has not been
 * rotated. A direct visit never renders it — middleware sends that home.
 */
export const dynamic = "force-dynamic";

export default function UnavailablePage() {
  const copy = getCopy();
  return (
    <main className="page" style={{ maxWidth: 520, margin: "0 auto", paddingTop: 64 }}>
      <div style={{ marginBottom: 24 }}>
        <Logo size={26} label={copy.brand} />
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 4px" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
            {copy.unavailable.title}
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {copy.unavailable.body}
          </p>
          <div>
            <ReloadButton>{copy.unavailable.retry}</ReloadButton>
          </div>
        </div>
      </Card>
    </main>
  );
}
