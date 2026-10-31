import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { openEveryDay } from "./day-accordion";

/**
 * BUG-736 — a keystroke inside the save's own history step, before React has committed the
 * save's clean render.
 *
 * A save that leaves nothing unsaved hands the guard's history entry back with
 * `history.back()` from inside its callback, in the same task as the state that clears the
 * form. A keystroke landing after that call and before the clean render commits is batched with
 * it, so the form's unsaved flag never changes value. On `315d11cf` the guard then held no entry
 * while the field showed text the server was never sent: Back left with no question and the
 * edit was lost (step (0) rig, hub `docs/qa/evidence/2026-10-30-bug736/`).
 *
 * The mechanism is the rig's (`zz-s3g-730.spec.ts` « · keystroke natural », and the natural
 * rows of `zz-s3g-730b.spec.ts`): the app's own `history.back()` runs unchanged, and one
 * keystroke is dispatched into the field at `setTimeout(0)` after it. At that keystroke the test
 * records:
 *
 *   · `guardAtType` — the guard's entry is still the current one, so the keystroke is inside
 *     the step (the traversal answers a few milliseconds later);
 *   · `badgeAtType` — on the two editors that render « Unsaved changes »: the clean render has
 *     not committed yet;
 *
 * and, once the page has settled, `holdsKeystroke` — the field still shows the keystroke, i.e.
 * text the server was not sent. A run REACHED the window when `guardAtType` and `holdsKeystroke`
 * are both true (BUG-736 (cs-iii)); on the badge editors a run where `guardAtType` and
 * `badgeAtType` disagree is recorded as `excluded`. All of it is attached as annotations, so a
 * `--reporter=json` run can be counted: a case whose window is never reached proves nothing.
 *
 * Asserted in EVERY run, reached or not: when the field holds text the server was not sent,
 * Back asks exactly once and the URL does not change. Then « Stay on this page » keeps the text
 * and the URL, a second Back asks again, and « Leave without saving » lands on the page a Back
 * with no unsaved work reaches, in one step, asking nothing more. The app calls
 * `history.back()` once for the save and never again on the first Back; on the creates the
 * history length does not change across that Back.
 *
 * Chromium only, default config. Copy is literal, never imported from `src/lib/copy*.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const LEAVE = "Leave with unsaved changes?";
const leaveDialog = (page: Page) => page.getByRole("dialog", { name: LEAVE, exact: true });

/** Installed before any page script; the counters live in sessionStorage. */
async function instrument(context: BrowserContext) {
  await context.addInitScript(() => {
    const ss = window.sessionStorage;
    const bump = (key: string) => ss.setItem(key, String(Number(ss.getItem(key) || "0") + 1));
    // Every distinct mount of the leave question.
    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const dialog of Array.from(document.querySelectorAll('[role="dialog"]'))) {
        if (seen.has(dialog)) continue;
        if ((dialog.textContent || "").includes("Leave with unsaved changes?")) {
          seen.add(dialog);
          bump("bug736Asks");
        }
      }
    };
    new MutationObserver(scan).observe(document, { childList: true, subtree: true });
    const back = window.history.back.bind(window.history);
    window.history.back = () => {
      bump("bug736Backs");
      back();
      if (ss.getItem("bug736Arm") !== "1") return;
      window.setTimeout(() => {
        const el = document.querySelector("[data-bug736-type]") as HTMLInputElement | null;
        if (!el) return;
        ss.setItem("bug736Arm", "0");
        ss.setItem("bug736GuardAtType", String(window.history.state?.evoliUnsavedGuard === true));
        ss.setItem("bug736BadgeAtType", String(document.body.innerText.includes("Unsaved changes")));
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(el, el.value + "x");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        bump("bug736Typed");
      }, 0);
    };
  });
}

async function counters(page: Page) {
  return page.evaluate(() => ({
    asks: Number(sessionStorage.getItem("bug736Asks") || "0"),
    backs: Number(sessionStorage.getItem("bug736Backs") || "0"),
    typed: Number(sessionStorage.getItem("bug736Typed") || "0"),
    guardAtType: sessionStorage.getItem("bug736GuardAtType"),
    badgeAtType: sessionStorage.getItem("bug736BadgeAtType"),
    len: window.history.length,
  }));
}

