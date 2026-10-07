import { getCopy } from "@/lib/i18n/server";
import type { CoachAccessScope } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";
import { TabBar, type TabDef } from "./TabBar";

/**
 * Overview · Routine · Nutrition (EV-184 AC1, EV-185 AC1), on EVERY client page (EV-342e).
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
 * section (EV-341b's intake) would have been added in two places. Now a section is ONE
 * entry of `CLIENT_SECTIONS` (its key, its path under `/clients/{id}`, the scope its page
 * reads) plus its label in `copy.tabs`; `ClientTab` is derived from the array. `scope` is
 * the section's data scope, stated beside it for the reader and for EV-341b; it does NOT
 * hide the tab (D5 above), and `TabBar` (`./TabBar.tsx`) never reads it.
 *
 * Server component — the active tab is a prop, not `usePathname`, so this adds no
 * client JavaScript to a page that may otherwise need none.
 */
export const CLIENT_SECTIONS = [
  { key: "overview", path: "" },
  { key: "routine", path: "/routine", scope: "WORKOUTS" },
  { key: "nutrition", path: "/nutrition", scope: "NUTRITION" },
] as const satisfies readonly { key: keyof Omit<Copy["tabs"], "label">; path: string; scope?: CoachAccessScope }[];

export type ClientTab = (typeof CLIENT_SECTIONS)[number]["key"];

/** The client's tabs, in order, in the request's language. */
export function clientTabs(clientId: string, copy: Copy): TabDef[] {
  return CLIENT_SECTIONS.map((s) => ({
    key: s.key,
    href: `/clients/${clientId}${s.path}`,
    label: copy.tabs[s.key],
    scope: "scope" in s ? s.scope : undefined,
  }));
}

export function ClientTabs({ clientId, active }: { clientId: string; active: ClientTab }) {
  const copy = getCopy();
  return <TabBar tabs={clientTabs(clientId, copy)} active={active} label={copy.tabs.label} />;
}
