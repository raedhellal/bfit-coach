import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";

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

/**
 * 🔴 THE SAME CONCEPT IN FRENCH (EV-337, staff 2026-10-02: the scan above was English-only,
 * and the portal has spoken French by default since the Evoli Pro redesign). The design
 * drew « Douleur genou signalée » and « Douleur 6/10 »; AC4 forbids both in either language.
 *
 * Built from strings so the classes are Unicode-aware (`u`): `\w` and `\b` are ASCII-only,
 * and French words end in « é ». « douleur » alone is not banned: a trainee's own injury note
 * can say it, and that text is theirs. Two patterns:
 *
 *   · FORBIDDEN_COPY_FR — « douleur » within a few words of a REPORTED form, either order
 *     (« douleur genou signalée », « signalement de douleur », « douleurs déclarées », « une
 *     douleur a été rapportée »). The reported forms are participles, nouns and the third
 *     person, never the stem: the stem flagged ordinary French (« par rapport à la douleur »,
 *     « qui remonte à 2019 », « Signalez toute douleur à votre médecin »; staff S3).
 *   · PAIN_SCORE — a pain score in either language, with the score as a number, a template
 *     slot (`${n}`) or a JSX expression (`{x}`), « /10 » or « sur 10 », and React's SSR text
 *     seam `<!-- -->` or `&nbsp;` between the parts: a JSX `Douleur {x}/10` is rendered as
 *     `Douleur <!-- -->6<!-- -->/10`, which a digits-only pattern never saw (staff B1).
 *
 * KNOWN MISSES, stated so nobody reads this as complete: a pain claim without the word
 * « douleur » (« Mal au genou signalé », « Gêne signalée »), with a verb outside the list
 * (« Douleur ressentie »), or a score without its scale (« Niveau de douleur : 7 »).
 */
const W = "[\\p{L}\\p{N}_]";
/** A separator: a non-word character, an `&nbsp;` entity (React's `<!-- -->` is all non-word). */
const SEP = "(?:[^\\p{L}\\p{N}_]|&nbsp;)";
const REPORTED =
  "(?:signal(?:ements?|ée?s?|e|ent)|d[ée]clar(?:ations?|ée?s?|e|ent)|rapport(?:ée?s?|e|ent)|indiqu(?:ée?s?))(?![\\p{L}\\p{N}_])";
const FORBIDDEN_COPY_FR = new RegExp(
  `(?<!${W})douleur${W}*(?:${SEP}+${W}+){0,3}?${SEP}+${REPORTED}` +
    `|(?<!${W})${REPORTED}(?:${SEP}+${W}+){0,4}?${SEP}+douleur`,
  "iu"
);
const SLOT = "(?:\\d{1,2}|\\$\\{[^}]*\\}|\\{[^}]*\\})";
const SCALE = `${SEP}*(?:/|sur|out${SEP}+of)${SEP}*10(?!\\d)`;
const PAIN_SCORE = new RegExp(
  `(?<!${W})(?:douleur|pain)${W}*(?:${SEP}+${W}+){0,3}?${SEP}+${SLOT}${SCALE}` +
    `|(?<!${W})${SLOT}${SCALE}(?:${SEP}+${W}+){0,1}?${SEP}+(?:douleur|pain)`,
  "iu"
);

function firstForbidden(text: string): string | undefined {
  return (FORBIDDEN_COPY.exec(text) ?? FORBIDDEN_COPY_FR.exec(text) ?? PAIN_SCORE.exec(text))?.[0];
}

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
  await signInThroughForm(page, { email: EMAIL, password: PASSWORD });
}

/** Every trainee the fixture can answer for — the flags surface on each of them. */
const TRAINEES = [
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001", // Lina — one flag, with evidence
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002", // Nils — no flags ("No red flags")
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003", // Sara — never weighed in
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006", // Petra — flags not shared
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009", // Tobias — BOTH live rules fired
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0010", // Kaia — no data at all
  // EV-337m M4: an overview whose wire says `["PAIN_REPORTED"]` (no api sends it today) —
  // the page must not name a pain signal even then.
  "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0021", // Pablo
];

