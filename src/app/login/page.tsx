import { Logo } from "@/components/ui/brand";
import { LoginForm } from "@/components/auth/LoginForm";
import { LanguageSwitch } from "@/components/shell/LanguageSwitch";
import { getCopy, getLocale } from "@/lib/i18n/server";

/**
 * /login — the only unguarded page (middleware.ts).
 *
 * Server component: it reads the redirect reason middleware attached and hands it to
 * the client form as its initial error, so a coach bounced out of /roster sees the
 * reason on the screen they land on rather than a bare form.
 *
 * EV-337k (plan §5.10, design screen 13): the black-mark brand panel beside the form from
 * 768 px, a compact band above it below 768 (globals.css `.login-*`), and the FR/EN switch
 * under the form — the shell's switch is not on this page, and a coach whose browser
 * names neither language would otherwise have no way to English before signing in.
 * Not built, deliberately: « Mot de passe oublié ? » (no coach reset flow exists, plan
 * G21) and an « Activer mon compte » link (activation IS signing in with the temporary
 * password, so it would point back here — `login.newCoach` says that instead).
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const copy = getCopy();
  const locale = getLocale();
  const initialError =
    searchParams?.error === "not_coach"
      ? copy.login.notACoach
      : searchParams?.error === "expired"
        ? copy.login.signedOut
        : null;

  return (
    <div className="login-split">
      {/* Brand panel — decorative, hidden below 768 px by CSS (no JS, no reflow). No inline
          style on it (BUG-380): an inline `display` beat the ≤767 px rule that hides it, so
          its whole layout lives on `.login-brand` in globals.css. */}
      <div className="login-brand">
        <div>
          <Logo size={36} tone="white" label={copy.brand} />
        </div>
        <p className="login-brand-title">{copy.login.panelTitle}</p>
        <p className="login-brand-body">{copy.login.panelBody}</p>
      </div>

      {/* Below 768 px: the mark and the headline above the form, never beside it. */}
      <div className="login-band">
        <div>
          <Logo size={30} tone="white" label={copy.brand} />
        </div>
        <p className="login-band-title">{copy.login.panelTitle}</p>
      </div>

      <main className="login-form">
        <div className="login-form-inner">
          <LoginForm initialError={initialError} />
          <p className="login-note">{copy.login.newCoach}</p>
          <LanguageSwitch locale={locale} inline />
        </div>
      </main>
    </div>
  );
}
