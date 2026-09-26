/**
 * Every place `src/lib/coachApi.ts` KNOWINGLY disagrees with `spec/b-fit-api.openapi.yaml`,
 * with the reason, in one file.
 *
 * `qa/contract-drift.spec.ts` fails on any disagreement that is not listed here — and
 * it also fails on any entry here that has STOPPED being a disagreement, so this cannot
 * quietly become a list of things that used to be true. An entry is a decision somebody
 * made and can be argued with; an unregistered difference is a coach's blank screen.
 *
 * The bar for adding one: it names a field, it says why the portal is right to differ,
 * and — if the answer is "it isn't, yet" — it names who owns closing it. "We have not
 * got to it" is an acceptable reason. Silence is not.
 */

/**
 * Keyed by the TYPESCRIPT interface name, not the schema name: two portal types can
 * legitimately face one schema (`Routine` is both the document the portal READS and the
 * body `PUT …/routine/draft` expects), and they deviate from it for different reasons.
 */
export interface SchemaDeviation {
  /** Fields the portal declares that the spec's schema does not have. */
  notOnWire?: Record<string, string>;
  /** Fields the spec's schema has that the portal deliberately does not declare. */
  missingInPortal?: Record<string, string>;
}

export const DEVIATIONS: Record<string, SchemaDeviation> = {
  /* ════════════════════════════════════════════════════════════════════════
   * ⛔ THE ROUTINE WRITE PATH — KNOWN BROKEN AGAINST LIVE.
   *
   * `PUT /coach-portal/clients/{id}/routine/draft` takes a whole `Routine`;
   * `CoachRoutineDraftRequest` sends two of its eight fields, so a "Save draft"
   * against a real api is a 400 and the editor shows its generic failure. This is
   * pre-existing — it shipped with EV-184b, which was written against an api branch
   * that had not merged — and it is registered rather than fixed because fixing it is
   * not a web decision. See the ⛔ block in `src/lib/coachApi.ts`.
   *
   * → OWNER: architect + java-engineer. Two open questions, both theirs:
   *   (1) a coach who is building a plan FROM SCRATCH (the api's own edge case 9) has
   *       no goal, level or minutes-per-session to send, and the portal must not
   *       invent them for somebody else's trainee;
   *   (2) the coach's editor edits a LOSSY projection, so rebuilding the whole
   *       document from it would silently delete `tempo`, `notes`, `trackingType`,
   *       `durationSeconds`, `weight` and `estimatedMinutes` from a trainee's plan.
   *
   * These entries do NOT make the type green (EV-222). Five of the six are `required`
   * by `Routine`, and `qa/contract-drift.spec.ts` never lets a `missingInPortal` entry
   * excuse a required field on a schema the api receives — so the case
   * "CoachRoutineDraftRequest carries every field Routine requires" is red, declared
   * with `test.fail()` under the annotation BUG-195. They stay here only because the
   * NAME check (the other direction) still reads them.
   * ════════════════════════════════════════════════════════════════════════ */
  CoachRoutineDraftRequest: {
    missingInPortal: {
      goal: "⛔ Not sendable. `@NotBlank` on the wire and unknown to this surface for a from-scratch plan; the portal has no honest source for a trainee's training goal.",
      level: "⛔ Not sendable. `@NotBlank`, same reason.",
      daysPerWeek: "⛔ Derivable (`trainingDays.length`) but pointless alone — `RoutinePlanWriter.reconcileIdentity` recomputes it server-side and ignores what it is sent.",
      weeklyProgression: "⛔ Not sendable. `@NotNull` on the wire; no coach control authors a progression rule and EV-184 gives them none.",
      constraints: "⛔ Not sendable. `@NotNull`, and `minutesPerSession` is `@Positive` with no coach control and no stored value the portal receives.",
      summary: "⛔ Not sendable. The generator's coach-voice overview; a portal-written one would put words in the engine's mouth.",
    },
  },

  /* ── read-path omissions, all of them decisions ─────────────────────────── */

  CatalogExercise: {
    missingInPortal: {
      type: "A second, older catalog taxonomy. Rendering it would put two vocabularies beside each other on one picker row.",
      difficulty: "EV-184 gives the coach no difficulty filter and no difficulty badge.",
      unilateral: "No control and no sentence in EV-184 turns on it.",
      tags: "Free-text catalog tags; nothing picks by them.",
      externalId: "The provider's id. This surface addresses a catalog row by `slug` and by nothing else.",
      bodyPart: "A coarser duplicate of `primaryMuscles`, which is what the muscle facet filters by.",
      targetMuscle: "Likewise — one muscle field is rendered, and it is the one the facet is derived from.",
      secondaryMuscles: "Not rendered: the row carries one muscle badge by design (edge case 6 is about the row already being too wide).",
      instructions: "The coach picks an exercise here; they do not read it. Instructions belong on the trainee's screen.",
      gifUrl: "No media in the picker. A media fetch per row on every keystroke of a search is the performance bug this omission prevents.",
      videoUrl: "Same.",
      femaleVideoUrl: "Same.",
      thumbnailUrl: "Same.",
      imageStart: "Same.",
      imageEnd: "Same.",
      category: "Provider taxonomy; no control uses it.",
      provider: "Which catalog the row came from. A coach does not choose a provider and must not be shown one.",
      exerciseType: "WEIGHTED / BODYWEIGHT / DURATION — the TRAINEE's logging mode. The coach's editor writes sets/reps/rest only, so reading it would imply a control that does not exist.",
    },
  },

  /* ── EV-071b / EV-190a, landing on another branch ────────────────────────
   * These three are NOT drift to close here. They are the api half of EV-071b
   * ruling 6 addendum 6.1 and EV-190a N1, and the portal half is on
   * `feat/ev071b-coach-refusal` (b-fit-coach, unmerged at 72563e8), which is
   * rewriting these exact types. Declaring them here would be a merge conflict in
   * that agent's file for no gain — but leaving them UNREGISTERED would mean this
   * guard is red on main, and a red guard is one nobody reads.
   * ---------------------------------------------------------------------- */
  MealWeekView: {
    missingInPortal: {
      status:
        "EV-071b addendum 6.1's GENERATING | ACTIVE | REFUSED | ARCHIVED — the read-side of the refusal state. Owned by feat/ev071b-coach-refusal.",
      mealStructure:
        "EV-190a / N1 — the structure the week was generated against, for AC5's reconciliation line. Same branch.",
    },
  },

  PlannedDayView: {
    missingInPortal: {
      origin:
        "EV-071b addendum 6.1's GENERATED | REPLACED | STANDARD | UNKNOWN, which the coach's replaced-days line counts off. Same branch.",
    },
  },

  CoachApplyWeekRequest: {
    missingInPortal: {
      mealStructure:
        "EV-190a's per-week meals/snacks override. OPTIONAL on the wire — omitting it means 'generate against the trainee's own stored preference', which is what every apply did before EV-190a, so the portal is currently correct rather than broken. The control that sets it is on feat/ev071b-coach-refusal.",
    },
  },
};
