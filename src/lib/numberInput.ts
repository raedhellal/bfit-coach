/**
 * PB-2 (EV-273b gate, 2026-09-30) — whole numbers as a French coach types them.
 *
 * The portal itself prints 1800 as "1 800" in French (`formatKcal(…, "fr")`, a narrow
 * no-break space), so a coach who copies it back, or types it the French way with a
 * plain or a no-break space, must not be told "Enter a number above 0.": that sentence
 * was false for "1 800".
 *
 * ONE reader (`readNumber`) for both whole-number fields the portal has — the daily
 * targets (`parseTarget`) and a recipe's kcal and macros (`parseWhole` in
 * `recipeDocument.ts`) — so the two can no longer disagree about what "1.000" is. A
 * recipe ingredient's quantity (`readQuantity`, BUG-556) reads through it too: "1 000" g
 * is 1000, and its own rule (at most two decimals, ≤ 5000) is applied to what it reads.
 *
 * What a SPACE may do: separate thousands, and nothing else. "1 800", "12 500" and
 * "1 234 567" are whole numbers; "18 00" and "1  800" are not (a space in the wrong
 * place is not a grouping a coach meant). The spaces that group are the ones a French
 * keyboard, the portal's own output or a pasted document can carry: plain, no-break,
 * narrow no-break, thin and figure.
 *
 * What a POINT or a COMMA followed by EXACTLY three digits after a 1–3 digit integer
 * means — "1.000", "1,500" — nobody can tell: a thousand to one coach, one-point-zero to
 * another. Reading it either way sends the wrong number for half of them (BUG-460 sent
 * "1,000" as kcal 1; "1.000" did the same in a recipe). It is `thousands`, and both
 * readers refuse it with the same sentence: a whole number, without decimals.
 *
 * Built from strings, not regex literals, so this file carries no literal no-break
 * space for an editor to lose (`unicode-escapes-in-written-source`).
 */

/**
 * A space that may group thousands: U+0020, U+00A0 (no-break), U+202F (narrow no-break),
 * U+2009 (thin) and U+2007 (figure).
 */
const SPACE = "[\\u0020\\u00A0\\u202F\\u2009\\u2007]";
/** "1800" or "1 800" / "1 234 567" — an integer part, with or without correct grouping. */
const INTEGER_PART = `(?:\\d+|\\d{1,3}(?:${SPACE}\\d{3})+)`;
const INTEGER = new RegExp(`^${INTEGER_PART}$`);
const SPACES = new RegExp(SPACE, "g");
/** "1.000", "1,500", "100.000": a separator nobody can read either way. */
const THOUSANDS = /^\d{1,3}[.,]\d{3}$/;
/** An integer part, a decimal point OR comma, and digits: "1800,5", "1 200.5". */
const DECIMAL = new RegExp(`^(${INTEGER_PART})[.,](\\d+)$`);
/** A minus before something that would otherwise be a number: "-5", "-1 800", "-0,5". */
const NEGATIVE = new RegExp(`^-${SPACE}*${INTEGER_PART}(?:[.,]\\d+)?$`);

/**
 * What a typed number IS, before any field decides what it accepts.
 *
 *   empty     — nothing typed (after trimming).
 *   integer   — digits, correctly grouped: "1800", "1 800" → digits "1800".
 *   decimal   — an integer part and a fraction after "." or ",": "1200,5" → "1200" / "5".
 *   thousands — "1.000", "1,500": refused by every whole-number field, never guessed.
 *   negative  — a minus before a number.
 *   malformed — a DIGIT was typed, and no reading fits: "18 00", "1 25", "12abc".
 *   notNumber — no digit at all: "abc", "-".
 */
export type NumberText =
  | { kind: "empty" }
  | { kind: "integer"; digits: string }
  | { kind: "decimal"; digits: string; fraction: string }
  | { kind: "thousands" }
  | { kind: "negative" }
  | { kind: "malformed" }
  | { kind: "notNumber" };

export function readNumber(raw: string): NumberText {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (INTEGER.test(text)) return { kind: "integer", digits: text.replace(SPACES, "") };
  // Before DECIMAL, which would read "1.000" as one-point-zero.
  if (THOUSANDS.test(text)) return { kind: "thousands" };
  const decimal = DECIMAL.exec(text);
  if (decimal) return { kind: "decimal", digits: decimal[1].replace(SPACES, ""), fraction: decimal[2] };
  if (NEGATIVE.test(text)) return { kind: "negative" };
  return /\d/.test(text) ? { kind: "malformed" } : { kind: "notNumber" };
}

/**
 * A daily target (kcal, protein, carbs, fat) — whole numbers on the wire
 * (`CoachTargetsRequest`, `NutritionTemplateTargetsRequest`: `type: integer`).
 *
 *   whole     — a whole number above 0, grouping spaces allowed: "1 800" → 1800.
 *   notWhole  — a number with a decimal part, after a point OR a comma: "1800,5",
 *               "1800.5", and "1,000" / "1.000" (ambiguous thousands, see above).
 *               The coach is told to enter a whole number without decimals.
 *   malformed — digits that cannot be read: "18 00", "1  800", "1 25" (BUG-552). The
 *               coach is shown how to write one ("par exemple 1 800"), never "above 0",
 *               which was false for them.
 *   invalid   — empty, no digit, zero or negative: "Enter a number above 0." is TRUE.
 *
 * Nothing is sent unless all four are `whole`.
 */
export type ParsedTarget =
  | { kind: "whole"; value: number }
  | { kind: "notWhole" }
  | { kind: "malformed" }
  | { kind: "invalid" };

export function parseTarget(raw: string): ParsedTarget {
  const read = readNumber(raw);
  switch (read.kind) {
    case "integer": {
      const value = Number(read.digits);
      if (value === 0) return { kind: "invalid" };
      // Twenty digits is not "above 0"'s problem; it is not a number anyone meant.
      return Number.isSafeInteger(value) ? { kind: "whole", value } : { kind: "malformed" };
    }
    case "decimal":
    case "thousands":
      return { kind: "notWhole" };
    case "malformed":
      return { kind: "malformed" };
    case "empty":
    case "negative":
    case "notNumber":
      return { kind: "invalid" };
  }
}

/**
 * The ONE sentence a form of several targets shows, or null when every field is whole.
 * "Above 0" while any field needs it (it is the only sentence true for an empty field),
 * then the format sentence, then "no decimals".
 */
export function targetRefusal(read: readonly ParsedTarget[]): "invalid" | "malformed" | "notWhole" | null {
  for (const kind of ["invalid", "malformed", "notWhole"] as const) {
    if (read.some((field) => field.kind === kind)) return kind;
  }
  return null;
}
