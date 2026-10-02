import Link from "next/link";
import { Logo } from "@/components/ui/brand";
import { UiIcon } from "@/components/ui/icons";
import type { Copy } from "@/lib/copy";
import { getCopy, getLocale } from "@/lib/i18n/server";
import { AccountMenu } from "./AccountMenu";
import { LanguageSwitch } from "./LanguageSwitch";
import { ShellAvatar } from "./ShellAvatar";
import { BackForwardCacheGuard, SignOutButton } from "./SignOutButton";

type Section = "roster" | "templates" | "recipes" | "nutrition-templates" | "challenges";

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
 * Server component. The islands are the language switch, the account menu and sign-out.
 */
export function CoachShell({
  coachName,
  section,
  children,
}: {
  coachName?: string | null;
  /** Which nav entry is the page under this shell. Undefined on a trainee screen. */
  section?: Section;
  children: React.ReactNode;
}) {
  const copy = getCopy();
  const locale = getLocale();
  const items = navItems(copy);
  return (
    <div className="app-shell">
      <BackForwardCacheGuard />
      <header className="shell-sidebar">
        {/* EV-183 AC1: the app header reads exactly "Evoli Pro" (the wordmark). */}
        <Link href="/" className="shell-home" aria-label={copy.shell.home}>
          <Logo size={34} label={copy.brand} />
        </Link>
        <nav aria-label={copy.shell.nav} className="shell-side-nav">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="shell-side-link"
              aria-current={section === item.key ? "page" : undefined}
            >
              <span aria-hidden="true" style={{ display: "inline-flex" }}>
                <UiIcon name={item.icon} size={18} />
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="shell-account">
          <div style={{ padding: "0 8px" }}>
            <LanguageSwitch locale={locale} />
          </div>
          {coachName && (
            <div className="shell-account-who">
              <ShellAvatar name={coachName} />
              <span className="shell-account-name">{coachName}</span>
            </div>
          )}
          <SignOutButton block />
        </div>
      </header>

      <div className="shell-column">
        <header className="shell-topbar">
          <Link href="/" className="shell-home" aria-label={copy.shell.home}>
            <Logo size={30} label={copy.brand} />
          </Link>
          <span style={{ flex: 1 }} />
          <AccountMenu coachName={coachName} locale={locale} />
        </header>

        <main className="page">{children}</main>

        <nav aria-label={copy.shell.nav} className="shell-tabbar">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="shell-tab"
              aria-current={section === item.key ? "page" : undefined}
            >
              <span aria-hidden="true" style={{ display: "inline-flex" }}>
                <UiIcon name={item.icon} size={20} />
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function navItems(copy: Copy): { key: Section; href: string; label: string; icon: string }[] {
  return [
    { key: "roster", href: "/", label: copy.shell.roster, icon: "users" },
    { key: "templates", href: "/templates", label: copy.templates.nav, icon: "layers" },
    { key: "recipes", href: "/recipes", label: copy.recipes.nav, icon: "book" },
    { key: "nutrition-templates", href: "/nutrition-templates", label: copy.nutritionTemplates.nav, icon: "leaf" },
    { key: "challenges", href: "/challenges", label: copy.challenges.nav, icon: "trophy" },
  ];
}
