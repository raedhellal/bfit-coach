import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * EV-204b against a REAL b-fit-api (playwright.live.config.ts): « Ajouter un client », Resend,
 * Withdraw and the existing-user branch, end to end, on the api's own `CoachTraineeInitialisation
 * Controller` (origin/main 2bf3b42). The fixture cannot fail on a field name; this can.
 *
 * Boot the api with the mail STUB (`BFIT_MAIL_ENABLED=false`), so `LoggingMailSender` writes each
 * invitation — temporary password included — to the api's log and nowhere else, and a monitored
 * inbox (`BFIT_OBJECTION_INBOX=…`, or every call answers 503). Then point this run at that log:
 *
 *   EV204B_API_LOG=/path/to/api.log COACH_LIVE_API_ORIGIN=http://localhost:<port> \
 *     npx playwright test --config playwright.live.config.ts qa/coach-add-client.live.spec.ts
 *
 * The log is how AC-P9 is checked live: the password is read from the email, then looked for in
 * every response the portal served. Without the log the run FAILS rather than skips — a P9 check
 * that evaporates when its evidence is missing is not a check.
 *
 * Re-runnable: every address is new (a timestamp), and each account it sets up is withdrawn.
 */
const API_ORIGIN = process.env.COACH_LIVE_API_ORIGIN || "http://localhost:8099";
const API_LOG = process.env.EV204B_API_LOG ?? "";

async function signIn(page: Page) {
  await page.goto("/login");
  const button = page.getByRole("button", { name: "Sign in" });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.getByLabel("Email").fill("coach@evoli.fit");
    await page.getByLabel("Password").fill("Password123!");
    if (await button.isEnabled()) break;
    await page.waitForTimeout(250);
  }
  await button.click();
  await page.waitForURL("/");
}

/** Every temporary password the api's mail stub logged for `to`, oldest first. */
function loggedPasswords(to: string): string[] {
  const log = readFileSync(API_LOG, "utf8");
  const out: string[] = [];
  const marker = `[mail stub] to=${to} `;
  let at = log.indexOf(marker);
  while (at >= 0) {
    const m = /\n\n {4}([A-Za-z0-9]{16})\n/.exec(log.slice(at, at + 4000));
    if (m) out.push(m[1]);
    at = log.indexOf(marker, at + marker.length);
  }
  return out;
}

async function apiLogin(page: Page, email: string, password: string): Promise<number> {
  const res = await page.request.post(`${API_ORIGIN}/auth/login`, { data: { email, password } });
  return res.status();
}

test("live: set up a new address, Resend, Withdraw — and the temporary password never reaches the portal", async ({ page }) => {
  test.slow();
  expect(API_LOG, "EV204B_API_LOG must name the api's log file (the mail stub's output)").not.toBe("");
  const bodies: { url: string; body: string }[] = [];
  page.on("response", async (res) => {
    try {
      bodies.push({ url: res.url(), body: await res.text() });
    } catch {
      /* no body */
    }
  });

  const stamp = Date.now();
  const email = `ev204b-${stamp}@example.test`;
  const name = `Live Trainee ${stamp}`;
  await signIn(page);

  await page.getByRole("button", { name: "Add a client", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a client" });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("Email address", { exact: true }).fill(email);
  await dialog.getByRole("button", { name: "Add client", exact: true }).click();
  const done = page.getByRole("dialog", { name: "Account set up" });
  await expect(done).toContainText(`${name}'s account is set up. We're emailing ${email} a temporary password.`);
  await done.getByRole("button", { name: "Done" }).click();

  // The Invited row, read back from GET /coach-portal/trainees.
  const row = page.locator("[data-invited-section]").getByRole("group", { name, exact: true });
  await expect(row).toBeVisible();
  await expect(row).toContainText(email);
  const expiry = await row.locator("time[data-invited-expires]").getAttribute("datetime");
  expect(Date.parse(expiry!) - Date.now(), "created_at + 720 h").toBeGreaterThan(719 * 3600 * 1000);

  await expect.poll(() => loggedPasswords(email).length, { message: "the mail stub logged the invitation" }).toBe(1);
  const first = loggedPasswords(email)[0];
  expect(await apiLogin(page, email, first), "the emailed temporary password signs in (PENDING)").toBe(200);

  // Resend: a new password; the old one stops; the expiry does not move.
  await row.getByRole("button", { name: `Resend the invitation to ${name}` }).click();
  await page.getByRole("dialog", { name: `Resend ${name}'s invitation?` }).getByRole("button", { name: "Resend", exact: true }).click();
  await expect(page.locator("[data-invited-section] .invited-notice")).toHaveText(new RegExp(`^Resent to ${email.replace(/[.]/g, "\\.")}\\.`));
  await expect.poll(() => loggedPasswords(email).length).toBe(2);
  const second = loggedPasswords(email)[1];
  expect(second).not.toBe(first);
  expect(await apiLogin(page, email, first), "the old temporary password no longer signs in").toBe(401);
  expect(await apiLogin(page, email, second)).toBe(200);
  await page.reload();
  await expect(row.locator("time[data-invited-expires]")).toHaveAttribute("datetime", expiry!);

  // The person's page, with the disabled body-data control.
  await row.getByRole("link").click();
  await page.waitForURL(/\/invited\//);
  await expect(page.getByRole("button", { name: "Add a measurement" })).toBeDisabled();

  // AC-P9: neither password in anything the portal served.
  for (const password of [first, second]) {
    for (const b of bodies) expect(b.body.includes(password), `temporary password in ${b.url}`).toBe(false);
    expect((await page.content()).includes(password)).toBe(false);
  }
  expect(bodies.some((b) => b.body.includes(email) && b.body.includes("expiresAt")), "the capture saw the action's answer").toBe(true);

  // Withdraw, from the page: back to the roster, the row gone, the account gone.
  await page.getByRole("button", { name: `Withdraw ${name}'s invitation` }).click();
  await page.getByRole("dialog", { name: `Withdraw ${name}'s invitation?` }).getByRole("button", { name: "Withdraw", exact: true }).click();
  await page.waitForURL("/");
  await expect(page.locator("[data-invited-section]").getByRole("group", { name, exact: true })).toHaveCount(0);
  expect(await apiLogin(page, email, second), "a withdrawn account no longer exists").toBe(401);
});

test("live: an address that already uses Evoli gets AC-P8's sentence and a real invite link; nothing is created", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Add a client", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a client" });
  await dialog.getByLabel("Name", { exact: true }).fill("Test User");
  await dialog.getByLabel("Email address", { exact: true }).fill("user@evoli.fit");
  await dialog.getByRole("button", { name: "Add client", exact: true }).click();
  await expect(dialog.locator("[data-add-client-refusal]")).toContainText(
    "This person already uses Evoli — send them an invite instead."
  );
  await dialog.getByRole("button", { name: "Create an invite link" }).click();
  // POST /coach-portal/invites minted a real token (43 base64url characters).
  await expect(page.getByRole("dialog", { name: "Invite a trainee" }).getByLabel("Invite link")).toHaveValue(
    /\/i\/[A-Za-z0-9_-]{43}\?coach=/
  );
  expect(loggedPasswords("user@evoli.fit"), "no invitation email for an existing account").toEqual([]);
});
