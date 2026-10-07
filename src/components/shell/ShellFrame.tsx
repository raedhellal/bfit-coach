import Link from "next/link";
import { Logo } from "@/components/ui/brand";
import { UiIcon } from "@/components/ui/icons";
import type { Copy } from "@/lib/copy";
import type { Locale } from "@/lib/i18n/locale";
import { AccountMenu } from "./AccountMenu";
import { FocusClearOfBars } from "./FocusClearOfBars";
import { LanguageSwitch } from "./LanguageSwitch";
import { ShellAvatar } from "./ShellAvatar";
import { SkipLink } from "./SkipLink";
import { BackForwardCacheGuard, SignOutButton } from "./SignOutButton";

export type Section = "roster" | "templates" | "recipes" | "nutrition-templates" | "challenges";

/**
 * The shell's MARKUP, with the dictionary and the locale passed in (BUG-689).
 *
 * `CoachShell` (a server component) is what every page renders; it reads the copy and the
 * locale on the server and hands them here. The root error boundary (`src/app/error.tsx`)
 * is a CLIENT component and cannot render `CoachShell`, so it renders this with
 * `useCopy()` / `useLocale()` instead: one markup, two callers, so a page that failed to
 * render still has the navigation a page that rendered has. No `server-only` import may
 * enter this module, or the error boundary stops building. The layout's rationale (widths,
 * section order, one `h1` per page) is documented on `CoachShell`.
 */
export function ShellFrame({
  copy,
  locale,
  coachName,
  section,
  toReviewCount,
  children,
}: {
  copy: Copy;
  locale: Locale;
  coachName?: string | null;
  section?: Section;
  toReviewCount?: number;
  children: React.ReactNode;
}) {
  const items = navItems(copy);
  const count = typeof toReviewCount === "number" && toReviewCount > 0 ? toReviewCount : null;
  /**
   * The number is drawn `aria-hidden` and the sentence ("3 clients to review") is the link's
   * DESCRIPTION, from a `hidden` span (`aria-describedby` reads hidden text). So the link's
   * NAME stays « Clients » / "Roster" — what every locator and every screen-reader user
   * already knows it by. Two ids, one per navigation; only one navigation is displayed.
   */
  const countBadge = (where: "side" | "tab") =>
    count === null ? null : (
      <>
        <span className="shell-nav-count" data-roster-count={count} aria-hidden="true">
          {count}
        </span>
        <span id={`shell-roster-count-${where}`} hidden>
          {copy.roster.navCount(count)}
        </span>
      </>
    );
  return (
    <div className="app-shell">
      {/* EV-342g: the first Tab stop of every signed-in page. */}
      <SkipLink label={copy.shell.skipToContent} />
      <BackForwardCacheGuard />
      <FocusClearOfBars />
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
              aria-describedby={item.key === "roster" && count !== null ? "shell-roster-count-side" : undefined}
            >
              <span aria-hidden="true" style={{ display: "inline-flex" }}>
                <UiIcon name={item.icon} size={18} />
              </span>
              <span className="shell-nav-label">{item.label}</span>
              {item.key === "roster" && countBadge("side")}
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

        {/* EV-342g: the skip link's target; -1 so it takes focus without becoming a Tab stop. */}
        <main id="main" tabIndex={-1} className="page">
          {children}
        </main>

        <nav aria-label={copy.shell.nav} className="shell-tabbar">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="shell-tab"
              aria-current={section === item.key ? "page" : undefined}
              aria-describedby={item.key === "roster" && count !== null ? "shell-roster-count-tab" : undefined}
            >
              <span aria-hidden="true" style={{ display: "inline-flex", position: "relative" }}>
                <UiIcon name={item.icon} size={20} />
                {item.key === "roster" && countBadge("tab")}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}


/**
 * The section a path sits under, for a caller that has only the URL (the error boundary).
 * A client's pages, `/clients/denied` and `/invited/*` are « Clients », as `CoachShell`'s
 * callers pass them.
 */
export function sectionFor(pathname: string): Section | undefined {
  if (pathname === "/" || pathname.startsWith("/clients/") || pathname.startsWith("/invited/")) return "roster";
  for (const key of ["templates", "recipes", "nutrition-templates", "challenges"] as const) {
    if (pathname === `/${key}` || pathname.startsWith(`/${key}/`)) return key;
  }
  return undefined;
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
