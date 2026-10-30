import { createHash } from "node:crypto";
import { expect, type Locator, type Page, type Request } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm, type SignInLang } from "./sign-in";

/**
 * BUG-1073 — during an intake conflict, « Recharger » / "Reload" replaces the conflicted sections'
 * fields with the stored values after a GET. While that GET was out, those fields stayed editable,
 * so on coach `main` 315d11cf:
 *   R1: a late edit typed during the read was silently overwritten by the stored text;
 *   R2: a select-all taken during the read collapsed when the stored text was written, so the next
 *       keystroke was APPENDED to it (`TheirsX`).
 * Ruling (cq): while the read is out the conflicted sections' fields are READ-ONLY (focus and
 * selection kept, no characters taken, not `disabled`); after the read BUG-1070's selection rule
 * applies (the whole text selected stays the whole new text, a caret at the end stays at the end).
 *
 * Built from senior-qa's out-of-repo probe `qa1070-recharger.spec.ts` (hub `chore/po-demo-final-1021`,
 * `docs/qa/evidence/2026-10-30-bug1070/`). Chromium, fixture mode, the default config. The GET is
 * held 1.5 s with `page.route` for R1 / R2 (human-pace steps, as that probe); the other tests hold
 * it on a promise the test releases, so "during" is never a race. Every "during" read is checked to
 * have been taken before the GET's answer reached the page (`answered`), so no assertion about the
 * read-only window can pass vacuously after it.
 *
 * Round 2 (staff r1 S1, S2): a chip's remove button (HISTORY) and « Clear » (AVAILABILITY) pressed
 * during the read move no focus and change nothing; a radio group says it is read-only.
 *
 * Not covered here: WebKit (not installed on the rig), touch selection handles, a partial
 * selection (Out, as in BUG-1070), the catalogue picker and the muscle chips during a read.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const INTAKE = `/clients/${LINA}/intake`;
const READ = `**/api/bff/clients/${LINA}/intake`;

const T = {
  en: { locale: "en-US", reload: "Reload", notes: "Notes", saved: "Saved" },
  fr: { locale: "fr-FR", reload: "Recharger", notes: "Notes", saved: "Enregistré" },
} as const;
type Lang = keyof typeof T;

const panel = (page: Page, s: string) => page.locator(`[data-intake-panel="${s}"]`);
const notes = (page: Page, section = "GOALS", lang: Lang = "en"): Locator =>
  panel(page, section).getByRole("textbox", { name: T[lang].notes, exact: true });
const alertOf = (page: Page, k: string) => page.locator(`[data-intake-alert="${k}"]`);
const status = (page: Page) => page.locator("[data-intake-status]");
const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ").trim();

async function subjectHeader(page: Page): Promise<Record<string, string>> {
  const token = (await page.context().cookies()).find((c) => c.name === "evoli_pro_at")?.value ?? "";
  const sub = (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8") || "{}") as { sub?: string }).sub ?? "";
  return { "x-evoli-session-subject": createHash("sha256").update(`evoli-session-subject:${sub}`).digest("hex").slice(0, 32) };
}

/** QA's setup: the coach saves « Mine », another writer stores « Theirs », the coach's « Mine again » meets a 409. */
async function conflicted(page: Page, lang: Lang = "en") {
  await signInThroughForm(page, { lang: lang as SignInLang });
  const g = await page.request.post("/api/fixture/intake", { data: { clientId: LINA, answer: "grant" }, maxRedirects: 0 });
  expect(g.status()).toBe(200);
  await page.goto(INTAKE);
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
  await expect(page.locator(`[data-intake-ready="ready"]`)).toHaveCount(1);
  await notes(page, "GOALS", lang).fill("Mine");
  await notes(page, "GOALS", lang).press("Tab");
  await expect.poll(async () => plain(await status(page).textContent())).toBe(T[lang].saved);
  const res = await page.request.put(`/api/clients/${LINA}/intake/GOALS`, {
    data: { version: 1, values: { notes: "Theirs" } },
    headers: { "Content-Type": "application/json", ...(await subjectHeader(page)) },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(200);
  await notes(page, "GOALS", lang).fill("Mine again");
  await notes(page, "GOALS", lang).press("Tab");
  await expect(alertOf(page, "conflict")).toBeVisible();
}

/** The read held 1.5 s, then sent on (CW1). `answered()` is true once its answer reached the page. */
async function holdRead(page: Page) {
  let answered = false;
  page.on("response", (r) => {
    if (r.url().endsWith(`/api/bff/clients/${LINA}/intake`) && r.request().method() === "GET") answered = true;
  });
  await page.route(READ, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  return { answered: () => answered };
}

/** The read held until the test releases it, then answered by `answer`. */
async function gateRead(page: Page, answer: "continue" | number) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let answered = false;
  page.on("response", (r) => {
    if (r.url().endsWith(`/api/bff/clients/${LINA}/intake`) && r.request().method() === "GET") answered = true;
  });
  await page.route(READ, async (route) => {
    await gate;
    if (answer === "continue") await route.continue();
    else await route.fulfill({ status: answer, contentType: "application/json", body: JSON.stringify({ code: "TEST" }) });
  });
  return { release: () => release(), answered: () => answered };
}

const read = (l: Locator) =>
  l.evaluate((el: HTMLTextAreaElement | HTMLInputElement) => ({
    v: el.value,
    s: el.selectionStart,
    e: el.selectionEnd,
    focused: document.activeElement === el,
    disabled: el.disabled,
    readOnly: el.readOnly,
  }));

function goalsPuts(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && new URL(r.url()).pathname === `/api/clients/${LINA}/intake/GOALS`) seen.push(r);
  });
  return seen;
}

const readGet = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith(`/api/bff/clients/${LINA}/intake`) && r.request().method() === "GET");

test("R1 (CW2). during the read a late edit takes no characters; after it Notes is the stored text, editable, and one PUT carries it at the read's version", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await conflicted(page);
  const hold = await holdRead(page);
  const button = alertOf(page, "conflict").getByRole("button", { name: T.en.reload, exact: true });
  const got = readGet(page);
  await button.click();
  await expect(button).toBeDisabled();
  await notes(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" plus a late edit", { delay: 60 });
  const during = await read(notes(page));
  const duringBeforeAnswer = !hold.answered();
  const response = await got;
  const stored = (await response.json()) as { sections: Record<string, { version: number }> };
  const readVersion = stored.sections.GOALS.version;
  await expect(alertOf(page, "conflict")).toHaveCount(0);
  await page.waitForTimeout(400);
  const after = await read(notes(page));
  process.stdout.write(`BUG1073 R1 during=${JSON.stringify(during)} before-answer=${duringBeforeAnswer} after=${JSON.stringify(after)} readVersion=${readVersion}\n`);
  expect(duringBeforeAnswer, "the 'during' read was taken while the GET was still out").toBe(true);
  expect(during).toMatchObject({ v: "Mine again", focused: true, readOnly: true, disabled: false });
  expect(after).toMatchObject({ v: "Theirs", focused: true, readOnly: false, disabled: false });
  // A caret at the end before the write is at the end after it (CW3, BUG-1070's rule).
  expect([after.s, after.e]).toEqual([6, 6]);

  const sent = goalsPuts(page);
  await page.keyboard.type("ok", { delay: 60 });
  await page.keyboard.press("Tab");
  await expect.poll(async () => plain(await status(page).textContent())).toBe(T.en.saved);
  await page.waitForTimeout(2_000);
  expect(sent.length, "one PUT for GOALS").toBe(1);
  const body = sent[0].postDataJSON() as { version: number; values: { notes: string } };
  expect(body.version, "at the version the read returned").toBe(readVersion);
  expect(body.values.notes).toBe("Theirsok");
  expect(plain(await status(page).textContent())).toBe(T.en.saved);
});

for (const lang of ["en", "fr"] as const) {
  test.describe(`R2 (CW3) ${lang.toUpperCase()}`, () => {
    test.use({ locale: T[lang].locale });

    test(`a select-all taken while « ${T[lang].reload} » is out is the whole stored text after it: X replaces it`, async ({ page }) => {
      test.setTimeout(90_000);
      await conflicted(page, lang);
      const hold = await holdRead(page);
      const button = alertOf(page, "conflict").getByRole("button", { name: T[lang].reload, exact: true });
      const got = readGet(page);
      await button.click();
      await expect(button).toBeDisabled();
      await notes(page, "GOALS", lang).click();
      await page.keyboard.press("Control+A");
      const during = await read(notes(page, "GOALS", lang));
      const duringBeforeAnswer = !hold.answered();
      await got;
      await expect(alertOf(page, "conflict")).toHaveCount(0);
      await expect(notes(page, "GOALS", lang)).toHaveValue("Theirs");
      await page.waitForTimeout(400);
      const after = await read(notes(page, "GOALS", lang));
      await page.keyboard.type("X", { delay: 150 });
      const final = await read(notes(page, "GOALS", lang));
      process.stdout.write(
        `BUG1073 R2 ${lang} during=${JSON.stringify(during)} before-answer=${duringBeforeAnswer} after=${JSON.stringify(after)} final=${JSON.stringify(final)}\n`
      );
      expect(duringBeforeAnswer, "the 'during' read was taken while the GET was still out").toBe(true);
      expect(during).toMatchObject({ v: "Mine again", s: 0, e: 10, focused: true, readOnly: true, disabled: false });
      expect(after).toMatchObject({ v: "Theirs", s: 0, e: 6, focused: true, readOnly: false });
      expect(final.v, "the keystroke replaced the whole stored text").toBe("X");
    });
  });
}

test("CW4. only the conflicted section is locked: a non-conflicted section's text field takes typing during the read and keeps it after", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await conflicted(page);
  const gate = await gateRead(page, "continue");
  const button = alertOf(page, "conflict").getByRole("button", { name: T.en.reload, exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  // The conflicted section's other controls take no change either: a radio is put back, a
  // checkbox says it is read-only.
  await expect(notes(page)).toHaveJSProperty("readOnly", true);
  const radio = panel(page, "GOALS").getByRole("radio").first();
  await radio.click();
  await expect(radio, "a radio of the conflicted section takes no choice during the read").not.toBeChecked();
  await expect(panel(page, "GOALS").locator('input[type="checkbox"][value="HEALTH"]')).toHaveAttribute("aria-readonly", "true");
  // Staff r1 S2: a radio has no read-only state of its own; its group says it.
  const goalGroup = page.locator('[data-intake-field="GOALS.primaryGoal"] [role="radiogroup"]');
  await expect(goalGroup).toHaveAttribute("aria-readonly", "true");
  await expect(page.locator('[data-intake-field="HISTORY.level"] [role="radiogroup"]'), "a section not in conflict is not read-only").not.toHaveAttribute(
    "aria-readonly",
    /.*/
  );
  await page.locator('[data-intake-section="HISTORY"]').click();
  await notes(page, "HISTORY").click();
  await page.keyboard.type("History typed", { delay: 30 });
  const during = await read(notes(page, "HISTORY"));
  const duringBeforeAnswer = !gate.answered();
  const got = readGet(page);
  gate.release();
  await got;
  await expect(alertOf(page, "conflict")).toHaveCount(0);
  await page.waitForTimeout(400);
  const after = await read(notes(page, "HISTORY"));
  process.stdout.write(`BUG1073 CW4 history during=${JSON.stringify(during)} before-answer=${duringBeforeAnswer} after=${JSON.stringify(after)}\n`);
  expect(duringBeforeAnswer).toBe(true);
  expect(during).toMatchObject({ v: "History typed", readOnly: false, disabled: false, focused: true });
  expect(after.v, "the non-conflicted section's text is kept after the read").toBe("History typed");
  await page.locator('[data-intake-section="GOALS"]').click();
  await expect(notes(page)).toHaveValue("Theirs");
  await expect(goalGroup, "unlocked after the read").not.toHaveAttribute("aria-readonly", /.*/);
});

test("CW4. a failed read (GET 500): locked while out, then editable again with what it held, and the load sentence shows", async ({ page }) => {
  test.setTimeout(90_000);
  await conflicted(page);
  const gate = await gateRead(page, 500);
  const button = alertOf(page, "conflict").getByRole("button", { name: T.en.reload, exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await notes(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" late", { delay: 40 });
  const during = await read(notes(page));
  const duringBeforeAnswer = !gate.answered();
  gate.release();
  await expect(alertOf(page, "conflict").locator("[data-intake-reload-failed]")).toBeVisible();
  await expect(button).toBeEnabled();
  const after = await read(notes(page));
  process.stdout.write(`BUG1073 CW4 500 during=${JSON.stringify(during)} before-answer=${duringBeforeAnswer} after=${JSON.stringify(after)}\n`);
  expect(duringBeforeAnswer).toBe(true);
  expect(during).toMatchObject({ v: "Mine again", readOnly: true, disabled: false });
  expect(after).toMatchObject({ v: "Mine again", readOnly: false, disabled: false });
  await page.keyboard.type(" kept", { delay: 40 });
  await expect(notes(page), "editable again after the failed read").toHaveValue("Mine again kept");
  await expect(alertOf(page, "conflict"), "the conflict stays").toBeVisible();
});

test("CW4. a read answered 403 is access ended, as on main: the denied page", async ({ page }) => {
  test.setTimeout(90_000);
  await conflicted(page);
  await page.route(READ, (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "ACCESS_DENIED" }) }));
  // The 403's refresh only reaches /clients/denied once the link has ended on the fixture's side too.
  await page.context().addCookies([{ name: "evoli_fixture_link", value: "ended", url: new URL("/", page.url()).href }]);
  await alertOf(page, "conflict").getByRole("button", { name: T.en.reload, exact: true }).click();
  await page.waitForURL("/clients/denied", { timeout: 15_000 });
});

/**
 * Staff r1 S1: the same conflict in another section, seeded first (version 1). The coach saves
 * « Mine » (version 2), another writer stores `theirs` at version 2 (version 3), and the coach's
 * « Mine again » meets a 409.
 */
async function conflictedIn(page: Page, section: string, seed: Record<string, unknown>, theirs: Record<string, unknown>) {
  await signInThroughForm(page, { lang: "en" });
  const g = await page.request.post("/api/fixture/intake", { data: { clientId: LINA, answer: "grant" }, maxRedirects: 0 });
  expect(g.status()).toBe(200);
  const put = async (version: number, values: Record<string, unknown>) => {
    const res = await page.request.put(`/api/clients/${LINA}/intake/${section}`, {
      data: { version, values },
      headers: { "Content-Type": "application/json", ...(await subjectHeader(page)) },
      maxRedirects: 0,
    });
    expect(res.status(), `PUT ${section} v${version}: ${await res.text()}`).toBe(200);
  };
  await put(0, seed);
  await page.goto(INTAKE);
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
  await expect(page.locator(`[data-intake-ready="ready"]`)).toHaveCount(1);
  await page.locator(`[data-intake-section="${section}"]`).click();
  await notes(page, section).fill("Mine");
  await notes(page, section).press("Tab");
  await expect.poll(async () => plain(await status(page).textContent())).toBe(T.en.saved);
  await put(2, theirs);
  await notes(page, section).fill("Mine again");
  await notes(page, section).press("Tab");
  await expect(alertOf(page, "conflict")).toBeVisible();
}

/** Which element has the focus, named by the attributes the probe finds it by. */
const focusName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "none";
    const chip = el.closest("[data-intake-chip]")?.getAttribute("data-intake-chip");
    if (chip && el.hasAttribute("data-intake-chip-remove")) return `remove:${chip}`;
    if (el.closest("[data-intake-clear]")) return "clear";
    if (el instanceof HTMLInputElement) return `${el.type}:${el.value}`;
    return el.tagName.toLowerCase();
  });

test("S1. a chip's remove button pressed during the read: the chip stays, and the focus stays on that button through the write", async ({ page }) => {
  test.setTimeout(90_000);
  await conflictedIn(page, "HISTORY", { likedExercises: ["Plank"] }, { likedExercises: ["Goblet Squat", "Plank"], notes: "Theirs" });
  const liked = page.locator('[data-intake-field="HISTORY.likedExercises"]');
  const chips = () => liked.locator("[data-intake-chip]").evaluateAll((els) => els.map((e) => e.getAttribute("data-intake-chip")));
  const gate = await gateRead(page, "continue");
  const button = alertOf(page, "conflict").getByRole("button", { name: T.en.reload, exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await liked.locator('[data-intake-chip="Plank"] [data-intake-chip-remove]').click();
  await page.waitForTimeout(300);
  const during = { chips: await chips(), focus: await focusName(page) };
  const duringBeforeAnswer = !gate.answered();
  const got = readGet(page);
  gate.release();
  await got;
  await expect(alertOf(page, "conflict")).toHaveCount(0);
  await expect.poll(chips).toEqual(["Goblet Squat", "Plank"]);
  await page.waitForTimeout(400);
  const after = { chips: await chips(), focus: await focusName(page) };
  process.stdout.write(`BUG1073 S1 chip during=${JSON.stringify(during)} before-answer=${duringBeforeAnswer} after=${JSON.stringify(after)}\n`);
  expect(duringBeforeAnswer).toBe(true);
  expect(during, "the removal is refused and the focus stays").toEqual({ chips: ["Plank"], focus: "remove:Plank" });
  expect(after, "the write shows the stored list and does not move the focus").toEqual({ chips: ["Goblet Squat", "Plank"], focus: "remove:Plank" });
});

test("S1. « Clear » pressed during the read: the choice stays, and the focus stays on « Clear » through the write", async ({ page }) => {
  test.setTimeout(90_000);
  await conflictedIn(page, "AVAILABILITY", { splitPreference: "FULL_BODY" }, { splitPreference: "UPPER_LOWER", notes: "Theirs" });
  const split = page.locator('[data-intake-field="AVAILABILITY.splitPreference"]');
  const checked = () => split.locator('input[type="radio"]:checked').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  const gate = await gateRead(page, "continue");
  const button = alertOf(page, "conflict").getByRole("button", { name: T.en.reload, exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await split.locator("[data-intake-clear]").getByRole("button", { name: "Clear", exact: true }).click();
  await page.waitForTimeout(300);
  const during = { checked: await checked(), focus: await focusName(page) };
  const duringBeforeAnswer = !gate.answered();
  const got = readGet(page);
  gate.release();
  await got;
  await expect(alertOf(page, "conflict")).toHaveCount(0);
  await expect.poll(checked).toEqual(["UPPER_LOWER"]);
  await page.waitForTimeout(400);
  const after = { checked: await checked(), focus: await focusName(page) };
  process.stdout.write(`BUG1073 S1 clear during=${JSON.stringify(during)} before-answer=${duringBeforeAnswer} after=${JSON.stringify(after)}\n`);
  expect(duringBeforeAnswer).toBe(true);
  expect(during, "the clear is refused and the focus stays").toEqual({ checked: ["FULL_BODY"], focus: "clear" });
  expect(after, "the write shows the stored choice and does not move the focus").toEqual({ checked: ["UPPER_LOWER"], focus: "clear" });
});
