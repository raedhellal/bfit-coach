/**
 * EV-341b — the intake interview's sections 1–4 as data: which fields each section has, what
 * kind of control each one is, how a stored answer becomes a form value and back, and what
 * counts as answered.
 *
 * Pure and client-safe (no `server-only`, no `coachApi` at runtime): the interview island
 * reads it, and `qa/intake-autosave-unit.spec.ts` runs it in node.
 *
 * The vocabularies are b-fit-api EV-341a's (`IntakeSectionBody`), in the story's catalogue
 * order (§ "The interview, section by section"). The four EV-341y1 fields (`emphasis`,
 * `likedExercises`, `avoidedExercises`, `splitPreference`) are NOT here: they are EV-341y2's.
 *
 * ═══ THE FORM'S TERMS ═══════════════════════════════════════════════════════════════════
 *
 * One form for the four sections (ONE guarded form per page, `useCoachForm`), so every key
 * is `<SECTION>.<field>` and every value is a string or a list of strings:
 *   · a single choice is its api value, "" when unanswered;
 *   · a multiple choice is its values IN THE CATALOGUE'S ORDER (so "same answers" is "same
 *     array", whatever order the boxes were ticked in);
 *   · a number is the text in the field ("" when unanswered), read with `readNumber`;
 *   · a date is `YYYY-MM-DD` ("" when unanswered), the native date control's value;
 *   · free text is the text, exactly as typed.
 *
 * A section PUT is the WHOLE section (an absent field is cleared on the api), so `toApi`
 * always writes every field of the section, `null` / `[]` for the unanswered ones.
 */
import { readNumber } from "./numberInput";

/** The sections this slice builds (EV-341b: 1–4). EV-341c adds 5–8. */
export const INTAKE_FORM_SECTIONS = ["GOALS", "HISTORY", "AVAILABILITY", "LIFESTYLE"] as const;
export type IntakeFormSection = (typeof INTAKE_FORM_SECTIONS)[number];

/** B16 / EV-341a AC5: a section note is at most 1,000 Unicode code points. */
export const NOTES_MAX_CODE_POINTS = 1000;
/** EV-341a: GOALS' `eventLabel` is at most 80 code points. */
export const EVENT_LABEL_MAX_CODE_POINTS = 80;

export type IntakeField =
  /** Radio group: one Tab stop, arrow keys (B8). `options` are api values. */
  | { kind: "single"; field: string; options: readonly string[] }
  /** A single choice whose api value is an integer (minutes, a 1–5 score). */
  | { kind: "singleInt"; field: string; options: readonly number[] }
  /** A group of checkboxes (B8). `max` is the api's bound, when it has one below the vocabulary. */
  | { kind: "multi"; field: string; options: readonly string[]; max?: number }
  /** Typed digits (B8), a whole number in `[min, max]`. */
  | { kind: "integer"; field: string; min: number; max: number }
  | { kind: "text"; field: string; maxCodePoints: number }
  | { kind: "date"; field: string }
  /** The section note (B16). Always the last field of a section. */
  | { kind: "notes"; field: "notes" };

const NOTES: IntakeField = { kind: "notes", field: "notes" };
const SCORE = [1, 2, 3, 4, 5] as const;

/** Each section's fields, in the catalogue's order. */
export const INTAKE_CATALOGUE: Record<IntakeFormSection, readonly IntakeField[]> = {
  GOALS: [
    { kind: "single", field: "primaryGoal", options: ["BUILD_MUSCLE", "LOSE_WEIGHT", "GET_STRONGER", "MOBILITY", "ENDURANCE"] },
    {
      kind: "multi",
      field: "motivations",
      options: ["HEALTH", "CONFIDENCE", "APPEARANCE", "PERFORMANCE", "ENERGY", "EVENT"],
      max: 3,
    },
    { kind: "singleInt", field: "motivationScore", options: SCORE },
    { kind: "text", field: "eventLabel", maxCodePoints: EVENT_LABEL_MAX_CODE_POINTS },
    { kind: "date", field: "eventDate" },
    NOTES,
  ],
  HISTORY: [
    { kind: "single", field: "level", options: ["BEGINNER", "INTERMEDIATE", "ADVANCED"] },
    { kind: "single", field: "trainingAge", options: ["NONE", "LT_6M", "M6_24", "Y2_5", "GT_5Y"] },
    { kind: "integer", field: "currentSessionsPerWeek", min: 0, max: 14 },
    {
      kind: "multi",
      field: "activities",
      options: ["STRENGTH", "RUNNING", "CYCLING", "SWIMMING", "TEAM_SPORTS", "COMBAT", "YOGA_PILATES", "HIIT", "OTHER"],
    },
    NOTES,
  ],
  AVAILABILITY: [
    // TrainingDayBounds' 2–6.
    { kind: "integer", field: "sessionsPerWeek", min: 2, max: 6 },
    { kind: "singleInt", field: "sessionMinutes", options: [30, 45, 60, 75, 90] },
    {
      kind: "multi",
      field: "availableDays",
      options: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"],
    },
    { kind: "single", field: "timeOfDay", options: ["MORNING", "MIDDAY", "EVENING"] },
    { kind: "multi", field: "trainingPlaces", options: ["GYM", "HOME", "OUTDOOR", "COACH_STUDIO"] },
    NOTES,
  ],
  LIFESTYLE: [
    { kind: "single", field: "workActivity", options: ["SEDENTARY", "STANDING", "PHYSICAL"] },
    { kind: "single", field: "sleepHours", options: ["LT_6", "H6_7", "H7_8", "GT_8"] },
    { kind: "singleInt", field: "stressScore", options: SCORE },
    NOTES,
  ],
};

