/**
 * BUG-694 — the label for one stored diet-profile value: the preset's label in the page's
 * language when the value IS a preset (exact match, as the app's `prefLabel` does), and
 * the trainee's own words, unchanged, when it is not.
 *
 * An own-property check, not `labels[value] ?? value`: the value is free text a trainee
 * typed, and a plain lookup of "constructor" or "toString" finds `Object.prototype`'s
 * function instead of falling back (qa/diet-preset-labels.spec.ts holds both).
 */
export function dietValueLabel(labels: Readonly<Record<string, string>>, value: string): string {
  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : value;
}
