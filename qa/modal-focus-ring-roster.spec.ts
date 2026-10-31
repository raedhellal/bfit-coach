import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, webkit, type Browser, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { decodePng } from "./focus-ring-sweep";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-668 — the kit `Modal`'s body (`[data-modal-body]`, `overflow-y: auto`) cut the keyboard
 * focus ring. BUG-663 draws the ring as a 2 px outline 2 px OUTSIDE the field's box. When a Tab
 * scrolls a field into view, the browser brings the element it scrolls to the body's edge and no
 * further. For a text field that is the <input>, 1 px inside the box. For a date field in
 * Chromium it is a UA part inside the field (a segment or the calendar button), measured 14 px
 * in. Either way the ring band, and on a date field the box's border too, ended up outside the
 * body's clip rect and was not painted. QA's repro in « Nouveau défi »: 390×844 Shift+Tab from
 * « Créer et inviter » to « Début »; 390×600 Tab to « Fin ». Both are red on main 2339fc8b here.
 *
 * Run by `playwright.roster.config.ts`: « Créer et inviter » is only enabled with clients to
 * invite, and only the POPULATED scenario has any. Under the main config's `empty` scenario the
 * dialog has no checkbox list, so the walk would be shorter and miss the scroll.
 *
 * At every Tab stop inside the Modal body that draws an outline, and at the stop the walk starts
 * from, this spec checks:
 *   1. Geometry — THE GATE. The ring's outer box (the ring host's border box grown by
 *      outline-offset + outline-width, read from computed style) must lie inside the body's clip
 *      rect (its padding box) on all four sides.
 *   2. Paint — a coarse second check only. In a viewport screenshot, the MIDDLE of the ring band
 *      on each side must be the ring's colour in at least half of the sampled pixels. A cut of
 *      1 px from the outer edge leaves the middle painted, so only (1) catches a partial cut.
 *      Misses are logged with their colour. The right side reads 0.73-0.87 on an uncut ring
 *      (Chromium, 2026-10-31): its sample x = right − 1 floors to the band's OUTER pixel
 *      column (the left side's floors to the inner one), and near the ends, inside the
 *      outline's corner radius (--r-md 11 + 2 offset), that column is antialiased —
 *      logged as rgb(161,185,255) against #4F7CFF with the ring at x 33..357.
 *   3. No layout shift: the dialog's rect (all four sides) and the body's scrollHeight equal
 *      what they were when the walk started.
 *   4. The walk reaches its end stop (« Créer et inviter » forward, Close backward) within the
 *      press budget, and the kit fields it focused are exactly the dialog's.
 *
 * Engines: Chromium, and a WebKit leg (repo pattern: `qa/focus-ring-sweep.ts`'s `pageFor`).
 * WebKit is ASSERTED installed, so where it is missing those tests fail on that assertion; they
 * are not skipped. On macOS, WebKit's plain Tab skips buttons, so its walk uses Alt+Tab.
 */

type Lang = "en" | "fr";
type Engine = "chromium" | "webkit";
type Viewport = { width: number; height: number };
const LOCALES: Record<Lang, string> = { en: "en-US", fr: "fr-FR" };
const COPY = {
  en: { open: "New challenge", submit: "Create and invite", close: "Close", title: "Title", goal: "Daily step goal", start: "Starts on", end: "Ends on" },
  fr: { open: "Nouveau défi", submit: "Créer et inviter", close: "Fermer", title: "Titre", goal: "Objectif de pas par jour", start: "Début", end: "Fin" },
} as const;
const VIEWPORTS: Viewport[] = [
  { width: 390, height: 844 },
  { width: 390, height: 600 },
];
const SHOTS = process.env.BUG668_SHOTS;
const MAC = process.platform === "darwin";

type Rect = { left: number; top: number; right: number; bottom: number };
type Stop = {
  name: string;
  /** The aria-label of a focused kit Input (`.kit-field > input`, not a checkbox), else null. */
  field: string | null;
  inBody: boolean;
  /** null: the stop draws no outline. */
  ring: (Rect & { color: string; width: number }) | null;
  /** The focused kit Input's box (`.kit-field`), else null. */
  fieldBox: Rect | null;
  /** A date field whose focus is in its calendar button (Chromium): the <input> is active but not :focus. */
  picker: boolean;
  clip: Rect;
  dialog: Rect;
  scrollHeight: number;
  /** The body's scrollTop at this stop, for the log. */
  scrollTop: number;
  submit: boolean;
  close: boolean;
};

let webkitBrowser: Browser | undefined;
test.afterAll(async () => {
  await webkitBrowser?.close();
  webkitBrowser = undefined;
});

/** Chromium: the fixture's page (viewport and locale from `test.use`). WebKit: a new context. */
async function pageFor(engine: Engine, page: Page, baseURL: string | undefined, vp: Viewport, lang: Lang): Promise<Page> {
  if (engine === "chromium") return page;
  expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
  webkitBrowser ??= await webkit.launch();
  const context = await webkitBrowser.newContext({
    baseURL,
    locale: LOCALES[lang],
    viewport: vp,
    deviceScaleFactor: 1,
    extraHTTPHeaders: { "Accept-Language": LOCALES[lang] },
  });
  return context.newPage();
}

const keys = (engine: Engine) =>
  engine === "webkit" && MAC ? { next: "Alt+Tab", prev: "Alt+Shift+Tab" } : { next: "Tab", prev: "Shift+Tab" };

async function readStop(page: Page, submitName: string, closeName: string): Promise<Stop> {
  return page.evaluate(
    ([submitName, closeName]) => {
      const a = document.activeElement as HTMLElement;
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
      const body = dialog.querySelector("[data-modal-body]") as HTMLElement;
      const r = (x: DOMRect) => ({ left: x.left, top: x.top, right: x.right, bottom: x.bottom });
      const b = body.getBoundingClientRect();
      // The clip rect of an overflow box is its padding box: inside the borders.
      const clip = {
        left: b.left + body.clientLeft,
        top: b.top + body.clientTop,
        right: b.left + body.clientLeft + body.clientWidth,
        bottom: b.top + body.clientTop + body.clientHeight,
      };
      const parent = a.parentElement;
      const kitField = parent && parent.classList.contains("kit-field") && a instanceof HTMLInputElement && a.type !== "checkbox" ? parent : null;
      // The ring host: the kit-field box when the box draws the ring (BUG-663), else the element.
      const hosts = [kitField, a].filter(Boolean) as HTMLElement[];
      const host = hosts.find((h) => getComputedStyle(h).outlineStyle !== "none" && parseFloat(getComputedStyle(h).outlineWidth) > 0);
      let ring: Stop["ring"] = null;
      if (host) {
        const cs = getComputedStyle(host);
        const grow = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
        const h = host.getBoundingClientRect();
        ring = { left: h.left - grow, top: h.top - grow, right: h.right + grow, bottom: h.bottom + grow, color: cs.outlineColor, width: parseFloat(cs.outlineWidth) };
      }
      const picker = !!kitField && (a as HTMLInputElement).type === "date" && !a.matches(":focus");
      const name = (a.getAttribute("aria-label") || (a as HTMLInputElement).type || "") + " " + (a.textContent || "").trim().slice(0, 30);
      return {
        name: `<${a.tagName.toLowerCase()}> ${name.trim()}${picker ? " (calendar button)" : ""}`,
        field: kitField ? a.getAttribute("aria-label") : null,
        inBody: body.contains(a),
        ring,
        fieldBox: kitField ? r(kitField.getBoundingClientRect()) : null,
        picker,
        clip,
        dialog: r(dialog.getBoundingClientRect()),
        scrollHeight: body.scrollHeight,
        scrollTop: body.scrollTop,
        submit: a.tagName === "BUTTON" && (a.textContent || "").trim() === submitName,
        close: a.getAttribute("aria-label") === closeName,
      };
    },
    [submitName, closeName] as const,
  );
}

function parseRgb(css: string): [number, number, number] {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`unparsed colour ${css}`);
  const [r, g, b] = m[1].split(",").map((v) => parseFloat(v));
  return [r, g, b];
}

type Side = "top" | "right" | "bottom" | "left";
const SIDES: Side[] = ["top", "right", "bottom", "left"];

/**
 * Per side: the share of samples along the MIDDLE of the ring band that are the ring's colour,
 * and the first miss (position and colour), for the log.
 */
function paintedSides(png: Buffer, ring: NonNullable<Stop["ring"]>): Record<Side, { share: number; miss?: string }> {
  const { width, height, rgba } = decodePng(png);
  const want = parseRgb(ring.color);
  const mid = ring.width / 2;
  const px = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return null;
    const i = (iy * width + ix) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
  };
  const along = (from: number, to: number, at: (t: number) => [number, number]) => {
    // The middle 60 % of the side: away from the rounded corners.
    const n = 15;
    let hit = 0;
    let miss: string | undefined;
    for (let k = 0; k < n; k++) {
      const [x, y] = at(from + (to - from) * (0.2 + (0.6 * k) / (n - 1)));
      const c = px(x, y);
      if (c && c.every((v, j) => Math.abs(v - want[j]) <= 40)) hit++;
      else miss ??= `(${Math.floor(x)},${Math.floor(y)}) ${c ? `rgb(${c.join(",")})` : "off-screen"}`;
    }
    return { share: Math.round((hit / n) * 100) / 100, miss };
  };
  return {
    top: along(ring.left, ring.right, (x) => [x, ring.top + mid]),
    right: along(ring.top, ring.bottom, (y) => [ring.right - mid, y]),
    bottom: along(ring.left, ring.right, (x) => [x, ring.bottom - mid]),
    left: along(ring.top, ring.bottom, (y) => [ring.left + mid, y]),
  };
}

