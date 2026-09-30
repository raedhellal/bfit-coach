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
  /* ── BUG-195c: the routine write path is no longer a deviation ────────────────
   * `CoachRoutineDraftRequest` was registered here as "⛔ KNOWN BROKEN AGAINST LIVE"
   * from EV-184b until BUG-195c: it sent two of the eight fields `Routine` requires.
   * It now carries `{replacesDraftUpdatedAt, document: Routine}` — the api's own
   * `CoachRoutineDraftRequest` (BUG-195b, ADR-0018 D1 option 1-D) — so there is nothing
   * left to register, and `qa/contract-drift.spec.ts` would fail on a stale entry
   * (AC3.8). Its absence here is the forced deletion, not an omission.
   * ────────────────────────────────────────────────────────────────────────── */

  /* ── EV-316, arrived with the BUG-195c re-vendor ────────────────────────────── */

  AuthTokens: {
    missingInPortal: {
      expiresAt:
        "EV-316 (b-fit-api `239c8ab`, on api main before this branch's base) made it required in the spec because the api always SENDS it. The portal never sends an AuthTokens — it only reads `POST /me/activate`'s 200 — and it times the session from `expiresIn`, which the api still sends. Reading a second, redundant expiry would be two clocks for one session. Not a request body, so `required` here is a statement about the response, not a 400.",
    },
  },

  /* ── EV-278c: finishing an initialised account ───────────────────────────── */

  ActivateAccountRequest: {
    missingInPortal: {
      fullName:
        "OPTIONAL on the wire (`nullable`, not `required`): omitted = the name the admin typed stays. ADR-0022 D22.10e wants the activation screen to SHOW that name and let the person correct it, but the portal cannot read it — `GET /me` is behind the ACCOUNT floor a PENDING token lacks, and `ActivationStatusResponse` carries no name. A blank 'correct your name' field with nothing to correct would be a control about a value the person cannot see. → OWNER: java-engineer (a `fullName` on `ActivationStatusResponse`), then web-engineer adds the field.",
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
    },
  },

  /* ── EV-320a meal-slot tags: on api main, no portal control yet ─────────────
   * b-fit-api `0d58432` (on api main, vendored at 741ed39) added `mealSlots` to the
   * three recipe schemas so "Apply week" can fill breakfast and snacks from a coach's
   * recipes. This portal neither sets nor shows them yet; the chips that would are an
   * unwritten portal story. Identical on BUG-195c and EV-321b (both re-vendored 741ed39),
   * so both added it; the duplicate was dropped when they merged (both 2026-09-30).
   * ---------------------------------------------------------------------- */
  CoachRecipeSaveRequest: {
    missingInPortal: {
      mealSlots:
        "OPTIONAL and nullable on the wire. Omitted on UPDATE the api KEEPS the stored tags (b-fit-api 741ed39 `CoachRecipeUseCase.update`: `checked.mealSlots() != null ? checked.mealSlots() : owned.recipe().mealSlots()`, where `CoachRecipeRules.mealSlots` returns null for an absent field; pinned by `CoachRecipeIntegrationTest.ev320a_mealSlotsAreSavedReadKeptOnAnUpdateThatOmitsThemAndBounded`), so a save from this editor cannot untag a recipe tagged elsewhere. Omitted on CREATE the recipe is stored untagged, which the fill reads as LUNCH and DINNER only: exactly what every recipe was before EV-320a. -> OWNER: senior-po to card the portal half (tag chips on the recipe editor); it declares the field and deletes this entry.",
    },
  },

  CoachRecipe: {
    missingInPortal: {
      mealSlots:
        "Not rendered: no screen here shows a recipe's slot tags until the portal half of EV-320 exists. Nullable on the wire (null = untagged = LUNCH and DINNER to the fill), so whoever declares it must not read null as an empty list.",
    },
  },

  CoachRecipeSummary: {
    missingInPortal: {
      mealSlots:
        "Not rendered: the recipe library row carries no slot badge until the portal half of EV-320 exists. Same null = untagged caveat as `CoachRecipe`.",
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

  /* ── EV-273b: nutrition templates ship TARGETS ONLY (EV-273 N6) ─────────────
   * The api stores and serves an optional meal structure (EV-273a). The portal neither
   * sends it nor reads it until EV-190's N1 control has met its release conditions
   * (ADR-0016b D16b.11): EV-190d's kill-clause PASS in AI-EVAL-LOG.md, then EV-190e,
   * then EV-273e, which is the row that deletes these two entries.
   * ---------------------------------------------------------------------- */
  NutritionTemplateSaveRequest: {
    missingInPortal: {
      mealStructure:
        "EV-273 N6 — OPTIONAL on the wire (omitted = the trainee's own structure). The first portal control to send it would be N1's, which has not cleared. EV-273b AC5/AC2's key-set assertions hold it off the wire; EV-273e adds it. ⚠ Omitting it on PUT CLEARS a stored one (the api replaces the whole row), so an EV-273b edit or rename wipes a structure stored through the api; EV-273e must read it and carry it through edit and rename.",
    },
  },
  NutritionTemplate: {
    missingInPortal: {
      mealStructure:
        "EV-273 N6 / AC1 — 'No meal structure is shown, even for a template that has one stored through the api.' Not declared, so nothing can render it. EV-273e adds it.",
    },
  },

  CoachApplyWeekRequest: {
    missingInPortal: {
      mealStructure:
        "EV-190a's per-week meals/snacks override. OPTIONAL on the wire — omitting it means 'generate against the trainee's own stored preference', which is what every apply did before EV-190a, so the portal is currently correct rather than broken. The control that sets it is on feat/ev071b-coach-refusal.",
    },
  },
};
