/**
 * The two trainee apps a link from this portal can open (ADR-0027 D27.5, D27.5d).
 *
 * ONE place for each app's identity, so a rename is one edit here and every label and
 * deep link follows. Both apps carry the same route files (ADR-0027 V2), so the same
 * path resolves in either; only the scheme differs, because two installed apps claiming
 * one scheme open whichever the OS picks.
 */
export interface TraineeApp {
  /** The display name, as the store and the home screen show it. */
  name: string;
  /** The custom URL scheme, without `://`. */
  scheme: string;
  /** iOS bundle id / Android package. Not linked to yet: no store listing exists (⛔ D8, EV-037). */
  bundleId: string;
}

export const EVOLI_FIT: TraineeApp = {
  name: "Evoli Fit",
  scheme: "evolifit",
  bundleId: "com.fit.evoli.app",
};

/**
 * ⚠ A DEFAULT, not a decision. The display name is Raed's `D-LITE-1` and the bundle id is
 * confirmed by him before the first store upload (ADR-0027 D27.5a); until then these are
 * the ADR's defaults. If either changes, change it HERE — the invite page's label reads it.
 */
export const EVOLI_FIT_LITE: TraineeApp = {
  name: "Evoli Fit Lite",
  scheme: "evolifitlite",
  bundleId: "com.fit.evoli.lite",
};

/**
 * EV-289 — the invite page offers both, in this order (the order is `senior-po`'s): the
 * full app first, because most people opening an invite link already use it.
 */
export const INVITE_APPS: readonly TraineeApp[] = [EVOLI_FIT, EVOLI_FIT_LITE];

/**
 * `<scheme>://my-coach/invite/<token>[?coach=<name>]`. The token and the name are
 * re-encoded rather than concatenated raw, so a name containing `&`, `#` or a space
 * cannot split the deep link into extra parameters (EV-183 AC3).
 */
export function inviteDeepLink(app: TraineeApp, token: string, coachName: string | null): string {
  return (
    `${app.scheme}://my-coach/invite/${encodeURIComponent(token)}` +
    (coachName ? `?coach=${encodeURIComponent(coachName)}` : "")
  );
}
