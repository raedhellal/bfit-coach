import { chromium, type FullConfig } from "@playwright/test";

/**
 * ⏱ Compile every route ONCE, before the first assertion is timed.
 *
 * `next dev` compiles a route the first time it is NAVIGATED to, and this suite runs
 * against `next dev` on purpose — that is what makes it the gate: no build step, no
 * backend, runnable in a fresh clone. The cost is that the first test to touch a page
 * pays for webpack, and its assertions are timed against that.
 *
 * EV-188b added three routes and 25 tests and pushed several of those first assertions
 * past Playwright's 5 s `expect` default on a cold `.next`. `senior-qa` measured the
 * branch RED 2/2 cold and `main` GREEN 2/2 cold, with a DIFFERENT pre-existing file
 * failing each time and no EV-188b test ever failing — timing, not product, but a red
 * gate for anyone with a fresh checkout.
 *
 * Raising `expect.timeout` alone treats the symptom and scales badly: measured here,
 * a cold run under load (another session's live suite on the same machine) still went
 * red at 10 s, while the same commit cold and unloaded was green in 1.9 m. So the
 * compile is moved OUT of the measured window entirely, and the raised budget stays as
 * the belt to this brace.
 *
 * ⚠ IT MUST SIGN IN. Every route but `/login` and `/i/*` is behind `middleware.ts`,
 * which redirects an unauthenticated request BEFORE Next ever reaches the page module
 * — so an anonymous warm-up compiles the middleware and none of the pages it was
 * written for. That is the whole trap here, and it is silent: the warm-up "succeeds"
 * and nothing is warm.
 *
 * ⚠ IT MAY ONLY READ. This runs in the same dev-server process as the tests and the
 * fixture is one in-memory store, so a warm-up that pressed a button would hand the
 * first spec a mutated world. Every navigation below is a GET, and the template id is a
 * random UUID that renders the "not in your library" notice — which compiles the
 * `/templates/[id]` route module without touching a template.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** A trainee the fixture answers for in BOTH scenarios (empty and populated). */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** Never a real template. `/templates/[id]` is compiled either way. */
const NOBODYS_TEMPLATE = "00000000-0000-0000-0000-000000000000";
/** Never a real recipe either: `/recipes/[id]` compiles on the "not in your library" notice. */
const NOBODYS_RECIPE = "00000000-0000-0000-0000-000000000000";

export default async function warmRoutes(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    /**
     * ⚠ `fill()` BEFORE HYDRATION IS A NO-OP FOR REACT STATE, and this is where that
     * bites hardest.
     *
     * `LoginForm` disables Sign in on `!email || !password`, which are React state, not
     * the DOM values. Playwright's `fill` sets the value and dispatches `input` — if
     * React has not attached its listeners yet, nothing reaches the state and the button
     * stays disabled FOREVER. Measured here on a cold `.next`: the warm-up sat on a
     * `<button disabled>` for the full 30 s while the form looked completely filled in.
     *
     * The specs' own `signIn` never hits it because by the time they run something has
     * already compiled and hydrated `/login`. This helper is the first request the
     * server ever sees, so it has to poll: re-fill, re-check, until the control the
     * form's own state governs agrees that the form has been filled in.
     */
    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password");
    const signIn = page.getByRole("button", { name: "Sign in" });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await email.fill(EMAIL);
      await password.fill(PASSWORD);
      if (await signIn.isEnabled()) break;
      await page.waitForTimeout(500);
    }
    await signIn.click({ timeout: 60_000 });
    await page.waitForURL("/", { timeout: 60_000 });

    for (const route of [
      "/templates",
      "/templates/new",
      `/templates/${NOBODYS_TEMPLATE}`,
      "/recipes",
      "/recipes/new",
      `/recipes/${NOBODYS_RECIPE}`,
      `/clients/${LINA}`,
      `/clients/${LINA}/routine`,
      `/clients/${LINA}/nutrition`,
      "/clients/denied",
      "/i/warm-up-token",
    ]) {
      // `domcontentloaded`, not `networkidle`: the point is to make the server compile
      // the route, not to wait for the page to settle.
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
    }
  } finally {
    await browser.close();
  }
}
