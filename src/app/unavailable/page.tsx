import { AutoRetry } from "@/components/shell/AutoRetry";
import { ReloadButton } from "@/components/shell/ReloadButton";
import { Logo } from "@/components/ui/brand";
import { UiIcon } from "@/components/ui/icons";
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
 *
 * EV-337k (plan §5.10, design screen 17): one centred card — the black mark, a clock tile,
 * the title, the body, the automatic retry (`AutoRetry`, a GET reload of the same URL) and
 * « Try again now ». Not built: « État du service » (there is no status page, plan G23).
 * The design's « Vos programmes et brouillons sont conservés ; rien n'est perdu » is not
 * used either: the existing body says what this page can witness (nothing was changed, the
 * session is kept), which is not the same claim as "nothing anywhere is lost".
 * No language switch here: it is a server action, a POST, and on this page a POST is
 * exactly what middleware answers with a bare 503.
 */
export const dynamic = "force-dynamic";

export default function UnavailablePage() {
  const copy = getCopy();
  return (
    <main className="auth-page">
      <div className="auth-card auth-card--center">
        <Logo size={26} label={copy.brand} />
        <span className="auth-badge" data-tone="warn" aria-hidden="true">
          <UiIcon name="clock" size={26} />
        </span>
        <h1 className="auth-card-title">{copy.unavailable.title}</h1>
        <p className="auth-body">{copy.unavailable.body}</p>
        <AutoRetry />
        <div style={{ marginTop: 6 }}>
          <ReloadButton>{copy.unavailable.retry}</ReloadButton>
        </div>
      </div>
    </main>
  );
}
