/**
 * The trainee's stored guardrail inputs, turned into words a coach can read.
 *
 * `CoachRoutineResponse.guardrails` carries WIRE VOCABULARIES, not labels:
 * `["BARBELL", "PULL_UP_BAR"]` and `["LOWER_BACK", "SHOULDER"]`. Rendering them raw is
 * a logged bug on the other client — BUG-047, where the last screen before an AI
 * credit was spent printed "DUMBBELLS, GYM" — and EV-150 fixed it there with a label
 * table plus a humanising fallback. This is that fix, ported: the labels below are
 * b-fit-mobile's `equipment.*` strings from `src/i18n/locales/en.json`, verbatim, and
 * the tokens are `src/features/profile/types.ts`'s eleven, which are ADR-0005 D1a's
 * published set. Evoli Pro is English-only, so there is no bundle to look them up in.
 *
 * The fixture used to serve catalog words here ("Barbell", "Dumbbell", "Cable",
 * "Machine") — a DIFFERENT vocabulary from the profile tokens the api actually sends.
 * `ExerciseCatalogEntry.equipment` and `user_profiles.equipment` are two different
 * columns with two different value sets, and the fixture had quietly conflated them,
 * which is why the humanising this file does was never missed.
 *
 * ⚠️ Nothing here is a safety claim. The equipment list is labelled and nothing more:
 * `RoutinePolicy.apply` takes injuries only, equipment-aware replacement is BUG-053
 * and is undeployed, and EV-184 AC3's warning box is the only sentence on the subject.
 */

/** ADR-0005 D1a's published equipment tokens → b-fit-mobile's English labels. */
const EQUIPMENT_LABELS: Record<string, string> = {
  NONE: "Bodyweight only",
  BODYWEIGHT: "Bodyweight only",
  DUMBBELLS: "Dumbbells",
  BARBELL: "Barbell",
  BANDS: "Bands",
  GYM: "Full gym",
  KETTLEBELL: "Kettlebell",
  PULL_UP_BAR: "Pull-up bar",
  BENCH: "Bench",
  CABLE_MACHINE: "Cable machine",
  SQUAT_RACK: "Squat rack",
};

/**
 * The eight onboarding injury chips → their labels.
 *
 * `b-fit-mobile`'s `INJURY_TO_PROFILE` read backwards
 * (`src/features/onboarding/mappers.ts`). The server treats injuries as free text and
 * matches substrings, so these tokens are a convention rather than an enum — which is
 * exactly why the fallback below must not assume one.
 */
const INJURY_LABELS: Record<string, string> = {
  KNEE: "Knees",
  LOWER_BACK: "Lower back",
  SHOULDER: "Shoulders",
  NECK: "Neck",
  WRIST: "Wrists",
  HIP: "Hips",
  ANKLE: "Ankles",
  ELBOW: "Elbows",
};

/** `PULL_UP_BAR` → "Pull-up bar" lookups tolerate case and separator differences. */
function normalise(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

/** `FOAM_ROLLER` → "Foam roller". Readable, honest, never SHOUTING. */
function humanise(token: string): string {
  const words = token.toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Equipment labels for the guardrail panel.
 *
 * Tier 1 the published token, tier 2 a humanised unknown one. Tier 2 is safe here for
 * the same reason it is safe on mobile: the token set is checked against the spec on
 * both sides, so it only ever fires for a value somebody else's deploy produced.
 * Blanks are dropped (a blank badge reads as a lost answer) and so are duplicates.
 */
export function equipmentLabels(equipment: string[] | null | undefined): string[] {
  if (!Array.isArray(equipment)) return [];
  const out: string[] = [];
  for (const raw of equipment) {
    if (typeof raw !== "string") continue;
    const token = normalise(raw);
    if (!token) continue;
    const label = EQUIPMENT_LABELS[token] ?? humanise(token);
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/**
 * Injury labels for the guardrail panel.
 *
 * **The fallback is VERBATIM, not humanised, and that is the difference that matters.**
 * `user_profiles.injuries` is not a closed vocabulary: onboarding appends the
 * trainee's free-text "Anything else?" answer to the list, up to 500 characters, and
 * that is a sentence a person wrote about their own body. Humanising it — lower-casing
 * it and splitting it on underscores — would mangle the one entry on this screen that a
 * coach most needs to read exactly as written. So a known chip token gets its label and
 * everything else is passed through untouched.
 */
export function injuryLabels(injuries: string[] | null | undefined): string[] {
  if (!Array.isArray(injuries)) return [];
  const out: string[] = [];
  for (const raw of injuries) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    const label = INJURY_LABELS[normalise(value)] ?? value;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}
