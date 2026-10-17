import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The content probes `locale-bundle.spec.ts` and `locale-chunk-preload.spec.ts` recognise a
 * dictionary chunk by: one dictionary VALUE per language that appears NOWHERE else in `src/`.
 *
 * "Nowhere" includes comments: `next dev` serves client modules with their comments, so a
 * probe quoted in a comment of any module a page imports makes that page's chunk look like a
 * dictionary. BUG-861: BUG-839's comment in `src/components/ui/modalFocus.ts` quoted
 * « Add a client »; every page importing `ui/kit.tsx` then "shipped" English under `next dev`
 * (not under `next build`, which strips comments), and 10 Chromium tests went red on counts
 * and on aborting a page chunk instead of the dictionary.
 *
 * `probeLeaks()` is the precondition both specs check first, so the next such collision fails
 * with the file and line that broke it rather than as a wrong count.
 */
export const PROBE = { en: "Add a client", fr: "Ouvrir le plan" } as const;
export type Lang = keyof typeof PROBE;

/** The only files a probe may appear in: its own dictionary. */
const HOME: Record<Lang, string> = { en: "src/lib/copy.ts", fr: "src/lib/copy.fr.ts" };

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs|cjs|css|json)$/.test(entry.name) ? [path] : [];
  });
}

/** Every `file:line` under `src/` that holds a probe outside its own dictionary. */
export function probeLeaks(): string[] {
  const leaks: string[] = [];
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const rel = relative(ROOT, file).split("\\").join("/");
    const lines = readFileSync(file, "utf8").split("\n");
    for (const lang of ["en", "fr"] as const) {
      if (rel === HOME[lang]) continue;
      lines.forEach((line, i) => {
        if (line.includes(PROBE[lang])) leaks.push(`${rel}:${i + 1} holds the ${lang} probe "${PROBE[lang]}"`);
      });
    }
  }
  return leaks;
}
