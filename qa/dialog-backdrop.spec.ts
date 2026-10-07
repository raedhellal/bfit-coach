import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-699 — a click on a dialog's backdrop closed EVERY portal dialog (`Modal`, kit.tsx) and
 * threw away what the coach had typed, with no warning.
 *
 * Expected, per dialog, in English and French, at 1440 and 390 px (at 390 the click lands in
 * the 12 px backdrop margin beside the dialog):
 *   (1) a field differs from its opening value → the backdrop click leaves the dialog open,
 *       every value as typed, the focus where it was, and nothing sent;
 *   (2) nothing differs (never touched, or typed and then erased back) → it closes as today;
 *   (3) × and « Annuler » / Cancel close and discard as today.
 * Escape is out of scope (the kit's `Modal` has no Escape handler).
 *
 * The three dialogs the row names: « Nouveau défi » (`CreateChallengeDialog`, built on
 * `useCoachForm`), « Ajouter un client » (`AddClientButton`) and « Enregistrer comme modèle »
 * (`SaveAsTemplateButton`). The default suite's `empty` scenario serves all three: the
 * challenge dialog has nobody to invite there, but its title and step goal are fields.
 *
 * Red on ba0ca15 (train/ev342-sprint1b) plus only the `data-modal-backdrop` attribute the hit
 * test reads: 20/20, every one at "a changed dialog stays open" / "one changed value holds the
 * dialog".
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const LINA_PLAN = "Intermediate Muscle Building Routine";

type Lang = "en" | "fr";

/** The words, verbatim from `src/lib/copy.ts` / `copy.fr.ts`. */
const WORDS = {
  en: {
    locale: "en-US",
    close: "Close",
    cancel: "Cancel",
    addClient: { opener: "Add a client", title: "Add a client", name: "Name", email: "Email address" },
    challenge: { opener: "New challenge", title: "New challenge", name: "Title", target: "Daily step goal" },
    template: {
      opener: "Save as template",
      title: "Save as template",
      name: "Template name",
      fromPlan: "From the published plan",
      fromDraft: "From your unpublished draft",
    },
    routine: { planName: "Plan name", saveDraft: "Save draft", draftBadge: "Draft — not yet published" },
    /** The email language the dialog opens on (the page's) and the other one. */
    language: { opening: "English", other: "Français" },
  },
  fr: {
    locale: "fr-FR",
    close: "Fermer",
    cancel: "Annuler",
    addClient: { opener: "Ajouter un client", title: "Ajouter un client", name: "Nom", email: "Adresse e-mail" },
    challenge: { opener: "Nouveau défi", title: "Nouveau défi", name: "Titre", target: "Objectif de pas par jour" },
    template: {
      opener: "Enregistrer comme modèle",
      title: "Enregistrer comme modèle",
      name: "Nom du modèle",
      fromPlan: "À partir du plan publié",
      fromDraft: "À partir de votre brouillon non publié",
    },
    routine: { planName: "Nom du plan", saveDraft: "Enregistrer le brouillon", draftBadge: "Brouillon — pas encore publié" },
    language: { opening: "Français", other: "English" },
  },
} as const;

type Words = (typeof WORDS)[Lang];

interface Case {
  label: string;
  path: string;
  opener: (w: Words) => string;
  title: (w: Words) => string;
  /** The fields this case changes, with the value it types. The LAST one keeps the focus. */
  edits: (w: Words) => { label: string; value: string }[];
}

const CASES: Case[] = [
  {
    label: "« Nouveau défi »",
    path: "/challenges",
    opener: (w) => w.challenge.opener,
    title: (w) => w.challenge.title,
    edits: (w) => [
      { label: w.challenge.target, value: "12000" },
      { label: w.challenge.name, value: "Octobre en marche" },
    ],
  },
  {
    label: "« Ajouter un client »",
    path: "/",
    opener: (w) => w.addClient.opener,
    title: (w) => w.addClient.title,
    edits: (w) => [
      { label: w.addClient.name, value: "Inès Martin" },
      { label: w.addClient.email, value: "ines.martin@example.com" },
    ],
  },
  {
    label: "« Enregistrer comme modèle »",
    path: `/clients/${LINA}/routine`,
    opener: (w) => w.template.opener,
    title: (w) => w.template.title,
    edits: (w) => [{ label: w.template.name, value: "Modèle de Lina, semaine 2" }],
  },
];

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/** The opener does nothing before hydration (the dialog is client-only): click until it opens. */
async function openDialog(page: Page, opener: string, title: string): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: opener, exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

/**
 * A click on the backdrop, BESIDE the dialog: 6 px from the left edge, half-way down, so at
 * 390 px it is the 12 px margin and the dialog is level with it. Hit-tested first (layout
 * assertions need an occlusion check): the topmost element there must be the kit's backdrop
 * (`data-modal-backdrop`, the dialog's sibling in the modal root), not the dialog or anything
 * above it. Base ba0ca15 has no such attribute, so its red run is made with that one
 * attribute added and nothing else: it then fails on the behaviour, not on the hook.
 */
async function clickBackdrop(page: Page) {
  const viewport = page.viewportSize()!;
  const x = 6;
  const y = Math.round(viewport.height / 2);
  const hit = await page.evaluate(
    ([px, py]) => {
      const dialog = document.querySelector('[role="dialog"]');
      const el = document.elementFromPoint(px, py);
      if (!dialog || !el) return "nothing there";
      if (dialog.contains(el)) return "the dialog itself";
      if (el.parentElement !== dialog.parentElement || !el.matches("[data-modal-backdrop]")) {
        return `not the backdrop: <${el.tagName.toLowerCase()}>`;
      }
      return "backdrop";
    },
    [x, y] as const
  );
  expect(hit, `the point (${x}, ${y}) is the backdrop`).toBe("backdrop");
  await page.mouse.click(x, y);
}

/**
 * Staff S1 — each clause of a hand-written `dirty` needs its own witness: changing ONE field
 * must hold the dialog, and putting that one value back must let it close. The main test
 * always changes every field it names, so a `dirty` that forgot a clause stayed green.
 */
async function holdsThenCloses(
  page: Page,
  dialog: Locator,
  change: () => Promise<void>,
  held: () => Promise<void>,
  restore: () => Promise<void>
) {
  await change();
  await clickBackdrop(page);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(dialog, "one changed value holds the dialog").toBeVisible();
  await held();
  await restore();
  await clickBackdrop(page);
  await expect(dialog, "that value put back = unchanged").toBeHidden();
}

/** A draft beside Lina's published plan, so « Save as template » offers both sources. */
async function saveADraft(page: Page, w: Words) {
  await page.goto(`/clients/${LINA}/routine`);
  const name = page.getByLabel(w.routine.planName, { exact: true });
  const save = page.getByRole("button", { name: w.routine.saveDraft, exact: true });
  // A fill before hydration is lost (qa/sign-in.ts): clear-then-fill until Save is live.
  await expect(async () => {
    await name.fill("");
    await name.fill("BUG-699 brouillon");
    await expect(save).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await save.click();
  await expect(page.getByText(w.routine.draftBadge, { exact: true })).toBeVisible();
}

for (const lang of ["en", "fr"] as const) {
  const w = WORDS[lang];
  for (const size of WIDTHS) {
    test.describe(`BUG-699 ${lang.toUpperCase()} at ${size.width} px`, () => {
      test.use({ locale: w.locale, viewport: size });

      for (const c of CASES) {
        test(`${c.label}: a changed dialog ignores the backdrop, an unchanged one closes, × and ${w.cancel} discard`, async ({
          page,
        }) => {
          await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!", lang });
          await page.goto(c.path);
          const edits = c.edits(w);

          // ── (2) never touched: the backdrop closes it, as today ─────────────────────
          let dialog = await openDialog(page, c.opener(w), c.title(w));
          const opening: string[] = [];
          for (const e of edits) opening.push(await dialog.getByLabel(e.label, { exact: true }).inputValue());
          if (c.path.includes("/routine")) expect(opening[0], "pre-named with the plan's name").toBe(LINA_PLAN);
          await clickBackdrop(page);
          await expect(dialog).toBeHidden();

          // ── (1) changed: the backdrop click does nothing at all ───────────────────────
          dialog = await openDialog(page, c.opener(w), c.title(w));
          for (const e of edits) await dialog.getByLabel(e.label, { exact: true }).fill(e.value);
          const last = dialog.getByLabel(edits[edits.length - 1].label, { exact: true });
          await expect(last).toBeFocused();

          const sent: string[] = [];
          const onRequest = (req: { method(): string; url(): string }) => {
            if (req.method() !== "GET") sent.push(`${req.method()} ${req.url()}`);
          };
          page.on("request", onRequest);
          await clickBackdrop(page);
          // A settle point that is not the thing asserted: a close is a synchronous state
          // update, so one animation frame later it has rendered if it was going to.
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          await expect(dialog, "a changed dialog stays open").toBeVisible();
          for (const e of edits) {
            await expect(dialog.getByLabel(e.label, { exact: true }), `${e.label} keeps what was typed`).toHaveValue(e.value);
          }
          await expect(last, "the focus stays in the field").toBeFocused();
          page.off("request", onRequest);
          expect(sent, "nothing is sent").toEqual([]);

          // ── (2) typed, then erased back to the opening values: unchanged, so it closes ──
          for (const [i, e] of edits.entries()) await dialog.getByLabel(e.label, { exact: true }).fill(opening[i]);
          await clickBackdrop(page);
          await expect(dialog, "erased back to the opening values = unchanged").toBeHidden();

          // ── (3) × closes a changed dialog and discards ──────────────────────────────
          dialog = await openDialog(page, c.opener(w), c.title(w));
          for (const e of edits) await dialog.getByLabel(e.label, { exact: true }).fill(e.value);
          await dialog.getByRole("button", { name: w.close, exact: true }).click();
          await expect(dialog).toBeHidden();

          // ── (3) Cancel too, and the next opening starts from the opening values ───────
          dialog = await openDialog(page, c.opener(w), c.title(w));
          for (const [i, e] of edits.entries()) {
            await expect(dialog.getByLabel(e.label, { exact: true }), "× discarded the typed value").toHaveValue(opening[i]);
          }
          for (const e of edits) await dialog.getByLabel(e.label, { exact: true }).fill(e.value);
          await dialog.getByRole("button", { name: w.cancel, exact: true }).click();
          await expect(dialog).toBeHidden();
        });
      }

      test("« Ajouter un client »: the email alone, then the language alone, hold the dialog", async ({ page }) => {
        await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!", lang });
        await page.goto("/");

        let dialog = await openDialog(page, w.addClient.opener, w.addClient.title);
        const email = dialog.getByLabel(w.addClient.email, { exact: true });
        await holdsThenCloses(
          page,
          dialog,
          () => email.fill("ines.martin@example.com"),
          async () => {
            await expect(email).toHaveValue("ines.martin@example.com");
            await expect(email).toBeFocused();
            await expect(dialog.getByLabel(w.addClient.name, { exact: true })).toHaveValue("");
          },
          () => email.fill("")
        );

        dialog = await openDialog(page, w.addClient.opener, w.addClient.title);
        const opening = dialog.getByRole("radio", { name: w.language.opening, exact: true });
        const other = dialog.getByRole("radio", { name: w.language.other, exact: true });
        await expect(opening, "the email language opens on the page's").toBeChecked();
        await holdsThenCloses(
          page,
          dialog,
          () => other.check(),
          () => expect(other).toBeChecked(),
          () => opening.check()
        );
      });

      test("« Enregistrer comme modèle »: the source alone holds the dialog", async ({ page }) => {
        await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!", lang });
        await saveADraft(page, w);

        const dialog = await openDialog(page, w.template.opener, w.template.title);
        const fromPlan = dialog.getByRole("radio", { name: w.template.fromPlan, exact: true });
        const fromDraft = dialog.getByRole("radio", { name: w.template.fromDraft, exact: true });
        await expect(fromPlan, "the dialog opens on the published plan").toBeChecked();
        await holdsThenCloses(
          page,
          dialog,
          () => fromDraft.check(),
          async () => {
            await expect(fromDraft).toBeChecked();
            await expect(dialog.getByLabel(w.template.name, { exact: true })).toHaveValue(LINA_PLAN);
          },
          () => fromPlan.check()
        );
      });
    });
  }
}