/** Pixels that differ (any channel by > 60) between two shots, in a box-relative region. */
function changedPixels(a: Buffer, boxA: Rect, b: Buffer, boxB: Rect, region: (box: Rect) => Rect): number {
  const A = decodePng(a);
  const B = decodePng(b);
  const ra = region(boxA);
  const rb = region(boxB);
  let n = 0;
  for (let dy = 0; dy < Math.floor(ra.bottom - ra.top); dy++) {
    for (let dx = 0; dx < Math.floor(ra.right - ra.left); dx++) {
      const ia = ((Math.floor(ra.top) + dy) * A.width + Math.floor(ra.left) + dx) * 4;
      const ib = ((Math.floor(rb.top) + dy) * B.width + Math.floor(rb.left) + dx) * 4;
      if ([0, 1, 2].some((k) => Math.abs(A.rgba[ia + k] - B.rgba[ib + k]) > 60)) n++;
    }
  }
  return n;
}

function shot(png: Buffer, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(join(SHOTS, `${name.replace(/[^\w.-]+/g, "-")}.png`), png);
}

async function openChallengeDialog(page: Page, lang: Lang) {
  await signInThroughForm(page, { lang });
  await page.goto("/challenges");
  const trigger = page.getByRole("button", { name: COPY[lang].open }).first();
  await expect(trigger).toBeVisible();
  await page.waitForLoadState("load");
  const dialog = page.getByRole("dialog", { name: COPY[lang].open });
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  // There are clients to invite, so the walk passes the checkbox list and the body scrolls.
  await expect(dialog.getByRole("checkbox").first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: COPY[lang].submit })).toBeEnabled();
}

