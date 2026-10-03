import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { COPY, ENGINES, closeBrowsers, holdHydration, openPage, type Engine } from "./prehydration";

/**
 * BUG-686 follow-up — the sweep: on every page of the portal that server-renders a field,
 * NOTHING typed before React hydrates is left shown-but-not-held.
 *
 * For each route: the JS is held (`qa/prehydration.ts`), every visible, enabled, writable
 * field is typed into (text, number, date, textarea, select, checkbox, one radio per
 * group), each without a React fiber, then the JS is released. The check is per field and
 * reads React's own controlled value for the node (`__reactProps$…`.value / .checked)
 * against what the DOM shows; the list of fields where they differ must become empty.
 *
 * This is the witness the follow-up was decided on. On a862698 it lists, in Chromium and
 * WebKit alike: /activate's three passwords and consent box; every field of the template,
 * recipe, nutrition-template and routine editors; the daily targets; the progress goal;
 * the template search; the recipe meal-time filter; and the FR / EN switch on every page
 * (the roster search, on the populated roster, is `qa/roster-search-prehydration.spec.ts`).
 * /login was already fixed by BUG-686 (967963e) and is the control.
 *
 * The dialog forms (Add a client, New challenge, Save as template) are a different answer,
 * also witnessed here: their fields are not in the server HTML at all (the kit's `Modal`
 * renders nothing while closed), and a click on the opener before hydration opens nothing,
 * so there is no pre-hydration field to type into. React creates those inputs controlled.
 *
 * What it does not check, stated: that a typed value SURVIVES (a replayed change may
 * legitimately be refused, e.g. a weekday already taken, or re-render a row, e.g. "Tracked
 * as" replaces the reps field); the per-form specs prove the values are saved. A textarea
 * with a non-empty rendered value is reset by React itself at hydration (shown and held
 * agree), so it is never listed.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const UPPER_LOWER = "7c2d0a11-0000-4000-8000-0000000000b1";
const CHICKEN_RICE_BOWL = "8e3f1b22-0000-4000-8000-0000000000c1";

const t = COPY.en;
const ROUTES: Array<{ path: string; as: "anon" | "coach" | "pending"; opener?: string }> = [
  { path: "/login", as: "anon" },
  { path: "/activate", as: "pending" },
  { path: "/", as: "coach", opener: t.addClient.button },
  { path: "/challenges", as: "coach", opener: t.challenges.create },
  { path: "/templates", as: "coach" },
  { path: "/templates/new", as: "coach" },
  { path: `/templates/${UPPER_LOWER}`, as: "coach" },
  { path: "/recipes", as: "coach" },
  { path: "/recipes/new", as: "coach" },
  { path: `/recipes/${CHICKEN_RICE_BOWL}`, as: "coach" },
  { path: "/nutrition-templates", as: "coach" },
  { path: "/nutrition-templates/new", as: "coach" },
  { path: `/clients/${LINA}`, as: "coach" },
  { path: `/clients/${LINA}/nutrition`, as: "coach" },
  { path: `/clients/${LINA}/routine`, as: "coach", opener: t.templates.saveAsTemplate },
];

test.afterAll(closeBrowsers);

interface Field {
  i: number;
  tag: string;
  type: string;
  name: string;
}

/** Tags every field a person could type into; returns them with their names. */
function tagFields(page: Page): Promise<Field[]> {
  return page.evaluate(() => {
    const out: Field[] = [];
    let i = 0;
    for (const node of Array.from(document.querySelectorAll("input, textarea, select"))) {
      const el = node as HTMLInputElement;
      if (el.type === "hidden" || el.disabled || el.readOnly) continue;
      const box = el.getBoundingClientRect();
      // Native radios and checkboxes may sit under a styled face; they still count.
      if ((box.width === 0 || box.height === 0) && el.type !== "radio" && el.type !== "checkbox") continue;
      el.setAttribute("data-sweep", String(i));
      const name =
        el.getAttribute("aria-label") || el.closest("label")?.textContent?.trim().slice(0, 40) || el.id || "?";
      out.push({ i, tag: el.tagName.toLowerCase(), type: el.type, name });
      i += 1;
    }
    return out;
  });
}

/** Fields whose DOM state differs from React's controlled value for them; [] when none. */
function shownButNotHeld(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLInputElement>("[data-sweep]")).flatMap((el) => {
      const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
      const label = `#${el.getAttribute("data-sweep")} ${el.tagName.toLowerCase()}[${el.type}]`;
      if (!key) return [`${label}: not hydrated`];
      const props = (el as unknown as Record<string, Record<string, unknown>>)[key];
      const checkable = el.type === "checkbox" || el.type === "radio";
      if (checkable) {
        if (!("checked" in props)) return [];
        return el.checked === props.checked ? [] : [`${label}: shown ${el.checked}, held ${String(props.checked)}`];
      }
      if (!("value" in props)) return [];
      return el.value === String(props.value) ? [] : [`${label}: shown ${JSON.stringify(el.value)}, held ${JSON.stringify(props.value)}`];
    }),
  );
}

for (const engine of Object.keys(ENGINES) as Engine[]) {
  test.describe(engine, () => {
    for (const route of ROUTES) {
      test(`${route.path}: nothing typed before hydration is shown but not held`, async ({ baseURL }) => {
        const page = await openPage(engine, "en", 1440, baseURL, route.as);
        try {
          const hold = await holdHydration(page);
          await page.goto(route.path, { waitUntil: "domcontentloaded" });
          expect(new URL(page.url()).pathname).toBe(route.path);
          const fields = await tagFields(page);
          expect(fields.length, "the page server-renders at least the language switch").toBeGreaterThan(0);

          const radioGroups = new Set<string>();
          for (const f of fields) {
            const field = page.locator(`[data-sweep="${f.i}"]`);
            if (f.tag === "select") {
              const values = await field.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
              const current = await field.inputValue();
              const other = values.find((v) => v !== current);
              if (other !== undefined) await field.selectOption(other);
            } else if (f.type === "checkbox") {
              await field.evaluate((el) => (el as HTMLInputElement).click());
            } else if (f.type === "radio") {
              const group = (await field.getAttribute("name")) ?? "";
              if (radioGroups.has(group) || (await field.isChecked())) continue;
              radioGroups.add(group);
              await field.evaluate((el) => (el as HTMLInputElement).click());
            } else if (f.type === "number") {
              await field.fill("123");
            } else if (f.type === "date") {
              await field.fill("2026-11-05");
            } else {
              await field.fill(f.type === "email" ? "sweep@evoli.fit" : `sweep ${f.i}`);
            }
          }
          const hydratedEarly = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-sweep]")).some((n) => Object.keys(n).some((k) => k.startsWith("__reactFiber$"))),
          );
          expect(hydratedEarly, "every field was typed into server HTML").toBe(false);

          if (route.opener) {
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await page.getByRole("button", { name: route.opener, exact: true }).click();
            await expect(page.getByRole("dialog"), `${route.opener}: opens nothing before hydration`).toHaveCount(0);
          }

          expect(await hold.release(), "JS chunks held until every field was typed into").toBeGreaterThan(0);
          await expect
            .poll(() => shownButNotHeld(page), {
              message: `${route.path} (${fields.map((f) => f.name).join(" | ")})`,
              timeout: 30_000,
            })
            .toEqual([]);
        } finally {
          await page.context().close();
        }
      });
    }
  });
}