test("the source carries no copy advertising a pain rule, in any spelling", () => {
  const offenders = sourceFiles(SRC)
    .map((path) => ({ path, match: firstForbidden(readFileSync(path, "utf8")) }))
    .filter((hit) => hit.match !== undefined)
    .map((hit) => `${hit.path.slice(ROOT.length + 1)} — "${hit.match}"`);

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
    expect(firstForbidden(html), `the rendered DOM for ${id} advertises a rule that cannot fire`).toBeUndefined();
  });
}

/**
 * The same pages in FRENCH — the portal's default language. `page.request` carries the
 * context's locale as `Accept-Language` (qa/fixture-test.ts), and the check that the page
 * really IS French keeps the scan from passing on an English document.
 */
test.describe("in French", () => {
  test.use({ locale: "fr-FR" });
  for (const id of TRAINEES) {
    test(`the French pages for ${id.slice(-4)} never name a pain signal`, async ({ page }) => {
      await signInFrench(page);
      for (const path of [`/clients/${id}`, `/clients/${id}/routine`]) {
        const response = await page.request.get(path);
        expect(response.status()).toBe(200);
        const html = await response.text();
        expect(html, `${path} is served in French`).toContain('lang="fr"');
        expect(firstForbidden(html), `the French DOM of ${path} advertises a rule that cannot fire`).toBeUndefined();
      }
    });
  }
  test("the French roster never names one either", async ({ page }) => {
    await signInFrench(page);
    const html = await (await page.request.get("/")).text();
    expect(html).toContain('lang="fr"');
    expect(firstForbidden(html)).toBeUndefined();
  });
});

test("the roster never names a pain rule either", async ({ page }) => {
  await signIn(page);
  const html = await (await page.request.get("/")).text();
  expect(firstForbidden(html)).toBeUndefined();
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

  // French and score forms — the design's own strings first (EV-337, G4).
  const plantedFr = [
    "Douleur genou signalée",
    "Séances manquées · Douleur genou signalée",
    "douleur signalée",
    "DOULEUR SIGNALÉE",
    "Signalement de douleur",
    "douleurs déclarées",
    "une douleur a été rapportée",
    "Douleur 6/10",
    "Douleur : 6 / 10",
    "Pain 7/10",
    "Douleur 6 sur 10",
    "Douleur&nbsp;6/10",
    "6/10 de douleur",
    "Signalé : douleur au genou",
    "Douleur (genou) — signalée",
    "le client rapporte une douleur",
    // Staff B1's three, and what SSR makes of a JSX score.
    "painScore: (n) => `Douleur ${n}/10`",
    "<span>Douleur {x}/10</span>",
    "`Niveau de douleur : ${n} sur 10`",
    "Douleur <!-- -->6<!-- -->/10",
  ];
  for (const spelling of plantedFr) {
    expect(firstForbidden(spelling), `"${spelling}" would reach a coach unnoticed`).toBeDefined();
  }

  const allowed = [
    'PAIN_REPORTED',
    '"PAIN_REPORTED" | "NO_WEIGH_IN_14_DAYS"',
    "This routine was adjusted for their injuries.",
    "No weigh-in for 14 days",
    // A trainee's own injury note, and the editor's French sentence about flagged FIELDS.
    "Douleur à l'épaule gauche",
    "Complétez les champs signalés ci-dessus pour enregistrer.",
    "Aucune pesée depuis 14 jours",
    "6/10 séances",
    // Ordinary French the stems used to flag (staff S3).
    "Douleur au genou qui remonte à 2019",
    "Par rapport à la douleur, adaptez la charge",
    "Signalez toute douleur à votre médecin",
    "Indiquez si la séance était trop dure. Douleur ou gêne : consultez.",
  ];
  for (const fine of allowed) {
    expect(
      firstForbidden(fine) !== undefined,
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
