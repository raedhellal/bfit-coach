import { expect, type Page } from "@playwright/test";

/**
 * Signing in through the /login FORM, without racing React's hydration.
 *
 * The race: /login arrives as server HTML, and `LoginForm`'s inputs are controlled by React
 * state. A `fill()` that lands before hydration changes the DOM value only, so React's
 * state stays empty. The SSR'd « Sign in » is `disabled` (`!email || !password`) and stays
 * disabled. The plain helper's click then waits on `<button disabled>` until the test times
 * out (measured: 50 s, Chromium and WebKit, `qa/sign-in-hydration.spec.ts`'s forced race).
 * The specs' own retry loops survived the forced race at idle but used 2–3 s inner timeouts
 * inside a 30 s budget, which a loaded machine overruns. QA saw it in WebKit under load,
 * because WebKit gets the dev server's HTML well before its JS has run.
 *
 * The hydration witness, read from the app's own behaviour (the portal has no hydration
 * marker, and adding one would be product code): « Sign in » becomes ENABLED only when
 * React's state holds both fields. That needs the `onChange` handlers to be live, which
 * means the form has hydrated. So the helper fills, waits for that enabled state, and
 * fills again if it does not come. Filling again after hydration is what reaches the state
 * (measured, both engines).
 *
 * Once the button is enabled, React owns the submit (its `onSubmit` prevents the native
 * one), so the click is made ONCE, and the wait for the landing URL is long: under load the
 * login round trip and the document load that follows (`crossSessionBoundary`) are slow,
 * not lost. Re-clicking a busy form could post the credentials twice. No fixed sleep
 * anywhere: every wait ends on something the page did.
 */

export type SignInLang = "en" | "fr";

const LABELS: Record<SignInLang, { email: string; password: string; submit: string }> = {
  en: { email: "Email", password: "Password", submit: "Sign in" },
  fr: { email: "E-mail", password: "Mot de passe", submit: "Se connecter" },
};

export interface SignInOptions {
  email?: string;
  password?: string;
  /** The form's language: the labels are looked up in it. Default English. */
  lang?: SignInLang;
  /** Where the sign-in lands. Default the roster, `/`. */
  landing?: string | RegExp;
}

/** Fill the form until React has the values, then submit once and wait for the landing. */
export async function signInThroughForm(page: Page, options: SignInOptions = {}): Promise<void> {
  const { email = "coach@evoli.fit", password = "Password123!", lang = "en", landing = "/" } = options;
  const labels = LABELS[lang];
  // `domcontentloaded`, not `load`: the enabled button below is the readiness check. `load`
  // also waits for Next's async chunks, which `qa/sign-in-hydration.spec.ts` holds back.
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const emailField = page.getByLabel(labels.email);
  const passwordField = page.getByLabel(labels.password);
  const submit = page.getByRole("button", { name: labels.submit });

  await expect(async () => {
    await emailField.fill(email);
    await passwordField.fill(password);
    // The hydration witness: only React's state, through `onChange`, enables the button.
    await expect(submit, "« Sign in » is enabled only once the form's state holds both fields").toBeEnabled({
      timeout: 2_000,
    });
  }, "the login form never took the typed credentials into its state (never hydrated?)").toPass({
    timeout: 45_000,
  });

  await submit.click();
  await page.waitForURL(landing, { timeout: 45_000 });
}
