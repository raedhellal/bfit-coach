import { getCopy, getLocale } from "@/lib/i18n/server";
import { ShellFrame, type Section } from "./ShellFrame";

/**
 * The app shell (Evoli Pro redesign, branch 1 — `evoli-pro-redesign-2026-10-02.md` §3).
 *
 * - **≥ 1024 px:** a 240 px sidebar — the black logo, the five sections, and at its foot
 *   the account block: language switch, the coach's name, sign-out.
 * - **< 1024 px:** a 56 px top bar (logo, account menu) and a bottom tab bar with the same
 *   five sections. The old reasoning still holds — a navigation rail costs a quarter of a
 *   390 px viewport — so the rail only exists where there is room for it.
 *
 * Both layouts are server-rendered and CSS (`globals.css`, "the app shell") picks one: no
 * viewport hook, no hydration flash. The hidden one is `display: none`, so at any width
 * there is exactly one banner and one navigation named "Portal" in the accessibility tree.
 *
 * The section ORDER is the stories', not the design's: EV-256b AC1 puts Recipes right after
 * Templates and EV-273b AC1 puts Nutrition templates after Recipes (pinned by
 * `coach-recipes.spec.ts` / `coach-nutrition-templates.spec.ts`). The design draws
 * Clients · Défis · Modèles · Nutrition · Recettes; reordering is a story change.
 *
 * One `h1` per page stays the page's job: the shell draws no heading.
 *
 * Server component: it reads the copy and the locale and renders `ShellFrame` (the markup,
 * shared with the error boundary since BUG-689). The islands are the language switch, the
 * account menu and sign-out.
 */
export function CoachShell({
  coachName,
  section,
  toReviewCount,
  children,
}: {
  coachName?: string | null;
  /**
   * Which nav entry the page sits under. A client's pages and `/clients/denied` are
   * "roster" (QA NB-2, branch 1): a coach on Léa's programme is still in « Clients ».
   */
  section?: Section;
  /**
   * EV-337 D3 (restated 2026-10-02) — the « Clients » count: how many clients are to review
   * (`redFlagCount` > 0), passed by the roster page from its own read. Absent everywhere
   * else (no page reads the roster just to feed a badge: plan §5.1), and never drawn as 0 —
   * a page that did not load the roster passes nothing, and "nobody to review" is no badge.
   */
  toReviewCount?: number;
  children: React.ReactNode;
}) {
  return (
    <ShellFrame
      copy={getCopy()}
      locale={getLocale()}
      coachName={coachName}
      section={section}
      toReviewCount={toReviewCount}
    >
      {children}
    </ShellFrame>
  );
}
