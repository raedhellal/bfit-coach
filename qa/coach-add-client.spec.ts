import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll } from "./layout";

/**
 * EV-204b — « Ajouter un client » in the Evoli Pro portal (b-fit-api EV-204a2, merged at
 * 6cb2289, live at 2bf3b42). The DEFAULT suite's `empty` scenario: nobody is invited at the
 * seed, so every Invited row here is made through the dialog, the way a coach makes one.
 *
 * The ACs this file owns (story EV-204, "Acceptance criteria for the re-scoped shape"):
 *   AC-P7  the Invited row with its expiry; Resend issues a new password, the expiry unchanged
 *   AC-P8  an address with an account (active OR pending) → one sentence, and the invite branch
 *   AC-P9  the temporary password is on NO coach surface (the fixture's mail sink holds it)
 *   AC-P11 the body-data control: visible, disabled, says why; no write path behind it
 *   AC-P13 Withdraw, confirmed; the row goes
 *   AC-P14 an expired, unswept account's address counts as absent
 *   AC-P18 « Finish your coach profile first… »
 * plus the refusals in words (throttle, unavailable, unknown outcome, invalid fields), the
 * Invited read failing on its own, French, and X1/X3/X4 on the two routes this adds.
 */

async function signIn(page: Page, lang: "en" | "fr" = "en") {
  // Fills until React's state agrees (a fill before hydration is lost): qa/sign-in.ts.
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!", lang });
}

interface Mail {
  kind: "INITIALISED" | "RESENT";
  to: string;
  fullName: string;
  creatorName: string;
  temporaryPassword: string;
  expiresAt: string;
  locale: string | null;
}

async function mails(page: Page): Promise<Mail[]> {
  const res = await page.request.get("/api/fixture/mail");
  expect(res.status(), "GET /api/fixture/mail (fixture mode only)").toBe(200);
  return ((await res.json()) as { mails: Mail[] }).mails;
}

async function apiOps(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls");
  return ((await res.json()) as { api: { op: string }[] }).api.map((e) => e.op);
}

async function setSwitch(context: BrowserContext, baseURL: string | undefined, name: string, value: string) {
  await context.addCookies([{ name, value, url: baseURL! }]);
}

function addDialog(page: Page, name = "Add a client"): Locator {
  return page.getByRole("dialog", { name });
}

/** Opens the dialog and submits a name and an address. Returns the dialog. */
async function addClient(page: Page, fullName: string, email: string, opts: { language?: "Français" | "English" } = {}) {
  await page.getByRole("button", { name: "Add a client", exact: true }).click();
  const dialog = addDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).fill(fullName);
  await dialog.getByLabel("Email address", { exact: true }).fill(email);
  if (opts.language) await dialog.getByRole("radio", { name: opts.language }).check();
  await dialog.getByRole("button", { name: "Add client", exact: true }).click();
  return dialog;
}

async function addAndClose(page: Page, fullName: string, email: string) {
  await addClient(page, fullName, email);
  const done = addDialog(page, "Account set up");
  await expect(done.locator("[data-add-client-done]")).toBeVisible();
  await done.getByRole("button", { name: "Done", exact: true }).click();
  await expect(done).toHaveCount(0);
}

function invitedRow(page: Page, name: string): Locator {
  return page.locator("[data-invited-section]").getByRole("group", { name, exact: true });
}

const EXPIRY_TEXT = /^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC$/;