const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

for (const engine of ["chromium", "webkit"] as const) {
  for (const lang of ["fr", "en"] as const) {
    for (const vp of VIEWPORTS) {
      test.describe(`BUG-668 ${engine} ${lang} ${vp.width}×${vp.height}`, () => {
        test.use({ viewport: vp, locale: LOCALES[lang] });

        for (const dir of ["forward", "backward"] as const) {
          test(`challenge dialog: every focused field's ring is painted on all four sides, walking ${dir}`, async ({ page: fixturePage, baseURL }) => {
            test.setTimeout(120_000);
            const page = await pageFor(engine, fixturePage, baseURL, vp, lang);
            try {
              await openChallengeDialog(page, lang);
              const c = COPY[lang];
              const { next, prev } = keys(engine);
              const key = dir === "forward" ? next : prev;
              const tag = `${engine}-${lang}-${vp.height}-${dir}`;
              const BUDGET = 60;
              if (dir === "backward") {
                // Reach « Créer et inviter » the way a keyboard user does: Tab down through the body.
                for (let i = 0; i < BUDGET && !(await readStop(page, c.submit, c.close)).submit; i++) await page.keyboard.press(next);
                expect((await readStop(page, c.submit, c.close)).submit, `Tab reaches « ${c.submit} »`).toBe(true);
              }
              const start = await readStop(page, c.submit, c.close);
              const failures: string[] = [];
              const measured: string[] = [];
              const tabbedFields = new Set<string>();
              // Per date field: one segment stop and its calendar-button stop, for the S5 witness.
              const dateShots = new Map<string, { segment?: { png: Buffer; box: Rect }; picker?: { png: Buffer; box: Rect } }>();

              const measure = async (s: Stop, label: string) => {
                if (JSON.stringify(s.dialog) !== JSON.stringify(start.dialog) || s.scrollHeight !== start.scrollHeight) {
                  failures.push(`${s.name}: layout shift (dialog ${JSON.stringify(start.dialog)} → ${JSON.stringify(s.dialog)}, scrollHeight ${start.scrollHeight} → ${s.scrollHeight})`);
                }
                if (!s.inBody) return;
                const png = await page.screenshot();
                if (s.picker && s.fieldBox && s.field) {
                  // Chromium gives a date field one more Tab stop after its segments: the calendar
                  // button in the field's UA shadow. The <input> stays document.activeElement but
                  // matches neither :focus nor :focus-visible, so BUG-663's box ring is not drawn
                  // there; Chromium draws its own ring round the button, inside the field. That
                  // claim is witnessed below (pixels changed against a segment stop) and the
                  // screenshot is saved. Out of BUG-668's scope; checked here: the box is not cut.
                  const box = s.fieldBox;
                  measured.push(`${s.name}: scrollTop ${s.scrollTop} field box ${box.top.toFixed(1)}..${box.bottom.toFixed(1)}`);
                  if (box.top < s.clip.top - 0.01 || box.bottom > s.clip.bottom + 0.01) failures.push(`${s.name}: the field's box is outside the clip`);
                  dateShots.set(s.field, { ...dateShots.get(s.field), picker: { png, box } });
                  shot(png, `${tag}-${label}-${s.field}-calendar-button`);
                  return;
                }
                if (!s.ring) {
                  failures.push(`${s.name}: no outline drawn`);
                  return;
                }
                if (s.field && s.fieldBox && engine === "chromium" && !dateShots.get(s.field)?.segment) {
                  dateShots.set(s.field, { ...dateShots.get(s.field), segment: { png, box: s.fieldBox } });
                }
                const cut = SIDES.filter((side) => (side === "top" || side === "left" ? s.ring![side] < s.clip[side] - 0.01 : s.ring![side] > s.clip[side] + 0.01));
                const painted = paintedSides(png, s.ring);
                const unpainted = SIDES.filter((side) => painted[side].share < 0.5);
                const misses = SIDES.filter((side) => painted[side].miss).map((side) => `${side} ${painted[side].share} first miss ${painted[side].miss}`);
                const line = `${s.name}: scrollTop ${s.scrollTop} ring y ${s.ring.top.toFixed(1)}..${s.ring.bottom.toFixed(1)} x ${s.ring.left.toFixed(2)}..${s.ring.right.toFixed(2)} clip y ${s.clip.top.toFixed(1)}..${s.clip.bottom.toFixed(1)}${misses.length ? ` | ${misses.join("; ")}` : " | painted on all four"}`;
                measured.push(line);
                const bad = cut.length > 0 || unpainted.length > 0;
                if (bad) failures.push(`${line} — outside the clip: [${cut.join(",")}], not painted: [${unpainted.join(",")}]`);
                shot(png, `${tag}-${label}-${(s.field ?? s.name).slice(0, 30)}-${bad ? "CUT" : "ok"}`);
              };

              // The stop the walk starts from is measured too: forward, it is the Title field
              // (the dialog's initial focus), which no Tab in this walk reaches.
              if (dir === "forward") {
                expect(start.field, "forward: the walk starts on the Title field").toBe(c.title);
                await measure(start, "00-start");
              }
              let reached = false;
              for (let i = 1; i <= BUDGET; i++) {
                await page.keyboard.press(key);
                // Focus scrolling is synchronous, but give the paint a frame before the screenshot.
                await frames(page);
                const s = await readStop(page, c.submit, c.close);
                if ((dir === "forward" && s.submit) || (dir === "backward" && s.close)) {
                  reached = true;
                  break;
                }
                if (s.field) tabbedFields.add(s.field);
                await measure(s, String(i).padStart(2, "0"));
              }
              // eslint-disable-next-line no-console -- the measured geometry is the run's evidence, in the log
              console.log(`[BUG-668 ${tag}] dialog ${JSON.stringify(start.dialog)} body scrollHeight ${start.scrollHeight}; ${measured.length} stops measured\n  ${measured.join("\n  ")}`);

              expect(reached, `the walk reaches ${dir === "forward" ? `« ${c.submit} »` : `« ${c.close} »`} within ${BUDGET} presses`).toBe(true);
              const want = dir === "forward" ? [c.goal, c.start, c.end] : [c.title, c.goal, c.start, c.end];
              expect([...tabbedFields].sort(), `the kit fields the ${dir} walk focused`).toEqual([...want].sort());

              // S5: the calendar-button stop shows something the segment stop does not, in the
              // field's right end (inside the box border, where the calendar icon is): its ring.
              for (const [field, { segment, picker }] of dateShots) {
                if (!picker) continue;
                expect(segment, `${field}: a segment stop to compare the calendar-button stop with`).toBeTruthy();
                const region = (box: Rect) => ({ left: box.right - 40, right: box.right - 3, top: box.top + 3, bottom: box.bottom - 3 });
                const changed = changedPixels(picker.png, picker.box, segment!.png, segment!.box, region);
                measured.push(`${field} calendar button: ${changed} px changed against a segment stop`);
                // eslint-disable-next-line no-console -- evidence
                console.log(`[BUG-668 ${tag}] ${field} calendar-button stop: ${changed} px in the field's right end differ from a segment stop`);
                expect(changed, `${field}: the calendar-button stop paints a ring of its own in the field's right end`).toBeGreaterThanOrEqual(20);
              }
              expect(failures, failures.join("\n")).toEqual([]);
            } finally {
              if (engine === "webkit") await page.context().close();
            }
          });
        }
      });
    }
  }
}

