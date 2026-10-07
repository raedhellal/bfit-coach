/** @jsxImportSource react */
// ↑ The default for Next's compiler, stated for Playwright's: its loader compiles JSX in any
// module a spec imports to its component-testing runtime (`playwright/jsx-runtime`), which
// React cannot render. With the pragma, `qa/client-tab-bar.spec.ts` renders this file as Next does.
import Link from "next/link";
import type { CoachAccessScope } from "@/lib/coachApi";
import { MIN_TOUCH_TARGET } from "@/components/ui/kit";

/**
 * EV-342e — the client tab bar's markup, apart from `ClientTabs` so that it imports nothing
 * server-only (`getCopy` reads the request): `qa/client-tab-bar.spec.ts` renders it with a
 * four-entry array outside Next (E.2). `ClientTabs` builds the client's entries and passes
 * them here.
 */

/** One tab of a bar: where it goes, what it says, and (for the reader) the scope behind it. */
export interface TabDef {
  key: string;
  href: string;
  label: string;
  scope?: CoachAccessScope;
}

/**
 * The bar itself, from any array of tabs: pure, no copy lookup and no request, so a unit
 * test can render it with four entries (E.2). At 390 px it scrolls sideways inside itself
 * (`overflow-x: auto`, tabs never wrap), never the page (E.3).
 */
export function TabBar({ tabs, active, label }: { tabs: readonly TabDef[]; active: string; label: string }) {
  return (
    <nav
      aria-label={label}
      className="client-tabs"
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
              flex: "none",
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
