import { expect, type Page } from "@playwright/test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";

/**
 * EV-324 — what the French specs share: the footer sentences (literals), the English-leftover
 * guard and the French sign-in. See `coach-french.spec.ts` for what each check means.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

export const FOOTER_FR =
  "Plans alimentaires destinés à des personnes en bonne santé. Ils ne remplacent pas un avis médical ni le suivi d'un diététicien.";
export const FOOTER_EN = "Meal plans for healthy people. They do not replace medical advice or care from a dietitian.";

/** Every static string of a dictionary. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value !== null && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

/**
 * English strings that French words differently. A string the two share ("Nutrition",
 * "Calories", "kcal") is not evidence of anything, and very short ones ("g", "OK") would
 * match content.
 */
const ENGLISH_ONLY = [...new Set(strings(en))].filter((s) => s.trim().length >= 4 && !strings(fr).includes(s));

export async function signInFrench(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("/");
}

/** Visible text nodes and the accessible/hint attributes of the whole page. */
async function pageStrings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (parent?.closest("script, style, noscript, template")) continue;
      const text = (walker.currentNode.textContent ?? "").trim();
      if (text) out.push(text);
    }
    for (const el of Array.from(document.querySelectorAll("[aria-label], [title], [placeholder], [alt]"))) {
      for (const attr of ["aria-label", "title", "placeholder", "alt"]) {
        const v = el.getAttribute(attr)?.trim();
        if (v) out.push(v);
      }
    }
    return out;
  });
}

export async function expectNoEnglish(page: Page, where: string) {
  const seen = await pageStrings(page);
  const leftovers = seen.filter(
    (text) => ENGLISH_ONLY.includes(text) || ENGLISH_ONLY.some((en) => en.length >= 20 && text.includes(en))
  );
  expect(leftovers, `English UI strings on ${where} in a French browser`).toEqual([]);
}

/** AC5b: the footer line, verbatim, on screen at 1280 × 800 without scrolling. */
export async function expectFooterOnScreen(page: Page, sentence: string) {
  const footer = page.getByRole("contentinfo");
  await expect(footer).toHaveText(sentence);
  const box = await footer.boundingBox();
  expect(box, "the legal footer has a box").not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5);
  // Nothing painted over it: the element at its centre is the footer or inside it.
  const onTop = await page.evaluate(
    ({ x, y }) => !!document.elementFromPoint(x, y)?.closest("footer"),
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  );
  expect(onTop, "the footer is not covered at its centre").toBe(true);
}
