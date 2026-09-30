import type { ReactNode } from "react";
import { ActivationForm } from "@/components/activation/ActivationForm";
import { SignOutButton } from "@/components/shell/SignOutButton";
import { Logo, UiIcon } from "@/components/ui/icons";
import {
  ApiError,
  activationExpired,
  coachApi,
  initialiserName,
  type ActivationStatus,
  type LegalVersions,
} from "@/lib/coachApi";
import { getCopy } from "@/lib/i18n/server";
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

function Frame({ title, children }: { title: string; children: ReactNode }) {
  const copy = getCopy();
  return (
    <div className="login-split">
      {/* No inline style on the panel (BUG-380): an inline `display` beat the ≤767 px rule
          that hides it. Its whole layout lives on `.login-brand` in globals.css. */}
      <div className="login-brand">
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(160deg,rgba(255,255,255,0.16),transparent 50%)",
          }}
        />
        <div style={{ position: "relative" }}>
          <Logo size={34} on="dark" label={copy.brand} />
        </div>
        <div style={{ position: "relative", maxWidth: 460 }}>
          <p
            className="dt"
            style={{ fontSize: 36, lineHeight: 1.15, letterSpacing: -1, margin: 0, fontWeight: 700 }}
          >
            {copy.tagline}
          </p>
        </div>
        <div />
      </div>

      <main
        className="login-form"
        style={{
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          <h1
            className="dt"
            style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0, color: "var(--ink)" }}
          >
            {title}
          </h1>
          {children}
        </div>
      </main>
    </div>
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
        marginTop: 16,
      }}
    >
      <UiIcon name={tone === "error" ? "ban" : "clock"} size={16} color="currentColor" />
      <span>{children}</span>
    </div>
  );
}

function WayOut() {
  return (
    <div style={{ marginTop: 20 }}>
      <SignOutButton />
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
          <WayOut />
        </Frame>
      );
    }
    return (
      <Frame title={copy.activate.loadFailedTitle}>
        <Notice tone="error">{copy.activate.loadFailed}</Notice>
        <WayOut />
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
        <WayOut />
      </Frame>
    );
  }

  // The sign-in handler admits a coach's grant only; this is the belt to that brace.
  if (status.grantedRole !== "COACH") {
    return (
      <Frame title={copy.activate.traineeTitle}>
        <Notice tone="info">{copy.activate.trainee}</Notice>
        <WayOut />
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
        <WayOut />
      </Frame>
    );
  }

  return (
    <Frame title={copy.activate.title}>
      <p style={{ fontSize: 14, color: "var(--ink-2)", margin: "10px 0 0", lineHeight: 1.5 }}>
        {copy.activate.setUpBy(initialiser)}
      </p>
      <Notice tone="info">{copy.activate.finishBy(when)}</Notice>
      <div style={{ marginTop: 22 }}>
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
      <WayOut />
    </Frame>
  );
}
