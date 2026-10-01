/**
 * PB-2 (EV-273b gate, 2026-09-30) — whole numbers as a French coach types them.
 *
 * The portal itself prints 1800 as "1 800" in French (`formatKcal(…, "fr")`, a narrow
 * no-break space), so a coach who copies it back, or types it the French way with a
 * plain or a no-break space, must not be told "Enter a number above 0.": that sentence
 * was false for "1 800".
 *
 * What a SPACE may do: separate thousands, and nothing else. "1 800", "12 500" and
 * "1 234 567" are whole numbers; "18 00" and "1  800" are not (a space in the wrong
 * place is not a grouping a coach meant).
 *
 * What a COMMA may NOT do, in any whole-number field: be a thousands separator. "1,000"
 * is a thousand to an English coach and one-point-zero to a French one, and reading
 * either way sends the wrong number for half of them — reading it as 1.000 sent kcal 1
 * (BUG-460). A comma is refused, always, and never rewritten.
 *
 * Built from strings, not regex literals, so this file carries no literal no-break
 * space for an editor to lose (`unicode-escapes-in-written-source`).
 */

/** A space that may group thousands: U+0020, U+00A0 (no-break), U+202F (narrow no-break). */
const SPACE = "[\\u0020\\u00A0\\u202F]";
/** "1800" or "1 800" / "1 234 567" — an integer part, with or without correct grouping. */
const INTEGER_PART = `(?:\\d+|\\d{1,3}(?:${SPACE}\\d{3})+)`;
const INTEGER = new RegExp(`^${INTEGER_PART}$`);
const SPACES = new RegExp(SPACE, "g");
/** An integer part followed by a decimal point OR a comma and digits: "1800,5", "1,000". */
const DECIMAL = new RegExp(`^${INTEGER_PART}[.,]\\d+$`);

/**
 * The integer part's digits with the grouping spaces removed, or null when `text` is not
 * a correctly grouped run of digits. `text` must already be trimmed.
 */
export function ungroupInteger(text: string): string | null {
  return INTEGER.test(text) ? text.replace(SPACES, "") : null;
}

/**
 * A daily target (kcal, protein, carbs, fat) — whole numbers on the wire
 * (`CoachTargetsRequest`, `NutritionTemplateTargetsRequest`: `type: integer`).
 *
 *   whole     — a whole number above 0, grouping spaces allowed: "1 800" → 1800.
 *   notWhole  — a number with a decimal part, after a point OR a comma: "1800,5",
 *               "1800.5", and "1,000" (a comma is never a thousands separator here).
 *               The coach is told to enter a whole number; nothing is sent.
 *   invalid   — empty, zero, negative, or not a number: "Enter a number above 0."
 */
export type ParsedTarget =
  | { kind: "whole"; value: number }
  | { kind: "notWhole" }
  | { kind: "invalid" };

export function parseTarget(raw: string): ParsedTarget {
  const text = raw.trim();
  const digits = ungroupInteger(text);
  if (digits !== null) {
    const value = Number(digits);
    return Number.isSafeInteger(value) && value > 0 ? { kind: "whole", value } : { kind: "invalid" };
  }
  return DECIMAL.test(text) ? { kind: "notWhole" } : { kind: "invalid" };
}
