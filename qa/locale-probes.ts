import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The content probes `locale-bundle.spec.ts` and `locale-chunk-preload.spec.ts` recognise a
 * dictionary chunk by: one dictionary VALUE per language, which those specs need to be absent
 * from every other module in `src/`.
 *
 * That includes comments: `next dev` serves client modules with their comments, so a probe
 * quoted in a comment of any module a page imports makes that page's chunk look like a
 * dictionary. BUG-861: BUG-839's comment in `src/components/ui/modalFocus.ts` quoted
 * « Add a client »; every page importing `ui/kit.tsx` then "shipped" English under `next dev`
 * (not under `next build`, which strips comments), and 10 Chromium tests went red on counts
 * and on aborting a page chunk instead of the dictionary.
 *
 * `probeLeaks()` is the precondition both specs check first. It searches each file whole, with
 * any run of whitespace (newlines included) between the probe's words, so JSX text that
 * Prettier wraps across lines (`<b>\n  Add a\n  client\n</b>`, which SWC collapses into the
 * probe) is caught as well as a one-line string or comment. It reports the line the match
 * starts on. It is a text search, not a model of what Next ships: a probe built at runtime
 * (concatenated, escaped) would get past it.
 *
 * It scans every file under `src/`, server-only modules included, although only client modules
 * reach the browser: that over-reports, which errs on the safe side.
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

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `probe` with any whitespace, newlines included, between its words. */
const flexible = (probe: string) => new RegExp(probe.split(" ").map(escape).join("\\s+"), "g");

/** Every `file:line` under `src/` where a probe starts, outside its own dictionary. */
export function probeLeaks(): string[] {
  const leaks: string[] = [];
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const rel = relative(ROOT, file).split("\\").join("/");
    const text = readFileSync(file, "utf8");
    for (const lang of ["en", "fr"] as const) {
      if (rel === HOME[lang]) continue;
      for (const m of text.matchAll(flexible(PROBE[lang]))) {
        const line = text.slice(0, m.index).split("\n").length;
        leaks.push(`${rel}:${line} holds the ${lang} probe "${PROBE[lang]}"`);
      }
    }
  }
  return leaks;
}
