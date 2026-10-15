import { expect, type Locator, type Page } from "@playwright/test";
import { appPages, beforeFilesRewrites, destinationPath, resolvePage, sampleUrl, sourceMatches } from "./app-pages";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { openEveryDay } from "./day-accordion";

/**
 * BUG-739 — the recipe and training-template editors: after a CREATE, the first UPDATE's
 * answer must not re-mount the editor.
 *
 * Before the fix, `/x/new` and `/x/[id]` were two segments. The create corrected the URL with
 * a plain `history.replaceState` that Next 14.2 lets through untouched (the entry's state
 * carries `__NA`), so Next's router still believed the page was `/x/new`. The update's
 * revalidating answer then rendered the `[id]` segment, which replaced the editor: a rename
 * typed during « Saving… » was lost, the saved notice vanished, no unsaved badge, Back left
 * without asking, and a `/x/new` entry was left in the history (staff's probe P5).
 *
 * Row Expected, each test on one editor:
 *   (1) the editor is the same instance after the update's answer (an expando set on the name
 *       input after the create is still on it);
 *   (2) the saved notice stays;
 *   (3) a late edit is kept with the badge, Back asks, Stay keeps it, the next Save sends it;
 *   (4) no `/x/new` entry is left anywhere in the session history, and one Back from the
 *       saved editor reaches the list.
 * (5), a direct-load update, is `qa/editor-late-edit.spec.ts`'s.
 *
 * The fix makes `/x/new` and `/x/{id}` ONE route (`/x/editor?id=…`, `next.config.mjs`), so this
 * file also holds what that costs and how it is paid for (staff's Q3–Q5, `bug739-staff.md`):
 *   · the addresses: `/x/new?id=<A>` is still a NEW record (the rewrite pins `id=`), and
 *     `/x/editor` / `/x/editor?id=<A>` serve what the canonical address serves;
 *   · the identity rule (`src/lib/useEditorIdentity.ts`): a soft navigation from A's editor to
 *     B's, or to New, gets a fresh editor, and its Save writes B (or creates), never A. Driven
 *     by `window.next.router.push` (Next's own handle on the app router, dev and production):
 *     no link in the portal goes from an editor to another, and none is added for the test;
 *   · a direct load renders with no console error or warning (no hydration diff);
 *   · EV-362: the editor is ONE page file per resource (`src/app/x/editor/page.tsx`); the four
 *     `new/` and `[id]/` page files it used to compose are deleted and stay absent, and
 *     `next.config.mjs` still declares the four rewrites exactly (the last two tests below).
 *
 * Sample point, stated: a re-mount lands with the update's router state, a few ms around the
 * notice's own commit, so every "still the same" read is taken SETTLE_MS after the notice is
 * on screen. Staff saw the notice gone by then on the base (1.5 s; QA 1 s).
 *
 * The update's answer is HELD (not slowed by a sleep): the POST reaches the server and its
 * response is handed to the page only after the late keystrokes are in the field.
 *
 * Copy is literal here, never imported from `src/lib/copy*.ts`.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const UNSAVED = "Unsaved changes";
const LEAVE = "Leave with unsaved changes?";
const STAY = "Stay on this page";
const LATE = " L1";
const SETTLE_MS = 1_500;
const BOWL = { id: "8e3f1b22-0000-4000-8000-0000000000c1", name: "Chicken rice bowl" };
const OATS = { id: "8e3f1b22-0000-4000-8000-0000000000c2", name: "Overnight oats" };
const SPLIT = { id: "7c2d0a11-0000-4000-8000-0000000000b1", name: "Upper / Lower split" };
const LEGACY = { id: "7c2d0a11-0000-4000-8000-0000000000b2", name: "Legacy strength" };
const UUID_PATH = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

interface Editor {
  kind: "recipe" | "template";
  newTitle: string;
  a: { id: string; name: string };
  b: { id: string; name: string };
  list: string;
  nameLabel: string;
  save: string;
  saving: string;
  saved: string;
}

const RECIPE: Editor = {
  kind: "recipe",
  newTitle: "New recipe",
  a: BOWL,
  b: OATS,
  list: "/recipes",
  nameLabel: "Recipe name",
  save: "Save recipe",
  saving: "Saving…",
  saved: "Recipe saved.",
};
const TEMPLATE: Editor = {
  kind: "template",
  newTitle: "New template",
  a: SPLIT,
  b: LEGACY,
  list: "/templates",
  nameLabel: "Template name",
  save: "Save template",
  saving: "Saving…",
  saved: "Template saved",
};

const leaveDialog = (page: Page) => page.getByRole("dialog", { name: LEAVE, exact: true });
const badge = (page: Page) => page.getByText(UNSAVED, { exact: true });
const notice = (page: Page, e: Editor) => page.getByText(e.saved, { exact: true });

interface Entries {
  index: number;
  paths: string[];
}

/** The session history through the Navigation API (Chromium, and Playwright's WebKit). */
async function entries(page: Page): Promise<Entries> {
  return page.evaluate(() => {
    const nav = (
      window as unknown as {
        navigation: { currentEntry: { index: number }; entries(): { url: string | null }[] };
      }
    ).navigation;
    return {
      index: nav.currentEntry.index,
      paths: nav.entries().map((entry) => (entry.url ? new URL(entry.url).pathname : "")),
    };
  });
}