/** The form's key for one field of one section. */
export function formKey(section: IntakeFormSection, field: string): string {
  return `${section}.${field}`;
}

export type IntakeFormValue = string | readonly string[];
export type IntakeFormValues = Record<string, IntakeFormValue>;

/** Unicode code points, as Postgres `char_length` and the api count them (ADR-0034 Q5). */
export function codePoints(text: string): number {
  return Array.from(text).length;
}

/**
 * One section's stored answers (`GET …/intake`'s `values`), in the form's terms. Anything the
 * catalogue does not know is ignored (an api ahead of this build); a value of the wrong type
 * reads as unanswered rather than as a crash.
 */
export function sectionFromApi(section: IntakeFormSection, values: Record<string, unknown> | null | undefined): IntakeFormValues {
  const out: IntakeFormValues = {};
  for (const f of INTAKE_CATALOGUE[section]) {
    const raw = values ? values[f.field] : undefined;
    const key = formKey(section, f.field);
    switch (f.kind) {
      case "multi":
        out[key] = Array.isArray(raw) ? f.options.filter((o) => raw.includes(o)) : [];
        break;
      case "single":
        out[key] = typeof raw === "string" && f.options.includes(raw) ? raw : "";
        break;
      case "singleInt":
      case "integer":
        out[key] = typeof raw === "number" && Number.isInteger(raw) ? String(raw) : "";
        break;
      case "text":
      case "date":
      case "notes":
        out[key] = typeof raw === "string" ? raw : "";
        break;
    }
  }
  return out;
}

/** Every section's answers, in the form's terms (one object for the whole form). */
export function formFromApi(
  sections: Partial<Record<string, { values?: Record<string, unknown> | null } | undefined>> | null | undefined
): IntakeFormValues {
  const out: IntakeFormValues = {};
  for (const section of INTAKE_FORM_SECTIONS) Object.assign(out, sectionFromApi(section, sections?.[section]?.values));
  return out;
}

/** Why a section cannot be sent as it stands: a field the api would refuse. */
export type IntakeFieldProblem =
  | { field: string; kind: "range"; min: number; max: number }
  | { field: string; kind: "tooLong"; max: number };

/**
 * One section of the form as the api's `values`: EVERY field of the section, `null` / `[]`
 * when unanswered, in the catalogue's order. `problems` lists the fields the api would refuse
 * (a number outside its bounds or unreadable, a note over 1,000 code points); while there is
 * one, the section must not be sent (B16).
 */
export function sectionToApi(
  section: IntakeFormSection,
  form: IntakeFormValues
): { values: Record<string, unknown>; problems: IntakeFieldProblem[] } {
  const values: Record<string, unknown> = {};
  const problems: IntakeFieldProblem[] = [];
  for (const f of INTAKE_CATALOGUE[section]) {
    const raw = form[formKey(section, f.field)];
    switch (f.kind) {
      case "multi": {
        const list = Array.isArray(raw) ? raw : [];
        values[f.field] = f.options.filter((o) => list.includes(o));
        break;
      }
      case "single":
        values[f.field] = typeof raw === "string" && f.options.includes(raw) ? raw : null;
        break;
      case "singleInt": {
        const n = typeof raw === "string" && raw !== "" ? Number(raw) : NaN;
        values[f.field] = f.options.includes(n) ? n : null;
        break;
      }
      case "integer": {
        const text = typeof raw === "string" ? raw : "";
        const read = readNumber(text);
        if (read.kind === "empty") {
          values[f.field] = null;
        } else {
          const n = read.kind === "integer" ? Number(read.digits) : NaN;
          if (Number.isSafeInteger(n) && n >= f.min && n <= f.max) values[f.field] = n;
          else {
            values[f.field] = null;
            problems.push({ field: f.field, kind: "range", min: f.min, max: f.max });
          }
        }
        break;
      }
      case "text": {
        const text = typeof raw === "string" ? raw : "";
        values[f.field] = text === "" ? null : text;
        if (codePoints(text) > f.maxCodePoints) problems.push({ field: f.field, kind: "tooLong", max: f.maxCodePoints });
        break;
      }
      case "date":
        values[f.field] = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
        break;
      case "notes": {
        const text = typeof raw === "string" ? raw : "";
        values[f.field] = text === "" ? null : text;
        if (codePoints(text) > NOTES_MAX_CODE_POINTS) problems.push({ field: "notes", kind: "tooLong", max: NOTES_MAX_CODE_POINTS });
        break;
      }
    }
  }
  return { values, problems };
}

/** The form's values of one section only (what a save of that section stands for). */
export function sectionSlice(section: IntakeFormSection, form: IntakeFormValues): IntakeFormValues {
  const out: IntakeFormValues = {};
  for (const f of INTAKE_CATALOGUE[section]) {
    const key = formKey(section, f.field);
    out[key] = form[key] ?? (f.kind === "multi" ? [] : "");
  }
  return out;
}

/** B2: a section is « Commencé » / "Started" once one of its fields holds an answer. */
export function sectionAnswered(section: IntakeFormSection, form: IntakeFormValues): boolean {
  return INTAKE_CATALOGUE[section].some((f) => {
    const raw = form[formKey(section, f.field)];
    return Array.isArray(raw) ? raw.length > 0 : typeof raw === "string" && raw.trim() !== "";
  });
}

/** B6: the section the page opens on, the first one with no answer (the first if all have one). */
export function firstUnanswered(form: IntakeFormValues): IntakeFormSection {
  return INTAKE_FORM_SECTIONS.find((s) => !sectionAnswered(s, form)) ?? INTAKE_FORM_SECTIONS[0];
}
