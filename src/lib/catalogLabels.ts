import type { Copy } from "./copy";
import { intlLocale } from "./i18n/locale";

/**
 * BUG-489 — the exercise catalogue's muscle and equipment values, as words a coach reads.
 *
 * The values are catalogue DATA, not a published enum: b-fit-api derives the picker's two
 * option lists from the rows it serves (`distinctTargetMuscles` / `distinctEquipment`), so
 * the seeded catalogue says "t_spine" and "DUMBBELLS" while a provider-synced one says what
 * that provider says. The tables (`copy.catalog`) cover what is witnessed; everything else
 * goes through the fallback below. The VALUE sent back to the api as a filter is always the
 * raw one — only the label changes.
 *
 * Not translated on purpose: the exercise NAMES ("Box Squat (Barbell)"), which are the
 * api's content (EV-324 R3).
 */

/** "BARBELL", "Barbell", "smith-machine", "Smith Machine" → one key each. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * A value no table has. A TOKEN ("upper_arms", "RESISTANCE_BAND") is humanised — "Upper
 * arms", "Resistance band" — because a raw token is what this row exists to stop printing.
 * A value that is already words ("Traps (mid-back)") is shown exactly as served: lower-casing
 * and splitting it would only damage it.
 */
function fallback(raw: string): string {
  const value = raw.trim();
  const isToken = value.includes("_") || (/^[A-Z0-9]+$/.test(value) && value.length > 3);
  if (!isToken) return value;
  const words = value.toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function muscleLabel(raw: string, copy: Copy): string {
  return copy.catalog.muscles[normalise(raw)] ?? fallback(raw);
}

export function equipmentLabel(raw: string, copy: Copy): string {
  return copy.catalog.equipment[normalise(raw)] ?? fallback(raw);
}

/**
 * A row's `primaryMuscles`, which is a comma-joined list on the wire ("quads,glutes"):
 * "Quadriceps, Fessiers". Blanks and repeats are dropped.
 */
export function musclesLabel(raw: string, copy: Copy): string {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    if (part.trim() === "") continue;
    const label = muscleLabel(part, copy);
    if (!out.includes(label)) out.push(label);
  }
  return out.join(", ");
}

/**
 * A filter's options as `{ value, label }`: the raw value is what the api filters on, the
 * label is what the coach reads, and the list is in the order of the LABELS in the page's
 * language (the api sorts its raw values, which in French is no order at all).
 */
export function filterOptions(
  values: readonly string[],
  label: (raw: string, copy: Copy) => string,
  copy: Copy
): { value: string; label: string }[] {
  const collator = new Intl.Collator(intlLocale(copy.locale), { sensitivity: "base" });
  return values
    .map((value) => ({ value, label: label(value, copy) }))
    .sort((a, b) => collator.compare(a.label, b.label));
}
