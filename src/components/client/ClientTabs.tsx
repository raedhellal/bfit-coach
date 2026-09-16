import Link from "next/link";
import { copy } from "@/lib/copy";
import { MIN_TOUCH_TARGET } from "@/components/ui/kit";

export type ClientTab = "overview" | "routine" | "nutrition";

/**
 * Overview · Routine · Nutrition (EV-184 AC1, EV-185 AC1).
 *
 * Real routes, not client-side panels. Three reasons: each tab is a separate api read
 * and a panel would make the overview pay for all three; a tab must be linkable,
 * because QA and a coach both arrive at `/clients/{id}/routine` directly; and the
 * scope denial is per tab, so each one needs to be able to render its own sentence
 * under its own request.
 *
 * **All three tabs are always present, including for a scope the trainee has not
 * shared** (ADR-0015 D5). The ADR's B1 leaves the choice to EV-184b and this is it:
 * a tab that disappears is indistinguishable from a product that has no such feature,
 * so a coach would read a withheld scope as "Evoli Pro cannot do nutrition" and ask
 * support rather than ask their trainee. The tab is therefore rendered, and the page
 * behind it says in one sentence why it is empty — which is also why no `scopes` prop
 * is threaded through here: this component makes no decision that needs one, and an
 * unused prop is a contract someone will start depending on.
 *
 * Server component — the active tab is a prop, not `usePathname`, so this adds no
 * client JavaScript to a page that may otherwise need none.
 */
export function ClientTabs({ clientId, active }: { clientId: string; active: ClientTab }) {
  const tabs: { key: ClientTab; label: string; href: string }[] = [
    { key: "overview", label: copy.tabs.overview, href: `/clients/${clientId}` },
    { key: "routine", label: copy.tabs.routine, href: `/clients/${clientId}/routine` },
    { key: "nutrition", label: copy.tabs.nutrition, href: `/clients/${clientId}/nutrition` },
  ];
  return (
    <nav
      aria-label="Trainee sections"
      style={{
        display: "flex",
        gap: 4,
        marginTop: 16,
        borderBottom: "1px solid var(--border)",
        overflowX: "auto",
      }}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            style={{
              // The 44 px floor applies to a link that behaves like a control
              // (BUG-146): these are thumb targets at the 390 px viewport EV-183 demos.
              minHeight: MIN_TOUCH_TARGET,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 14px",
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: "nowrap",
              color: on ? "var(--blue-600)" : "var(--ink-3)",
              borderBottom: `2px solid ${on ? "var(--blue-500)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
