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
/**
 * Append a full stop unless the value already ends a sentence.
 *
 * Trainee display names in this product are frequently `"Yusuf A."` — an initial with
 * its own stop — so any sentence that interpolates one and then punctuates produces a
 * double stop. It is the smallest possible defect and it was shipped and then pinned by
 * a test, which is why it gets a named helper rather than a `.replace` at one call site.
 */
function endSentence(value: string): string {
  return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;
}

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
    /**
     * The NAVIGATION landmark's name, and not the same string as `roster`.
     *
     * It was `roster` — so a screen-reader user heard a navigation called "Roster"
     * whose contents were Roster **and** Templates, i.e. a landmark named after one of
     * its own children. "Portal" names what the region is: the two places this product
     * has.
     */
    nav: "Portal",
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

    // ── EV-187 AC2: triage ──────────────────────────────────────────────────
    colFlags: "Flags",
    /** AC2, verbatim: "2 flags" / "1 flag". Both spellings are verified. */
    flags: (count: number) => `${count} flag${count === 1 ? "" : "s"}`,
    /**
     * The control's own name, and the two orders. "Needs attention" and "Recently
     * active" are AC2's words; the group label is ours.
     */
    sortLabel: "Sort",
    sortNeedsAttention: "Needs attention",
    sortRecentActivity: "Recently active",
    /**
     * What the flag column says for a link that shares neither workouts nor weigh-ins.
     * The SAME sentence as every other absence on this surface (`client.notShared`),
     * deliberately: a coach must not have to learn a second vocabulary for the one
     * column where an absence could be misread as good news.
     */
    flagsNotShared: "Not shared",
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
    /**
     * 🔴 **THE TWO RULES THAT CAN FIRE. THERE IS NO THIRD ENTRY HERE, AND ITS ABSENCE
     * IS THE POINT — DO NOT ADD ONE.**
     *
     * `RedFlag.PAIN_REPORTED` is published in b-fit-api's enum and is **never emitted
     * and cannot be**: session feedback is exactly {EASY, OK, HARD}, and
     * `workout_completion.notes` — the column a pain note would live in — is written by
     * **no mobile call site**. The only pain detection in the product reads AI-chat free
     * text, which the trainee did not consent to share with a coach (the four scopes are
     * Workouts · Progress · Nutrition · Weigh-ins; messages are not among them).
     * **EV-082, which would create the signal, is not scheduled.**
     *
     * This map used to carry its sentence "so the vocabulary is complete the day EV-082
     * makes the rule fire". EV-187 ruled that out: *"the portal may not advertise a rule
     * that cannot fire"*, in a legend, a filter, an empty state or a tooltip — and not
     * "coming soon" either, because that is a promise with no date. A sentence sitting
     * in this object is in the shipped bundle whether or not a coach ever sees it
     * rendered, which is why removing it is the fix and not hiding it behind a branch.
     *
     * EV-187 AC4 makes the grep release-blocking, `qa/coach-red-flags-vocabulary.spec.ts`
     * enforces it on the source and on the rendered DOM, and it binds on the CONCEPT
     * rather than one spelling — the b-fit-api guard it mirrors does the same.
     *
     * Both keys are b-fit-api's `RedFlag` constants, not a local spelling.
     */
    redFlagLabels: {
      MISSED_TWO_OR_MORE_SESSIONS: "Missed 2 or more planned sessions this week",
      NO_WEIGH_IN_14_DAYS: "No weigh-in for 14 days",
    } as Record<string, string>,

    /* ── EV-187b: monitoring (AC3 · AC4 · AC5) ─────────────────────────────── */

    /** AC3. The block title is ours; the headline and the bar label are the story's. */
    adherenceSeries: "Adherence, last 8 weeks",
    /** AC3, verbatim: "<done> of <planned> planned sessions in the last 8 weeks". */
    adherenceSeriesHeadline: (done: number, planned: number) =>
      `${done} of ${planned} planned sessions in the last 8 weeks`,
    /** AC3, verbatim: each week reads "<done> / <planned> sessions". */
    weekSessions: (done: number, planned: number) => `${done} / ${planned} sessions`,
    /**
     * AC3, verbatim. A week in which no plan existed is "No plan" and NOT a 0 % week —
     * a week nothing was scheduled in is not a week the trainee failed.
     *
     * ⚠️ It is also what a trainee whose routine was just published reads for every
     * past week (BUG-197: publishing overwrites `selected_at`, so the history is
     * erased). Rendering those weeks as "0 % adherent" would tell a coach their client
     * did nothing, on the strength of a bug in somebody else's write path.
     */
    weekNoPlan: "No plan",
    /**
     * EV-208 AC1, verbatim — the whole-series empty state when NO week in the window
     * had a plan. No chart, no axis of zeroes.
     *
     * 🔴 It replaces EV-187 AC3's last clause, `"No sessions in the last 8 weeks"`,
     * which is **deleted from the product** (EV-208 supersedes that clause; EV-187b is
     * merged, so nothing is reverted). That sentence was reached from
     * `done === 0 && planned === 0`, a condition that is true whenever no week had a
     * plan — so it told a coach their client did nothing while "Recent sessions"
     * listed five workouts they did (BUG-205). It also contradicted `weekNoPlan` one
     * line up. Neither of the two sentences here says anything about whether the
     * trainee trained; the session-history block below is the only block entitled to.
     */
    noPlanInWindow: "No plan on record for these 8 weeks",
    /** EV-208 AC2, verbatim — a plan existed in the window, but nothing was scheduled. */
    nothingScheduledIn8Weeks: "No sessions scheduled in the last 8 weeks",

    /** AC5. The title is ours; the summary line and both empty states are the story's. */
    sessionHistory: "Recent sessions",
    /**
     * AC5, verbatim: "Of the last <n> sessions: <n> easy · <n> OK · <n> hard · <n> no
     * feedback". `returned` is the api's REAL count, so a trainee with six reads "Of
     * the last 6 sessions: …" and never "of the last 10".
     */
    sessionSummary: (
      returned: number,
      easy: number,
      ok: number,
      hard: number,
      noFeedback: number
    ) =>
      `Of the last ${returned} sessions: ${easy} easy · ${ok} OK · ${hard} hard · ${noFeedback} no feedback`,
    /** AC5, verbatim. */
    noCompletedSessions: "No completed sessions yet",

    /** AC4. The evidence heading is ours. */
    missedSessionsEvidence: "Missed sessions",
    /**
     * AC4, verbatim: "Last weigh-in <date> — <N> days ago".
     *
     * Always plural, and that is not an oversight: the rule is "no weigh-in for 14
     * days", so `days` is never 1. A singular branch here would be a line no build can
     * reach and no test can assert.
     */
    lastWeighIn: (date: string, days: number) => `Last weigh-in ${date} — ${days} days ago`,
    /**
     * AC4, verbatim — and reserved for a trainee who has genuinely NEVER logged a
     * weight, in either weight table. A trainee who weighed in nine weeks ago has an
     * empty 8-week chart and a real date here: "nothing recently" is not "nothing ever".
     */
    neverWeighedIn: "Never weighed in",
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
    /**
     * EV-187b. The api did not answer the monitoring read — NOT a scope denial, which
     * is `notSharedProgress` and is decided from `scopes`. The two must stay different
     * sentences: telling a coach a trainee has not shared something because a server
     * was down is a claim about the trainee made out of an outage.
     */
    monitoringLoadError: "These blocks could not be loaded. Reload the page to try again.",
    notFound:
      "This trainee is not on your roster. They may have revoked access.",
  },

  /* ══════════════════════════════════════════════════════════════════════════
   * EV-202b — where the trainee started, where they are, and where they are going.
   *
   * Four sentences below are the STORY'S, verbatim, and senior-qa checks them
   * character by character against EV-202's acceptance criteria:
   *   · `noReadingOnOrAfter` — AC3
   *   · `notRecorded`        — AC4 ("not `0 %`, not a dash, not an empty row")
   *   · `noWeightYet`        — AC5
   *   · `notShared`          — AC6
   *
   * ⚠ `notShared` deliberately does NOT reuse `client.notSharedWeighIns` ("This
   * trainee has not shared their weigh-ins with you."), which says the same thing one
   * card higher up the same page. AC6 gives its sentence in the first-name form and a
   * story's AC text is not a place to improve on the story; the two shapes now sit on
   * one screen, which is a question for `senior-po` and not something to resolve by
   * rewording an AC here.
   *
   * 🔴 G-GOAL. `milestoneNote` is the one sentence on this block that makes a claim
   * about the SYSTEM rather than about the trainee, and it is a negative one — so it
   * owes a witness. It has two, both api-side and both release-blocking in EV-202
   * AC8: the static limb (`milestone_weight_kg` appears in the coach-portal DTO, its
   * use case, the entity and the migration, and in NOTHING under `infrastructure/ai`,
   * `domain/nutrition` or `domain/fitness`) and the difference-of-zero limb (setting an
   * extreme milestone changes neither the nutrition targets nor a generated routine,
   * byte for byte). Without those two runs the sentence would be an assurance, which
   * is exactly what `CLAUDE.md` forbids.
   * ══════════════════════════════════════════════════════════════════════════ */
  progressGoal: {
    /** The block title, and its landmark name. Ours, not the story's. */
    title: "Progress and milestone",
    weight: "Weight",
    bodyFat: "Body fat",

    /* The five cells of a metric row, in the order AC2 prints them. */
    start: (value: string) => `Start ${value}`,
    current: (value: string) => `Current ${value}`,
    milestone: (value: string) => `Milestone ${value}`,
    /**
     * AC2 reads "6.0 kg to go" for a cut and edge case 4 reads "+4.0 kg" for a bulk,
     * so the SIGN is part of the value and not of this template. See `toGoValue` in
     * src/lib/progressGoal.ts, which is the only place that decides it.
     */
    toGo: (value: string) => `${value} to go`,
    /** "92.0 kg (1 Jun 2026)" — a reading printed with the day it was recorded. */
    withDate: (value: string, date: string) => `${value} (${date})`,

    /** AC3, verbatim. Renders INSTEAD of a Start value, and the delta cell is absent. */
    noReadingOnOrAfter: (date: string) => `No reading on or after ${date}`,
    /**
     * AC4, verbatim. "Body fat — Not recorded", and never `0 %`, never a dash and
     * never an empty row: `weigh_ins` has no body-fat column, so a trainee who logs
     * through the weigh-in screen has a weight and no body fat, and "has not recorded
     * body fat" and "has not weighed in" are two different facts about a person.
     */
    notRecorded: "Not recorded",
    /** AC5, verbatim. The milestone field stays editable and still saves beneath it. */
    noWeightYet: (firstName: string) => `${firstName} hasn't recorded a weight yet.`,
    /** AC6, verbatim — rendered from `scopes`, NEVER inferred from a 403. */
    notShared: (firstName: string) => `${firstName} hasn't shared their weigh-ins with you.`,
    /** The api did not answer. A separate sentence from "not shared", on purpose. */
    loadError: "This block could not be loaded. Reload the page to try again.",

    /* ── the start date and its provenance ──────────────────────────────────
     *
     * The api never sends a null `startedOn`: it falls back to the link date and says
     * so in `startedOnSource`. Printing the date without the provenance would pass a
     * defaulted date off as a typed one — which is exactly the shape a silent wipe of
     * `startedOn` takes, since the PUT is a whole representation and a cleared date
     * comes back as a PLAUSIBLE WRONG DATE rather than as a blank.
     *
     * There is deliberately NO sentence for `startedOnSource === "SELF"`. EV-202 AC11
     * gives the trainee no way to set one ("nothing is editable"), so a line reading
     * "set by the trainee" would be copy for a state the product cannot reach — a
     * shipped claim about a capability that does not exist. The date still renders;
     * only the provenance clause is withheld.
     */
    startedOn: (date: string) => `Coaching started ${date}`,
    startedOnCoach: "set by a coach",
    startedOnLinkDefault: "no start date set, so this is the date the link was accepted",

    /* ── the milestone's attribution ────────────────────────────────────────
     *
     * The row is user-scoped, not link-scoped (edge case 10): after a revoke and a new
     * link the next coach sees the previous coach's milestone, and this line is what
     * makes that honest. `milestoneSetByName` null WITH a milestone present is the
     * `ON DELETE SET NULL` case — the coach's account is gone and the number is not.
     */
    milestoneSetBy: (name: string, date: string) => `Milestone set by ${name} on ${date}`,
    milestoneSetByGone: "Milestone set by a coach who has left",

    /* ── the edit form: TWO fields, and there is no third ────────────────────
     *
     * There is no heading key here. The form sits under the block's own title inside
     * one card, so a second heading would name nothing the region is not already
     * named; a key nothing renders is a string nobody can review in place.
     */
    startDateLabel: "Coaching start date",
    /**
     * Said out loud because the PUT is a whole representation: clearing the field and
     * saving is a WRITE, not a no-op, and what comes back is the link date. A coach
     * who is not told that reads the fallback as the date they set.
     */
    startDateHint: "Clear it to fall back to the date the link was accepted.",
    milestoneLabel: "Milestone weight (kg)",
    /** 🔴 G-GOAL. Witnessed by EV-202 AC8's two release-blocking api runs. */
    milestoneNote:
      "A number you and your trainee agreed. Plans and nutrition targets are not calculated from it.",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    /** Client-side, and no request is sent. */
    invalidMilestone: "Enter a milestone weight in kilograms, or leave it empty.",
    invalidDate: "Enter the start date as a calendar date, or leave it empty.",
    /** Edge case 6's 400, rendered rather than pre-empted: the api refuses, we report. */
    outOfRange: "A milestone weight must be between 25 and 300 kg. Nothing was saved.",
    failed: "The start date and milestone could not be saved.",
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
    /**
     * EV-201 AC1. The focus field carried an `aria-label` and no visible one — the only
     * editable field on the page without a label, sitting between a `select` and a count
     * and styled like a heading. The label is rendered in the Sets / Reps / Rest style so
     * a coach reads it as the field it is. Nothing else about the field changes.
     */
    dayFocusLabel: "Day focus",
    /**
     * EV-201 AC2, verbatim. Replace carries the row's sets, reps and rest onto the new
     * exercise (`onPick`); Remove-then-Add does not — it lands on the 3 / "8-12" / "90s"
     * defaults. Both halves were driven before this line shipped. It states what the
     * control DOES and nothing about safety (the story's second non-negotiable).
     */
    replaceKeepsPrescription: "Replace keeps the sets, reps and rest.",
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
    /**
     * EV-201 AC4, verbatim, and the one line of this row I would ship alone.
     *
     * `openPublish` runs `previewPublishAction` — it SAVES the draft and opens the
     * repair preview. `publishAction` (the modal's confirm, echoing the digest) is the
     * only call that reaches the trainee. EV-184's central safety design was stated
     * nowhere on the screen, and a coach unsure what "Publish" does does not press it.
     *
     * It describes what the CONTROL does, not what the guardrail checks: "the safety
     * changes" is the modal's own contents, and this line promises no property of them.
     */
    publishShowsFirst:
      "Publish shows you the safety changes first. Nothing reaches the trainee until you confirm.",
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
    /**
     * EV-201 AC3, verbatim. `keepOpen` is true only for the ADD opening, so this line is
     * rendered only there — the REPLACE picker closes on the pick and a line promising
     * otherwise would be false on that dialog. A modal that stays open after a successful
     * pick is also what a FAILED pick looks like, which is the whole reason it is said.
     */
    catalogStaysOpen: "Pick as many as you need — this stays open. Close it when you're done.",
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
    /**
     * EV-201 AC5, verbatim, next to the line above and never replacing it.
     *
     * The page stated the REGENERATION limit and said nothing about swap, so the safe
     * read was that swapping costs the trainee something too. It does not:
     * `CoachNutritionUseCase.applySwap` → `WeeklyMealPlanService.applySwap` writes the
     * meal and invalidates the cached candidates, and touches neither `regenDate` nor
     * `regenCount` — only `regenerateDay` moves those. Witnessed against a live api by
     * reading the trainee's own counter before and after a swap (EV-201 AC5).
     *
     * The trainee is named the same way the regeneration line names them, so the two
     * sentences sitting together cannot disagree about who they are about.
     *
     * ⚠ "is instant and" WAS in this sentence and was CUT by `senior-po` at review. The
     * cost clause is witnessed twice over; the latency clause had no bound, no timeout
     * and no test — and `planned_meal.swap_candidates` is never pre-warmed, so the FIRST
     * swap dialog on every meal is a model round trip (BUG-186 for the text path,
     * BUG-187 for the images). An unevidenced "can" is the same defect as an unevidenced
     * "cannot". It also bought nothing: the misread this line exists to kill is "the page
     * names the regeneration limit and says nothing about swap, so swap must cost
     * something too", which the cost clause alone answers. Do not add it back, and do not
     * hedge it to "usually instant" — if the wait needs disclosing, that is a loading
     * state, not a sentence.
     */
    swapIsFree: (trainee: string) =>
      `Swapping a meal doesn't use ${trainee}'s daily regenerations.`,
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

  /**
   * EV-256e — "Use one of my recipes" on the meal week. Every sentence marked AC is the
   * story's, VERBATIM (hub `32d2657`), and QA checks them character by character.
   * `{FirstName}` is `firstName(traineeDisplayName)`; `{recipe}` and `{meal name}` are
   * the coach's and the engine's text exactly as served, never truncated INSIDE a
   * sentence (the element wraps instead — BUG-243/244).
   */
  placement: {
    /** AC1, verbatim — the meal action. Only while `recipePlacementEnabled` is true. */
    action: "Use one of my recipes",
    actionNamed: (meal: string) => `Use one of my recipes: ${meal}`,
    title: "Use one of my recipes",
    filterLabel: "Filter your recipes",
    filterPlaceholder: "Recipe name",
    loading: "Loading your recipes…",
    loadFailed: "Your recipes could not be loaded.",
    /** AC2, verbatim — the empty library, with a link to `/recipes/new`. */
    empty: "You have no recipes yet.",
    emptyLink: "New recipe",
    noMatch: (query: string) => `None of your recipes match “${query}”.`,
    macroLine: (kcal: number, p: number, c: number, f: number) =>
      `${kcal} kcal · P ${p} g · C ${c} g · F ${f} g`,
    chooseNamed: (recipe: string) => `Choose ${recipe}`,
    /** AC2, verbatim — the confirm. */
    confirm: (meal: string, recipe: string, weekday: string) =>
      `Replace “${meal}” with “${recipe}” on ${weekday}?`,
    confirmButton: "Replace",
    back: "Choose another recipe",
    placing: "Replacing…",
    cancel: "Cancel",

    /* ── AC4, verbatim — the markers ─────────────────────────────────────────── */
    yourRecipe: "Your recipe",
    coachRecipe: "Coach recipe",
    yourRecipeTitle: "You put one of your recipes on this meal",
    coachRecipeTitle: "Another coach put one of their recipes on this meal",

    /* ── AC3, verbatim — the refusals, shown with the dialog left open ───────── */
    excludedIngredient: (recipe: string, first: string, value: string) =>
      `“${recipe}” can't be used for ${first}: ${value} conflicts with their dietary settings.`,
    excludedName: (recipe: string, first: string) =>
      `“${recipe}” can't be used for ${first}: its name contains a word that conflicts with their dietary settings. Rename the recipe and try again.`,
    ruleUncheckable: (first: string) =>
      `Recipes can't be used for ${first} yet: Evoli can't check a hand-written recipe for kosher meat-and-dairy combinations. Their generated meals are not affected.`,
    allergiesUncheckable: (first: string) =>
      `Recipes can't be used for ${first} yet: Evoli can't safety-check a hand-written recipe against their dietary settings. Their generated meals are not affected.`,
    belowFloor: (first: string, weekday: string, dayKcalAfter: number, floorKcal: number) =>
      `This would bring ${first}'s ${weekday} to ${dayKcalAfter} kcal, below their minimum of ${floorKcal} kcal. Choose a recipe with more calories.`,
    /** AC3 + AC7, verbatim — shared by the placement dialog and the Swap dialog. */
    mealEaten: (first: string) => `${first} has already eaten this meal, so it can't be replaced.`,
    mealLocked: (first: string) => `${first} has already locked this meal, so it can't be replaced.`,
    /** AC3 (ADR-0026 A3), verbatim — a key retired since the recipe was saved. */
    retiredIngredient: (recipe: string) =>
      `“${recipe}” uses an ingredient Evoli no longer offers. Open the recipe to replace it, then try again.`,
    openRecipe: "Open the recipe",
    /** Edge case 6, verbatim — the meal was regenerated after the page loaded (404). */
    mealChanged: "This meal changed. Pick it again.",

    /* ── states the story does not word (not AC copy; senior-po may reword) ──── */
    /**
     * 403 on the placement: the recipe is not in the coach's library any more (deleted
     * in another tab), or the link ended. The api answers one body for both. The page
     * is refreshed as well, so an ended link still lands on /clients/denied.
     */
    recipeGone: "That recipe is not in your library any more.",
    /** 404 `NOT_FOUND`: the flag was switched off after the page loaded (edge case 14). */
    placementOff: "Recipes can't be put on meals right now.",
    failed: "The recipe could not be used. Try again.",

    /**
     * AC5, verbatim, inside the existing apply-week confirm, only when n ≥ 1 (n = this
     * week's COACH_RECIPE meals that are not locked). The story writes "meal(s)"; the
     * portal renders the correct singular or plural.
     */
    applyWarning: (n: number, first: string) =>
      `This replaces up to ${n} ${n === 1 ? "meal" : "meals"} placed from coach recipes. Meals ${first} has eaten are kept.`,
  },

  /**
   * EV-188b — the coach's routine library. Sentences marked AC are verbatim story text
   * and `senior-qa` checks them character by character; rewording one is a story change.
   *
   * ⚠ SPELLING, recorded rather than silently harmonised: EV-188 AC5 writes
   * "catalogue" and EV-184 AC4 — already shipped, already QA-verified — writes
   * "catalog". Both are AC text. The new strings below use the new story's spelling and
   * `copy.routine.catalogUnavailable` keeps the old one, so two spellings are on the
   * product at once. That is a PO decision to make, not a tidy-up for an engineer to
   * take unilaterally on strings QA compares by character.
   *
   * ⚠ WHAT IS DELIBERATELY ABSENT: no sentence here says or implies that using a
   * template on a trainee changes anything the trainee can see. Apply writes the
   * coach's DRAFT and touches no plan row — b-fit-api's QA confirmed the trainee's app
   * still shows the old plan immediately after an apply — so `applied` and
   * `applyNotPublished` both say so in as many words. EV-201 exists because "Publish"
   * did not publish and the screen never said so; this is that lesson one row later.
   */
  templates: {
    nav: "Templates", // AC1 — the portal's main navigation
    title: "Templates",
    subtitle: "Routines you can put on any trainee.",
    /** AC4, verbatim. Stated once, on the library page. */
    private: "Templates are yours. No trainee ever sees them.",
    emptyTitle: "No templates yet", // AC1, verbatim
    emptyBody: "Build a routine once and put it on any trainee.",
    create: "New template", // AC1, verbatim
    loadError: "Your templates could not be loaded.",
    /**
     * One body for a foreign template, an id that never existed and one deleted in
     * another tab — the api answers all three the same way on purpose, so the portal
     * must not render three sentences and turn the prefix into an existence oracle.
     */
    notYours: "That template is not in your library.",
    backToLibrary: "Back to templates",

    /* ── the library list (AC2) ───────────────────────────────────────────── */
    /** AC1, verbatim, for a template saved moments ago. */
    updatedJustNow: "Updated just now",
    updatedAt: (when: string) => `Updated ${when}`,
    rowSummary: (days: number, exercises: number) =>
      `${days} day${days === 1 ? "" : "s"} · ${exercises} exercise${exercises === 1 ? "" : "s"}`,
    edit: "Edit", // AC2, verbatim
    duplicate: "Duplicate", // AC2, verbatim
    rename: "Rename", // AC2, verbatim
    remove: "Delete", // AC2, verbatim
    use: "Use on a trainee", // AC2, verbatim
    /**
     * AC2's cap, with the number the API SERVES rather than a hardcoded 50 — raising it
     * is a decision on the api side and the portal must not disagree with it on screen.
     * It is a PRODUCT bound (a flat list of 50 needs no folders, tags or search) and
     * Ruling 5c forbids describing it as a storage control, so this sentence does not.
     */
    limitReached: (limit: number) =>
      `You can keep up to ${limit} templates. Delete one to make room.`,
    remaining: (left: number, limit: number) => `${left} of ${limit} left`,

    /* ── rename (AC2) ─────────────────────────────────────────────────────── */
    renameTitle: "Rename template",
    renameLabel: "Template name",
    /** AC2, verbatim. Both templates are left unchanged. */
    nameTaken: "You already have a template called that.",
    nameRequired: "Give the template a name.",
    nameTooLong: "A template name is at most 80 characters.",
    renameFailed: "The template could not be renamed.",
    duplicateFailed: "The template could not be duplicated.",

    /* ── delete (AC2) ─────────────────────────────────────────────────────── */
    deleteTitle: "Delete template?",
    /**
     * AC2 — the confirm NAMES the template, and states Ruling 2's guarantee, which is
     * the single most important sentence on this screen: a coach who thinks deleting a
     * template might disturb a trainee's live plan will never delete one.
     */
    deleteBody: (name: string) =>
      `“${name}” is deleted from your library. Every plan and every draft you made from it is unchanged.`,
    deleteFailed: "The template could not be deleted.",

    /* ── the editor ───────────────────────────────────────────────────────── */
    newTitle: "New template",
    editTitle: "Edit template",
    nameLabel: "Template name",
    documentNameLabel: "Routine name",
    documentNameRequired: "Give the routine a name.",
    newDocumentName: "New routine",
    newDayFocus: "New day",
    goalLabel: "Goal",
    levelLabel: "Level",
    minutesLabel: "Minutes per session",
    summaryLabel: "Summary",
    summaryHint: "Shown to nobody but you. Leave it empty if you have nothing to add.",
    notesLabel: "Notes",
    tempoLabel: "Tempo",
    weightLabel: "Weight",
    trackingLabel: "Tracked as",
    trackingWeightReps: "Weight and reps",
    trackingDuration: "Duration",
    durationLabel: "Seconds",
    save: "Save template",
    saving: "Saving…",
    saved: "Template saved",
    saveFailed: "The template could not be saved.",
    unsavedBadge: "Unsaved changes",
    /**
     * ADR-0016 §Amendment V1b, said on the screen it costs.
     *
     * The validation group was withdrawn: the server accepts only a document it would
     * accept as a published plan, so there is no autosave and a half-built template
     * cannot be parked on the server. A coach who does not know that loses a tab and
     * blames the product. The editor therefore states the rule up front and lists what
     * is outstanding, rather than letting Save fail with a 400.
     */
    notSaveableYet: "This template is not ready to save yet:",
    localOnly: "Nothing here is saved until you press Save template.",

    /* ── bounds (AC2 / Ruling 5c) ─────────────────────────────────────────── */
    dayCountBound: "A template has between 2 and 6 training days.",
    dayEmpty: (n: number) => `Day ${n} has no exercises.`,
    dayFocusRequired: (n: number) => `Day ${n} needs a focus.`,
    duplicateWeekday: "Two training days are on the same weekday.",
    freeTextTooLong: "One of the text fields is too long.",
    /** AC2, verbatim — on the disabled "Add exercise" control at 12. */
    dayFull: "12 exercises is the most in one day.",
    /** AC2, verbatim — the server's refusal, named with the day and its count. */
    tooLarge: (day: number, count: number) =>
      `A training day can hold up to 12 exercises. Day ${day} has ${count}.`,

    /* ── save as template (AC1) ───────────────────────────────────────────── */
    saveAsTemplate: "Save as template", // AC1, verbatim
    saveAsTemplateTitle: "Save as template",
    fromPlan: "From the published plan",
    fromDraft: "From your unpublished draft",
    /** Edge case 12 — an active plan with no routine document. Never an empty template. */
    sourceEmpty: "This trainee has no routine to copy yet.",
    saveAsTemplateDone: (name: string) => `“${name}” is in your templates.`,
    saveAsTemplateFailed: "The template could not be created.",

    /* ── use on a trainee (AC3) ───────────────────────────────────────────── */
    useTitle: "Use on a trainee",
    pickTrainee: "Trainee",
    /**
     * AC3, verbatim. The picker offers ACTIVE, WORKOUTS-scoped links ONLY, so this
     * sentence is never shown beside a trainee the coach would then be refused for.
     */
    guardrailsAtPublish: (trainee: string) =>
      `${trainee}'s injuries and equipment are applied when you publish.`,
    useConfirm: (template: string, trainee: string) =>
      `Put “${template}” on ${trainee}?`,
    /**
     * AC3, verbatim — shown ONLY after the api has answered 409 COACH_DRAFT_EXISTS.
     *
     * It is not a pre-read. ADR-0016 D9.1 rejected reading the draft first because
     * check-then-act across two tabs makes this sentence a lie; the retry echoes the
     * timestamp the 409 carried, and a second tab that saved in between is refused
     * again rather than overwritten.
     */
    /**
     * AC3's wording with the sentence boundary handled, because the display names this
     * product actually holds end in one: "Yusuf A." produced *"…draft for Yusuf A..
     * That draft…"* — a double stop, shipped, and PINNED by a test asserting the string
     * exactly, which is the worse half of the defect. A name already ending in `.`,
     * `!` or `?` supplies its own terminator.
     */
    replacesDraft: (trainee: string) =>
      `This replaces your unpublished draft for ${endSentence(trainee)} That draft cannot be recovered.`,
    useIt: "Use this template",
    replaceAndUse: "Replace the draft",
    cancel: "Cancel",
    noTrainees: "You have no trainees who have shared their workouts with you.",
    applyFailed: "The template could not be used on that trainee.",
    /**
     * The 409 with no `details.existingUpdatedAt`. The portal will NOT retry blind: a
     * retry without the assertion is a draft destroyed on a guess, and the assertion is
     * the only thing that makes the sentence above true.
     */
    applyConflictUnreadable:
      "That trainee's draft changed while this dialog was open. Open it again.",
    /**
     * 🔴 The sentence constraint 4 of this story is about, and it is on screen BEFORE
     * the coach confirms, not after. Apply writes the coach's draft and nothing else.
     */
    applyNotPublished:
      "This fills your draft for that trainee. Nothing changes for them until you publish.",
    applied: (trainee: string) =>
      `Draft ready for ${trainee}. Nothing has changed for them yet — publish when you are ready.`,

    /* ── in the trainee's editor (AC3 / AC5) ──────────────────────────────── */
    /** AC3, verbatim. Disappears when the template is deleted, and nothing else does. */
    startedFrom: (name: string) => `Started from ${name}`,
    /**
     * AC5, verbatim at n = 2. **"may"**, because the matcher is fuzzy and the product
     * does not claim to know more than it does — and nothing is removed on its opinion.
     */
    unbindable: (n: number) =>
      n === 1
        ? "1 exercise may not be in the exercise catalogue. Check it before you publish."
        : `${n} exercises may not be in the exercise catalogue. Check them before you publish.`,
    /** AC5, verbatim — marked IN PLACE, on the row, in the day it belongs to. */
    notInCatalogue: "Not found in the catalogue",
  },

  /* ══ EV-256b — the coach's recipe library ══════════════════════════════════════
   *
   * Sentences marked "AC" are verbatim EV-256 (hub `docs/product/stories/
   * EV-256-coach-recipes.md`, section EV-256b). Straight apostrophes and CURLY double
   * quotes, exactly as the story writes them.
   *
   * Deliberately absent: any sentence saying a recipe is checked against a trainee's
   * allergies or food rules. Nothing in this row checks anything about a trainee — a
   * recipe belongs to no trainee (EV-256a AC9) — and the checks at placement are
   * EV-256c's, behind a production flag that is OFF. A reassuring "safe for your
   * trainees" here would be a claim with no code behind it.
   */
  recipes: {
    nav: "Recipes", // AC1 — next to Templates in the portal nav
    title: "Recipes",
    /**
     * Not "for any trainee": putting a recipe on a trainee's meal is EV-256c/e and is OFF
     * in production until EV-256f ships (ruling R5). The subtitle says what the page does
     * today.
     */
    subtitle: "Meals you write once.",
    /** Stated once, on the library page. EV-256a AC9: a recipe holds no trainee data. */
    private: "Recipes are yours. No trainee sees your library.",
    /** AC1, verbatim. */
    count: (n: number, limit: number) => `${n} of ${limit} recipes`,
    /** AC1, verbatim. */
    emptyTitle: "No recipes yet.",
    emptyBody: "Write a recipe once, with its ingredients, macros and steps.",
    create: "New recipe", // AC1, verbatim
    loadError: "Your recipes could not be loaded.",
    /** The editor's read failed for a reason that is not the AC6 denial (api down, a 400). */
    recipeLoadError: "This recipe could not be loaded.",
    /** ONE sentence for a foreign, an unknown and a deleted recipe (EV-256a AC6). */
    notYours: "That recipe is not in your library.",
    backToLibrary: "Back to recipes",
    limitReached: (limit: number) =>
      `You can keep up to ${limit} recipes. Delete one to make room.`,

    /* ── a library row ────────────────────────────────────────────────────── */
    macroLine: (kcal: number, p: number, c: number, f: number) =>
      `${kcal} kcal · P ${p} g · C ${c} g · F ${f} g`,
    ingredientCount: (n: number) => `${n} ingredient${n === 1 ? "" : "s"}`,
    edit: "Edit",
    remove: "Delete",

    /* ── delete (AC5) ─────────────────────────────────────────────────────── */
    deleteTitle: "Delete recipe?",
    /** AC5, verbatim. Default D-f: a placed meal is a snapshot. */
    deleteBody: (name: string) =>
      `Delete “${name}”? Meals you already put on a trainee's plan keep this recipe.`,
    deleteFailed: "The recipe could not be deleted.",
    cancel: "Cancel",

    /* ── the editor (AC2) ─────────────────────────────────────────────────── */
    newTitle: "New recipe",
    editTitle: "Edit recipe",
    /** AC6, verbatim — above the form, on an existing recipe only. */
    futureUsesOnly:
      "Changes apply to future uses only. Meals you already placed keep the version you placed.",
    nameLabel: "Recipe name",
    ingredientsHeading: "Ingredients",
    ingredientsNote: "One serving. Pick each ingredient from Evoli's list.",
    searchLabel: "Find an ingredient",
    searchPlaceholder: "Chicken, rice, oats…",
    searching: "Searching…",
    /** The search's one announced line (role="status"); the result buttons are not live. */
    found: (n: number) => `${n} ingredient${n === 1 ? "" : "s"} found`,
    /** AC3, verbatim. The query is shown as the coach typed it, trimmed. */
    noIngredientMatch: (query: string) =>
      `Evoli only lists ingredients it can safety-check, and “${query}” isn't one yet.`,
    searchFailed: "The ingredient list could not be searched. Try again.",
    alreadyAdded: "Added",
    addIngredientNamed: (label: string) => `Add ${label}`,
    quantityLabel: "Quantity",
    unitLabel: "Unit",
    unitNames: { g: "g", ml: "ml", piece: "piece" } as Record<string, string>,
    removeIngredient: "Remove",
    removeIngredientNamed: (label: string) => `Remove ${label}`,
    ingredientsFull: "A recipe has at most 25 ingredients.",
    macrosHeading: "Macros per serving",
    kcalLabel: "Calories (kcal)",
    proteinLabel: "Protein (g)",
    carbsLabel: "Carbs (g)",
    fatLabel: "Fat (g)",
    stepsHeading: "Steps",
    stepsNote: "Optional. They keep the order you write them in.",
    stepLabel: (n: number) => `Step ${n}`,
    addStep: "Add a step",
    removeStep: "Remove",
    removeStepNamed: (n: number) => `Remove step ${n}`,
    stepsFull: "A recipe has at most 15 steps.",
    save: "Save recipe",
    saving: "Saving…",
    saved: "Recipe saved.",
    saveFailed: "The recipe could not be saved.",
    unsavedBadge: "Unsaved changes",
    notReady: "Complete the fields marked above to save.",

    /* ── local refusals, each shown beside its field ──────────────────────── */
    required: "Required.",
    nameRequired: "Give the recipe a name.",
    nameTooLong: "A recipe name is at most 80 characters.",
    nameInvalid: "Check the name: 1 to 80 characters, on one line.",
    noLineBreaks: "Keep this on one line, with no special characters.",
    ingredientsRequired: "Add at least one ingredient.",
    quantityRequired: "Enter a quantity.",
    quantityRange: "A quantity is more than 0 and at most 5000, with up to 2 decimals.",
    /** The EV-256a review's rule: 50.7 is refused, never truncated. */
    wholeNumbersOnly: (below: number, above: number) =>
      `Whole numbers only. Use ${below} or ${above}.`,
    numberRange: (label: string, min: number, max: number) =>
      `${label}: a whole number from ${min} to ${max}.`,
    stepEmpty: "Write this step or remove it.",
    stepTooLong: "A step is at most 300 characters.",
    stepInvalid: "Check this step: 1 to 300 characters, on one line.",

    /* ── server refusals (AC4), each shown beside its field ───────────────── */
    /** AC4, verbatim. */
    macrosInconsistent: (computedKcal: number, kcal: number) =>
      `These macros add up to ${computedKcal} kcal, not ${kcal}. Check the numbers.`,
    nameTaken: "You already have a recipe called that.",
    /**
     * `COACH_RECIPE_UNKNOWN_INGREDIENT` on a line the coach did not type: every line
     * comes from a search result, so the only way to meet this is a key the api has
     * RETIRED since the recipe was saved. The same sentence marks such a line on load.
     */
    ingredientRetired: (label: string) =>
      `“${label}” is no longer on Evoli's ingredient list. Remove it to save.`,
    /**
     * The mark a line carries ON LOAD when the api reports its key in `unknownKeys`.
     * Shorter than `ingredientRetired` on purpose: that sentence is the SAVE refusal,
     * and the two must be distinguishable so a spec can tell "the api refused this line"
     * from "the read said this key is retired".
     */
    retiredBadge: "No longer on Evoli's list",
    ingredientTwice: "This ingredient is already in the recipe.",
    ingredientInvalid: "Check this ingredient's quantity and unit.",
    ingredientsBound: "A recipe has between 1 and 25 ingredients.",
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
