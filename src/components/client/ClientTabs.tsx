import { getCopy } from "@/lib/i18n/server";
import type { CoachAccessScope } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";
import { TabBar, type TabDef } from "./TabBar";
import { TAB_STRIP_SCRIPT } from "./tabStrip";
import { INTAKE_REQUEST_ENABLED } from "@/lib/env";

/**
 * Overview · Routine · Nutrition · Intake · Messages (EV-184 AC1, EV-185 AC1, EV-341b B1, EV-095b AC-B1),
 * on EVERY client page (EV-342e).
 *
 * Real routes, not client-side panels. Three reasons: each tab is a separate api read
 * and a panel would make the overview pay for all three; a tab must be linkable,
 * because QA and a coach both arrive at `/clients/{id}/routine` directly; and the
 * scope denial is per tab, so each one needs to be able to render its own sentence
 * under its own request.
 *
 * **All tabs are always present, including for a scope the trainee has not shared**
 * (ADR-0015 D5). The ADR's B1 leaves the choice to EV-184b and this is it: a tab that
 * disappears is indistinguishable from a product that has no such feature, so a coach
 * would read a withheld scope as "Evoli Pro cannot do nutrition" and ask support rather
 * than ask their trainee. The tab is therefore rendered, and the page behind it says in
 * one sentence why it is empty.
 *
 * **EV-342e (audit A5): the sections are DATA.** Before it, the overview drew two buttons
 * and only the other pages drew this strip, and `ClientTab` was a closed union: a fourth
 * section (EV-341b's intake) would have been added in two places. Now adding a section is
 * ONE entry of `CLIENT_SECTIONS` (its key, its path under `/clients/{id}`, the scope its page
 * reads) AND its two labels, `copy.tabs.<key>` in `copy.ts` and `copy.fr.ts` (the `satisfies`
 * below refuses a key without one); `ClientTab` is derived from the array. `scope` is
 * the section's data scope, stated beside it for the reader and for EV-341b; it does NOT
 * hide the tab (D5 above), and `TabBar` (`./TabBar.tsx`) never reads it.
 *
 * Server component — the active tab is a prop, not `usePathname`. `TabBar` itself is a
 * client component since fix/coach-tabbar-mobile (it keeps the narrow strip scrolled to the
 * current tab and its edge fade current), so the strip does ship client JavaScript. This file
 * adds the inline `TAB_STRIP_SCRIPT` right after the `<nav>`: it places the strip during
 * parsing, so a document load's FIRST paint already shows the current tab and the fade, before
 * hydration (`./tabStrip.ts`; T5 in `qa/client-tab-bar-overflow.spec.ts`).
 */
export const CLIENT_SECTIONS = [
  { key: "overview", path: "" },
  { key: "routine", path: "/routine", scope: "WORKOUTS" },
  { key: "nutrition", path: "/nutrition", scope: "NUTRITION" },
  // EV-341b B1: with the release hold on, always rendered, never filtered out (D22.6a: without the
  // grant its page says why). With `COACH_INTAKE_REQUEST` off it is not drawn at all (G2).
  { key: "intake", path: "/intake", scope: "INTAKE" },
  // EV-095b AC-B1: the thread. No data scope: messaging is a property of the ACTIVE link
  // (ADR-0038 S3, D-CHAT-2), so no `scope` is stated, and none could hide it anyway (D5).
  { key: "messages", path: "/messages" },
] as const satisfies readonly { key: keyof Omit<Copy["tabs"], "label">; path: string; scope?: CoachAccessScope }[];

export type ClientTab = (typeof CLIENT_SECTIONS)[number]["key"];

/** The client's tabs, in order, in the request's language. */
export function clientTabs(clientId: string, copy: Copy, intakeOn: boolean = INTAKE_REQUEST_ENABLED): TabDef[] {
  return CLIENT_SECTIONS.filter((s) => intakeOn || s.key !== "intake").map((s) => ({
    key: s.key,
    href: `/clients/${clientId}${s.path}`,
    label: copy.tabs[s.key],
    scope: "scope" in s ? s.scope : undefined,
  }));
}

export function ClientTabs({ clientId, active }: { clientId: string; active: ClientTab }) {
  const copy = getCopy();
  return (
    <>
      <TabBar tabs={clientTabs(clientId, copy)} active={active} label={copy.tabs.label} />
      {/* Must stay the nav's NEXT sibling: the script finds the strip as its previous element.
          It places the strip at first paint only while ClientHeader is NOT inside a late-streaming
          <Suspense> boundary (no loading.tsx under clients/[id] today): streamed content is parsed
          into a hidden container, where the script measures 0 and does nothing, so the strip
          would be placed only after hydration (TabBar's effect). */}
      <script dangerouslySetInnerHTML={{ __html: TAB_STRIP_SCRIPT }} />
    </>
  );
}
