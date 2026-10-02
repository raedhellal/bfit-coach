import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { DiscardTemplateOutcome } from "@/components/nutritionTemplates/DiscardTemplateOutcome";
import { UiIcon } from "@/components/ui/icons";
import { readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";

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
 *
 * EV-337k (plan §5.10, design screen 16): the design's centred card — a neutral tile, the
 * title, one line, the way back — drawn INSIDE the shell, which the design does not draw.
 * Kept on purpose: the coach is signed in, the shell is how he leaves for any other
 * section, and branch 3's QA follow-up NB-2 pins « Clients » as the current section here
 * (`qa/pro-roster.spec.ts`). The h1 is still EV-183 AC5's sentence, verbatim, rather than
 * the design's shorter « Ce client ne fait pas partie de votre liste »: AC5's text is the
 * story's, and the design's « le lien appartient à un autre coach » claims a reason the api
 * deliberately does not give. The way back is a real link drawn as a button, not a link
 * wrapped round a <button> (two nested interactive elements, as `ClientNotice` still has).
 */
export const dynamic = "force-dynamic";

export default async function ClientDeniedPage() {
  const copy = getCopy();
  const me = await readCoachMe();
  return (
    <CoachShell coachName={me?.displayName} section="roster">
      <div className="auth-stage">
        <div className="auth-card auth-card--center">
          <span className="auth-badge" aria-hidden="true">
            <UiIcon name="ban" size={26} />
          </span>
          <h1 className="auth-card-title">{copy.client.notFound}</h1>
          <p className="auth-body">{copy.denied.body}</p>
          <Link href="/" className="auth-action" style={{ marginTop: 6 }}>
            <UiIcon name="arrowL" size={17} />
            {copy.shell.backToRoster}
          </Link>
        </div>
      </div>
      {/* EV-273b: access-lost drops any pending "Use on a trainee" outcome, unread. */}
      <DiscardTemplateOutcome />
    </CoachShell>
  );
}
