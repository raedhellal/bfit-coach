import { expect, test, type Page } from "@playwright/test";

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
 * fills again if it does not come. Each fill CLEARS the field first. React tracks the value
 * it last saw, and after hydration over pre-typed text it has seen that text, so writing the
 * SAME text again can fire no `onChange`. Measured on the nutrition template editor in
 * throttled WebKit: hydrated at 2.5 s, then 40 identical re-fills over 80 s never enabled
 * Save, while one clear-then-fill did at once. The login form's re-fill happened to get
 * through in the forced race, but nothing guarantees it.
 *
 * Once the button is enabled, React owns the submit (its `onSubmit` prevents the native
 * one), so the click is made ONCE, and the wait for the landing URL is long: under load the
 * login round trip and the document load that follows (`crossSessionBoundary`) are slow,
 * not lost (see `budget()`). Re-clicking a busy form could post the credentials twice. No fixed sleep
 * anywhere: every wait ends on something the page did.
 */

export type SignInLang = "en" | "fr";

/** How the form's three controls are found. A string is matched as Playwright does by default. */
export interface SignInLabels {
  email: string | RegExp;
  password: string | RegExp;
  submit: string | RegExp;
  /** Exact-string matching, for a spec whose subject is the form's own wording. */
  exact?: boolean;
}

const LABELS: Record<SignInLang, SignInLabels> = {
  en: { email: "Email", password: "Password", submit: "Sign in" },
  fr: { email: "E-mail", password: "Mot de passe", submit: "Se connecter" },
};

export interface SignInOptions {
  email?: string;
  password?: string;
  /** The form's language: the labels are looked up in it. Default English. */
  lang?: SignInLang;
  /** Overrides `lang`'s labels (exact wording, or either language by RegExp). */
  labels?: SignInLabels;
  /**
   * Where the sign-in lands. Default the roster, `/`. `null`: submit once and return, for a
   * spec that asserts what the form says about a REFUSED sign-in.
   */
  landing?: string | RegExp | null;
  /** Runs after the form has taken the credentials, right before the one click. */
  beforeSubmit?: () => Promise<unknown>;
}

/**
 * Each of the helper's two waits gets 40 % of the test's timeout, at most 25 s (24 s of the
 * suites' 60 s), so both fit inside the test and a failure names the helper's step rather
 * than "Test timeout exceeded".
 */
function budget(): number {
  let timeout = 0;
  try {
    timeout = test.info().timeout;
  } catch {
    // Not inside a test (a global setup): the cap alone applies.
  }
  return timeout > 0 ? Math.min(25_000, Math.floor(timeout * 0.4)) : 25_000;
}

/** Fill the form until React has the values, then submit once and wait for the landing. */
export async function signInThroughForm(page: Page, options: SignInOptions = {}): Promise<void> {
  const { email = "coach@evoli.fit", password = "Password123!", lang = "en", landing = "/" } = options;
  const labels = options.labels ?? LABELS[lang];
  const exact = labels.exact ?? false;
  const wait = budget();
  // `domcontentloaded`, not `load`: the enabled button below is the readiness check. `load`
  // also waits for Next's async chunks, which `qa/sign-in-hydration.spec.ts` holds back.
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const emailField = page.getByLabel(labels.email, { exact });
  const passwordField = page.getByLabel(labels.password, { exact });
  const submit = page.getByRole("button", { name: labels.submit, exact });

  await expect(async () => {
    await emailField.fill("");
    await emailField.fill(email);
    await passwordField.fill("");
    await passwordField.fill(password);
    // The hydration witness: only React's state, through `onChange`, enables the button.
    await expect(submit, "« Sign in » is enabled only once the form's state holds both fields").toBeEnabled({
      timeout: 2_000,
    });
  }, `the login form never took the typed credentials into its state within ${wait} ms (never hydrated?)`).toPass({
    timeout: wait,
  });

  await options.beforeSubmit?.();
  await submit.click();
  if (landing !== null) await page.waitForURL(landing, { timeout: wait });
}
