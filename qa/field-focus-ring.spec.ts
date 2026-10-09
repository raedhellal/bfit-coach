import { appendFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, webkit, type Browser, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-663 (P2, WCAG 2.2 SC 2.4.7 Focus Visible) — every text field in the portal, reached
 * with the keyboard, shows a focus indicator that a sighted keyboard user can see.
 *
 * Before the fix the kit `Input` set an inline `outline: none` on its `<input>` and drew a
 * ring only when the caller passed `focusRing`, which only LoginForm did: QA measured the
 * recipe editor's "Find an ingredient" field (`qapro1`, PB-6) with no outline and no
 * shadow on Tab. The other kit call sites (activation, challenge create, progress goal,
 * swap-sheet recipe search, exercise catalogue search) shared it by construction.
 *
 * What this file does, per route and in Chromium AND WebKit (WebKit is launched here: the
 * configs' project is Chromium; a missing WebKit FAILS rather than skips):
 *
 *  1. Tabs through the page (or through an opened dialog's focus trap) until focus comes
 *     back round, and for every TEXT FIELD focus lands on (input of a text-like type,
 *     textarea, select):
 *  2. finds the indicator: a non-`none` outline on the field or on one of its two nearest
 *     ancestors (the kit draws it on the field's box), else a non-`none` box-shadow there;
 *     neither is a failure, "no indicator";
 *  3. PHOTOGRAPHS it and reads the painted pixels, side by side: the ring's own band, the
 *     pixel just outside it and the pixel just inside it, on the middle half of each of
 *     the four sides. Each side's ring colour must reach 3:1 against both neighbours
 *     (WCAG 1.4.11's non-text contrast for the indicator). A ring that is declared but
 *     clipped by a scrolling ancestor, painted under something, or drawn in a colour too
 *     close to what it sits on reads as a failure here, because what is measured is the
 *     screen, not the stylesheet. (The kit's old `focusRing` halo was a declared box-shadow
 *     at 0.18 alpha: computed "not none", painted at ~1.2:1. A computed-style check alone
 *     would have passed it.)
 *  4. checks the sweep was not vacuous: every visible, enabled text field in the scope was
 *     reached by the keyboard, and the route's named fields were among them.
 *
 * Red on the base (c4a5865), both engines: exactly the 15 kit `Input` fields, in nine
 * routes; LoginForm's caller-switched halo reads 1.23:1 against the white around it. Every
 * raw `<input>`/`<select>`/`<textarea>` was already green there (the global `:focus-visible`
 * rule), and the sweep keeps them so.
 *
 * WebKit: Alt+Tab on macOS (a plain Tab skips links there), and a date field reached with
 * it never matches `:focus-visible` (it walks the month/day/year parts of one element), so
 * the kit also rings `[type=date]:focus` and this file does not demand `:focus-visible` of a
 * WebKit date field: the pixels decide.
 *
 * The WebKit half needs `next dev` (this config) or https: under `next start` the session
 * cookie is `Secure`, and WebKit, unlike Chromium, drops a Secure cookie on
 * http://localhost, so every signed-in route bounces back to /login (witnessed 2026-10-02;
 * the Chromium half is green on `next start`).
 *
 * The roster search field (EV-337d) is not on this base; it ships with its own
 * `:has(input:focus-visible)` ring on `feat/pro-redesign-3-roster`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const TESS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0019";
const TEMPLATE = "7c2d0a11-0000-4000-8000-0000000000b1"; // Upper / Lower split
const RECIPE = "8e3f1b22-0000-4000-8000-0000000000c1"; // Chicken rice bowl
const NUTRITION_TEMPLATE = "Focus ring 1800"; // the default seed holds no nutrition template: made here
const PASSWORD = "Password123!";
const MIN_CONTRAST = 3;

type Engine = "chromium" | "webkit";
const VIEWPORT = { width: 1280, height: 720 };

// ─────────────────────────── the PNG reader (no dependency) ───────────────────────────

/** Decodes Playwright's screenshots: 8-bit RGB or RGBA, not interlaced. */
function decodePng(buf: Buffer): { width: number; height: number; rgba: Uint8Array } {
  let p = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colour = data[9];
      if (depth !== 8 || data[12] !== 0 || (colour !== 2 && colour !== 6)) {
        throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${data[12]}`);
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) out[(y * width + x) * 4 + k] = cur[x * channels + k];
      out[(y * width + x) * 4 + 3] = channels === 4 ? cur[x * channels + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, rgba: out };
}

type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function median(colours: Rgb[]): Rgb {
  const pick = (k: 0 | 1 | 2) => {
    const v = colours.map((c) => c[k]).sort((x, y) => x - y);
    return v[Math.floor(v.length / 2)];
  };
  return [pick(0), pick(1), pick(2)];
}

const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

// ─────────────────────────── the sweep ───────────────────────────

const FIELD =
  "input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=button]):not([type=submit])" +
  ":not([type=reset]):not([type=range]):not([type=file]):not([type=color]):not([type=image]), textarea, select";

type Stop = { key: number; isField: boolean; name: string } | null;

type FieldResult = {
  name: string;
  indicator: string;
  failures: string[];
  sides: string[];
};

/**
 * Every element gets a stable number in a page-side WeakMap — never a DOM attribute: an
 * attribute written before hydration is a dev-mode hydration warning, and the overlay that
 * follows is itself a focus stop.
 */
async function currentStop(page: Page, scope: string | null): Promise<Stop> {
  return page.evaluate(
    ({ FIELD, scope }) => {
      const w = window as unknown as { __bug663?: WeakMap<Element, number>; __bug663n?: number };
      w.__bug663 ??= new WeakMap();
      w.__bug663n ??= 0;
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      if (scope && !el.closest(scope)) return null;
      if (!w.__bug663.has(el)) w.__bug663.set(el, ++w.__bug663n);
      const field = el as HTMLInputElement;
      const label =
        field.getAttribute("aria-label") ||
        (field.labels && field.labels[0] ? (field.labels[0].innerText || "").split("\n")[0] : "") ||
        field.getAttribute("placeholder") ||
        field.getAttribute("title") ||
        "";
      return {
        key: w.__bug663.get(el)!,
        isField: el.matches(FIELD),
        name: `${el.tagName.toLowerCase()}${el instanceof HTMLInputElement ? `[${el.type}]` : ""} "${label.trim().slice(0, 40)}"`,
      };
    },
    { FIELD, scope }
  );
}

/** Every visible, enabled text field in the scope, by the same numbering. */
async function fieldsInScope(page: Page, scope: string | null): Promise<{ key: number; name: string }[]> {
  return page.evaluate(
    ({ FIELD, scope }) => {
      const w = window as unknown as { __bug663?: WeakMap<Element, number>; __bug663n?: number };
      w.__bug663 ??= new WeakMap();
      w.__bug663n ??= 0;
      const root: ParentNode = scope ? (document.querySelector(scope) ?? document) : document;
      return Array.from(root.querySelectorAll<HTMLInputElement>(FIELD))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const visible = typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
          return visible && r.width > 0 && r.height > 0 && !el.disabled;
        })
        .map((el) => {
          if (!w.__bug663!.has(el)) w.__bug663!.set(el, ++w.__bug663n!);
          const label =
            el.getAttribute("aria-label") ||
            (el.labels && el.labels[0] ? (el.labels[0].innerText || "").split("\n")[0] : "") ||
            el.getAttribute("placeholder") ||
            "";
          return { key: w.__bug663!.get(el)!, name: `${el.tagName.toLowerCase()} "${label.trim().slice(0, 40)}"` };
        });
    },
    { FIELD, scope }
  );
}

type Indicator = {
  kind: string;
  inner: number;
  outer: number;
  rect: { left: number; top: number; right: number; bottom: number } | null;
  focusVisible: boolean;
  isDate: boolean;
};

/** Where the focused field's indicator is drawn: outline first, else box-shadow. */
async function readIndicator(page: Page): Promise<Indicator> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const focusVisible = el.matches(":focus-visible");
    const isDate = el instanceof HTMLInputElement && el.type === "date";
    const owners = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean) as HTMLElement[];
    for (const [depth, o] of owners.entries()) {
      const cs = getComputedStyle(o);
      const width = parseFloat(cs.outlineWidth) || 0;
      if (cs.outlineStyle !== "none" && width > 0) {
        const offset = parseFloat(cs.outlineOffset) || 0;
        const r = o.getBoundingClientRect();
        return {
          kind: `outline ${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} offset ${cs.outlineOffset} on ${depth === 0 ? "the field" : `ancestor ${depth}`}`,
          inner: offset,
          outer: offset + width,
          rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
          focusVisible,
          isDate,
        };
      }
    }
    for (const [depth, o] of owners.entries()) {
      const cs = getComputedStyle(o);
      if (cs.boxShadow && cs.boxShadow !== "none") {
        // "rgba(79, 124, 255, 0.18) 0px 0px 0px 3px" — the first shadow's spread.
        const lengths = cs.boxShadow.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? [];
        const spread = lengths.length >= 4 ? parseFloat(lengths[3]) : 0;
        const blur = lengths.length >= 3 ? parseFloat(lengths[2]) : 0;
        const r = o.getBoundingClientRect();
        return {
          kind: `box-shadow ${cs.boxShadow} on ${depth === 0 ? "the field" : `ancestor ${depth}`}`,
          inner: 0,
          outer: Math.max(spread + blur / 2, 1),
          rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
          focusVisible,
          isDate,
        };
      }
    }
    return { kind: "none", inner: 0, outer: 0, rect: null, focusVisible, isDate };
  });
}

const sameRect = (a: Indicator["rect"], b: Indicator["rect"]) =>
  !!a && !!b && (["left", "top", "right", "bottom"] as const).every((side) => Math.abs(a[side] - b[side]) < 0.5);

/** The focused field's indicator, measured on the screen. */
async function measureFocused(page: Page, engine: Engine, name: string): Promise<FieldResult> {
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement).scrollIntoView({ block: "center", inline: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  const failures: string[] = [];
  /**
   * The photograph has to be of the box the geometry was read from: a list that finishes
   * loading (the exercise catalogue) moves the field between the read and the shot, and the
   * band then samples the page beside it. Re-read after the shot; retake until they agree.
   */
  let geo = await readIndicator(page);
  let shot: Buffer | null = null;
  for (let attempt = 0; attempt < 5 && geo.rect; attempt++) {
    const r = geo.rect;
    const pad = Math.ceil(geo.outer) + 3;
    shot = await page.screenshot({
      clip: {
        x: Math.round(r.left) - pad,
        y: Math.round(r.top) - pad,
        width: Math.round(r.right) - Math.round(r.left) + 2 * pad,
        height: Math.round(r.bottom) - Math.round(r.top) + 2 * pad,
      },
      scale: "css",
      animations: "disabled",
      caret: "hide",
    });
    const again = await readIndicator(page);
    if (again.kind === geo.kind && sameRect(again.rect, geo.rect)) break;
    geo = again;
    shot = null;
    await page.waitForTimeout(200);
  }

  /**
   * WebKit never matches :focus-visible on a date field reached with Tab (it moves focus
   * through the month/day/year parts of the same element). The keyboard put focus there;
   * the pixels below are what decide whether it shows.
   */
  if (!geo.focusVisible && !(engine === "webkit" && geo.isDate)) {
    failures.push("the focused field does not match :focus-visible");
  }
  if (geo.kind === "none" || !geo.rect) {
    failures.push("no indicator: outline none and box-shadow none on the field and its box");
    return { name, indicator: geo.kind, failures, sides: [] };
  }
  if (!shot) {
    failures.push("the field kept moving: no photograph matched its box");
    return { name, indicator: geo.kind, failures, sides: [] };
  }

  const L = Math.round(geo.rect.left);
  const T = Math.round(geo.rect.top);
  const R = Math.round(geo.rect.right);
  const B = Math.round(geo.rect.bottom);
  const pad = Math.ceil(geo.outer) + 3;
  const img = decodePng(shot);
  const px = (x: number, y: number): Rgb => {
    const i = (Math.min(Math.max(y, 0), img.height - 1) * img.width + Math.min(Math.max(x, 0), img.width - 1)) * 4;
    return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]];
  };
  // Box edges in image coordinates; `d` is a distance OUTSIDE the box (negative = inside).
  const x0 = pad;
  const y0 = pad;
  const x1 = pad + (R - L);
  const y1 = pad + (B - T);
  const k = (d: number) => Math.floor(d - 0.5);
  const sample = (side: "top" | "right" | "bottom" | "left", d: number): Rgb[] => {
    const out: Rgb[] = [];
    if (side === "top" || side === "bottom") {
      const y = side === "top" ? y0 - k(d) - 1 : y1 + k(d);
      for (let x = Math.round(x0 + (x1 - x0) * 0.25); x <= Math.round(x0 + (x1 - x0) * 0.75); x++) out.push(px(x, y));
    } else {
      const x = side === "left" ? x0 - k(d) - 1 : x1 + k(d);
      for (let y = Math.round(y0 + (y1 - y0) * 0.25); y <= Math.round(y0 + (y1 - y0) * 0.75); y++) out.push(px(x, y));
    }
    return out;
  };

  const sides: string[] = [];
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const ring = median(sample(side, (geo.inner + geo.outer) / 2));
    const outside = median(sample(side, geo.outer + 0.5));
    const inside = median(sample(side, geo.inner - 0.5));
    const cOut = contrast(ring, outside);
    const cIn = contrast(ring, inside);
    sides.push(`${side} ring ${hex(ring)} | out ${hex(outside)} ${cOut.toFixed(2)}:1 | in ${hex(inside)} ${cIn.toFixed(2)}:1`);
    if (cOut < MIN_CONTRAST) failures.push(`${side}: ring ${hex(ring)} vs outside ${hex(outside)} = ${cOut.toFixed(2)}:1`);
    if (cIn < MIN_CONTRAST) failures.push(`${side}: ring ${hex(ring)} vs inside ${hex(inside)} = ${cIn.toFixed(2)}:1`);
  }
  return { name, indicator: geo.kind, failures, sides };
}

const TAB = (engine: Engine) => (engine === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");

/**
 * Tabs until focus comes back to the first element it reached (a full cycle of the page,
 * or of a dialog's focus trap), measuring each text field once.
 */
async function sweep(page: Page, engine: Engine, scope: string | null) {
  const results: FieldResult[] = [];
  const reached = new Set<number>();
  const measured = new Set<number>();
  let first: number | null = null;
  let stops = 0;
  for (let i = 0; i < 300; i++) {
    await page.keyboard.press(TAB(engine));
    const stop = await currentStop(page, scope);
    if (!stop) continue;
    if (first === null) first = stop.key;
    else if (stop.key === first) break;
    stops += 1;
    reached.add(stop.key);
    if (stop.isField && !measured.has(stop.key)) {
      measured.add(stop.key);
      results.push(await measureFocused(page, engine, stop.name));
    }
  }
  expect(first, "Tab reached nothing at all in the scope").not.toBeNull();
  const visible = await fieldsInScope(page, scope);
  const unreached = visible.filter((f) => !reached.has(f.key)).map((f) => f.name);
  return { results, unreached, stops };
}

// ─────────────────────────── routes ───────────────────────────

/**
 * WebKit gets the HTML well before React hydrates, and a fill before hydration is a no-op
 * for the form's state (witnessed: the WebKit half hung on every signed-in route). The
 * shared helper waits for the form's own hydration witness: qa/sign-in.ts.
 */
async function signIn(page: Page, email = "coach@evoli.fit", password = PASSWORD, landing: RegExp | string = "/") {
  await signInThroughForm(page, { email, password, landing });
}

/** A click before hydration is a no-op: retried until the dialog answers. */
async function openDialog(page: Page, trigger: Locator, name: string | RegExp): Promise<string> {
  const dialog = page.getByRole("dialog", { name });
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  // The scope selector for the sweep: the dialog element itself.
  await dialog.evaluate((el) => el.setAttribute("data-qa-sweep-scope", ""));
  return "[data-qa-sweep-scope]";
}

const nutritionTemplateRow = (page: Page) => page.getByRole("group", { name: NUTRITION_TEMPLATE, exact: true });

/**
 * New nutrition template, saved. A fill before hydration is a no-op for the editor's state,
 * so it waits for the form's own witness first, like `qa/sign-in.ts`: « Save template » is
 * SSR'd disabled and only React's name state enables it. Once it is enabled the editor has
 * hydrated, so the numbers are filled once and Save is clicked ONCE. The old loop clicked
 * again after a 3 s wait, which a loaded machine overran (WebKit, 30 s budget, witnessed),
 * and a second click on a slow save could create a second template of the same name.
 */
async function createNutritionTemplate(page: Page) {
  await page.goto("/nutrition-templates/new", { waitUntil: "domcontentloaded" });
  const save = page.getByRole("button", { name: "Save template" });
  await expect(async () => {
    // Cleared first: a re-fill with the same text is not a change to React (qa/sign-in.ts).
    await page.getByLabel("Template name").fill("");
    await page.getByLabel("Template name").fill(NUTRITION_TEMPLATE);
    await expect(save, "« Save template » enabled = the editor's state holds the name (hydrated)").toBeEnabled({
      timeout: 2_000,
    });
  }).toPass({ timeout: 45_000 });
  await page.getByLabel("Calories", { exact: true }).fill("1800");
  await page.getByLabel("Protein", { exact: true }).fill("150");
  await page.getByLabel("Carbs", { exact: true }).fill("170");
  await page.getByLabel("Fat", { exact: true }).fill("60");
  await save.click();
  await page.waitForURL("/nutrition-templates", { timeout: 45_000 });
  await expect(nutritionTemplateRow(page)).toBeVisible();
}

async function settled(page: Page, ready: Locator) {
  await expect(ready).toBeVisible();
  await page.waitForLoadState("load");
}

type Route = {
  name: string;
  /** Returns the sweep's scope: null for the page, a selector for an opened dialog. */
  open: (page: Page) => Promise<string | null>;
  /** Accessible names (substring) that must be among the fields the keyboard reached. */
  expectNames: string[];
};

const ROUTES: Route[] = [
  {
    name: "login",
    open: async (page) => {
      await page.goto("/login");
      await settled(page, page.getByLabel("Email"));
      return null;
    },
    expectNames: ["email", "password"],
  },
  {
    name: "activate",
    open: async (page) => {
      await signIn(page, "new.coach@evoli.fit", "Temp-pass-2026", /\/activate$/);
      await settled(page, page.getByLabel("Temporary password"));
      return null;
    },
    expectNames: ["Temporary password", "New password", "Repeat the new password"],
  },
  {
    name: "roster: invite link",
    open: async (page) => {
      await signIn(page);
      const scope = await openDialog(page, page.getByRole("button", { name: "Invite a trainee" }), /Invite/);
      // The link is minted after the dialog opens (a skeleton until then).
      await expect(page.getByLabel("Invite link")).toBeVisible();
      return scope;
    },
    expectNames: ["Invite link"],
  },
  {
    name: "templates: new",
    open: async (page) => {
      await signIn(page);
      await page.goto("/templates/new");
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return null;
    },
    expectNames: [],
  },
  {
    name: "templates: detail",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/templates/${TEMPLATE}`);
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return null;
    },
    expectNames: [],
  },
  {
    name: "templates: exercise catalogue search",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/templates/${TEMPLATE}`);
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return openDialog(page, page.getByRole("button", { name: "Add exercise" }).first(), /exercise/i);
    },
    expectNames: [],
  },
  {
    name: "templates: rename",
    open: async (page) => {
      await signIn(page);
      await page.goto("/templates");
      // EV-337i: Rename sits behind the row's « ⋯ » disclosure.
      const more = page.getByRole("button", { name: "More actions" }).first();
      await settled(page, more);
      await expect(async () => {
        if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
        await expect(more).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
      }).toPass();
      return openDialog(page, page.getByRole("button", { name: "Rename" }).first(), "Rename template");
    },
    expectNames: [],
  },
  {
    name: "recipes: library filter",
    open: async (page) => {
      await signIn(page);
      await page.goto("/recipes");
      await settled(page, page.locator("#recipe-slot-filter"));
      return null;
    },
    // EV-337j2 (staff N2): the library's search is a text field Tab must reach, by name.
    expectNames: ["Search recipes"],
  },
  {
    name: "recipes: new",
    open: async (page) => {
      await signIn(page);
      await page.goto("/recipes/new");
      await settled(page, page.getByLabel("Find an ingredient"));
      return null;
    },
    expectNames: ["Find an ingredient"],
  },
  {
    name: "recipes: detail",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/recipes/${RECIPE}`);
      await settled(page, page.getByLabel("Find an ingredient"));
      return null;
    },
    expectNames: ["Find an ingredient"],
  },
  {
    name: "nutrition templates: new",
    open: async (page) => {
      await signIn(page);
      await page.goto("/nutrition-templates/new");
      await settled(page, page.locator("main input").first());
      return null;
    },
    expectNames: [],
  },
  {
    name: "nutrition templates: detail",
    open: async (page) => {
      await signIn(page);
      await createNutritionTemplate(page);
      await nutritionTemplateRow(page).getByRole("link", { name: "Edit" }).click();
      await page.waitForURL(/\/nutrition-templates\/[^/]+$/, { timeout: 10_000 });
      await settled(page, page.getByLabel("Template name"));
      return null;
    },
    expectNames: ["Template name", "Calories", "Protein", "Carbs", "Fat"],
  },
  {
    name: "nutrition templates: rename",
    open: async (page) => {
      await signIn(page);
      await createNutritionTemplate(page);
      return openDialog(page, nutritionTemplateRow(page).getByRole("button", { name: "Rename" }), "Rename template");
    },
    expectNames: [],
  },
  {
    name: "client: overview (progress goal)",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}`);
      await settled(page, page.getByRole("region", { name: "Progress and milestone" }));
      return null;
    },
    expectNames: ["Coaching start date", "Milestone weight (kg)", "Milestone body fat (%)"],
  },
  {
    name: "client: routine editor",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}/routine`);
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return null;
    },
    expectNames: [],
  },
  {
    name: "client: routine exercise catalogue search",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}/routine`);
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return openDialog(page, page.getByRole("button", { name: "Add exercise" }).first(), /exercise/i);
    },
    expectNames: [],
  },
  {
    name: "client: save as template",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}/routine`);
      await settled(page, page.getByRole("button", { name: "Save as template" }));
      return openDialog(page, page.getByRole("button", { name: "Save as template" }), /template/i);
    },
    expectNames: [],
  },
  {
    name: "client: nutrition editor",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}/nutrition`);
      await settled(page, page.getByLabel("Calories", { exact: true }));
      return null;
    },
    expectNames: ["Calories"],
  },
  {
    name: "client: swap sheet recipe search",
    open: async (page) => {
      await signIn(page, "coach.c1@evoli.fit");
      await page.goto(`/clients/${TESS}/nutrition`);
      const row = page.getByRole("group", { name: "Wednesday Lunch", exact: true });
      await settled(page, row);
      return openDialog(page, row.getByRole("button", { name: /^Swap meal: / }), "Swap meal");
    },
    expectNames: ["Search your recipes"],
  },
  {
    name: "challenges: create",
    open: async (page) => {
      await signIn(page);
      await page.goto("/challenges");
      await settled(page, page.getByRole("button", { name: "New challenge" }));
      return openDialog(page, page.getByRole("button", { name: "New challenge" }), "New challenge");
    },
    expectNames: ["Title", "Daily step goal", "Starts on", "Ends on"],
  },
];

// ─────────────────────────── the tests ───────────────────────────

let webkitBrowser: Browser | undefined;
test.afterAll(async () => {
  await webkitBrowser?.close();
});

/**
 * BUG-688 — the sweep starts only once every field the route names is DRAWN in the scope.
 *
 * A visible dialog is not a loaded one. The swap sheet draws « Search your recipes » only
 * after its library read (`recipeChoicesAction`, a server action) answers; until then it
 * shows « Loading your recipes… » and two buttons. On a cold `next dev` the first action
 * call is slow, so the sweep could Tab round Close and « Show suggestions », come back to
 * the first stop and stop there: 0 fields, « the keyboard reached no text field » (~1 run
 * in 20). Holding that action for 2 s turns it red on every run; this wait makes it green.
 *
 * It waits for the product's own witness, the named field, not for a time, and it only
 * waits: a field that never comes still fails here, by name.
 */
async function expectedFieldsDrawn(page: Page, scope: string | null, route: Route) {
  for (const want of route.expectNames) {
    await expect
      .poll(
        async () =>
          (await fieldsInScope(page, scope)).some((f) => f.name.toLowerCase().includes(want.toLowerCase())),
        { message: `${route.name}: "${want}" is never drawn in the scope`, timeout: 20_000 }
      )
      .toBe(true);
  }
}

async function pageFor(engine: Engine, page: Page, baseURL: string | undefined): Promise<Page> {
  if (engine === "chromium") {
    await page.setViewportSize(VIEWPORT);
    return page;
  }
  expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
  webkitBrowser ??= await webkit.launch();
  const context = await webkitBrowser.newContext({
    baseURL,
    locale: "en-US",
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    extraHTTPHeaders: { "Accept-Language": "en-US" },
  });
  return context.newPage();
}

for (const engine of ["chromium", "webkit"] as const) {
  test.describe(`BUG-663 — keyboard focus ring on every text field (${engine})`, () => {
    for (const route of ROUTES) {
      test(`${route.name}`, async ({ page: chromiumPage, baseURL }) => {
        const page = await pageFor(engine, chromiumPage, baseURL);
        try {
          const scope = await route.open(page);
          await expectedFieldsDrawn(page, scope, route);
          const { results, unreached } = await sweep(page, engine, scope);
          const report = results.map(
            (r) => `${r.failures.length ? "FAIL" : "ok  "} ${r.name}\n      ${r.indicator}\n      ${r.sides.join("\n      ")}${
              r.failures.length ? `\n      ✗ ${r.failures.join("\n      ✗ ")}` : ""
            }`
          );
          const body = `[BUG-663 ${engine}] ${route.name}: ${results.length} field(s)\n  ${report.join("\n  ")}\n`;
          await test.info().attach(`${engine}-${route.name}.txt`, { body, contentType: "text/plain" });
          // Evidence for a gate run: BUG663_EVIDENCE=<file> appends every field's reading.
          if (process.env.BUG663_EVIDENCE) appendFileSync(process.env.BUG663_EVIDENCE, body);

          expect(results.length, `${route.name}: the keyboard reached no text field`).toBeGreaterThan(0);
          for (const want of route.expectNames) {
            expect(
              results.some((r) => r.name.toLowerCase().includes(want.toLowerCase())),
              `${route.name}: "${want}" was not among the fields Tab reached: ${results.map((r) => r.name).join(", ")}`
            ).toBe(true);
          }
          expect(unreached, `${route.name}: visible text fields the keyboard never reached`).toEqual([]);
          expect(
            results.filter((r) => r.failures.length).map((r) => `${r.name}: ${r.failures.join("; ")}`),
            `${route.name}: text fields without a visible ≥${MIN_CONTRAST}:1 focus indicator`
          ).toEqual([]);
        } finally {
          if (engine === "webkit") await page.context().close();
        }
      });
    }
  });
}