/**
 * S4 (staff): a POINTER focus on a field partly inside the 20 px scroll-padding band. Clicked at
 * its centre with `page.mouse` (a locator click would scroll it into view first). Two positions,
 * the field's box top at clip top + 8 (wholly visible, in the band) and at clip top − 10 (cut).
 * Records the body's scrollTop before and after the click.
 */
for (const engine of ["chromium", "webkit"] as const) {
  test.describe(`BUG-668 ${engine} pointer focus in the scroll-padding band`, () => {
    const vp = { width: 390, height: 600 };
    test.use({ viewport: vp, locale: LOCALES.en });

    test("a click on « Daily step goal » near the body's top edge: does the body scroll?", async ({ page: fixturePage, baseURL }) => {
      test.setTimeout(120_000);
      const page = await pageFor(engine, fixturePage, baseURL, vp, "en");
      try {
        await openChallengeDialog(page, "en");
        const results: { offset: number; before: number; after: number; boxTop: number; clipTop: number }[] = [];
        for (const offset of [8, -10]) {
          // Focus Title (the initial focus) so the click is a real focus change each time.
          await page.getByRole("dialog").getByLabel(COPY.en.title).focus();
          const placed = await page.evaluate(
            ([label, offset]) => {
              const body = document.querySelector("[data-modal-body]") as HTMLElement;
              const input = body.querySelector(`input[aria-label="${label}"]`) as HTMLElement;
              const box = input.parentElement as HTMLElement;
              const clipTop = body.getBoundingClientRect().top + body.clientTop;
              body.scrollTop += box.getBoundingClientRect().top - (clipTop + offset);
              const b = box.getBoundingClientRect();
              return { scrollTop: body.scrollTop, boxTop: b.top, clipTop, x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
            },
            [COPY.en.goal, offset] as const,
          );
          await frames(page);
          await page.mouse.click(placed.x, placed.y);
          await expect(page.getByRole("dialog").getByLabel(COPY.en.goal)).toBeFocused();
          await frames(page);
          await page.waitForTimeout(300);
          const after = await page.evaluate(() => (document.querySelector("[data-modal-body]") as HTMLElement).scrollTop);
          results.push({ offset, before: placed.scrollTop, after, boxTop: placed.boxTop, clipTop: placed.clipTop });
          shot(await page.screenshot(), `${engine}-pointer-offset${offset}`);
        }
        const body = results
          .map((r) => `box top at clip ${r.offset >= 0 ? "+" : ""}${r.offset} (box ${r.boxTop.toFixed(1)}, clip ${r.clipTop.toFixed(1)}): scrollTop ${r.before} → ${r.after}${r.after === r.before ? " (no scroll)" : ` (scrolled ${r.after - r.before})`}`)
          .join("\n  ");
        // eslint-disable-next-line no-console -- the reading is the evidence staff asked for
        console.log(`[BUG-668 ${engine} pointer]\n  ${body}`);
        await test.info().attach(`${engine}-pointer.txt`, { body, contentType: "text/plain" });
        // The repo's rule for a pointer focus (FocusClearOfBars.tsx, staff B2 of EV-337i): the coach
        // is looking at what they clicked, so nothing scrolls. Scroll-padding only moves where a
        // scroll STOPS; it must not start one on a click.
        for (const r of results) expect(r.after, `box top at clip ${r.offset}: a click scrolled the Modal body`).toBe(r.before);
      } finally {
        if (engine === "webkit") await page.context().close();
      }
    });
  });
}
