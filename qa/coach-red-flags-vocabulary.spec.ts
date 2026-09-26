import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 EV-187 AC4, THE RELEASE-BLOCKING ONE: the portal may not advertise a red-flag
 * rule that cannot fire.
 *
 * `RedFlag.PAIN_REPORTED` is published in b-fit-api's enum and has **never fired and
 * cannot**: session feedback is exactly {EASY, OK, HARD}, and `workout_completion.notes`
 * — the column a pain note would have to live in — is written by no mobile call site.
 * The only such detection in the product reads AI-chat free text, which the trainee did
 * not consent to share with a coach. **EV-082, which would create the signal, is not
 * scheduled**, so there is no date to promise and "coming soon" is not an option either.
 *
 * AC4 says the phrase appears **nowhere in the portal** — no legend, tooltip, filter or
 * empty state — and makes the grep release-blocking.
 *
 * **IT BINDS ON THE CONCEPT, NOT ON ONE SPELLING.** b-fit-api's equivalent guard
 * (`CoachMonitoringReadOnlyContractTest.FORBIDDEN_COPY`) started as the case-sensitive
 * literal "Reported pain" and a review walked through it three times over — "Pain
 * reported in a session", "reported pain" and "REPORTED PAIN" were all planted as live
 * copy and all three passed. A guard pinned to one syntactic form is worse than no
 * guard, because it reads as proof and stops anyone looking. This file uses that guard's
 * pattern verbatim, for the same reason, and the last test in this file is the WITNESS
 * for that claim rather than an assertion that it is so.
 *
 * `\W+` between the two halves is what keeps the identifier `PAIN_REPORTED` out of the
 * net: `_` is a word character, so the published enum constant — which the portal's
 * `RedFlagCode` union legitimately carries, because it is b-fit-api's wire vocabulary —
 * does not match, while every human-readable spelling of the phrase does.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const FORBIDDEN_COPY =
  /\bpain\w*\W+(?:\w+\W+){0,3}?report\w*|\breport\w*\W+(?:\w+\W+){0,3}?pain\w*/i;

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

/** Every `.ts`/`.tsx` file under `src/` — the whole of what can reach a coach. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** Every trainee the fixture can answer for — the flags surface on each of them. */
const TRAINEES = [
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001", // Lina — one flag, with evidence
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002", // Nils — no flags ("No red flags")
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003", // Sara — never weighed in
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006", // Petra — flags not shared
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009", // Tobias — BOTH live rules fired
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0010", // Kaia — no data at all
];

test("the source carries no copy advertising a pain rule, in any spelling", () => {
  const offenders = sourceFiles(SRC)
    .map((path) => ({ path, match: FORBIDDEN_COPY.exec(readFileSync(path, "utf8")) }))
    .filter((hit) => hit.match !== null)
    .map((hit) => `${hit.path.slice(ROOT.length + 1)} — "${hit.match?.[0]}"`);

  expect(
    offenders,
    "EV-187 AC4 is release-blocking: the portal may not name a red-flag rule that cannot " +
      "fire, in a label, a legend, a tooltip, a filter or an empty state. Nothing writes " +
      "workout_completion.notes, EV-082 is not scheduled, and there is no date to promise.\n" +
      offenders.join("\n")
  ).toEqual([]);
});

for (const id of TRAINEES) {
  test(`the rendered page for ${id.slice(-4)} never names a pain rule`, async ({ page }) => {
    await signIn(page);
    /**
     * `page.request` rather than the renderer: this is the whole server-rendered
     * document, comments and inlined RSC payload included, which is a strictly larger
     * surface than `body.textContent` and is what a coach's browser actually receives.
     */
    const response = await page.request.get(`/clients/${id}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const match = FORBIDDEN_COPY.exec(html);
    expect(match?.[0], `the rendered DOM for ${id} advertises a rule that cannot fire`).toBeUndefined();
  });
}

test("the roster never names a pain rule either", async ({ page }) => {
  await signIn(page);
  const html = await (await page.request.get("/")).text();
  expect(FORBIDDEN_COPY.exec(html)?.[0]).toBeUndefined();
});

/**
 * 🔬 **THE WITNESS.** The three tests above claim this guard catches the concept rather
 * than one spelling. That is a capability claim, and an unevidenced "it would catch it"
 * is the same defect as an unevidenced "it cannot happen" — so here is the constructed
 * example, in both directions.
 *
 * The four PLANTED spellings are the ones that defeated the api guard's first version.
 * The two ALLOWED strings are what must keep passing: the published enum constant (the
 * portal's `RedFlagCode` union carries it because it is b-fit-api's wire vocabulary),
 * and a sentence about injuries that has nothing to do with this rule.
 */
test("the guard binds on the concept, and not on one spelling", () => {
  const planted = [
    "Reported pain in a session",
    "reported pain",
    "REPORTED PAIN",
    "Pain reported",
    "Pain reported in a session",
    "pain was reported in a session",
    "reports of pain",
  ];
  for (const spelling of planted) {
    expect(
      FORBIDDEN_COPY.test(spelling),
      `"${spelling}" would reach a coach unnoticed — the guard is pinned to one form`
    ).toBe(true);
  }

  const allowed = [
    'PAIN_REPORTED',
    '"PAIN_REPORTED" | "NO_WEIGH_IN_14_DAYS"',
    "This routine was adjusted for their injuries.",
    "No weigh-in for 14 days",
  ];
  for (const fine of allowed) {
    expect(
      FORBIDDEN_COPY.test(fine),
      `"${fine}" is not the forbidden claim, and a guard that bans true lines gets deleted`
    ).toBe(false);
  }
});

/**
 * The file-walker cannot pass by finding nothing. It has been one grep away from
 * scanning an empty list twice in this repo's history (a moved directory, a changed
 * extension), and a guard that reads "no offenders" because it read no files is the one
 * failure nobody notices.
 */
test("the source scan actually read the portal's sources", () => {
  const files = sourceFiles(SRC);
  expect(files.length, "the src/ walk found no TypeScript at all").toBeGreaterThan(30);
  expect(
    files.map((f) => basename(f)),
    "copy.ts is where a red-flag label would live, so it must be in the scan"
  ).toContain("copy.ts");
});