async function signIn(page: Page) {
  await signInThroughForm(page, { email: EMAIL, password: PASSWORD });
}

/** Rename until React has it: the badge is the editor's own witness that its state took the edit. */
async function rename(page: Page, name: Locator, value: string) {
  await expect(async () => {
    await name.fill(value);
    await expect(badge(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function fillNewRecipe(page: Page, name: Locator, value: string) {
  await rename(page, name, value);
  await page.getByLabel("Find an ingredient").fill("greek");
  await page.getByRole("button", { name: "Add greek yogurt", exact: true }).click();
  await page.getByRole("group", { name: "greek yogurt", exact: true }).getByLabel("Quantity").fill("200");
  await page.getByLabel("Calories (kcal)").fill("245");
  await page.getByLabel("Protein (g)").fill("20");
  await page.getByLabel("Carbs (g)").fill("30");
  await page.getByLabel("Fat (g)").fill("5");
}

async function fillNewTemplate(page: Page, name: Locator, value: string) {
  await rename(page, name, value);
  for (const day of [0, 1]) {
    await openEveryDay(page);
    await page
      .getByRole("group", { name: `Day ${day + 1}`, exact: true })
      .getByRole("button", { name: "Add exercise" })
      .click();
    const picker = page.getByRole("dialog");
    for (let i = 0; i < 2; i += 1) await picker.locator("button[title]").nth(i).click();
    await picker.getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
}

/**
 * /x/new → filled → Save, answered at once. Returns the history index the page was loaded at,
 * read before the first keystroke armed the guard.
 */
async function create(page: Page, e: Editor, name: Locator, value: string): Promise<number> {
  await page.goto(e.list);
  await page.goto(`${e.list}/new`);
  const start = (await entries(page)).index;
  if (e.kind === "recipe") await fillNewRecipe(page, name, value);
  else await fillNewTemplate(page, name, value);
  await page.getByRole("button", { name: e.save, exact: true }).click();
  await expect(notice(page, e)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${e.list}/${UUID_PATH}$`));
  await expect(badge(page)).toHaveCount(0);
  await expect.poll(async () => (await entries(page)).index, { message: "the clean create kept a guard entry" }).toBe(start);
  return start;
}

/** Marks the name input, so a re-mount (a new input) is visible as a missing mark. */
async function mark(name: Locator) {
  await name.evaluate((el) => {
    (el as unknown as { __bug739?: true }).__bug739 = true;
  });
}
async function marked(name: Locator): Promise<boolean> {
  return name.evaluate((el) => (el as unknown as { __bug739?: true }).__bug739 === true);
}

/** Press Save with the answer held; `answer()` hands it to the page. Only the first action is held. */
async function saveHeld(page: Page, e: Editor): Promise<{ answer: () => Promise<void> }> {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  let arrived!: () => void;
  const reached = new Promise<void>((resolve) => (arrived = resolve));
  let held = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!held && request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      held = true;
      const response = await route.fetch();
      arrived();
      await gate;
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: e.save, exact: true }).click();
  await reached;
  await expect(page.getByRole("button", { name: e.saving, exact: true })).toBeDisabled();
  return {
    answer: async () => {
      open();
      await expect(notice(page, e)).toBeVisible();
      await page.unrouteAll({ behavior: "wait" });
    },
  };
}

/** (4): no `/x/new` entry anywhere, and the created URL is the current one. */
async function noNewEntry(page: Page, e: Editor, created: string) {
  const now = await entries(page);
  expect(now.paths, "a /new entry is left in the session history").not.toContain(`${e.list}/new`);
  expect(now.paths[now.index]).toBe(created);
}

/** (4): from a clean editor, one Back is the list, unasked; Forward is the created URL, not /new. */
async function oneBackIsTheList(page: Page, e: Editor, created: string) {
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${e.list}$`));
  await expect(leaveDialog(page)).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`${created}$`));
}

for (const e of [RECIPE, TEMPLATE]) {
  test.describe(`BUG-739 — ${e.kind} editor: create, then update`, () => {
    test.use({ locale: "en-US" });

    test(`${e.kind}: a late rename during the first update is kept, badged and guarded`, async ({ page }) => {
      await signIn(page);
      const name = page.getByLabel(e.nameLabel);
      const start = await create(page, e, name, `BUG-739 ${e.kind}`);
      const created = new URL(page.url()).pathname;
      await mark(name);

      await rename(page, name, `BUG-739 ${e.kind} renamed`);
      const held = await saveHeld(page, e);
      await name.click();
      // The caret to the end. Not the End key: on macOS it does not move a text field's caret
      // (Chromium and WebKit follow the platform), so a click mid-text typed " L1" mid-word.
      await name.evaluate((el) => {
        const input = el as HTMLInputElement;
        input.setSelectionRange(input.value.length, input.value.length);
      });
      await page.keyboard.type(LATE, { delay: 20 });
      const late = `BUG-739 ${e.kind} renamed${LATE}`;
      await expect(name).toHaveValue(late);
      await held.answer();
      await page.waitForTimeout(SETTLE_MS);

      // (1) and (2)
      expect(await marked(name), "the update's answer re-mounted the editor").toBe(true);
      await expect(notice(page, e), "the saved notice vanished").toBeVisible();
      // (3), first half: the late text, the badge, and the guard's entry.
      await expect(name).toHaveValue(late);
      await expect(badge(page), "the late edit is shown as saved").toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${created}$`));
      expect((await entries(page)).index, "the late edit holds no guard entry").toBe(start + 1);
      await noNewEntry(page, e, created);

      // (3): Back asks, Stay keeps the text and the URL.
      await page.goBack({ timeout: 3_000 }).catch(() => null);
      await expect(leaveDialog(page), "Back over the late edit did not ask").toBeVisible();
      await leaveDialog(page).getByRole("button", { name: STAY, exact: true }).click();
      await expect(leaveDialog(page)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`${created}$`));
      await expect(name).toHaveValue(late);
      await expect(badge(page)).toBeVisible();

      // (3): the next Save sends it and ends clean; a fresh load shows it.
      await page.getByRole("button", { name: e.save, exact: true }).click();
      await expect(notice(page, e)).toBeVisible();
      await expect(badge(page)).toHaveCount(0);
      await expect.poll(async () => (await entries(page)).index, { message: "the clean save kept its guard entry" }).toBe(start);
      expect(await marked(name), "the second update re-mounted the editor").toBe(true);
      await noNewEntry(page, e, created);
      await page.reload();
      await expect(page.getByLabel(e.nameLabel)).toHaveValue(late);
      await oneBackIsTheList(page, e, created);
    });

    test(`${e.kind}: a clean first update keeps the editor, the notice and a one-step Back`, async ({ page }) => {
      await signIn(page);
      const name = page.getByLabel(e.nameLabel);
      const start = await create(page, e, name, `BUG-739 clean ${e.kind}`);
      const created = new URL(page.url()).pathname;
      await mark(name);

      await rename(page, name, `BUG-739 clean ${e.kind} renamed`);
      const held = await saveHeld(page, e);
      await held.answer();
      await page.waitForTimeout(SETTLE_MS);

      expect(await marked(name), "the update's answer re-mounted the editor").toBe(true);
      await expect(notice(page, e), "the saved notice vanished").toBeVisible();
      await expect(name).toHaveValue(`BUG-739 clean ${e.kind} renamed`);
      await expect(badge(page)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`${created}$`));
      expect((await entries(page)).index, "the clean update kept a guard entry").toBe(start);
      await noNewEntry(page, e, created);
      await oneBackIsTheList(page, e, created);
    });
  });
}

/** A soft navigation through Next's own router, once the app router has mounted. */
async function softPush(page: Page, href: string) {
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { next?: { router?: unknown } }).next?.router)))
    .toBe(true);
  await page.evaluate((to) => {
    (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push(to);
  }, href);
}

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

for (const e of [RECIPE, TEMPLATE]) {
  test.describe(`BUG-739 — ${e.kind} editor: one route for /new and /{id}`, () => {
    test.use({ locale: "en-US" });

    test(`${e.kind}: /new?id=<existing> is still a new ${e.kind}; /editor and /editor?id= serve the canonical page`, async ({
      page,
    }) => {
      await signIn(page);
      const name = page.getByLabel(e.nameLabel);
      // The rewrite pins `id=`: a request's own `id` must not turn /new into an existing record.
      await page.goto(`${e.list}/new?id=${e.a.id}`);
      await expect(heading(page)).toHaveText(e.newTitle);
      await expect(name).toHaveValue("");
      await page.goto(`${e.list}/editor`);
      await expect(heading(page)).toHaveText(e.newTitle);
      await expect(name).toHaveValue("");
      await page.goto(`${e.list}/editor?id=${e.a.id}`);
      await expect(heading(page)).toHaveText(e.a.name);
      await expect(name).toHaveValue(e.a.name);
    });

    test(`${e.kind}: a direct load renders with no console error or warning`, async ({ page }) => {
      const logged: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") logged.push(`${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (err) => logged.push(`pageerror: ${err.message}`));
      await signIn(page);
      for (const path of [`${e.list}/${e.a.id}`, `${e.list}/new`]) {
        logged.length = 0;
        await page.goto(path);
        await expect(page.getByLabel(e.nameLabel)).toHaveValue(path.endsWith("/new") ? "" : e.a.name);
        // A hydration diff is reported once React has hydrated; the badge after a rename is the
        // editor's own witness that it has.
        await rename(page, page.getByLabel(e.nameLabel), "hydrated");
        expect(new URL(page.url()).pathname).toBe(path);
        expect(logged, `console on a direct load of ${path}`).toEqual([]);
        await page.goto(e.list);
      }
    });

    test(`${e.kind}: A's editor, then B's by a soft navigation, is B's editor and saves B`, async ({ page }) => {
      await signIn(page);
      const name = page.getByLabel(e.nameLabel);
      await page.goto(e.list);
      await page.goto(`${e.list}/${e.a.id}`);
      await expect(name).toHaveValue(e.a.name);
      await mark(name);

      await softPush(page, `${e.list}/${e.b.id}`);
      await expect(page).toHaveURL(new RegExp(`${e.list}/${e.b.id}$`));
      await expect(heading(page)).toHaveText(e.b.name);
      await expect(name, "B's page kept A's draft").toHaveValue(e.b.name);
      expect(await marked(name), "B's page kept A's editor").toBe(false);

      await rename(page, name, `${e.b.name} v2`);
      await page.getByRole("button", { name: e.save, exact: true }).click();
      await expect(notice(page, e)).toBeVisible();
      await page.goto(`${e.list}/${e.b.id}`);
      await expect(page.getByLabel(e.nameLabel)).toHaveValue(`${e.b.name} v2`);
      await page.goto(`${e.list}/${e.a.id}`);
      await expect(page.getByLabel(e.nameLabel), "the save went to A").toHaveValue(e.a.name);
    });

    test(`${e.kind}: A's editor, then New by a soft navigation, is a blank editor that creates`, async ({ page }) => {
      await signIn(page);
      const name = page.getByLabel(e.nameLabel);
      await page.goto(e.list);
      await page.goto(`${e.list}/${e.a.id}`);
      await expect(name).toHaveValue(e.a.name);

      await softPush(page, `${e.list}/new`);
      await expect(page).toHaveURL(new RegExp(`${e.list}/new$`));
      await expect(heading(page)).toHaveText(e.newTitle);
      await expect(name, "New kept A's draft").toHaveValue("");

      if (e.kind === "recipe") await fillNewRecipe(page, name, `BUG-739 soft new ${e.kind}`);
      else await fillNewTemplate(page, name, `BUG-739 soft new ${e.kind}`);
      await page.getByRole("button", { name: e.save, exact: true }).click();
      await expect(notice(page, e)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${e.list}/${UUID_PATH}$`));
      expect(new URL(page.url()).pathname, "New saved over A").not.toBe(`${e.list}/${e.a.id}`);
      await page.goto(`${e.list}/${e.a.id}`);
      await expect(page.getByLabel(e.nameLabel), "the create renamed A").toHaveValue(e.a.name);
    });
  });
}

/**
 * EV-362 AC1 — one page file per editor, and no page a rewrite hides.
 *
 * (a) The four page files `editor/page.tsx` replaced stay absent: `recipes/new`, `recipes/[id]`,
 *     `templates/new`, `templates/[id]`, in any page extension. Only those files: a nested page
 *     such as `recipes/[id]/history/page.tsx` is not pinned by (a), and (b) lets it through,
 *     since no rule takes a two-segment URL under `recipes/`.
 * (b) No page under `src/app` has a URL that a `beforeFiles` source takes, except a rule's own
 *     destination page (`editor/`). Such a page is unreachable (the rule rewrites its URL
 *     before the file system is consulted), and a `loading.tsx`, `layout.tsx` or `error.tsx`
 *     beside it is silently dead. Each page's URL is its path with `(group)` segments removed and
 *     each dynamic segment filled with a sample (`sampleUrl`); the sources are compiled as Next
 *     compiles them (`sourceMatches`). So `recipes/(list)/page.tsx` (`/recipes`) passes, and
 *     `recipes/(x)/import/page.tsx` (`/recipes/import`, taken by the `:id` rule) fails.
 *
 * Mutants (staff's EV-362 review): M1 restore `recipes/new/page.tsx` → red (a) and (b);
 * M7 add `recipes/(list)/page.tsx` → green; M8 add `recipes/(x)/import/page.tsx` → red (b).
 */
test("EV-362: the four replaced page files stay absent, and no page sits under a beforeFiles rewrite", async () => {
  const pages = appPages();
  const replaced = pages.filter((p) => /^(recipes|templates)\/(new|\[id\])\/page\.(tsx|ts|jsx|js)$/.test(p));
  // Soft: a restored file is reported by both limbs, so the (b) message shows which rule took it.
  expect.soft(replaced, "page files EV-362 deleted, back in src/app").toEqual([]);

  const rules = await beforeFilesRewrites();
  expect(rules.length, "next.config.mjs declares beforeFiles rewrites").toBeGreaterThan(0);
  const destinations = new Set(rules.map((r) => resolvePage(destinationPath(r.destination), pages)));
  const shadowed = pages
    .filter((p) => !destinations.has(p))
    .flatMap((p) => {
      const url = sampleUrl(p);
      return rules.filter((r) => sourceMatches(r.source, url)).map((r) => `${p} (${url}) is taken by ${r.source}`);
    });
  expect(shadowed, "pages whose URL a beforeFiles rewrite takes first").toEqual([]);
});

/**
 * EV-362 AC2 — `next.config.mjs` declares the four BUG-739 `beforeFiles` rewrites, as written:
 * the `(?!new$|editor$)` lookahead (the rules CHAIN) and the pinned `id=` on the `new` rules (a
 * request's own `id` would otherwise win). The exported config is read, as Next reads it, so a
 * comment cannot satisfy it. With `new/` and `[id]/` gone, these rules are the only way to the
 * editors.
 *
 * Mutants: drop the lookahead from `/recipes/:id`, or the `?id=` from `/templates/new` → red.
 */
test("EV-362: next.config.mjs declares the four editor rewrites with the lookahead and the pinned id=", async () => {
  expect(await beforeFilesRewrites()).toEqual([
    { source: "/recipes/new", destination: "/recipes/editor?id=" },
    { source: "/recipes/:id((?!new$|editor$)[^/]+)", destination: "/recipes/editor?id=:id" },
    { source: "/templates/new", destination: "/templates/editor?id=" },
    { source: "/templates/:id((?!new$|editor$)[^/]+)", destination: "/templates/editor?id=:id" },
  ]);
});
