/**
 * EV-341b — the intake interview's sections 1–4 as data: which fields each section has, what
 * kind of control each one is, how a stored answer becomes a form value and back, and what
 * counts as answered.
 *
 * Pure and client-safe (no `server-only`, no `coachApi` at runtime): the interview island
 * reads it, and `qa/intake-autosave-unit.spec.ts` runs it in node.
 *
 * The vocabularies are b-fit-api EV-341a's (`IntakeSectionBody`), in the story's catalogue
 * order (§ "The interview, section by section"). EV-341y2 adds EV-341y1's four fields (api
 * `443ac5d8`): GOALS `emphasis` under the goal (YP1), HISTORY `likedExercises` /
 * `avoidedExercises` (YP2), AVAILABILITY `splitPreference` (YP4). Two of them take their
 * vocabulary from the CATALOGUE, not from this file: `emphasis` is a value of the `muscles`
 * facet, an exercise is a catalogue `name`, and both are picked, never typed.
 *
 * ═══ THE FORM'S TERMS ═══════════════════════════════════════════════════════════════════
 *
 * One form for the four sections (ONE guarded form per page, `useCoachForm`), so every key
 * is `<SECTION>.<field>` and every value is a string or a list of strings:
 *   · a single choice is its api value, "" when unanswered;
 *   · a multiple choice is its values IN THE CATALOGUE'S ORDER (so "same answers" is "same
 *     array", whatever order the boxes were ticked in);
 *   · a catalogue pick list (`emphasis`, the exercise lists) is its values IN THE COACH'S ORDER,
 *     exactly as stored: a value the catalogue has since dropped is KEPT (YP6 / YP6b), never
 *     filtered out, since the api accepts it again on a re-save (EV-341y1 Y1b / Y2);
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
/** EV-341y1 Y1 / EV-341y2 YP1: at most 5 muscle groups. */
export const EMPHASIS_MAX = 5;
/** EV-341y1 Y2 / EV-341y2 YP2: at most 10 exercises per list. */
export const EXERCISE_LIST_MAX = 10;

/** EV-341y1 Y3: `SplitPreference`, in the story's order (YP4). */
export const SPLIT_PREFERENCES = ["FULL_BODY", "UPPER_LOWER", "PUSH_PULL_LEGS", "NO_PREFERENCE"] as const;

export type IntakeField =
  /**
   * Radio group: one Tab stop, arrow keys (B8). `options` are api values. `clearable`: the choice
   * can be undone (« Effacer », YP4), since nothing is pre-selected and a radio cannot be unticked.
   */
  | { kind: "single"; field: string; options: readonly string[]; clearable?: boolean }
  /** A single choice whose api value is an integer (minutes, a 1–5 score). */
  | { kind: "singleInt"; field: string; options: readonly number[] }
  /** A group of checkboxes (B8). `max` is the api's bound, when it has one below the vocabulary. */
  | { kind: "multi"; field: string; options: readonly string[]; max?: number }
  /** Typed digits (B8), a whole number in `[min, max]`. */
  | { kind: "integer"; field: string; min: number; max: number }
  | { kind: "text"; field: string; maxCodePoints: number }
  | { kind: "date"; field: string }
  /** YP1: values of the catalogue's `muscles` facet, in the coach's order, at most `max`. */
  | { kind: "muscles"; field: "emphasis"; max: number }
  /** YP2: catalogue exercise names, in the coach's order, at most `max`; never also in `other`. */
  | { kind: "exercises"; field: ExerciseListField; max: number; other: ExerciseListField }
  /** The section note (B16). Always the last field of a section. */
  | { kind: "notes"; field: "notes" };

export type ExerciseListField = "likedExercises" | "avoidedExercises";

const NOTES: IntakeField = { kind: "notes", field: "notes" };
const SCORE = [1, 2, 3, 4, 5] as const;

/** Each section's fields, in the catalogue's order. */
export const INTAKE_CATALOGUE: Record<IntakeFormSection, readonly IntakeField[]> = {
  GOALS: [
    { kind: "single", field: "primaryGoal", options: ["BUILD_MUSCLE", "LOSE_WEIGHT", "GET_STRONGER", "MOBILITY", "ENDURANCE"] },
    // YP1: under the goal.
    { kind: "muscles", field: "emphasis", max: EMPHASIS_MAX },
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
    // YP2 / YP3: the injury line sits under « Exercices à éviter ».
    { kind: "exercises", field: "likedExercises", max: EXERCISE_LIST_MAX, other: "avoidedExercises" },
    { kind: "exercises", field: "avoidedExercises", max: EXERCISE_LIST_MAX, other: "likedExercises" },
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
    // YP4. No equipment control in this section, ever (ruling 4, YP7): B10's read-only line only.
    { kind: "single", field: "splitPreference", options: SPLIT_PREFERENCES, clearable: true },
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

/** A list field: a value is a list of strings (every other kind is one string). */
export function isListField(field: IntakeField): boolean {
  return field.kind === "multi" || field.kind === "muscles" || field.kind === "exercises";
}

/**
 * A stored catalogue pick list as the form holds it: its strings, in the stored order, once
 * each. Nothing is dropped for not being in the catalogue (YP6 / YP6b).
 */
function pickList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) if (typeof item === "string" && !out.includes(item)) out.push(item);
  return out;
}

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
      case "muscles":
      case "exercises":
        out[key] = pickList(raw);
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
      case "muscles":
      case "exercises":
        // YP5: exactly as chosen, in the coach's order; YP6 / YP6b: a dropped value goes back as it was.
        values[f.field] = pickList(raw);
        break;
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
    out[key] = form[key] ?? (isListField(f) ? [] : "");
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
