import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { holdNextAction } from "./hold-action";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-171 (P2) — the kit's `Modal` (kit.tsx) said `aria-modal="true"` and implemented none of
 * the APG dialog contract: no Escape, no focus trap, no focus restore, on every portal dialog.
 *
 * The register's check, per dialog, keyboard only, at 390 and 1440 px:
 *   K1 the dialog is a modal dialog named by its title: `role="dialog"`, `aria-modal="true"`,
 *      `aria-labelledby` pointing at the rendered title inside it;
 *   K2 opening it moves focus INTO it (and onto its first field where it has one);
 *   K3 Tab and Shift+Tab cycle within it — never one stop on the page behind — and wrap;
 *   K4 Escape closes it;
 *   K5 focus returns to the control that opened it — or, for « Revoke access », whose menu item
 *      is gone once the dialog opens, to the ⋮ « More » button that holds the menu.
 * K5 is the discriminating assertion (an Escape-only fix passes K1–K4).
 *
 * The nine dialogs the row names were eight `<Modal>` call sites at `ca3c5fc` — publish preview,
 * discard, revoke, invite, save-targets, apply-week, swap, catalogue — plus « regenerate », which
 * has no dialog (« Regenerate day » acts directly). All eight are here, with five later dialogs
 * built on the same `Modal`. `qa/modal-contract.spec.ts` holds that every dialog in `src/` IS
 * that `Modal`, and its unit half holds the rules a page cannot reach (nesting, a caller's own
 * focus move, StrictMode).
 *
 * K6 Escape is the dialog's own `onClose`, so a dialog that refuses to close while its request
 *    is in flight (« Apply this meal week? », Cancel disabled) refuses Escape too.
 * K7 a CHANGED dialog ignores Escape, as it ignores a backdrop click (after BUG-699/702: only ×
 *    and Cancel may discard what the coach typed; orchestrator ruling (BUG-171 staff r2), to be recorded by senior-po on BUG-171's row).
 * K8 the two dialogs that opt out (`escapeIgnoresDirty`) — whose `dirty` is search text only —
 *    close on Escape with a search typed, and their backdrop still ignores a click then.
 *
 * Red on `bfb4164` (main, before this fix) with only these two files added: 27 of 27 here — 22
 * cases at K2 (focus stays on the opener), 4 at K3 (« Add a client » and « Swap meal » autofocus
 * a field, then Tab #5 / #7 walks out onto the page), K6 at its focus return; and
 * `qa/modal-contract.spec.ts` U1–U7, 7 of 7 (C1/C2 are guards, green on both).
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

interface Case {
  label: string;
  path: string;
  /** Anything to do on the page before the opener is reachable. */
  prepare?: (page: Page) => Promise<void>;
  /** The control that opens the dialog. */
  opener: (page: Page) => Locator;
  /** Where focus must return (default: the opener). */
  returnsTo?: (page: Page) => Locator;
  /** Open through an intermediate control (a menu) — returns the dialog's real opener. */
  via?: (page: Page) => Locator;
  /** The element focus must land on when the dialog opens (default: anywhere inside it). */
  initial?: (dialog: Locator) => Locator;
  /**
   * A control that is enabled only once the dialog's request has settled. Only the publish
   * preview needs one: it can appear before its transition settles, and its onClose refuses
   * while pending (K6's refusal, correct and not what K4 asks).
   */
  settled?: (dialog: Locator) => Locator;
}

async function saveADraft(page: Page) {
  const name = page.getByLabel("Plan name", { exact: true });
  const save = page.getByRole("button", { name: "Save draft", exact: true });
  await expect(async () => {
    await name.fill("");
    await name.fill("BUG-171 draft");
    await expect(save).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await save.click();
  await expect(page.getByText("Draft — not yet published", { exact: true })).toBeVisible();
}

async function editTargets(page: Page) {
  const edit = page.getByRole("button", { name: "Edit targets", exact: true });
  const calories = page.getByLabel("Calories", { exact: true });
  await expect(async () => {
    if (!(await calories.isVisible())) await edit.click();
    await expect(calories).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await calories.fill("2300");
}

const close = (dialog: Locator) => dialog.getByRole("button", { name: "Close", exact: true });

const CASES: Case[] = [
  // ── the eight call sites of ca3c5fc ─────────────────────────────────────────────────
  {
    label: "publish preview",
    path: `/clients/${LINA}/routine`,
    opener: (p) => p.getByRole("button", { name: "Publish", exact: true }),
    settled: (d) => d.getByRole("button", { name: /^Publish/ }),
  },
  {
    label: "« Discard draft? »",
    path: `/clients/${LINA}/routine`,
    prepare: saveADraft,
    opener: (p) => p.getByRole("button", { name: "Discard draft", exact: true }),
  },
  {
    label: "« Revoke access? »",
    path: `/clients/${LINA}`,
    opener: (p) => p.getByRole("button", { name: "More", exact: true }),
    via: (p) => p.getByRole("menuitem", { name: "Revoke access" }),
    initial: close,
  },
  {
    label: "« Invite a trainee »",
    path: "/",
    opener: (p) => p.getByRole("button", { name: "Invite a trainee", exact: true }),
  },
  {
    label: "« Save targets? »",
    path: `/clients/${LINA}/nutrition`,
    prepare: editTargets,
    opener: (p) => p.getByRole("button", { name: "Save targets", exact: true }),
    initial: close,
  },
  {
    label: "« Apply this meal week? »",
    path: `/clients/${LINA}/nutrition`,
    opener: (p) => p.getByRole("button", { name: "Apply to Lina M.", exact: true }),
    initial: close,
  },
  {
    label: "« Swap meal »",
    path: `/clients/${LINA}/nutrition`,
    opener: (p) => p.getByRole("button", { name: /^Swap meal: / }).first(),
  },
  {
    label: "catalogue picker",
    path: `/clients/${LINA}/routine`,
    opener: (p) => p.getByRole("button", { name: "Add exercise", exact: true }).first(),
    initial: (d) => d.getByLabel("Search the catalog", { exact: true }),
  },
  // ── later dialogs on the same Modal ────────────────────────────────────────────────
  {
    label: "« Add a client »",
    path: "/",
    opener: (p) => p.getByRole("button", { name: "Add a client", exact: true }),
    initial: (d) => d.getByLabel("Name", { exact: true }),
  },
  {
    label: "« New challenge »",
    path: "/challenges",
    opener: (p) => p.getByRole("button", { name: "New challenge", exact: true }),
    initial: (d) => d.getByLabel("Title", { exact: true }),
  },
  {
    label: "« Save as template »",
    path: `/clients/${LINA}/routine`,
    opener: (p) => p.getByRole("button", { name: "Save as template", exact: true }),
  },
  {
    label: "« Delete recipe? »",
    path: "/recipes",
    opener: (p) => p.getByRole("button", { name: "Delete", exact: true }).first(),
    initial: close,
  },
  {
    label: "« Use on a trainee »",
    path: "/templates",
    opener: (p) => p.getByRole("button", { name: "Use on a trainee", exact: true }).first(),
  },
];

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/** The element that has focus, as "inside" / "outside: <tag> name" / "body". */
async function focusIs(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const a = document.activeElement;
    if (!a || a === document.body) return "body";
    if (dialog && dialog.contains(a) && a !== dialog) return "inside";
    return `outside: <${a.tagName.toLowerCase()}> ${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 40)}`;
  });
}

/** Focus `control` and press Enter — a keyboard user's way in — until `appears` is visible. */
async function pressUntil(page: Page, control: Locator, appears: Locator) {
  await expect(async () => {
    if (!(await appears.isVisible())) {
      await control.focus();
      await page.keyboard.press("Enter");
    }
    await expect(appears).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function openByKeyboard(page: Page, c: Case): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  const opener = c.opener(page);
  await expect(opener).toBeVisible();
  if (c.via) {
    const item = c.via(page);
    await pressUntil(page, opener, item);
    await pressUntil(page, item, dialog);
  } else {
    await pressUntil(page, opener, dialog);
  }
  return dialog;
}

/** Tab (or Shift+Tab) until focus wraps to where it started; every stop must be inside. */
async function cycles(page: Page, dialog: Locator, key: "Tab" | "Shift+Tab") {
  // Recounted at every press: a list that loads after opening (the catalogue) grows the cycle.
  const bound = () =>
    dialog.evaluate((d) => d.querySelectorAll("a[href],button,input,select,textarea,[tabindex]").length * 3 + 3);
  const start = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    a.dataset.k171 = "start";
    return a.tagName;
  });
  expect(start).not.toBe("BODY");
  let wrapped = false;
  for (let i = 0; i < (await bound()); i++) {
    await page.keyboard.press(key);
    expect(await focusIs(page), `${key} #${i + 1} stays inside the dialog`).toBe("inside");
    if (await page.evaluate(() => (document.activeElement as HTMLElement).dataset.k171 === "start")) {
      wrapped = true;
      break;
    }
  }
  await page.evaluate(() => document.querySelector("[data-k171]")?.removeAttribute("data-k171"));
  expect(wrapped, `${key} comes back round to where it started`).toBe(true);
}

for (const size of WIDTHS) {
  test.describe(`BUG-171 at ${size.width} px`, () => {
    test.use({ viewport: size });

    for (const c of CASES) {
      test(`${c.label}: named modal, focus in, Tab trapped, Escape closes, focus back`, async ({ page }) => {
        await signInThroughForm(page);
        await page.goto(c.path);
        await c.prepare?.(page);

        const dialog = await openByKeyboard(page, c);

        // K1 — a modal dialog, named by the title it renders.
        await expect(dialog).toHaveAttribute("aria-modal", "true");
        const named = await dialog.evaluate((d) => {
          const id = d.getAttribute("aria-labelledby");
          const title = id ? document.getElementById(id) : null;
          return title && d.contains(title) ? (title.textContent || "").trim() : null;
        });
        expect(named, "aria-labelledby points at a title inside the dialog").toBeTruthy();
        await expect(dialog).toHaveAccessibleName(named!);

        // K2 — focus moved in.
        await expect.poll(() => focusIs(page), { message: "focus is inside the dialog on open" }).toBe("inside");
        if (c.initial) await expect(c.initial(dialog), "the dialog's first stop has focus").toBeFocused();

        // K3 — Tab and Shift+Tab cycle within it.
        await cycles(page, dialog, "Tab");
        await cycles(page, dialog, "Shift+Tab");

        // K4 — one Escape closes it, once the dialog is not busy (`settled`, publish preview only).
        if (c.settled) await expect(c.settled(dialog), "the dialog's request has settled").toBeEnabled();
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);

        // K5 — focus is back where the coach was.
        const back = (c.returnsTo ?? c.opener)(page);
        await expect(back, "focus returns to the control that opened the dialog").toBeFocused();
      });
    }
  });
}

test.describe("BUG-171 K6", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Escape does not close « Apply this meal week? » while the apply is in flight; the dialog then closes and focus goes back to « Apply to … »", async ({
    page,
  }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${LINA}/nutrition`);
    const opener = page.getByRole("button", { name: "Apply to Lina M.", exact: true });
    const dialog = page.getByRole("dialog");
    await pressUntil(page, opener, dialog);

    const held = await holdNextAction(page);
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await held.reached;
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true }), "Cancel is disabled in flight").toBeDisabled();
    await page.keyboard.press("Escape");
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(dialog, "Escape is refused like Cancel and ×").toBeVisible();
    held.release();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe("BUG-171 K7", () => {
  for (const size of WIDTHS) {
    test.describe(`at ${size.width} px`, () => {
      test.use({ viewport: size });

      test("Escape on « New challenge » with a typed title keeps the dialog and the title; Cancel then closes it and focus goes back", async ({
        page,
      }) => {
        await signInThroughForm(page);
        await page.goto("/challenges");
        const opener = page.getByRole("button", { name: "New challenge", exact: true });
        const dialog = page.getByRole("dialog", { name: "New challenge", exact: true });
        await pressUntil(page, opener, dialog);
        const title = dialog.getByLabel("Title", { exact: true });
        await expect(title).toBeFocused();
        await page.keyboard.type("Octobre en marche");

        await page.keyboard.press("Escape");
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await expect(dialog, "a changed dialog stays open on Escape").toBeVisible();
        await expect(title, "what was typed is kept").toHaveValue("Octobre en marche");
        await expect(title, "and the focus stays in the field").toBeFocused();

        // Erased back to its opening value, it is unchanged again: Escape closes.
        await title.fill("");
        await page.keyboard.press("Escape");
        await expect(dialog, "unchanged again: Escape closes").toHaveCount(0);
        await expect(opener).toBeFocused();

        // Cancel still discards a changed dialog.
        await pressUntil(page, opener, dialog);
        await page.keyboard.type("Octobre en marche");
        await dialog.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
      });
    });
  }
});

test.describe("BUG-171 K8", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** A click on the backdrop beside the dialog, hit-tested as qa/dialog-backdrop.spec.ts does. */
  async function clickBackdrop(page: Page) {
    const x = 6;
    const y = Math.round(page.viewportSize()!.height / 2);
    const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.matches("[data-modal-backdrop]") ?? false, [x, y] as const);
    expect(hit, "the point is the backdrop").toBe(true);
    await page.mouse.click(x, y);
  }

  const OPT_OUTS = [
    {
      label: "« Swap meal »",
      path: `/clients/${LINA}/nutrition`,
      opener: (p: Page) => p.getByRole("button", { name: /^Swap meal: / }).first(),
      search: "Search your recipes",
    },
    {
      label: "catalogue picker",
      path: `/clients/${LINA}/routine`,
      opener: (p: Page) => p.getByRole("button", { name: "Add exercise", exact: true }).first(),
      search: "Search the catalog",
    },
  ];

  for (const c of OPT_OUTS) {
    test(`${c.label}: with a search typed, the backdrop is ignored and Escape closes; focus back on the opener`, async ({ page }) => {
      await signInThroughForm(page);
      await page.goto(c.path);
      const opener = c.opener(page);
      const dialog = page.getByRole("dialog");
      await pressUntil(page, opener, dialog);
      const search = dialog.getByLabel(c.search, { exact: true });
      await expect(search).toBeFocused();
      await page.keyboard.type("zzz");
      await expect(search).toHaveValue("zzz");

      // BUG-699 unchanged: the typed search holds the dialog against a backdrop click.
      await clickBackdrop(page);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await expect(dialog, "the backdrop still ignores a dirty dialog").toBeVisible();
      await expect(search).toHaveValue("zzz");

      // The opt-out: Escape closes it anyway — only the search text is lost.
      await page.keyboard.press("Escape");
      await expect(dialog, "Escape closes it with a search typed").toHaveCount(0);
      await expect(opener).toBeFocused();
    });
  }
});
