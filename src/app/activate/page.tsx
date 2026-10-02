import type { ReactNode } from "react";
import { ActivationForm } from "@/components/activation/ActivationForm";
import { LanguageSwitch } from "@/components/shell/LanguageSwitch";
import { SignOutButton } from "@/components/shell/SignOutButton";
import { UiIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/brand";
import {
  ApiError,
  activationExpired,
  coachApi,
  initialiserName,
  type ActivationStatus,
  type LegalVersions,
} from "@/lib/coachApi";
import { getCopy, getLocale } from "@/lib/i18n/server";
import { formatInstant, formatUtcTime } from "@/lib/format";

/**
 * /activate — EV-278c: a coach whose account the admin initialised finishes it here.
 *
 * Reachable ONLY with a PENDING session (middleware confines one here and keeps a coach
 * session off it), and that session only exists once `/api/auth/login` has seen
 * `GET /me/activation` answer a coach's grant. The page asks again on every render —
 * `force-dynamic`, `no-store` via `apiFetch` — because the answer can change under it
 * (activated in another tab, expired, withdrawn by the admin), and a cached "you may
 * finish this" is exactly the stale authorization view ADR-0012 D3 forbids.
 *
 * Server component: both reads happen here with the httpOnly cookie. The form is the one
 * client island, and it is only rendered when there is something the person can do:
 * pending, a coach's grant, before `expiresAt`, and with the policy versions in hand.
 * Every other outcome is its own state with a way out (Sign out), never a blank form.
 */
export const dynamic = "force-dynamic";

/** "27 Oct 2036, 09:30 UTC" — the portal formats in UTC (src/lib/format.ts), and says so. */
function formatExpiry(iso: string | null): string {
  const copy = getCopy();
  if (!iso) return copy.common.dash;
  return `${formatInstant(iso, copy.locale)}, ${formatUtcTime(iso)} UTC`;
}

/**
 * EV-337k (plan §5.10, design screen 14): one card on the page background — the black mark
 * (tile 26 + wordmark), the title, the state's content, then the way out (Sign out) and the
 * language switch. Every state of this page goes through it, so none can lose the way out.
 *
 * Drawn in the design and NOT here, and why:
 *   · « Bienvenue, Alex » and the e-mail field: `GET /me` is 403 to a PENDING token and
 *     `ActivationStatus` carries neither the name nor the address (the `fullName`
 *     deviation is java-engineer's);
 *   · the strength bar « 12 caractères minimum · bon »: the api's rule is 8 to 128
 *     characters (`src/lib/password.ts`); a strength verdict it does not make would be a
 *     rule the portal invented;
 *   · « Hébergé en Europe »: a hosting claim the PO must witness first (plan Q8);
 *   · the design has no temporary-password field; `POST /me/activate` requires it, so the
 *     field stays (EV-337k).
 */
function Frame({ title, children }: { title: string; children: ReactNode }) {
  const copy = getCopy();
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div>
          <Logo size={26} label={copy.brand} />
        </div>
        <h1 className="auth-card-title">{title}</h1>
        {children}
        <div className="auth-card-foot">
          <SignOutButton />
          <LanguageSwitch locale={getLocale()} inline />
        </div>
      </div>
    </main>
  );
}

function Notice({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        padding: "11px 13px",
        borderRadius: "var(--r-md)",
        background: tone === "error" ? "var(--err-bg)" : "var(--blue-50)",
        color: tone === "error" ? "var(--err-ink)" : "var(--ink-2)",
        fontSize: 13.5,
        lineHeight: 1.5,
      }}
    >
      <UiIcon name={tone === "error" ? "ban" : "clock"} size={16} color="currentColor" style={{ marginTop: 2 }} />
      <span>{children}</span>
    </div>
  );
}

type Loaded<T> = { ok: true; value: T } | { ok: false; error: unknown };

async function settle<T>(p: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await p };
  } catch (error) {
    return { ok: false, error };
  }
}

export default async function ActivatePage() {
  const copy = getCopy();
  const [activation, legal] = await Promise.all([
    settle<ActivationStatus>(coachApi.getActivation()),
    settle<LegalVersions>(coachApi.getLegalVersions()),
  ]);

  if (!activation.ok) {
    const code = activation.error instanceof ApiError ? activation.error.code : null;
    if (code === "ACCOUNT_NOT_INITIALISED") {
      return (
        <Frame title={copy.activate.title}>
          <Notice tone="error">{copy.activate.notInitialised}</Notice>
        </Frame>
      );
    }
    return (
      <Frame title={copy.activate.loadFailedTitle}>
        <Notice tone="error">{copy.activate.loadFailed}</Notice>
      </Frame>
    );
  }

  const status = activation.value;

  // Finished elsewhere (another tab, or before this session's token was minted): this
  // session's tokens still say PENDING and died with the activation's token_version bump.
  if (!status.pending) {
    return (
      <Frame title={copy.activate.alreadyActiveTitle}>
        <Notice tone="info">{copy.activate.alreadyActive}</Notice>
      </Frame>
    );
  }

  // The sign-in handler admits a coach's grant only; this is the belt to that brace.
  if (status.grantedRole !== "COACH") {
    return (
      <Frame title={copy.activate.traineeTitle}>
        <Notice tone="info">{copy.activate.trainee}</Notice>
      </Frame>
    );
  }

  // EV-324: the two kind-only fallbacks in the page's language (coachApi.ts is left alone).
  const initialiser = status.creatorName?.trim()
    ? initialiserName(status)
    : status.creatorKind === "GYM"
      ? copy.activate.yourGym
      : status.creatorKind === "COACH"
        ? copy.activate.yourCoach
        : initialiserName(status);
  const when = formatExpiry(status.expiresAt);

  // `GET /me/activation` still answers pending for a row past its expiry until the sweeper
  // deletes it; only POST /me/activate says 410. So the page judges the instant itself,
  // rather than show a form that can only be refused.
  if (activationExpired(status)) {
    return (
      <Frame title={copy.activate.expiredTitle}>
        <Notice tone="error">{copy.activate.expired(when, initialiser)}</Notice>
      </Frame>
    );
  }

  return (
    <Frame title={copy.activate.title}>
      <p className="auth-body" style={{ maxWidth: "none", marginTop: -8 }}>
        {copy.activate.setUpBy(initialiser)}
      </p>
      <Notice tone="info">{copy.activate.finishBy(when)}</Notice>
      <div>
        {legal.ok ? (
          <ActivationForm
            versions={legal.value}
            expiredMessage={copy.activate.expiredOnSubmit(when, initialiser)}
          />
        ) : (
          // No versions, no consent control: the api records consent against the versions
          // the person was SHOWN, and this page has none to show.
          <Notice tone="error">{copy.activate.legalUnavailable}</Notice>
        )}
      </div>
    </Frame>
  );
}