/** Back, allowed to time out: while the guard holds, the document does not change. */
async function back(page: Page) {
  await page.goBack({ timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(700);
}

async function armed(page: Page) {
  await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard === true, null, { timeout: 1500 });
}

interface Flow {
  name: string;
  /** Opens the form from the page a clean Back returns to; returns that page's path. */
  open(page: Page): Promise<string>;
  field(page: Page): Locator;
  /** Makes the form dirty and valid; returns the field's text the save sends. */
  fill(page: Page): Promise<string>;
  save(page: Page): Promise<void>;
  /** The page the coach is on after the save. */
  on: RegExp;
  /** Renders « Unsaved changes ». */
  badge: boolean;
  create: boolean;
}

/** The coach's way in to a create: the list, then its « New » control. */
async function viaNew(page: Page, list: string, label: string) {
  await page.goto("/");
  await page.goto(list);
  await expect(async () => {
    await page
      .getByRole("main")
      .getByRole("button", { name: label, exact: true })
      .or(page.getByRole("main").getByRole("link", { name: label, exact: true }))
      .first()
      .click({ timeout: 2000 });
    await page.waitForURL(new RegExp(`${list}/new$`), { timeout: 3000 });
  }).toPass({ timeout: 25_000 });
}

async function editFromList(page: Page, list: string, row: RegExp) {
  await page.goto("/");
  await page.goto(list);
  await expect(async () => {
    await page.getByRole("link", { name: row }).first().click({ timeout: 2000 });
    await page.waitForURL(new RegExp(`${list}/[0-9a-f-]{36}$`), { timeout: 3000 });
  }).toPass({ timeout: 25_000 });
}

/** First edit of a field, retried until the guard has armed (hydration may still be running). */
async function firstEdit(page: Page, field: Locator, text: string) {
  await expect(async () => {
    await field.fill(text);
    await armed(page);
  }).toPass({ timeout: 25_000 });
  return text;
}

const FLOWS: Flow[] = [
  {
    name: "training template create",
    async open(page) {
      await viaNew(page, "/templates", "New template");
      return "/templates";
    },
    field: (page) => page.getByLabel("Template name"),
    async fill(page) {
      const sent = await firstEdit(page, page.getByLabel("Template name"), "QA 736 template");
      for (const day of [0, 1]) {
        await openEveryDay(page);
        await page.getByRole("group", { name: `Day ${day + 1}`, exact: true }).getByRole("button", { name: "Add exercise" }).click();
        const picker = page.getByRole("dialog");
        await expect(picker.locator("button[title]").nth(1)).toBeVisible();
        for (let i = 0; i < 2; i += 1) await picker.locator("button[title]").nth(i).click();
        await picker.getByRole("button").first().click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      return sent;
    },
    save: (page) => page.getByRole("button", { name: "Save template" }).click(),
    on: /\/templates\/[0-9a-f-]{36}$/,
    badge: true,
    create: true,
  },
  {
    name: "recipe create",
    async open(page) {
      await viaNew(page, "/recipes", "New recipe");
      return "/recipes";
    },
    field: (page) => page.getByLabel("Recipe name"),
    async fill(page) {
      const sent = await firstEdit(page, page.getByLabel("Recipe name"), "QA 736 skyr");
      await page.getByLabel("Find an ingredient").fill("greek");
      await page.getByRole("button", { name: "Add greek yogurt", exact: true }).click();
      await page.getByRole("group", { name: "greek yogurt", exact: true }).getByLabel("Quantity").fill("200");
      await page.getByLabel("Calories (kcal)").fill("245");
      await page.getByLabel("Protein (g)").fill("20");
      await page.getByLabel("Carbs (g)").fill("30");
      await page.getByLabel("Fat (g)").fill("5");
      return sent;
    },
    save: (page) => page.getByRole("button", { name: "Save recipe" }).click(),
    on: /\/recipes\/[0-9a-f-]{36}$/,
    badge: true,
    create: true,
  },
  {
    name: "training template update",
    async open(page) {
      await editFromList(page, "/templates", /^Edit/);
      return "/templates";
    },
    field: (page) => page.getByLabel("Template name"),
    fill: (page) => firstEdit(page, page.getByLabel("Template name"), "QA 736 T"),
    save: (page) => page.getByRole("button", { name: "Save template" }).click(),
    on: /\/templates\/[0-9a-f-]{36}$/,
    badge: true,
    create: false,
  },
  {
    name: "recipe update",
    async open(page) {
      await editFromList(page, "/recipes", /^Edit$/);
      return "/recipes";
    },
    field: (page) => page.getByLabel("Recipe name"),
    fill: (page) => firstEdit(page, page.getByLabel("Recipe name"), "QA 736 R"),
    save: (page) => page.getByRole("button", { name: "Save recipe" }).click(),
    on: /\/recipes\/[0-9a-f-]{36}$/,
    badge: true,
    create: false,
  },
  {
    name: "nutrition template update",
    async open(page) {
      // The default suite's EMPTY scenario has no nutrition template: make one through the UI.
      await page.goto("/");
      await page.goto("/nutrition-templates/new");
      await firstEdit(page, page.getByLabel("Template name"), "Cut 1800");
      await page.getByLabel("Calories", { exact: true }).fill("1800");
      await page.getByLabel("Protein", { exact: true }).fill("150");
      await page.getByLabel("Carbs", { exact: true }).fill("170");
      await page.getByLabel("Fat", { exact: true }).fill("60");
      await page.getByRole("button", { name: "Save template" }).click();
      await page.waitForURL("/nutrition-templates");
      await page.getByRole("group", { name: "Cut 1800", exact: true }).getByRole("link", { name: "Edit" }).click();
      await page.waitForURL(/\/nutrition-templates\/[0-9a-f-]{36}$/);
      await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("1800");
      return "/nutrition-templates";
    },
    field: (page) => page.getByLabel("Template name"),
    fill: (page) => firstEdit(page, page.getByLabel("Template name"), "QA 736 N"),
    save: (page) => page.getByRole("button", { name: "Save template" }).click(),
    on: /\/nutrition-templates\/[0-9a-f-]{36}$/,
    badge: false,
    create: false,
  },
  {
    name: "progress goal save",
    async open(page) {
      await page.goto("/");
      await page.goto(`/clients/${LINA}`);
      return "/";
    },
    field: (page) => page.getByRole("region", { name: "Progress and milestone" }).getByLabel("Milestone weight (kg)"),
    fill: (page) =>
      firstEdit(page, page.getByRole("region", { name: "Progress and milestone" }).getByLabel("Milestone weight (kg)"), "71"),
    save: (page) =>
      page.getByRole("region", { name: "Progress and milestone" }).getByRole("button", { name: "Save", exact: true }).click(),
    on: new RegExp(`/clients/${LINA}$`),
    badge: false,
    create: false,
  },
];

for (const flow of FLOWS) {
  test(`BUG-736 · ${flow.name}`, async ({ page, context }) => {
    await instrument(context);
    await signInThroughForm(page);
    const before = await flow.open(page);
    const sent = await flow.fill(page);
    await armed(page);
    const field = flow.field(page);
    await field.evaluate((el) => el.setAttribute("data-bug736-type", "1"));
    // Counted from this save on: a setup step may have saved too (the nutrition template's create).
    await page.evaluate(() => {
      sessionStorage.setItem("bug736Backs", "0");
      sessionStorage.setItem("bug736Asks", "0");
      sessionStorage.setItem("bug736Arm", "1");
    });
    const answered = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
    );
    await flow.save(page);
    await answered;
    await page.waitForURL(flow.on, { timeout: 15_000 });
    // Settled: the save's step has landed and anything it re-armed has been pushed.
    await page.waitForTimeout(2000);

    const c0 = await counters(page);
    const value = await field.inputValue();
    const holdsKeystroke = value !== sent;
    const guardAtType = c0.guardAtType === "true";
    const badgeAtType = c0.badgeAtType === "true";
    const excluded = flow.badge && c0.typed > 0 && guardAtType !== badgeAtType;
    const reached = guardAtType && holdsKeystroke && !excluded;
    const note = (type: string, description: string) => test.info().annotations.push({ type, description });
    note("guardAtType", String(c0.guardAtType));
    if (flow.badge) note("badgeAtType", String(c0.badgeAtType));
    note("holdsKeystroke", String(holdsKeystroke));
    note("reached", String(reached));
    if (excluded) note("excluded", "guardAtType and badgeAtType disagree");
    note("backsAtSave", String(c0.backs));

    expect(c0.asks, "no question before Back is pressed").toBe(0);
    if (!holdsKeystroke) return;

    const editUrl = page.url();
    await back(page);
    const c1 = await counters(page);
    note("backsAtFirstBack", String(c1.backs));
    note("historyLength", `${c0.len} -> ${c1.len}`);
    expect(c1.asks, "Back over text the server was not sent asks exactly once").toBe(1);
    expect(page.url(), "and the URL does not change").toBe(editUrl);
    expect(c1.backs, "one history.back() per save, none on the first Back").toBe(1);
    if (flow.create) expect(c1.len, "the first Back does not change the history length").toBe(c0.len);

    await leaveDialog(page).getByRole("button", { name: "Stay on this page", exact: true }).click();
    await page.waitForTimeout(400);
    expect(await field.inputValue(), "Stay keeps the field's text").toBe(value);
    expect(page.url(), "Stay keeps the URL").toBe(editUrl);

    await back(page);
    expect((await counters(page)).asks, "the second Back asks again, once").toBe(2);
    await leaveDialog(page).getByRole("button", { name: "Leave without saving", exact: true }).click();
    await page.waitForURL((url) => url.pathname === before, { timeout: 10_000 });
    await page.waitForTimeout(800);
    expect(new URL(page.url()).pathname, "Leave lands in one step on the page before the form").toBe(before);
    expect((await counters(page)).asks, "Leave asks nothing more").toBe(2);
  });
}