test.describe("AC-P7 — a new address: the account is set up and the roster lists it as Invited, with its expiry", () => {
  test("the dialog says what happens, the row reads Invited with the address, the sent day and the expiry instant", async ({ page }) => {
    const events: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "info") events.push(m.text());
    });
    await signIn(page);
    await expect(page.locator("[data-invited-section]")).toHaveCount(0); // nobody at the seed

    const dialog = await addClient(page, "  Amal Haddad ", "Amal@Example.com");
    const done = addDialog(page, "Account set up");
    await expect(done.locator("[data-add-client-done]")).toContainText(
      "Amal Haddad's account is set up. We're emailing amal@example.com a temporary password."
    );
    void dialog;

    const sent = await mails(page);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "INITIALISED", to: "amal@example.com", fullName: "Amal Haddad", locale: "en" });
    // 720 hours, not "a month" (V65).
    const created = Date.parse(sent[0].expiresAt) - 720 * 3600 * 1000;
    expect(Math.abs(created - Date.now())).toBeLessThan(5 * 60 * 1000);

    await expect(done.locator("[data-add-client-done]")).toContainText(
      "If the email doesn't arrive, use Resend in the Invited list."
    );
    await done.getByRole("button", { name: "Done", exact: true }).click();

    const section = page.locator("[data-invited-section]");
    await expect(section.getByRole("heading", { level: 2, name: "Invited", exact: true })).toBeVisible();
    const row = invitedRow(page, "Amal Haddad");
    await expect(row).toBeVisible();
    await expect(row).toContainText("amal@example.com");
    await expect(row.getByText("Invited", { exact: true })).toBeVisible();
    await expect(row.locator(".invited-sent time")).toHaveText(/^Sent \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    const expiry = row.locator("time[data-invited-expires]");
    await expect(expiry).toHaveAttribute("datetime", sent[0].expiresAt);
    await expect(expiry).toHaveText(EXPIRY_TEXT);

    // Ruling 2: an Invited person is not a client — the meter and the nav count do not move.
    await expect(page.getByText("0 / 2 profiles · Starter")).toBeVisible();
    await expect(page.locator(".shell-nav-count")).toHaveCount(0);
    await expect(page.getByText("No trainees yet", { exact: true })).toBeVisible();

    // It survives a plain reload (server-rendered from GET /coach-portal/trainees).
    await page.reload();
    await expect(invitedRow(page, "Amal Haddad")).toBeVisible();

    expect(events.filter((e) => e.startsWith("{")).map((e) => JSON.parse(e))).toContainEqual({ event: "coach_client_add", outcome: "initialised" });
  });

  test("the email's language is the coach's choice, French by default on a French portal", async ({ page }) => {
    await signIn(page);
    await addClient(page, "Lou", "lou@example.com", { language: "Français" });
    await expect(addDialog(page, "Account set up")).toBeVisible();
    expect((await mails(page))[0].locale).toBe("fr");
  });

  test("Resend: confirmed, a NEW temporary password is mailed, and the expiry does not move", async ({ page }) => {
    await signIn(page);
    await addAndClose(page, "Amal Haddad", "amal@example.com");
    const row = invitedRow(page, "Amal Haddad");
    const before = await row.locator("time[data-invited-expires]").getAttribute("datetime");

    await row.getByRole("button", { name: "Resend the invitation to Amal Haddad" }).click();
    const confirm = page.getByRole("dialog", { name: "Resend Amal Haddad's invitation?" });
    await expect(confirm).toContainText("We email amal@example.com a new temporary password. The previous one stops working.");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    expect((await mails(page)).filter((m) => m.kind === "RESENT")).toHaveLength(0);

    await row.getByRole("button", { name: "Resend the invitation to Amal Haddad" }).click();
    await page.getByRole("dialog", { name: "Resend Amal Haddad's invitation?" }).getByRole("button", { name: "Resend", exact: true }).click();
    const notice = page.locator("[data-invited-section] .invited-notice");
    await expect(notice).toHaveText(
      /^Resent to amal@example\.com\. The previous temporary password no longer works; access still expires on \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC\.$/
    );

    const all = await mails(page);
    expect(all.map((m) => m.kind)).toEqual(["INITIALISED", "RESENT"]);
    expect(all[1].temporaryPassword).not.toBe(all[0].temporaryPassword);
    expect(all[1].expiresAt, "D22.9c: the new email states the same date").toBe(all[0].expiresAt);
    await expect(row.locator("time[data-invited-expires]")).toHaveAttribute("datetime", before!);
    // Staff nit 2: a Resend in the first minute is still said ("Resent …"), on the row and the page.
    await expect(row.locator(".invited-resent time")).toHaveText(/^Resent \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    await row.getByRole("link").click();
    await page.waitForURL(/\/invited\//);
    await expect(page.locator(".invited-facts")).toContainText(/Resent \d{1,2} [A-Z][a-z]{2} \d{4}/);
  });

  test("staff should-fix 1: the dialog cannot be closed while the add is in flight, so its outcome lands in it", async ({ page, context, baseURL }) => {
    await signIn(page);
    // Every fixture api call held 1.5 s (fixtureApiJournal.ts), this browser context only.
    await setSwitch(context, baseURL, "evoli_fixture_api_latency", "1500");
    await page.getByRole("button", { name: "Add a client", exact: true }).click();
    const dialog = addDialog(page);
    await dialog.getByLabel("Name", { exact: true }).fill("Amal Haddad");
    await dialog.getByLabel("Email address", { exact: true }).fill("amal@example.com");
    await dialog.getByRole("button", { name: "Add client", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Adding…" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeVisible();
    // The answer lands in the same dialog, about the same person.
    await expect(page.getByRole("dialog", { name: "Account set up" }).locator("[data-add-client-done]")).toContainText(
      "Amal Haddad's account is set up."
    );
  });
});

test.describe("AC-P13 — Withdraw", () => {
  test("confirmed, the account is deleted: the row goes, and stays gone after a reload", async ({ page }) => {
    await signIn(page);
    await addAndClose(page, "Amal Haddad", "amal@example.com");
    await addAndClose(page, "Noé Martin", "noe@example.com");
    const row = invitedRow(page, "Amal Haddad");
    const href = await row.getByRole("link").getAttribute("href");

    await row.getByRole("button", { name: "Withdraw Amal Haddad's invitation" }).click();
    const confirm = page.getByRole("dialog", { name: "Withdraw Amal Haddad's invitation?" });
    await expect(confirm).toContainText("Their account is deleted now, with everything it holds: their name and amal@example.com.");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Withdraw Amal Haddad's invitation" }).click();
    await page.getByRole("dialog", { name: "Withdraw Amal Haddad's invitation?" }).getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(page.locator("[data-invited-section] .invited-notice")).toHaveText(
      "Amal Haddad's invitation was withdrawn and their account deleted."
    );
    await expect(row).toHaveCount(0);
    await expect(invitedRow(page, "Noé Martin")).toBeVisible();

    await page.reload();
    await expect(invitedRow(page, "Amal Haddad")).toHaveCount(0);
    // Its page now says so, in one sentence (the api's one 404).
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "This invitation no longer exists. They may have finished their account, or it expired or was withdrawn."
    );
    // The address is free again: withdrawn means deleted, not hidden.
    await page.goto("/");
    await addClient(page, "Amal Haddad", "amal@example.com");
    await expect(addDialog(page, "Account set up")).toBeVisible();
  });

  test("a row whose person finished meanwhile: Resend and Withdraw say so, and the row goes", async ({ page, context, baseURL }) => {
    await signIn(page);
    await addAndClose(page, "Amal Haddad", "amal@example.com");
    await addAndClose(page, "Noé Martin", "noe@example.com");
    await setSwitch(context, baseURL, "evoli_fixture_invitation_write", "gone");

    await invitedRow(page, "Amal Haddad").getByRole("button", { name: "Resend the invitation to Amal Haddad" }).click();
    await page.getByRole("dialog", { name: "Resend Amal Haddad's invitation?" }).getByRole("button", { name: "Resend", exact: true }).click();
    const notice = page.locator("[data-invited-section] .invited-notice");
    await expect(notice).toHaveText(
      "This invitation no longer exists: they may have finished their account, or it expired or was withdrawn. The list is up to date."
    );
    await expect(invitedRow(page, "Amal Haddad")).toHaveCount(0);

    await invitedRow(page, "Noé Martin").getByRole("button", { name: "Withdraw Noé Martin's invitation" }).click();
    await page.getByRole("dialog", { name: "Withdraw Noé Martin's invitation?" }).getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(notice).toHaveText(/^This invitation no longer exists:/);
    await expect(invitedRow(page, "Noé Martin")).toHaveCount(0);
    expect((await mails(page)).filter((m) => m.kind === "RESENT")).toHaveLength(0);
  });

  test("Resend refusals in words: the per-account throttle with its minutes, and the unavailable mailer", async ({ page, context, baseURL }) => {
    await signIn(page);
    await addAndClose(page, "Amal Haddad", "amal@example.com");
    const row = invitedRow(page, "Amal Haddad");
    const notice = page.locator("[data-invited-section] .invited-notice");

    await setSwitch(context, baseURL, "evoli_fixture_invitation_write", "throttled");
    await row.getByRole("button", { name: "Resend the invitation to Amal Haddad" }).click();
    await page.getByRole("dialog", { name: "Resend Amal Haddad's invitation?" }).getByRole("button", { name: "Resend", exact: true }).click();
    // Retry-After 2400 s → 40 minutes, rounded up.
    await expect(notice).toHaveText("This invitation was resent several times in the last hour. Try again in 40 minutes.");

    await setSwitch(context, baseURL, "evoli_fixture_invitation_write", "unavailable");
    await row.getByRole("button", { name: "Resend the invitation to Amal Haddad" }).click();
    await page.getByRole("dialog", { name: "Resend Amal Haddad's invitation?" }).getByRole("button", { name: "Resend", exact: true }).click();
    await expect(notice).toHaveText("Resending isn't available right now. Nothing was sent.");
    expect((await mails(page)).filter((m) => m.kind === "RESENT")).toHaveLength(0);
    await expect(row).toBeVisible();
  });

  test("the fixture's own window: the 6th Resend within the hour is refused (5 an hour per account)", async ({ page }) => {
    await signIn(page);
    await addAndClose(page, "Amal Haddad", "amal@example.com");
    const row = invitedRow(page, "Amal Haddad");
    const notice = page.locator("[data-invited-section] .invited-notice");
    for (let i = 1; i <= 6; i += 1) {
      await row.getByRole("button", { name: "Resend the invitation to Amal Haddad" }).click();
      await page.getByRole("dialog", { name: "Resend Amal Haddad's invitation?" }).getByRole("button", { name: "Resend", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(notice).toHaveText(i <= 5 ? /^Resent to / : /^This invitation was resent several times in the last hour\. Try again in \d+ minutes?\.$/);
    }
    expect((await mails(page)).filter((m) => m.kind === "RESENT")).toHaveLength(5);
  });
});

test.describe("AC-P8 / AC-P14 / AC-P18 and the refusals of « Ajouter un client »", () => {
  test("AC-P8: an address with an account, active or pending, gets ONE sentence and the invite branch; nothing is created", async ({ page }) => {
    await signIn(page);
    for (const address of ["deja.client@example.com", "pending.trainee@evoli.fit", "other.coach.invite@example.com"]) {
      const dialog = await addClient(page, "Someone", address);
      const refusal = dialog.locator("[data-add-client-refusal]");
      await expect(refusal).toHaveAttribute("data-add-client-refusal", "EXISTS");
      await expect(refusal).toContainText("This person already uses Evoli — send them an invite instead.");
      await dialog.getByRole("button", { name: "Cancel" }).click();
    }
    expect(await mails(page)).toHaveLength(0);
    await expect(page.locator("[data-invited-section]")).toHaveCount(0);

    // The invite branch: the link and its QR, from the same dialog.
    const dialog = await addClient(page, "Someone", "deja.client@example.com");
    await dialog.getByRole("button", { name: "Create an invite link" }).click();
    const invite = page.getByRole("dialog", { name: "Invite a trainee" });
    await expect(invite.getByLabel("Invite link")).toHaveValue(/\/i\/[A-Za-z0-9_-]{43}\?coach=Alex%20R\.$/);
    await expect(invite.getByRole("img", { name: "QR code for the invite link" })).toBeVisible();
    // Back returns to the form, still filled in.
    await invite.getByRole("button", { name: "Back" }).click();
    await expect(addDialog(page).getByLabel("Email address", { exact: true })).toHaveValue("deja.client@example.com");
  });

  test("AC-P14: an expired account nobody swept yet counts as absent — the address is set up again", async ({ page }) => {
    await signIn(page);
    // `lapsed.invite@example.com` is seeded past its expiry and is not listed.
    await expect(page.locator("[data-invited-section]")).toHaveCount(0);
    await addClient(page, "Lapsed Again", "lapsed.invite@example.com");
    await expect(addDialog(page, "Account set up")).toBeVisible();
    await addDialog(page, "Account set up").getByRole("button", { name: "Done" }).click();
    const expiry = await invitedRow(page, "Lapsed Again").locator("time[data-invited-expires]").getAttribute("datetime");
    expect(Date.parse(expiry!) - Date.now(), "a fresh 30-day window").toBeGreaterThan(29 * 24 * 3600 * 1000);
  });

  test("AC-P18: a coach with no name to give is told to finish the profile, and nothing is created", async ({ page, context, baseURL }) => {
    await signIn(page);
    await setSwitch(context, baseURL, "evoli_fixture_initialise", "profile_required");
    const dialog = await addClient(page, "Amal Haddad", "amal@example.com");
    const refusal = dialog.locator("[data-add-client-refusal]");
    await expect(refusal).toContainText("Finish your coach profile first, so the person knows who set up their account.");
    await expect(refusal).toContainText("Write to support@evoli.fit and we'll add it.");
    expect(await mails(page)).toHaveLength(0);
  });

  test("the throttle, the missing objection inbox and an unknown outcome, each in its own words", async ({ page, context, baseURL }) => {
    await signIn(page);
    await setSwitch(context, baseURL, "evoli_fixture_initialise", "throttled");
    let dialog = await addClient(page, "Amal Haddad", "amal@example.com");
    // Retry-After 1740 s → 29 minutes.
    await expect(dialog.locator("[data-add-client-refusal]")).toHaveText(
      "Too many attempts in the last hour. Nothing was created. Try again in 29 minutes."
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await setSwitch(context, baseURL, "evoli_fixture_initialise", "unavailable");
    dialog = await addClient(page, "Amal Haddad", "amal@example.com");
    await expect(dialog.locator("[data-add-client-refusal]")).toHaveText(
      "Adding clients isn't available right now. Nothing was created. Try again later."
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(await mails(page)).toHaveLength(0);

    // A 500 after the write: the account exists, so the sentence never says it does not.
    await setSwitch(context, baseURL, "evoli_fixture_initialise", "fail");
    dialog = await addClient(page, "Amal Haddad", "amal@example.com");
    await expect(dialog.locator("[data-add-client-refusal]")).toHaveText(
      "We couldn't confirm that Amal Haddad's account was set up. Check the Invited list before trying again: if Amal Haddad is there, it was."
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(invitedRow(page, "Amal Haddad")).toBeVisible();
  });

  test("the api's own window: the 31st initialisation in an hour is refused, the refused ones counted", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page);
    // Every call is charged (D22.3d), the 409s included: half of these are refusals.
    for (let i = 0; i < 30; i += 1) {
      const dialog = await addClient(page, `Client ${i}`, i % 2 === 0 ? `c${i}@example.com` : "deja.client@example.com");
      await expect(page.locator("[data-add-client-done], [data-add-client-refusal]")).toHaveCount(1);
      void dialog;
      await page.getByRole("dialog").getByRole("button", { name: /^(Done|Cancel)$/ }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const dialog = await addClient(page, "One Too Many", "toomany@example.com");
    await expect(dialog.locator("[data-add-client-refusal]")).toHaveText(
      /^Too many attempts in the last hour\. Nothing was created\. Try again in \d+ minutes?\.$/
    );
    expect((await mails(page)).map((m) => m.to)).not.toContain("toomany@example.com");
  });

  test("the form checks before it sends: empty, invalid and invisible-character input costs no api call", async ({ page }) => {
    await signIn(page);
    const opsBefore = (await apiOps(page)).filter((op) => op === "initialiseTrainee").length;
    await page.getByRole("button", { name: "Add a client", exact: true }).click();
    const dialog = addDialog(page);
    await dialog.getByRole("button", { name: "Add client", exact: true }).click();
    await expect(dialog.getByText("Enter their name.", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Enter their email address.", { exact: true })).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill("Amal\u202eHaddad");
    await dialog.getByLabel("Email address", { exact: true }).fill("amal at example.com");
    await dialog.getByRole("button", { name: "Add client", exact: true }).click();
    await expect(dialog.getByText("Remove the line breaks and invisible characters.", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Enter a valid email address.", { exact: true })).toBeVisible();

    // ZWNJ is orthography (Persian names), not an invisible trick: accepted, as by the api.
    await dialog.getByLabel("Name", { exact: true }).fill("Mitra\u200cZadeh");
    await expect(dialog.getByText("Remove the line breaks and invisible characters.", { exact: true })).toHaveCount(0);
    expect((await apiOps(page)).filter((op) => op === "initialiseTrainee").length).toBe(opsBefore);
  });
});

test.describe("AC-P9 — the temporary password is on no coach surface", () => {
  test("not in any response the portal served during set-up and Resend, nor on the roster or the person's page", async ({ page }) => {
    const bodies: { url: string; body: string }[] = [];
    page.on("response", async (res) => {
      if (res.url().includes("/api/fixture/mail")) return; // the mail sink IS the email
      try {
        bodies.push({ url: res.url(), body: await res.text() });
      } catch {
        /* a redirect or an aborted prefetch has no body */
      }
    });
    await signIn(page);
    await addAndClose(page, "Amal Haddad", "amal@example.com");
    const row = invitedRow(page, "Amal Haddad");
    await row.getByRole("button", { name: "Resend the invitation to Amal Haddad" }).click();
    await page.getByRole("dialog", { name: "Resend Amal Haddad's invitation?" }).getByRole("button", { name: "Resend", exact: true }).click();
    await expect(page.locator("[data-invited-section] .invited-notice")).toHaveText(/^Resent to /);
    const rosterHtml = await page.content();
    await row.getByRole("link").click();
    await page.waitForURL(/\/invited\//);
    await expect(page.locator("[data-body-data]")).toBeVisible();
    const pageHtml = await page.content();

    const passwords = (await mails(page)).map((m) => m.temporaryPassword);
    expect(passwords).toHaveLength(2);
    // The capture works: the server action's answer carrying the address was seen.
    expect(bodies.some((b) => b.body.includes("amal@example.com") && b.body.includes("expiresAt"))).toBe(true);
    for (const password of passwords) {
      expect(password.length).toBeGreaterThan(8);
      for (const b of bodies) expect(b.body.includes(password), `password in ${b.url}`).toBe(false);
      expect(rosterHtml.includes(password)).toBe(false);
      expect(pageHtml.includes(password)).toBe(false);
    }
  });
});

test.describe("AC-P11 — the person's page: the body-data control is visible, disabled, and says why", () => {
  test("disabled with the reason as its description, no handler, and no endpoint to call", async ({ page }) => {
    await signIn(page);
    await addAndClose(page, "Inès Ouali", "ines@example.com");
    await invitedRow(page, "Inès Ouali").getByRole("link").click();
    await page.waitForURL(/\/invited\/[0-9a-f-]{36}$/);

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inès Ouali");
    await expect(page.locator("[data-invited-email]")).toHaveText("ines@example.com");

    const body = page.locator("[data-body-data]");
    await expect(body.getByRole("heading", { level: 2, name: "Body data" })).toBeVisible();
    const control = body.getByRole("button", { name: "Add a measurement" });
    await expect(control).toBeVisible();
    await expect(control).toBeDisabled();
    await expect(control).toHaveAccessibleDescription(
      "Nothing about Inès Ouali's body can be recorded before they finish their account and agree to it. They enter their own starting measurements in the Evoli app, and you see their weigh-ins on their client page once they accept you."
    );
    const before = await apiOps(page);
    await control.click({ force: true });
    await page.waitForTimeout(300);
    expect(await apiOps(page), "a disabled control sends nothing").toEqual(before);

    // "No write path exists for it": b-fit-api publishes no coach-portal body-data write.
    const spec = readFileSync(join(__dirname, "..", "spec", "b-fit-api.openapi.yaml"), "utf8");
    const coachPaths = [...spec.matchAll(/^ {2}(\/coach-portal\/[^\s:]+):\s*$/gm)].map((m) => m[1]);
    expect(coachPaths.length, "the path scan found the coach-portal paths").toBeGreaterThan(20);
    expect(coachPaths.filter((p) => /measure|weigh|body|weight/i.test(p))).toEqual([]);
  });

  test("Resend and Withdraw work from the page; Withdraw returns to the roster without the row", async ({ page }) => {
    await signIn(page);
    await addAndClose(page, "Inès Ouali", "ines@example.com");
    await invitedRow(page, "Inès Ouali").getByRole("link").click();
    await page.waitForURL(/\/invited\//);
    await page.getByRole("button", { name: "Resend the invitation to Inès Ouali" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Resend", exact: true }).click();
    await expect(page.locator(".invited-notice")).toHaveText(/^Resent to ines@example\.com\./);

    await page.getByRole("button", { name: "Withdraw Inès Ouali's invitation" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Withdraw", exact: true }).click();
    await page.waitForURL("/");
    await expect(page.getByText("No trainees yet", { exact: true })).toBeVisible();
    await expect(invitedRow(page, "Inès Ouali")).toHaveCount(0);
  });

  test("an id that is not one of this coach's Invited accounts gets one sentence, as its h1", async ({ page }) => {
    await signIn(page);
    // Another coach's pending account, seeded: never this coach's to see.
    await page.goto("/invited/204b0000-0000-4000-8000-000000000003");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "This invitation no longer exists. They may have finished their account, or it expired or was withdrawn."
    );
    await expect(page.locator("[data-body-data]")).toHaveCount(0);
    await expect(page.getByText("Someone Else's")).toHaveCount(0);
  });
});

test.describe("the Invited read on its own, French, and the layout ACs", () => {
  test("the Invited read failing does not take the roster down, and says it failed rather than showing none", async ({ page, context, baseURL }) => {
    await signIn(page);
    await addAndClose(page, "Amal Haddad", "amal@example.com");
    await setSwitch(context, baseURL, "evoli_fixture_invited_read", "fail");
    await page.reload();
    await expect(page.locator("[data-invited-load-error]")).toHaveText("Pending invitations couldn't be loaded. Reload");
    await expect(page.getByText("No trainees yet", { exact: true })).toBeVisible();
    await expect(invitedRow(page, "Amal Haddad")).toHaveCount(0);
  });

  test.describe("French", () => {
    test.use({ locale: "fr-FR" });
    test("the dialog, the section and the refusals in French", async ({ page, context, baseURL }) => {
      await signIn(page, "fr");
      await page.getByRole("button", { name: "Ajouter un client", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Ajouter un client" });
      await expect(dialog.getByRole("radio", { name: "Français" })).toBeChecked();
      await dialog.getByLabel("Nom", { exact: true }).fill("Inès Ouali");
      await dialog.getByLabel("Adresse e-mail", { exact: true }).fill("deja.client@example.com");
      await dialog.getByRole("button", { name: "Ajouter le client", exact: true }).click();
      await expect(dialog.locator("[data-add-client-refusal]")).toContainText(
        "Cette personne utilise déjà Evoli\u00a0: envoyez-lui plutôt une invitation."
      );
      await dialog.getByLabel("Adresse e-mail", { exact: true }).fill("ines@example.com");
      await dialog.getByRole("button", { name: "Ajouter le client", exact: true }).click();
      const done = page.getByRole("dialog", { name: "Compte créé" });
      await expect(done).toContainText("Le compte d'Inès Ouali est créé. Nous envoyons un mot de passe temporaire à ines@example.com.");
      expect((await mails(page))[0].locale).toBe("fr");
      await done.getByRole("button", { name: "Terminé" }).click();

      const section = page.locator("[data-invited-section]");
      await expect(section.getByRole("heading", { level: 2, name: "Invitations en attente" })).toBeVisible();
      const row = section.getByRole("group", { name: "Inès Ouali" });
      await expect(row.getByText("En attente", { exact: true })).toBeVisible();
      await expect(row.locator(".invited-sent time")).toHaveText(/^Envoyée le (1er|\d{1,2}) \S+ \d{4}$/);
      await expect(row.getByRole("button", { name: "Renvoyer l'invitation à Inès Ouali" })).toBeVisible();
      await expect(row.getByRole("button", { name: "Retirer l'invitation d'Inès Ouali" })).toBeVisible();

      await setSwitch(context, baseURL, "evoli_fixture_initialise", "profile_required");
      await page.getByRole("button", { name: "Ajouter un client", exact: true }).click();
      const again = page.getByRole("dialog", { name: "Ajouter un client" });
      await again.getByLabel("Nom", { exact: true }).fill("Noé");
      await again.getByLabel("Adresse e-mail", { exact: true }).fill("noe@example.com");
      await again.getByRole("button", { name: "Ajouter le client", exact: true }).click();
      await expect(again.locator("[data-add-client-refusal]")).toContainText(
        "Complétez d'abord votre profil de coach, pour que la personne sache qui a créé son compte."
      );
    });
  });

  test("X1/X3/X4: no sideways scroll at nine widths, one h1, 44 px targets at 390 — roster and the person's page", async ({ page }) => {
    await signIn(page);
    await addAndClose(page, "Maximilian Alexander Okonkwo-Lindqvist", "maximilian.alexander.okonkwo-lindqvist@a-very-long-domain.example.com");
    const href = await invitedRow(page, "Maximilian Alexander Okonkwo-Lindqvist").getByRole("link").getAttribute("href");
    for (const route of ["/", href!]) {
      for (const width of [1440, 1280, 1279, 1024, 1023, 768, 767, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await expect(page.locator("main h1, h1").first()).toBeVisible();
        await expect(page.locator("h1")).toHaveCount(1);
        await expectNoSidewaysScroll(page, `${route} at ${width}`);
      }
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(route);
      const targets = route === "/" ? page.locator("[data-invited-section]").locator("a, button") : page.locator("main").locator("[data-body-data] button, .invited-actions button");
      const count = await targets.count();
      expect(count).toBeGreaterThan(1);
      for (let i = 0; i < count; i += 1) {
        const target = targets.nth(i);
        const box = await target.boundingBox();
        const inline = await target.evaluate((el) => el.classList.contains("invited-reload"));
        if (inline || !box) continue;
        expect(box.height, `${route} target ${i} height`).toBeGreaterThanOrEqual(44);
        expect(box.width, `${route} target ${i} width`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
