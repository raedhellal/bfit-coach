import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
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
 * At every Tab stop inside the Modal body that draws an outline, this spec checks two things.
 *   1. Geometry. The ring's outer box (the ring host's border box grown by outline-offset +
 *      outline-width, read from computed style) must lie inside the body's clip rect (its
 *      padding box) on all four sides.
 *   2. Paint. In a viewport screenshot, the middle of the ring band on each side must be the
 *      ring's colour in at least half of the sampled pixels.
 * It also checks for layout shift at every stop: the dialog's rect and the body's
 * scrollHeight must equal what they were when the dialog opened.
 *
 * Chromium only. WebKit is not verified by this spec.
 */

type Lang = "en" | "fr";
const LOCALES: Record<Lang, string> = { en: "en-US", fr: "fr-FR" };
const COPY = {
  en: { open: "New challenge", submit: "Create and invite", close: "Close" },
  fr: { open: "Nouveau défi", submit: "Créer et inviter", close: "Fermer" },
} as const;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 390, height: 600 },
];
const SHOTS = process.env.BUG668_SHOTS;

type Rect = { left: number; top: number; right: number; bottom: number };
type Stop = {
  name: string;
  inBody: boolean;
  /** null: the stop is in the body but draws no outline. */
  ring: (Rect & { color: string; width: number }) | null;
  /** A date field whose focus is in its calendar button: the field's kit-field box. */
  pickerBox: Rect | null;
  clip: Rect;
  dialog: Rect;
  scrollHeight: number;
  submit: boolean;
  close: boolean;
};

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
      // The ring host: the kit-field box when the box draws the ring (BUG-663), else the element.
      const parent = a.parentElement;
      const hosts = [parent && parent.classList.contains("kit-field") ? parent : null, a].filter(Boolean) as HTMLElement[];
      const host = hosts.find((h) => getComputedStyle(h).outlineStyle !== "none" && parseFloat(getComputedStyle(h).outlineWidth) > 0);
      let ring: Stop["ring"] = null;
      if (host) {
        const cs = getComputedStyle(host);
        const grow = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
        const h = host.getBoundingClientRect();
        ring = { left: h.left - grow, top: h.top - grow, right: h.right + grow, bottom: h.bottom + grow, color: cs.outlineColor, width: parseFloat(cs.outlineWidth) };
      }
      const inPicker = a instanceof HTMLInputElement && a.type === "date" && !a.matches(":focus") && !!parent?.classList.contains("kit-field");
      const pickerBox = inPicker && parent ? r(parent.getBoundingClientRect()) : null;
      const name = (a.getAttribute("aria-label") || (a as HTMLInputElement).type || "") + " " + (a.textContent || "").trim().slice(0, 30);
      return {
        name: `<${a.tagName.toLowerCase()}> ${name.trim()}`,
        inBody: body.contains(a),
        ring,
        pickerBox,
        clip,
        dialog: r(dialog.getBoundingClientRect()),
        scrollHeight: body.scrollHeight,
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

/** Fraction of the samples along the middle of each side's ring band that are the ring's colour. */
function paintedSides(png: Buffer, ring: NonNullable<Stop["ring"]>): Record<"top" | "right" | "bottom" | "left", number> {
  const { width, height, rgba } = decodePng(png);
  const want = parseRgb(ring.color);
  const mid = ring.width / 2;
  const isRing = (x: number, y: number) => {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return false;
    const i = (py * width + px) * 4;
    return Math.abs(rgba[i] - want[0]) <= 40 && Math.abs(rgba[i + 1] - want[1]) <= 40 && Math.abs(rgba[i + 2] - want[2]) <= 40;
  };
  const along = (from: number, to: number, at: (t: number) => [number, number]) => {
    // The middle 60 % of the side: away from the rounded corners.
    const n = 15;
    let hit = 0;
    for (let k = 0; k < n; k++) {
      const [x, y] = at(from + ((to - from) * (0.2 + (0.6 * k) / (n - 1))));
      if (isRing(x, y)) hit++;
    }
    return hit / n;
  };
  return {
    top: along(ring.left, ring.right, (x) => [x, ring.top + mid]),
    bottom: along(ring.left, ring.right, (x) => [x, ring.bottom - mid]),
    left: along(ring.top, ring.bottom, (y) => [ring.left + mid, y]),
    right: along(ring.top, ring.bottom, (y) => [ring.right - mid, y]),
  };
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

for (const lang of ["fr", "en"] as const) {
  for (const vp of VIEWPORTS) {
    for (const dir of ["forward", "backward"] as const) {
      test.describe(`BUG-668 ${lang} ${vp.width}×${vp.height}`, () => {
        test.use({ viewport: vp, locale: LOCALES[lang] });

        test(`challenge dialog: every focused field's ring is painted on all four sides, walking ${dir}`, async ({ page }) => {
          test.setTimeout(120_000);
          await openChallengeDialog(page, lang);
          const { submit, close } = COPY[lang];
          const key = dir === "forward" ? "Tab" : "Shift+Tab";
          if (dir === "backward") {
            // Reach « Créer et inviter » the way a keyboard user does: Tab down through the body.
            for (let i = 0; i < 60 && !(await readStop(page, submit, close)).submit; i++) await page.keyboard.press("Tab");
            expect((await readStop(page, submit, close)).submit, `Tab reaches « ${submit} »`).toBe(true);
          }
          const start = await readStop(page, submit, close);
          const failures: string[] = [];
          const measured: string[] = [];
          let fields = 0;
          for (let i = 0; i < 60; i++) {
            await page.keyboard.press(key);
            // Focus scrolling is synchronous, but give one frame for paint before the screenshot.
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            const s = await readStop(page, submit, close);
            if ((dir === "forward" && s.submit) || (dir === "backward" && s.close)) break;
            if (s.dialog.top !== start.dialog.top || s.dialog.bottom !== start.dialog.bottom || s.scrollHeight !== start.scrollHeight) {
              failures.push(`${s.name}: layout shift (dialog ${JSON.stringify(start.dialog)} → ${JSON.stringify(s.dialog)}, scrollHeight ${start.scrollHeight} → ${s.scrollHeight})`);
            }
            if (!s.inBody) continue;
            if (!s.ring && s.pickerBox) {
              // Chromium gives a date field one more Tab stop after its segments: the calendar
              // button in the field's UA shadow. The <input> stays document.activeElement but
              // matches neither :focus nor :focus-visible, so BUG-663's box ring is not drawn.
              // Chromium draws its own small ring on the button, inside the field (screenshot
              // 2026-10-31). Out of BUG-668's scope. Checked here: the field's box is not cut.
              const box = s.pickerBox;
              const cutBox = box.top < s.clip.top - 0.01 || box.bottom > s.clip.bottom + 0.01;
              measured.push(`${s.name}: calendar button, field box ${box.top.toFixed(1)}..${box.bottom.toFixed(1)}`);
              if (cutBox) failures.push(`${s.name}: calendar-button stop, the field's box is outside the clip`);
              continue;
            }
            if (!s.ring) {
              failures.push(`${s.name}: no outline drawn`);
              continue;
            }
            if (s.name.startsWith("<input>") && !s.name.includes("checkbox")) fields++;
            const cut = (["top", "bottom", "left", "right"] as const).filter((side) =>
              side === "top" || side === "left" ? s.ring![side] < s.clip[side] - 0.01 : s.ring![side] > s.clip[side] + 0.01,
            );
            const png = await page.screenshot();
            const painted = paintedSides(png, s.ring);
            const unpainted = (Object.keys(painted) as (keyof typeof painted)[]).filter((side) => painted[side] < 0.5);
            const line = `${s.name}: ring ${s.ring.top.toFixed(1)}..${s.ring.bottom.toFixed(1)} clip ${s.clip.top.toFixed(1)}..${s.clip.bottom.toFixed(1)} painted ${JSON.stringify(painted)}`;
            measured.push(line);
            const bad = cut.length > 0 || unpainted.length > 0;
            if (bad) failures.push(`${line} — outside the clip: [${cut.join(",")}], not painted: [${unpainted.join(",")}]`);
            // BUG668_SHOTS=<dir>: every measured stop's screenshot, named CUT or ok, for a reviewer.
            if (SHOTS) {
              mkdirSync(SHOTS, { recursive: true });
              const field = s.name.replace(/^<\w+>\s*/, "").replace(/\W+/g, "-").slice(0, 30);
              writeFileSync(join(SHOTS, `${lang}-${vp.height}-${dir}-${String(i).padStart(2, "0")}-${field}-${bad ? "CUT" : "ok"}.png`), png);
            }
          }
          // eslint-disable-next-line no-console -- the measured geometry is the run's evidence, in the log
          console.log(`[BUG-668 ${lang} ${vp.width}x${vp.height} ${dir}] dialog ${JSON.stringify(start.dialog)} body scrollHeight ${start.scrollHeight}; ${measured.length} stops measured\n  ${measured.join("\n  ")}`);
          // Title, daily target, start, end: the four kit Inputs of the dialog.
          expect(fields, "the walk reached the dialog's four fields").toBeGreaterThanOrEqual(4);
          expect(failures, failures.join("\n")).toEqual([]);
        });
      });
    }
  }
}
