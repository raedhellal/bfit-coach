/**
 * Every user-visible string in Evoli Pro, in one place.
 *
 * English only for the demo — there is no i18n runtime here and inventing one for a
 * demo branch would be work the story excludes. The sentences marked "AC" are
 * verbatim acceptance-criteria text from EV-183 and MUST NOT be reworded without
 * changing the story: senior-qa verifies them character by character.
 *
 * No invented benefits, no tier price, no ToS/DPA wording (EV-183 "NOT in the demo"
 * item 12 — ⛔ D8/D9 are open).
 */
export const copy = {
  brand: "Evoli Pro", // AC1: the app header reads exactly this
  tagline: "The coach back-office for Evoli Fit.",

  login: {
    title: "Sign in",
    subtitle: "Coach access to Evoli Pro.",
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    passwordPlaceholder: "••••••••",
    submit: "Sign in",
    submitting: "Signing in…",
    // AC1: a non-COACH account is rejected with exactly this sentence.
    notACoach: "This account is not an Evoli Pro coach account",
    invalidCredentials: "Email or password is incorrect.",
    // b-fit-api throttles repeated failures and answers 429; /api/auth/login maps that
    // to RATE_LIMITED. Without its own sentence it read as "wrong password", which sends
    // a coach who typed the right one into a loop of retries that can only extend the
    // lockout.
    rateLimited: "Too many attempts. Wait a few seconds and try again.",
    // MFA is not part of this preview (EV-059 is a follow-up in ADR-0012). The api
    // can still answer a login with a challenge, so say so honestly rather than
    // failing with a generic error.
    mfaUnsupported:
      "This account uses two-factor authentication, which Evoli Pro does not support yet.",
    unavailable: "Cannot reach the server. Check that the API is running.",
    signedOut: "You have been signed out.",
  },

  shell: {
    roster: "Roster",
    signOut: "Sign out",
    backToRoster: "Back to roster",
  },

  roster: {
    title: "Roster",
    subtitle: "The Evoli Fit profiles you coach.",
    // AC1 / AC4 / AC6: "<active> / <capacity> profiles · <tier>"
    capacity: (active: number, capacity: number, tier: string) =>
      `${active} / ${capacity} profiles · ${tier}`,
    capacityLabel: "Capacity",
    emptyTitle: "No trainees yet", // AC1, verbatim
    emptyBody:
      "Invite someone who already uses Evoli Fit. They accept on their phone and appear here.",
    invite: "Invite a trainee", // AC1, verbatim
    /**
     * Edge case 5, verbatim for the Starter tier ("Starter includes 2 profiles.") — but
     * derived from `GET /coach-portal/me`'s own `tier` and `capacity` rather than
     * hard-coded, so the sentence cannot disagree with the meter above it the day the
     * ladder lands (MVE-6).
     */
    inviteFull: (tier: string, capacity: number) =>
      `${tier} includes ${capacity} profile${capacity === 1 ? "" : "s"}.`,
    colTrainee: "Trainee",
    colPlan: "Plan",
    colLastWorkout: "Last workout",
    colStreak: "Streak",
    colStatus: "Status",
    noPlan: "No plan",
    /**
     * In use again. It went unused when ADR-0015 S1 made `lastCompletedWorkoutDate`
     * scope-filtered and the roster could no longer tell "never trained" from "not
     * shared"; the list response now carries `scopes` per row (contract item 4), so
     * this sentence is said only when PROGRESS is actually held — and is exactly the
     * row `sortNeedsAttentionFirst` puts first.
     */
    noWorkout: "No workouts yet",
    streak: (days: number) => `${days} day${days === 1 ? "" : "s"}`,
    noStreak: "No streak",
    statusActive: "ACTIVE",
    loadError: "The roster could not be loaded.",
    retry: "Reload",
  },

  invite: {
    title: "Invite a trainee",
    subtitle: "Share this link, or let them scan the code.",
    creating: "Creating an invite…",
    linkLabel: "Invite link",
    copy: "Copy link",
    copied: "Copied",
    // AC2, verbatim
    expiry: "This link works once and expires in 7 days.",
    expiryChip: "Expires in 7 days · single use",
    qrAlt: "QR code for the invite link",
    qrFailed: "The QR code could not be drawn. The link above still works.",
    close: "Close",
    error: "The invite could not be created.",
    /**
     * The server action answered CAPACITY_REACHED. The modal is client-side and has no
     * `me`, so the caller passes the derived sentence in; this is only the fallback for
     * the race where the roster said there was room and the api disagreed.
     */
    capacityReached: "Your plan's profile limit has been reached.",
  },

  /**
   * /i/<token> — the page the invite QR encodes (ADR-0012 D5, EV-183 edge case 3).
   *
   * Trainee-facing, not coach-facing: the wordmark here is "Evoli Fit", the mobile
   * app, not "Evoli Pro". Nobody who scans this code owns the back-office.
   *
   * There is no store listing yet (⛔ D8), so the fallback says "coming soon" rather
   * than linking somewhere dead — a broken App Store link is worse than a sentence.
   */
  invitePage: {
    brand: "Evoli Fit",
    title: "Your coach invited you to Evoli",
    /**
     * AC3: the trainee should see who is inviting them before they accept. The name
     * arrives as the optional ?coach= query the back-office composed; when it is absent
     * (an old link, a stripped query, a failed /coach-portal/me) the headline above
     * stands as-is and the app still says "Your coach".
     */
    titleFrom: (coachName: string) => `${coachName} invited you to Evoli Fit`,
    body: "Open the invite in the Evoli Fit app to see who is inviting you. Nothing is shared until you accept.",
    open: "Open in Evoli Fit",
    // Edge case 3, verbatim: a phone without the app gets a sentence, not a white screen.
    fallback:
      "Don't have the app yet? Install Evoli Fit, then open this link again.",
    storesComingSoon: "App Store and Google Play links coming soon.",
  },

  client: {
    coachedSince: (date: string) => `Coached since ${date}`,
    adherence: "Adherence this week",
    adherenceValue: (done: number, planned: number) => `${done} / ${planned}`,
    adherenceFoot: "sessions completed of planned",
    streak: "Current streak",
    streakUnit: (days: number) => `${days} day${days === 1 ? "" : "s"}`,
    lastSession: "Last session",
    noSession: "No sessions yet",
    noFeedback: "No feedback given", // AC5 block 3, verbatim
    feedback: { EASY: "Easy", OK: "OK", HARD: "Hard" } as const,
    weight: "Weight",
    weightTrend: "Weight trend, last 8 weeks",
    noWeighIns: "No weigh-ins in the last 8 weeks", // AC5 block 4, verbatim
    // The other two states of block 4's caption (BUG-144). AC5 gives the empty-state
    // sentence only, so these two are ours — they are deliberately about the SERIES,
    // never about a trend, because with one point there is no trend to report.
    oneWeighIn: "1 weigh-in, no trend yet",
    weighInDelta: (delta: string, count: number) => `${delta} over ${count} weigh-ins`,
    redFlags: "Red flags",
    noRedFlags: "No red flags", // AC5 block 5, verbatim
    /**
     * The per-block "not shared" states (ADR-0015 D5/R2-2 + the F1 sign-off edit).
     *
     * These four are OURS, not AC text: EV-183 wrote the overview for a link that
     * shares everything, and R2-2 created states it never described. They are worded
     * on EV-184/EV-185 AC1's pattern ("This trainee has not shared their … with you.")
     * so a coach reads one sentence shape across the whole client area.
     *
     * `notShared` is the tile caption; the value above it is a dash, never a 0 and
     * never "No streak" — both of those are claims about the trainee, and the whole
     * point of F1 is that the api stopped making them.
     */
    notShared: "Not shared",
    notSharedProgress: "This trainee has not shared their progress with you.",
    notSharedWeighIns: "This trainee has not shared their weigh-ins with you.",
    notSharedRedFlags:
      "Red flags need this trainee's progress and weigh-ins, which they have not shared.",
    // AC5's three rules, verbatim. The api sends the code; this maps it. The keys are
    // b-fit-api's `RedFlag` enum constants, not a local spelling — a code with no
    // sentence would render as a raw enum name to a coach.
    //
    // PAIN_REPORTED is published by the api and never emitted (ADR-0012 D6): there is
    // no structured pain signal in the product yet. Its sentence stays so the
    // vocabulary is complete the day EV-082 makes the rule fire.
    redFlagLabels: {
      MISSED_TWO_OR_MORE_SESSIONS: "Missed 2 or more planned sessions this week",
      PAIN_REPORTED: "Reported pain in a session",
      NO_WEIGH_IN_14_DAYS: "No weigh-in for 14 days",
    } as Record<string, string>,
    menu: "More",
    revoke: "Revoke access",
    revokeTitle: "Revoke access?",
    revokeBody: (name: string) =>
      `${name} will be removed from your roster and you will no longer see their training data. They keep their Evoli Fit account and all of their history.`,
    revokeConfirm: "Revoke access",
    revokeCancel: "Cancel",
    revoking: "Revoking…",
    revokeError: "Access could not be revoked.",
    /**
     * Was "Read-only. Program editing and messaging are not part of this preview."
     * EV-184b/EV-185b make the first half false: the Routine and Nutrition tabs are
     * real writes. The sentence now names only what is still absent, because a
     * footnote that under-claims is the same kind of lie as one that over-claims.
     */
    footNote:
      "Messaging and AI drafting are not part of this preview.",
    loadError: "This trainee could not be loaded.",
    notFound:
      "This trainee is not on your roster. They may have revoked access.",
  },

  /**
   * Shared by both tabs — EV-184 AC1 and EV-185 AC1 give this sentence in the same
   * words for two different blocks of profile data, so it lives once. Reworded on one
   * tab only, it stops being the same promise.
   */
  profile: {
    fromProfile: "From the trainee's profile — you cannot change these here.",
    none: "None recorded.",
  },

  tabs: {
    overview: "Overview",
    routine: "Routine", // EV-184 AC1, verbatim
    nutrition: "Nutrition", // EV-185 AC1, verbatim
  },

  /**
   * EV-184b. Every sentence marked AC is verbatim story text.
   *
   * Note what is NOT here: there is no sentence anywhere claiming the plan is safe for
   * the trainee's equipment. `RoutinePolicy.apply` takes injuries only; the
   * equipment-aware replacement is BUG-053 and is not deployed (EV-184 AC3's warning
   * box). The equipment block is labelled descriptively and promises nothing.
   */
  routine: {
    title: "Routine",
    injuries: "Injuries",
    equipment: "Available equipment",
    /**
     * OURS, not AC text. `guardrails.equipment` is `[]` in two different situations and
     * the api distinguishes them with `equipmentChecked`: `false` means the trainee
     * never answered the equipment question, `true` with an empty list cannot happen.
     * "None recorded." for an unanswered question states something about the trainee
     * that they never said — and a coach reading it would reasonably program for a
     * trainee who owns nothing.
     */
    equipmentUnanswered: "Not answered yet.",
    emptyTitle: "No active plan", // AC1, verbatim
    emptyBody: "Nothing is scheduled for this trainee yet.",
    build: "Build a plan", // AC1, verbatim
    // AC1, verbatim — the link is ACTIVE but carries no WORKOUTS scope.
    scopeMissing: "This trainee has not shared their workouts with you.",
    draftBadge: "Draft — not yet published", // AC2, verbatim
    publishedBadge: "Published plan",
    planNameLabel: "Plan name",
    dayLabel: (n: number) => `Day ${n}`,
    exercises: (n: number) => `${n} exercise${n === 1 ? "" : "s"}`,
    sets: "Sets",
    reps: "Reps",
    rest: "Rest",
    moveUp: "Move up",
    moveDown: "Move down",
    replace: "Replace",
    remove: "Remove",
    addExercise: "Add exercise",
    addDay: "Add day",
    removeDay: "Remove day",
    newDayFocus: "New day",
    /**
     * EV-190 R1/U1 — the weekday control and what it decides.
     *
     * `trainingDaysHeading` is EV-190 AC1 verbatim, and its second half is Ruling 2 (c):
     * a coach must be able to read off the screen whether a control is a BOUND the
     * system enforces or a BRIEF the model is asked to follow. These weekdays are
     * enforced — `RoutinePlanWriter` writes one `Workout` per day and derives the whole
     * 7-row `plan_schedule` from them.
     *
     * `trainingDaysNote` is OURS, not AC text. It exists because the consequence of
     * this control is invisible from this screen and lands on two other surfaces: the
     * trainee's Train tab, and `TrainingDayScheduleFactory`, which reads the same rows
     * to decide training-day vs rest-day nutrition. It says "once you publish" because
     * a draft changes nothing for the trainee, and it promises nothing about WHAT the
     * nutrition becomes — only that it follows the schedule, which is what the factory
     * does.
     */
    trainingDaysHeading: "Training days — Evoli enforces these.", // AC1, verbatim
    trainingDaysNote:
      "The trainee trains on these weekdays once you publish. The other days are rest days, and their nutrition follows.",
    /** The per-day accessible name, so seven identical selects stay addressable. */
    weekdayLabel: (n: number) => `Day ${n} weekday`,
    // AC1, verbatim: the refusal names the weekday, and the previous value stands.
    weekdayTaken: (weekday: string) => `${weekday} is already a training day.`,
    // AC1, verbatim: adding a day can never produce a duplicate weekday.
    allWeekdaysUsed: "All seven days are already in this plan.",
    /**
     * `TrainingDayBounds` is 2-6 in the api. The editor disables the add and remove
     * controls at each end and says WHY, rather than leaving a control silently inert —
     * a disabled button with no reason reads as a broken one.
     */
    dayCountBound: "A plan has between 2 and 6 training days.",
    /**
     * U2. `isDraft` is true for a SAVED draft with no edits, so it cannot be the flag:
     * a warning that fires when nothing is unsaved is dismissed reflexively and then
     * ignored on the day it matters. This badge is driven by a separate dirty flag that
     * is set by the first edit and cleared only by a SUCCESSFUL save or publish.
     */
    unsavedBadge: "Unsaved changes",
    leaveTitle: "Leave with unsaved changes?",
    leaveBody:
      "The edits you have made are not saved. If you leave now they are lost.",
    leaveStay: "Stay on this page",
    leaveConfirm: "Leave without saving",
    saveDraft: "Save draft", // AC2, verbatim
    saving: "Saving…",
    savedAt: (date: string) => `Draft saved ${date}`,
    saveFailed: "The draft could not be saved.",
    discardDraft: "Discard draft", // AC2, verbatim
    discardTitle: "Discard draft?",
    discardBody:
      "The draft is deleted and this page goes back to the published plan. This cannot be undone.",
    discardFailed: "The draft could not be discarded.",
    cancel: "Cancel", // AC3, verbatim (the modal's second control)
    publish: "Publish", // AC3, verbatim (the no-repairs modal's single control)
    publishing: "Publishing…",
    /** AC3, verbatim, with the number agreeing with the list length. */
    repairsTitle: (n: number) =>
      `We changed ${n} thing${n === 1 ? "" : "s"} to keep this safe`,
    /**
     * One repair, one line: the exercise, what it was replaced with, and the rule.
     *
     * The MODAL no longer uses this — EV-184a serves `repairs` as whole sentences
     * (`List<String>`), so the portal renders the api's string and composes nothing.
     * It survives as the FIXTURE's composer, which is what keeps the demo's repair
     * lines identical to the ones the triple produced, and it is the function the
     * modal goes back to if the staff review of EV-184a restores AC3's triple.
     */
    repairLine: (exercise: string, replacedWith: string, rule: string) =>
      `${exercise} → ${replacedWith} · ${rule}`,
    publishWithChanges: "Publish with these changes", // AC3, verbatim
    noChanges: "No changes were needed", // AC3, verbatim
    /**
     * The body of the no-repairs modal. It is NOT a second copy of the heading: the
     * heading already says "No changes were needed", and rendering that sentence twice
     * would put two matches on the page for the one string AC3 names, which makes the
     * criterion unassertable. What it says instead is AC5's own promise — the trainee
     * learns on next open, because this story ships no push and no messaging.
     */
    noChangesBody: "The trainee sees this plan next time they open the app.",
    published: "Published. The trainee sees it next time they open the app.",
    publishFailed: "The plan could not be published.",
    // AC4, verbatim — ADR-0013's refusal, shown for catalog search AND for publish.
    catalogUnavailable: "The exercise catalog is unavailable. Try again shortly.",
    planEmpty: "A plan needs at least one training day.", // AC4, verbatim
    catalogTitle: "Add an exercise",
    catalogReplaceTitle: "Replace exercise",
    catalogSearch: "Search the catalog",
    catalogMuscle: "Muscle",
    catalogEquipment: "Equipment",
    catalogAll: "All",
    catalogNoResults: "No exercises match these filters.",
    catalogTruncated: "Showing the first matches. Narrow the search to see more.",
    /**
     * U4. Adding is a repeated act — building a six-exercise day was six open / search
     * / pick cycles — so the picker now stays open while ADDING and the coach closes it
     * themselves. Replacing is a single act and still closes on the pick.
     *
     * `catalogAdded` is the only feedback that the pick landed, because the day it
     * landed on is behind the modal. It is announced, not just drawn.
     */
    catalogAdded: (name: string) => `Added ${name}.`,
    catalogDone: "Done",
    catalogSearching: "Searching…",
    // AC2: the coach picks from the catalog and can never type an exercise name.
    catalogPickOnly: "Pick from the catalog. Typed names are not accepted.",
    loadError: "This trainee's routine could not be loaded.",
  },

  /**
   * EV-185b. Slice 1 has NO nutrition draft and no "Publish" — the coach's control is
   * "Apply to {trainee}" and the confirm dialog says the trainee sees it immediately,
   * because they do (EV-185's ruling). There is no disabled Publish button anywhere.
   */
  nutrition: {
    title: "Nutrition",
    targetsTitle: "Daily targets",
    calories: "Calories",
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    kcal: "kcal",
    grams: "g",
    activity: "Activity level",
    activityLabels: {
      SEDENTARY: "Sedentary",
      LIGHT: "Lightly active",
      MODERATE: "Moderately active",
      ACTIVE: "Active",
      VERY_ACTIVE: "Very active",
    } as Record<string, string>,
    // AC1's three source sentences, verbatim. `COACH` means this coach: a trainee has
    // one coach, and the portal never shows another coach's attribution.
    sourceAuto: "Calculated automatically",
    sourceManual: "Set manually by the trainee",
    sourceCoach: (date: string) => `Set by you on ${date}`,
    /**
     * AC1's fourth label, named by ADR-0015's 2026-09-16 amendment (ruling (b)):
     * `source === "COACH"` and `setByYou === false` — a target written before a
     * revoke-and-re-link, or by a coach account since erased. "Set by you" would be
     * this coach's name on another professional's decision.
     *
     * It never names the other coach, and it cannot: the portal is served a boolean,
     * not an id and not a name. The amendment's words are "Set by another coach"; the
     * date is carried because the other three source lines carry it and a byline that
     * drops it reads like a different kind of fact.
     */
    sourceCoachOther: (date: string) => `Set by another coach on ${date}`,
    emptyTitle: "No nutrition set up yet", // AC1, verbatim
    emptyBody: "Set the targets, then apply a meal week.",
    // AC1, verbatim — ACTIVE link, no NUTRITION scope.
    scopeMissing: "This trainee has not shared their nutrition with you.",
    allergies: "Allergies",
    rules: "Dietary rules",
    dislikes: "Dislikes",
    // Edge case 1, verbatim: no preferences row is not the same as an empty checked list.
    noRestrictions: "No dietary restrictions recorded.",
    saveTargets: "Save targets", // AC2, verbatim
    saving: "Saving…",
    // AC2, verbatim — client-side, and no request is sent.
    invalidNumber: "Enter a number above 0.",
    // AC2, verbatim: the engine's own flag, rendered only when the api returns it.
    floorApplied: (n: number) => `Calories raised to a safe minimum of ${n} kcal.`,
    // AC2, verbatim. It stands whether or not a floor fired, because what it states is
    // the limit of the check itself: `setManual` clamps calories and nothing else.
    floorStanding:
      "Evoli checks calories against a safe minimum. It does not yet check protein or fat.",
    /**
     * EV-190 U3 / AC3 — the arithmetic, verbatim, and ADVISORY.
     *
     * The four targets are four independent numbers today and the only check is
     * "above 0", so 2200 kcal with macros summing to 2560 saves silently and the prompt
     * is handed both. This line states the sum and the signed difference and does
     * nothing else: "Save targets" is never disabled by it, no value is auto-corrected,
     * and no request is blocked. A coach may have a reason, and a control that refuses
     * a professional's deliberate number teaches them to work around the tool.
     *
     * 4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat, and +/-25 kcal reads as a match —
     * the story fixes both so QA computes the expected string instead of reading it off
     * the screen.
     */
    macrosAbove: (macroKcal: string, delta: string) =>
      `Your macros add up to ${macroKcal} kcal — ${delta} above the calorie target.`,
    macrosBelow: (macroKcal: string, delta: string) =>
      `Your macros add up to ${macroKcal} kcal — ${delta} below the calorie target.`,
    macrosMatch: (macroKcal: string) =>
      `Your macros add up to ${macroKcal} kcal — this matches the calorie target.`,
    targetsSaved: "Targets saved.",
    targetsFailed: "The targets could not be saved.",
    saveTargetsTitle: "Save targets?",
    weekTitle: "Meal week",
    weekOf: (date: string) => `Week of ${date}`,
    apply: (trainee: string) => `Apply to ${trainee}`, // AC3, verbatim
    applying: "Applying…",
    applyTitle: "Apply this meal week?",
    /** AC3: the dialog names the trainee AND the week start. */
    applyBody: (trainee: string, weekStart: string) =>
      `This replaces ${trainee}'s meal week starting ${weekStart}.`,
    // AC3, verbatim. Used by both confirm dialogs — a coach write in slice 1 is always
    // immediate, so the sentence is true in both places.
    seesStraightAway: (trainee: string) => `${trainee} will see this straight away.`,
    applyConfirm: "Apply",
    cancel: "Cancel",
    applyFailed: "The meal week could not be applied.",
    // Edge case 3: the portal only ever sends `currentWeekStart`, so this is the
    // sentence for the race where the server's week rolled over mid-session.
    weekOutOfRange: "Only the current week can be applied.",
    /**
     * ADR-0015 D6.6's cap, one apply per trainee per day. It names the limit and does
     * NOT offer a retry: the generic failure sentence invites a second click that
     * cannot succeed until tomorrow, which is how a coach ends up believing the portal
     * is broken.
     */
    weekRateLimited: "A meal week can be applied once a day for each trainee. Try again tomorrow.",
    /**
     * ADR-0015 D6.7: applying a week reuses the plan row and CARRIES LOCKED MEALS
     * FORWARD, so "replaces the week" is true of the row and not of every meal in it.
     * The ADR asks the confirm dialog to say so; without this line the dialog promises
     * a replacement it does not perform.
     */
    lockedMealsKept: "Meals the trainee has locked are kept.",
    regenerate: "Regenerate day", // AC3, verbatim
    /**
     * ADR-0015 D6: `regenerateDay` is free to the coach but its cap lives on the
     * TRAINEE's plan row, so a coach spends the trainee's daily allowance. The ADR's
     * accept-and-disclose: the portal states it (EV-091 carries the fix).
     */
    regenerateSharesLimit: (trainee: string) =>
      `Day regenerations share ${trainee}'s daily limit.`,
    regenerating: "Regenerating…",
    regenerateFailed: "The day could not be regenerated.",
    swap: "Swap meal", // AC3, verbatim
    swapTitle: "Swap meal",
    swapLoading: "Loading options…",
    swapNone: "No swap options are available for this meal.",
    swapFailed: "The meal could not be swapped.",
    noMeals: "No meals planned for this day.",
    /**
     * The marker on a meal the TRAINEE locked in their own app. ADR-0015 D6.7: an
     * apply carries locked meals forward, so without this the coach reads a week they
     * did not generate and cannot tell which parts are the trainee's. One word, and it
     * is the same word the confirm dialog uses ("…are kept").
     */
    mealKept: "Kept",
    mealKeptTitle: "Locked by the trainee — kept when a week is applied",
    // AC3, verbatim — EV-015's locale lock, removed by EV-073 and not before.
    englishOnly:
      "Meal plans are generated in English. Ingredient checks run on the English names.",
    mealSlots: {
      BREAKFAST: "Breakfast",
      LUNCH: "Lunch",
      DINNER: "Dinner",
      SNACK: "Snack",
    } as Record<string, string>,
    macros: (kcal: number, p: number, c: number, f: number) =>
      `${kcal} kcal · ${p} g protein · ${c} g carbs · ${f} g fat`,
    loadError: "This trainee's nutrition could not be loaded.",
  },

  common: {
    loading: "Loading…",
    // The route-level error boundary catches renders from every page, not just the
    // roster, so it cannot claim the roster failed.
    unexpectedError: "Something went wrong.",
    tryAgain: "Try again",
    dash: "—",
  },
} as const;
