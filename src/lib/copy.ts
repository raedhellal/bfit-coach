/**
 * Every user-visible string in Evoli Pro, in one place — the ENGLISH dictionary.
 *
 * EV-324: the portal speaks French to a browser whose first language is French. This
 * object is `en`; `src/lib/copy.fr.ts` is `fr`, typed `satisfies Copy`, so a key missing
 * from either side fails `tsc` (AC4). Nothing imports a dictionary directly: a server
 * component calls `getCopy()` (`src/lib/i18n/server.ts`), a client component calls
 * `useCopy()` (`src/lib/i18n/client.tsx`). A string added here without its French twin is
 * a compile error, which is the point.
 *
 * The sentences marked "AC" are verbatim acceptance-criteria text from their stories and
 * MUST NOT be reworded without changing the story: senior-qa verifies them character by
 * character. EV-324 AC2: the English strings are unchanged by the French row.
 *
 * No invented benefits, no tier price, no ToS/DPA wording (EV-183 "NOT in the demo"
 * item 12 — ⛔ D8/D9 are open).
 */
import type { Locale } from "./i18n/locale";

/**
 * Append a full stop unless the value already ends a sentence.
 *
 * Trainee display names in this product are frequently `"Yusuf A."` — an initial with
 * its own stop — so any sentence that interpolates one and then punctuates produces a
 * double stop. It is the smallest possible defect and it was shipped and then pinned by
 * a test, which is why it gets a named helper rather than a `.replace` at one call site.
 */
export function endSentence(value: string): string {
  return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;
}

export const en = {
  /** EV-324 — the dictionary's own language; formatters take it (`src/lib/format.ts`). */
  locale: "en" as Locale,
  brand: "Evoli Pro", // AC1: the app header reads exactly this
  tagline: "The coach back-office for Evoli Fit.",

  login: {
    title: "Sign in",
    subtitle: "For coaches only.",
    /** EV-337k — the brand panel (≥ 768 px) and the compact band above the form. */
    panelTitle: "The workspace for Evoli coaches.",
    /**
     * PO ruling 2026-10-02 (hub 4e52609a): the first draft said trainees CHOOSE what they
     * share, but every link is granted all four scopes (b-fit-api `CoachLinkService`). What
     * holds is that the coach sees only what each client agreed to share.
     */
    panelBody:
      "Routines, nutrition and challenges for your clients, in one place. You see only what each client agreed to share with you.",
    /**
     * EV-337k (plan §5.10): the design's « Activer mon compte » link would point back at this
     * page — activation IS signing in with the temporary password (the sign-in handler sends a
     * pending account to /activate). One sentence says so instead. It names the invitation,
     * not an email we sent: the api's mail adapter swallows failures (EV-278 edge case 1).
     */
    newCoach: "New coach? Sign in with the temporary password from your invitation, then choose your own.",
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
    /**
     * EV-278c / ADR-0022 D22.9e — "a pending trainee on the portal → today's refusal,
     * pointing at the app". AC1's sentence, then where the trainee finishes instead.
     */
    pendingTrainee:
      "This account is not an Evoli Pro coach account. Finish setting it up in the Evoli Fit app.",
    /** EV-278c — `409 ACCOUNT_NOT_INITIALISED` at sign-in (EV-204 AC-P5c's line, for the web). */
    notInitialised: "We can't finish this account here. Write to support@evoli.fit and we'll sort it out.",
  },

  /**
   * EV-278c — the activation screen (/activate). EV-278 carries no verbatim copy for it;
   * the refusal lines below marked "AC-P5c" are EV-204 AC-P5c's app sentences, mirrored so
   * the two activation surfaces say the same thing about the same refusal (ADR-0022 D22.9f:
   * one endpoint, one consent source). Everything else is this surface's own wording.
   *
   * Deliberately ABSENT: any "we emailed you" sentence (the api's mail adapter swallows
   * failures, EV-278 edge case 1) and any sentence naming the account's name (the portal
   * cannot read it; see `ActivationStatus`).
   */
  activate: {
    title: "Finish your account",
    setUpBy: (initialiser: string) => `${initialiser} set up this Evoli Pro account for you.`,
    finishBy: (when: string) =>
      `Finish it by ${when}. If it isn't finished by then, the account is deleted.`,
    temporaryPassword: "Temporary password",
    temporaryHint: "From the invitation email.",
    newPassword: "New password",
    newHint: "At least 8 characters.",
    repeatPassword: "Repeat the new password",
    mismatch: "The two new passwords don't match.",
    /**
     * The checkbox's accessible name. The links sit OUTSIDE the label, on their own line,
     * so that opening a document to read it can never tick the box (the app's BUG-023
     * reasoning: "a row-wide toggle would tick consent for anyone tapping to read").
     */
    consent: "I agree to the Terms of Service and the Privacy Policy.",
    termsLink: (version: string) => `Terms of Service (version ${version})`,
    privacyLink: (version: string) => `Privacy Policy (version ${version})`,
    readBefore: "Read them before you agree:",
    submit: "Finish my account",
    submitting: "Finishing…",
    // AC-P5c, verbatim from the app.
    temporaryInvalid: "That temporary password isn't right. Check the email we sent you.",
    // AC-P5c, verbatim from the app.
    temporaryReused: "Choose a new password that's different from the temporary one.",
    // AC-P5c's shape: {minutes} = Retry-After ÷ 60, rounded up.
    rateLimited: (minutes: number) =>
      `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
    rateLimitedNoWait: "Too many attempts. Wait a few minutes and try again.",
    // The app's consentRequired / consentUpdated lines, for a person finishing an account.
    consentRequired: "Please accept the Terms of Service and the Privacy Policy to finish your account.",
    consentUpdated:
      "Our Terms of Service or Privacy Policy have changed. Please review them and accept the new version.",
    consentReload: "Our Terms of Service or Privacy Policy have changed. Reload this page to see the new version.",
    validation: "Your new password must be 8 to 128 characters.",
    /**
     * BUG-381: b-fit-api's `@NotBlank` on `newPassword`. Said before sending (the form) and
     * for the api's own refusal (`PASSWORD_BLANK`, mapped by /api/auth/activate), never as
     * `validation` — eight spaces meet the length rule, so that sentence was false.
     */
    blank: "Your new password can't be only spaces.",
    notInitialised: "We can't finish this account here. Write to support@evoli.fit and we'll sort it out.",
    alreadyActiveTitle: "This account is already finished",
    alreadyActive: "Sign in again with the password you chose.",
    signInAgain: "Sign in again",
    expiredTitle: "This account has expired",
    /** The page, when `expiresAt` has passed before the form is shown. */
    expired: (when: string, initialiser: string) =>
      `It had to be finished by ${when}, and that time has passed. Ask ${initialiser} to set it up again.`,
    /** `410 ACTIVATION_EXPIRED` on submit: the clock passed while the form was open. */
    expiredOnSubmit: (when: string, initialiser: string) =>
      `This account had to be finished by ${when}, and that time has passed. Ask ${initialiser} to set it up again.`,
    traineeTitle: "Finish this account in the app",
    trainee: "This account is set up for Evoli Fit, not Evoli Pro. Finish it in the Evoli Fit app.",
    loadFailedTitle: "We couldn't load your account",
    loadFailed: "Reload the page to try again.",
    legalUnavailable:
      "We can't show the Terms of Service and the Privacy Policy right now, so the account can't be finished yet. Reload the page to try again.",
    /**
     * `failed` and `unavailable` are ONE sentence on purpose (staff, EV-278c round 2): after
     * an unrecognised answer or a lost reply the portal does not know whether the api
     * finished the account, so neither may say it was "not changed". Reloading /activate
     * asks `GET /me/activation` again and draws where it actually stands — the form if still
     * pending, `alreadyActiveTitle` if it was finished.
     */
    failed: "We couldn't confirm your account was finished. Reload this page to see where it stands.",
    unavailable: "We couldn't confirm your account was finished. Reload this page to see where it stands.",
    signedInAgain: "Your account is finished. Sign in with your new password.",
    /**
     * EV-324 — who set the account up, when the api sent a kind and no name (the name was
     * erased). `initialiserName` in coachApi.ts still carries its English pair — that file
     * belongs to a parallel branch this week — so /activate maps these two kinds itself.
     */
    yourGym: "Your gym",
    yourCoach: "Your coach",
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
    /**
     * The logo link's name (redesign, branch 1). It starts with the visible wordmark
     * (WCAG 2.5.3, label in name) and still says where it goes; "Back to roster" stays a
     * substring, so a locator by that name keeps finding it.
     */
    home: "Evoli Pro, back to roster",
    /** The account block (sidebar) and the account menu's button (top bar, < 1024 px). */
    account: "Account",
    /** The language switch's group label. The options are the languages' own names. */
    language: "Language",
    /** The switch's one-line failure: the cookie was not written, nothing changed. */
    languageFailed: "The language could not be changed. Try again.",
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
    /**
     * EV-283 In scope, verbatim: "a small *"Plan changed"* marker on rows with
     * `routineChangedSinceYourPublish`". Said only for a literal `true` — null is "not
     * shared" (no WORKOUTS) and says nothing, false says nothing.
     */
    planChanged: "Plan changed",
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

    // ── EV-337d: the redesigned roster (plan §5.1) ──────────────────────────────
    /**
     * The populated roster's subtitle: how many clients, how many need attention. Both
     * numbers are counts of rows the api returned; the empty and failed rosters keep
     * `subtitle`, which claims no number.
     */
    subtitleCounts: (total: number, toReview: number) =>
      `${total} client${total === 1 ? "" : "s"} · ${toReview} to review`,
    /**
     * The four groups (`src/lib/rosterView.ts`). "To review" and not "Needs attention":
     * that is the sort toggle's option, and one screen must not use one phrase for two
     * controls. There is no "Pending invites" group: the api has no read of pending
     * invites (plan §7 G2).
     */
    groups: {
      attention: "To review",
      onTrack: "On track",
      inactive: "Inactive",
      other: "Other clients",
    },
    /** A group heading's count chip, read as a sentence by a screen reader. */
    groupCount: (n: number) => `${n} client${n === 1 ? "" : "s"}`,
    searchLabel: "Search clients",
    searchPlaceholder: "Search clients",
    filtersLabel: "Filter clients",
    /**
     * Only the filters with data behind them (EV-337 D5). The design's "Adherence < 50 %"
     * (G1) and "Invitations" (G2) have no api field and are not drawn.
     */
    filters: {
      all: (n: number) => `All · ${n}`,
      flagged: (n: number) => `Flagged · ${n}`,
      inactive: (n: number) => `Inactive · ${n}`,
    },
    noMatch: "No client matches.",
    clearFilters: "Show all clients",
    /** The live region after a search or a filter. */
    shown: (n: number) => `${n} client${n === 1 ? "" : "s"} shown`,
    /** The navigation's count beside "Roster" — flagged clients — for a screen reader (D3, restated). */
    navCount: (n: number) => `${n} client${n === 1 ? "" : "s"} to review`,
    /** R6: more than 7 days without a completed session, with PROGRESS shared. */
    inactiveFor: (days: number) => `Inactive for ${days}\u00a0days`,
    upToDate: "Up to date",
    /** No PROGRESS on the link: the portal cannot say whether the client trains. */
    activityNotShared: "Activity not shared",
    /** PROGRESS shared, but neither WORKOUTS nor WEIGH_INS: no flag rule could run. */
    flagsUnavailable: "Flags not shared",
    today: "Today",
    yesterday: "Yesterday",
    daysAgo: (days: number) => `${days}\u00a0days ago`,
    /** The row's visual action. The whole row is the link; these are its label. */
    actionReview: "Review",
    actionOpen: "Open",
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
    /**
     * EV-289, verbatim: "Open in Evoli Fit" and "Open in Evoli Fit Lite". The app name
     * comes from `src/lib/traineeApps.ts`, so the lite label follows D-LITE-1 there.
     */
    openIn: (appName: string) => `Open in ${appName}`,
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

    /* ── the edit form: THREE fields since EV-274b, and there is no fourth ────
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
    /** EV-274b AC1, verbatim. Beside the weight milestone, in the same form. */
    bodyFatMilestoneLabel: "Milestone body fat (%)",
    /** 🔴 G-GOAL. Witnessed by EV-202 AC8's two release-blocking api runs. */
    milestoneNote:
      "A number you and your trainee agreed. Plans and nutrition targets are not calculated from it.",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    /** Client-side, and no request is sent. */
    invalidMilestone: "Enter a milestone weight in kilograms, or leave it empty.",
    invalidDate: "Enter the start date as a calendar date, or leave it empty.",
    /**
     * EV-274b AC1, verbatim. Client-side, and no request is sent: outside 3.0-60.0, more
     * than one significant decimal, or not a plain decimal. The bounds are the api's own
     * (EV-274 B2), and the rule matches the api's except exponent notation, a leading `+`
     * and a trailing point, which are refused here on purpose (`parseBodyFatMilestone`).
     */
    invalidBodyFat: "Enter a percentage between 3 and 60.",
    /** Edge case 6's 400, rendered rather than pre-empted: the api refuses, we report. */
    outOfRange: "A milestone weight must be between 25 and 300 kg. Nothing was saved.",
    /**
     * EV-274a's 400 for the body fat, rendered rather than assumed away. The browser
     * refuses the same values first, so this is reached only if the two rules ever
     * drift apart — and then the coach must not be told it was the WEIGHT.
     * `refusedMilestone` in src/lib/progressGoal.ts picks between the two.
     */
    outOfRangeBodyFat:
      "A milestone body fat must be between 3 and 60 %, with one decimal. Nothing was saved.",
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
    /** The tab strip's landmark name (was a literal in ClientTabs.tsx before EV-324). */
    label: "Trainee sections",
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
    /**
     * EV-283 In scope, verbatim: "{Trainee first name} changed this plan on {date}. You're
     * seeing their version." Shown above the editor when `lastChangedBy = TRAINEE`; the
     * date is `formatInstant` (this portal's one date format, en-GB, UTC) and is labelled
     * " (UTC)" — Raed's ruling 2026-09-28: keep UTC rather than guess the coach's zone,
     * but say so, because a change made late evening in Europe reads as the next day.
     * Deliberately NOT said: what changed (a diff is out of scope — no published copy is
     * kept beside the live one) and anything about session edits, which the api does not
     * record until EV-283c.
     */
    traineeChanged: (firstName: string, date: string) =>
      `${firstName} changed this plan on ${date} (UTC). You're seeing their version.`,
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
    /** The focus field's accessible name per day (was composed with a literal " focus" before EV-324). */
    dayFocusName: (n: number) => `Day ${n} focus`,
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

    /* ── BUG-195c: the whole document, and the write path that now works ──── */

    /** The per-day optional `TrainingDay.estimatedMinutes`, which had no control until now. */
    estimatedMinutesLabel: "Minutes (estimate)",
    estimatedMinutesName: (n: number) => `Day ${n} estimated minutes`,
    /**
     * AC3.4 — `goal` and `level` on a TRAINEE's draft are the trainee's own answers and
     * the server resolves them (ADR-0018 D3). A plan built from scratch has not been
     * resolved yet, so it says when it will be rather than printing a placeholder as the
     * trainee's goal.
     */
    subjectOnSave: "Set from their profile when you save.",
    /** AC3.4's label for the two read-only fields — distinct from the page's guardrail sentence. */
    subjectFromProfile:
      "Goal and level are the trainee's own answers, from their profile. They are filled in when you save, and you cannot change them here.",
    /**
     * ADR-0018 D10 — the trainee's own progression rules ride along untouched (they are
     * `CARRIED_UNSEEN` in src/lib/routineVisibility.ts). Said on screen so a coach is not
     * surprised that something they cannot edit is part of what they publish.
     */
    progressionCarried: (n: number) =>
      n === 1
        ? "This plan has 1 week-by-week progression rule from the trainee's own plan. It is kept as it is; you cannot edit it here."
        : `This plan has ${n} week-by-week progression rules from the trainee's own plan. They are kept as they are; you cannot edit them here.`,
    notSaveableYet: "This plan is not ready to save yet:",
    summaryHint: "Part of the plan you publish. Leave it empty if you have nothing to add.",
    minutesRequired: "Set how many minutes a session lasts.",
    setsBound: (day: number, exercise: string) =>
      `Day ${day}: ${exercise} needs between 1 and 20 sets.`,
    restRequired: (day: number, exercise: string) => `Day ${day}: ${exercise} needs a rest time.`,

    /* The api's three 400s — each its own sentence, none quoting the api's message. */
    invalid:
      "Nothing was saved: the server did not accept a value in this plan. Check every day has a focus and at least one exercise, and every exercise has sets and a rest time.",
    subjectField: (field: string) =>
      `Nothing was saved: the draft carried the trainee's own “${field}”, which only they can set. Reload the page and try again.`,
    repsOnDuration: (weekday: string, exercise: string) =>
      `Nothing was saved. ${exercise} on ${weekday} is timed, so it cannot have reps. Clear its reps, or track it by weight and reps.`,
    repsOnDurationUnlocated:
      "Nothing was saved. A timed exercise in this plan has reps. Clear them, or track it by weight and reps.",

    /*
     * The 409 COACH_DRAFT_EXISTS dialog (AC3.6). Somebody saved this trainee's draft
     * after this editor last read it — another tab, another device, or a template
     * apply — and NOTHING was written. The dialog carries the same overwrite sentence
     * apply uses (`templates.replacesDraft`) and the same "Replace the draft" control,
     * and it never overwrites without that press.
     */
    conflictTitle: "This draft changed somewhere else",
    conflictBody:
      "Someone saved this trainee's draft from another tab or device after you opened it. Your changes have not been saved.",
    conflictKeepEditing: "Keep editing",
    conflictLoad: "Load the saved version",
    /** Staff review S1 — the non-destructive-looking answer replaces the page's unsaved edits. */
    conflictLoadWarning: "Loading it replaces what is on this page.",
    conflictLoaded:
      "You are looking at the version that was saved elsewhere. Your changes were not saved.",
    conflictLoadFailed: "The saved version could not be loaded. Reload the page.",
    /** A 409 with no readable timestamp: no overwrite is offered, because it would be a guess. */
    conflictUnreadable:
      "This draft changed while you were editing. Load the saved version to see it.",
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
    /** The targets card's badge. EV-324 made it a template so French can space its colon. */
    activityBadge: (label: string) => `Activity level: ${label}`,
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
    /**
     * EV-324 — `FoodRule` tokens. English shows the token as it always has (AC2); French
     * gets the word. An unknown token falls back to itself.
     */
    ruleLabels: { HALAL: "HALAL", KOSHER: "KOSHER" } as Record<string, string>,
    dislikes: "Dislikes",
    // Edge case 1, verbatim: no preferences row is not the same as an empty checked list.
    noRestrictions: "No dietary restrictions recorded.",
    saveTargets: "Save targets", // AC2, verbatim
    saving: "Saving…",
    // AC2, verbatim — client-side, and no request is sent.
    invalidNumber: "Enter a number above 0.",
    /**
     * PB-2 — a number WITH a decimal part ("1800.5", "1800,5") in a whole-number field.
     * "Above 0" was false for it. A comma is named because "1,000" lands here too: it is
     * never read as a thousands separator (BUG-460), and the coach is told what to drop.
     */
    wholeNumber: "Enter a whole number, without a decimal point or comma.",
    /**
     * BUG-552 — digits that cannot be read ("18 00", "1  800", "1 25"). "Above 0" was
     * false for them; the sentence shows a number written the way the portal reads it.
     */
    numberFormat: "Enter a whole number, for example 1800.",
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
     * 409 `WEEK_GENERATION_IN_PROGRESS` (ADR-0030) — the trainee's own generation of this
     * week is still running. Not "could not be applied", which says nothing about when to
     * retry: nothing was changed and the api released today's apply, so a retry once the
     * week is ready is the right move. A warning, not an error, in the card.
     */
    weekGenerating: (first: string) =>
      `${first}'s meal week is still being prepared. Try again in a few minutes.`,
    /**
     * EV-071b ruling 2.3, verbatim — the 422 `NO_SAFE_MEAL_PLAN` on an apply. A refusal
     * for the trainee's safety, not an error: nothing was written, and only the TRAINEE
     * can change the outcome (EV-185 forbids a coach editing their food preferences), so
     * the block ends by saying so. One block, two slots: placement and quota.
     */
    weekRefusedTitle: (first: string) => `We couldn't build a meal week for ${first}.`,
    weekRefusedBody:
      "Their recorded allergies and food rules rule out every recipe we're able to check. Nothing was changed.",
    /** P1 — a week is on screen and stays fully rendered under the block (ruling 2.2). */
    weekRefusedKept: (first: string) =>
      `The week below is still ${first}'s current week — it hasn't been touched.`,
    /** P2 — no week on screen: the block renders instead of one. */
    weekRefusedNoWeek: (first: string) => `${first} has no meal week right now.`,
    /*
     * NO quota sentence (staff ruling, 2026-10-01, option a). Ruling 2.1's three are all
     * false or unwitnessed against b-fit-api main: `CoachNutritionUseCase.applyWeek`
     * releases the claim on EVERY refusal (NoSafeMealPlanException is a RuntimeException),
     * so Q2 ("This has used today's apply") and Q3's "trying again will use it" are false,
     * and Q1 needs the api to say so (EV-196). Do not add one back without that witness.
     */
    refusedAskThem: (first: string) =>
      `You can't change ${first}'s food preferences from here. Ask them to review them in the app.`,
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
    /**
     * EV-071b ruling 2.4, verbatim — the 422 `NO_SAFE_MEAL_PLAN` on a day regenerate,
     * shown in that day's card, followed by `refusedAskThem`. No quota sentence, ever:
     * this path never holds the apply reservation. `day` is the weekday's name.
     */
    dayRefusedTitle: (day: string, first: string) => `We couldn't rebuild ${day} for ${first}.`,
    dayRefusedBody:
      "Their recorded allergies and food rules rule out every recipe we're able to check for that day.",
    dayRefusedKept: (day: string) => `${day} is unchanged — nothing was replaced.`,
    /**
     * EV-242 AC3 — the 429 `COACH_DAY_REGEN_LIMIT`, reworded by the staff ruling of
     * 2026-10-01: the counter is the TRAINEE's plan row, so "You've used…" was false
     * whenever the trainee used them. Its second sentence ("You can regenerate again
     * after {local time}.") needs the reset instant EV-242a puts on the body, and
     * b-fit-api main does not send one: no time is shown rather than a made-up one.
     * `first` is French's (« de Lina »); English names the trainee as the line above does.
     */
    dayRegenCapped: (trainee: string, _first: string) =>
      `Today's day regenerations for ${trainee} are used up.`,
    swap: "Swap meal", // AC3, verbatim
    swapTitle: "Swap meal",
    swapLoading: "Loading options…",
    swapNone: "No swap options are available for this meal.",
    swapFailed: "The meal could not be swapped.",
    /**
     * EV-288, verbatim — the apply answered 409 `SWAP_OPTIONS_STALE` (BUG-271): the list
     * on screen was re-read and replaced. Shared by both Swap sheets (flag off and on).
     * Not shown when the re-read itself fails: there are no "current ones" to point at,
     * so that case is today's options-error state (story edge case 1).
     */
    swapOptionsChanged: "These options changed. Here are the current ones.",
    noMeals: "No meals planned for this day.",
    /**
     * The marker on a meal the TRAINEE locked in their own app. ADR-0015 D6.7: an
     * apply carries locked meals forward, so without this the coach reads a week they
     * did not generate and cannot tell which parts are the trainee's. One word, and it
     * is the same word the confirm dialog uses ("…are kept").
     */
    mealKept: "Kept",
    mealKeptTitle: "Locked by the trainee — kept when a week is applied",
    /**
     * EV-320 AC17 — the week's recipe share. `n` counts the meals of YOUR recipes
     * (`COACH_RECIPE` and `placedByYou`): a recipe another coach placed is not "yours",
     * so it is not counted in a sentence that says "your recipes". The verb agrees with
     * n ("1 of 28 meals comes"); the story's template is the plural form.
     */
    recipeShare: (count: number, total: number) =>
      `${count} of ${total} meals ${count === 1 ? "comes" : "come"} from your recipes`,
    /** AC17, verbatim — when n = m. */
    recipeShareAll: "The whole week comes from your recipes",
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
      `${kcal}\u00a0kcal · ${p}\u00a0g protein · ${c}\u00a0g carbs · ${f}\u00a0g fat`,
    loadError: "This trainee's nutrition could not be loaded.",
  },

  /**
   * EV-284b — the Food log section on the nutrition tab. Strings marked AC5 are the
   * story's (hub EV-284, AC5 as amended 2026-09-27), VERBATIM; the rest are ours.
   *
   * Deliberately NOT said: "Scanned". A scan and a food-database search are stored
   * identically (the app sends the product code for both), so AC5 merged the two into
   * one label; telling them apart needs a cross-repo row nobody has asked for.
   */
  foodLog: {
    title: "Food log",
    /**
     * OURS. The window is the api's default (seven days ending on its UTC today) and a
     * day is the stored `food_log.logged_on`, which is the server's UTC day of the write
     * (EV-284 AC4, BUG-274). Saying so is the only way a coach far from UTC can read a
     * late dinner filed under the next day.
     */
    window: (from: string, to: string) => `${from} – ${to}. Days are counted in UTC.`,
    nothingLogged: "Nothing logged", // EV-284b In scope + AC5, verbatim
    calories: "Calories",
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    /** "417 / 2,150 kcal" — eaten, then the day's target. */
    pair: (eaten: string, target: string, unit: string) => `${eaten} / ${target}\u00a0${unit}`,
    /** OURS. A trainee with no stored target: what they ate, and no invented target. */
    noTarget: (eaten: string, unit: string) => `${eaten}\u00a0${unit} · No target`,
    kcal: "kcal",
    grams: "g",
    /** AC5, verbatim, keyed by `FoodLogEntry.Source`. An unknown source gets no label. */
    source: {
      OFF: "From the food database",
      QUICK: "Quick add",
      MANUAL: "Entered by hand",
    } as Record<string, string>,
    fromThePlan: "From the plan", // AC5, verbatim
    logged: "Logged",
    serving: (grams: string) => `${grams}\u00a0g`,
    /** OURS. Times are the api's instants shown in UTC, like every date on this portal. */
    at: (time: string) => `${time} UTC`,
    loadError: "The food log could not be loaded.",
  },

  /**
   * EV-256e — "Use one of my recipes" on the meal week. Every sentence marked AC is the
   * story's, VERBATIM (hub `32d2657`), and QA checks them character by character.
   * `{FirstName}` is `firstName(traineeDisplayName)`; `{recipe}` and `{meal name}` are
   * the coach's and the engine's text exactly as served, never truncated INSIDE a
   * sentence (the element wraps instead — BUG-243/244).
   */
  placement: {
    /*
     * EV-272 R1: the separate "Use one of my recipes" button, its dialog title and its
     * filter strings are GONE — a recipe is chosen in the Swap sheet (`swapSheet`
     * below). What stays here is what EV-272 re-uses verbatim: the confirm, the
     * refusals, the markers and the apply warning.
     */
    loading: "Loading your recipes…",
    /** EV-272 AC7, verbatim (EV-256e's sentence). */
    loadFailed: "Your recipes could not be loaded.",
    /** AC2, verbatim — the empty library, with a link to `/recipes/new` (EV-272 AC7). */
    empty: "You have no recipes yet.",
    emptyLink: "New recipe",
    chooseNamed: (recipe: string) => `Choose ${recipe}`,
    /** AC2, verbatim — the confirm (EV-272 AC4). */
    confirm: (meal: string, recipe: string, weekday: string) =>
      `Replace “${meal}” with “${recipe}” on ${weekday}?`,
    placing: "Replacing…",

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
    /**
     * ⚠ NOT story copy — flagged for senior-po. The 403 whose cause the portal could
     * NOT confirm (the re-read library still holds the recipe, or could not be read):
     * most often the trainee ended the link, and the page refresh that runs beside it
     * redirects to /clients/denied. It claims neither cause.
     */
    accessDenied: (first: string) => `This recipe could not be used for ${first}.`,
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
   * EV-272 — the Swap sheet while the placement flag is on: the coach's recipes first,
   * suggestions only when asked. Sentences marked AC are verbatim story text.
   *
   * ⚠ DELIBERATELY ABSENT: any word saying the suggestions come from a model ("AI").
   * The portal cannot witness their source — `CoachSwapOptionsResponse` carries none,
   * and the same endpoint serves the stub catalogue when AI is off or fails, and always
   * for a meal that is already a coach recipe (EV-256d). R4; the escape hatch is an api
   * source field, not a label here.
   */
  swapSheet: {
    searchLabel: "Search your recipes", // AC2, verbatim
    searchPlaceholder: "Recipe name",
    suggestions: "Suggestions", // AC2, verbatim
    showSuggestions: "Show suggestions", // AC2 / AC5, verbatim
    /** AC3, verbatim. */
    noMatch: (query: string) => `No recipe matches “${query}”.`,
    cancel: "Cancel", // AC4, verbatim — back to the list, the query kept
    confirm: "Confirm", // AC4, verbatim
  },

  /**
   * `fix/recipes-and-editor-polish` (BUG-537, BUG-574) — its own section, so the branches
   * editing the dictionary's tail and the recipe sentences cannot collide with it.
   */
  recipePolish: {
    /**
     * BUG-537 — the swap sheet's mark on a recipe whose name and numbers are what the meal
     * already shows. A mark, not a refusal: choosing it re-places the recipe's current
     * version (the way to refresh a meal after editing the recipe).
     */
    onThisMeal: "On this meal",
    /**
     * BUG-574 — "1,500" / "1.000" as a quantity: a thousand-and-something or a decimal,
     * nobody can tell, so neither is sent (BUG-460/554). The range sentence did not say
     * why. Both examples are accepted as written.
     */
    quantityAmbiguous: (typed: string) =>
      `“${typed}” can be read two ways. Quantities are in g, ml or pieces: write 1500 for fifteen hundred, or 1.5 for one and a half.`,
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
    /**
     * EV-324 — the goal and level options. English shows the api's token, exactly as it
     * did before this row (AC2: English unchanged); French gets words. Giving English words
     * too is a UX call for another row, not a side effect of this one.
     */
    goalLabels: {
      BUILD_MUSCLE: "BUILD_MUSCLE",
      LOSE_WEIGHT: "LOSE_WEIGHT",
      GET_STRONGER: "GET_STRONGER",
      ENDURANCE: "ENDURANCE",
      MOBILITY: "MOBILITY",
    } as Record<string, string>,
    levelLabels: {
      BEGINNER: "BEGINNER",
      INTERMEDIATE: "INTERMEDIATE",
      ADVANCED: "ADVANCED",
    } as Record<string, string>,
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
    /**
     * Staff review B1 — template APPLY refused 400 COACH_DRAFT_REPS_ON_DURATION in
     * BUG-195b round 2: a timed exercise saved by the old editor still has reps, and the
     * editor shows no Reps field for a timed exercise. Since round 3 (api `fcc1ccd`, on
     * api main at 741ed39) apply clears them instead, so this sentence is only reachable
     * from an api rolled back past that commit. Saving the template once still clears
     * them here too (`withoutDurationReps`).
     */
    repsOnDuration:
      "A timed exercise in this template still has reps from the old editor. Open the template and save it, then use it again.",
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
    /**
     * BUG-196 — "Replace the draft" was pressed and REFUSED: the draft changed again (a
     * second tab, another device) after the coach was asked about it. Nothing was
     * written; the next press replaces the draft as it is now. Without this sentence the
     * dialog re-armed byte-identical and the refusal was invisible (EV-201's class).
     */
    replaceRefusedAgain: (trainee: string) =>
      `Nothing was replaced. The draft for ${trainee} was saved again after you were asked. Press “Replace the draft” again to replace it as it is now.`,
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
    /**
     * EV-320c — an UNTAGGED recipe's badge (`mealSlots: null`). It names what the week fill
     * uses it for (`CoachRecipeLibrary.UNTAGGED_SLOTS`) and says it is the default, never
     * "no meal time": null is not an empty list.
     */
    slotsDefault: (lunch: string, dinner: string) => `${lunch}, ${dinner} (default)`,
    slotsDefaultTitle: "No meal time saved: this recipe is used for lunch and dinner by default.",
    /** The library's filter. It filters on what the fill reads, so untagged counts as lunch and dinner. */
    filterLabel: "Meal time",
    filterAll: "All meal times",
    filterEmpty: "No recipe for this meal time yet.",
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
    /**
     * EV-320c — the meal-slot chips (api EV-320a). The note is scoped to APPLYING A WEEK on
     * purpose: that is the only place the api reads the tags (the swap and a placement do
     * not), and while the fill's flag is off a recipe is not used there at all, which the
     * sentence also leaves true.
     */
    slotsHeading: "Meal times",
    slotsNote: "When you apply a meal week, this recipe is only used for the meals chosen here.",
    /** EV-320 AC16, verbatim: Save's reason while no chip is on. */
    slotsRequired: "Choose at least one meal type.",
    /** The api's 400 naming `mealSlots` (unreachable from four toggles; kept addressed). */
    slotsInvalid: "Choose one to four meal times.",
    /** Shown on a stored UNTAGGED recipe while its chips are untouched. */
    slotsUntagged: "No meal time saved yet: this recipe is used for lunch and dinner by default.",
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
    /**
     * BUG-556 — digits that cannot be read as a quantity ("1 00", "1e3"). The range
     * sentence was false for them. The example is written the way the portal reads it:
     * "1000", never "1,000", which is refused (it has three decimals).
     */
    quantityFormat: "Enter a quantity, for example 1000 or 12.5.",
    /**
     * "1.000" / "1,500" kcal or grams: a thousand or one, nobody can tell, so neither is
     * sent. The targets' sentence (`nutrition.wholeNumber`), because it is their rule.
     */
    wholeNumber: "Enter a whole number, without a decimal point or comma.",
    /** The EV-256a review's rule: 50.7 is refused, never truncated. */
    wholeNumbersOnly: (below: number, above: number) =>
      `Whole numbers only. Use ${below} or ${above}.`,
    numberRange: (label: string, min: number, max: number) =>
      `${label}: a whole number from ${min} to ${max}.`,
    /**
     * Staff F1 (number-input follow-ups) — kcal or grams whose digits cannot be read
     * ("18 00"). The range sentence was false for them; `nutrition.numberFormat`'s rule,
     * with an example inside the field's range (1800 kcal, 150 g).
     */
    numberFormat: (example: number) => `Enter a whole number, for example ${example}.`,
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

  /* ══ EV-273b — the coach's nutrition templates, TARGETS ONLY ═════════════════════
   *
   * Sentences marked "AC" are verbatim EV-273b (hub `docs/product/stories/
   * EV-273-coach-nutrition-templates.md`). Curly double quotes, straight apostrophes,
   * exactly as the story writes them.
   *
   * Deliberately absent: any word about meals per day, snacks or "Meal k". The meal
   * structure is EV-273e's, after EV-190's N1 has cleared (N6), so nothing here may
   * suggest the template sets one — the week is rebuilt at the trainee's OWN structure,
   * and the confirm sentence says exactly that.
   */
  nutritionTemplates: {
    nav: "Nutrition templates", // AC1, verbatim
    title: "Nutrition templates",
    subtitle: "Calorie and macro targets you can use on any trainee.",
    /** AC1, verbatim. Stated once, on the library page. */
    private: "Nutrition templates are yours. No trainee ever sees them.",
    emptyTitle: "You have no nutrition templates yet.", // AC1, verbatim
    emptyBody: "Set the targets once and use them on any trainee.",
    create: "New template", // AC1, verbatim
    loadError: "Your nutrition templates could not be loaded.",
    /** ONE sentence for a foreign, an unknown and a deleted template (EV-273a AC4). */
    notYours: "That nutrition template is not in your library.",
    backToLibrary: "Back to nutrition templates",
    limitReached: (limit: number) =>
      `You can keep up to ${limit} nutrition templates. Delete one to make room.`,
    /** The 409 when the served limit is unknown (the library read failed): no number invented. */
    limitReachedUnknown: "You have reached your nutrition template limit. Delete one to make room.",
    remaining: (left: number, limit: number) => `${left} of ${limit} left`,

    /* ── a library row (AC1: name, kcal and P/C/F — and no meal structure) ── */
    macroLine: (kcal: number, p: number, c: number, f: number) =>
      `${kcal} kcal · P ${p} g · C ${c} g · F ${f} g`,
    updatedAt: (when: string) => `Updated ${when}`,
    edit: "Edit",
    duplicate: "Duplicate",
    rename: "Rename",
    remove: "Delete",
    use: "Use on a trainee", // AC3, verbatim
    duplicated: (name: string) => `“${name}” is in your nutrition templates.`,
    duplicateFailed: "The template could not be duplicated.",

    /* ── rename ───────────────────────────────────────────────────────────── */
    renameTitle: "Rename template",
    nameLabel: "Template name",
    nameRequired: "Give the template a name.",
    nameTooLong: "A template name is at most 80 characters.",
    nameTaken: "You already have a nutrition template called that.",
    renameFailed: "The template could not be renamed.",
    renamed: (name: string) => `Renamed to “${name}”.`,

    /* ── delete (AC2) ─────────────────────────────────────────────────────── */
    deleteTitle: "Delete template?",
    /** AC2, verbatim. A snapshot (N5): nothing already applied changes. */
    deleteBody: (name: string) =>
      `Delete “${name}”? Trainees you already used it on keep their targets and meals.`,
    deleteFailed: "The template could not be deleted.",
    cancel: "Cancel",

    /* ── the editor (AC2) ─────────────────────────────────────────────────── */
    newTitle: "New nutrition template",
    editTitle: "Edit nutrition template",
    targetsLabel: "Daily targets",
    /** AC2, verbatim — the targets form's client-side rule; nothing is sent. */
    invalidNumber: "Enter a number above 0.",
    /** PB-2 — `nutrition.wholeNumber`'s sentence, for the template's four targets. */
    wholeNumber: "Enter a whole number, without a decimal point or comma.",
    /** BUG-552 — `nutrition.numberFormat`'s sentence, for the template's four targets. */
    numberFormat: "Enter a whole number, for example 1800.",
    /** The api's bounds (`NutritionTemplateTargetsRequest`), after a 400 VALIDATION_ERROR. */
    outOfBounds:
      "Use whole numbers: calories 800 to 8000 kcal, protein up to 500 g, carbs up to 1200 g and fat up to 400 g.",
    /** AC2, verbatim — EV-185 AC2's standing line, for the template. */
    floorStanding:
      "Evoli checks calories against a safe minimum when you use this template. It does not yet check protein or fat.",
    save: "Save template",
    saving: "Saving…",
    saved: "Template saved.",
    saveFailed: "The template could not be saved.",

    /* ── use on a trainee (AC3-AC5) ───────────────────────────────────────── */
    pickTitle: "Use on a trainee",
    pickSub: (template: string) => `Choose who gets “${template}”.`,
    /** AC3: only ACTIVE links with NUTRITION are offered, so nobody is refused after. */
    noTrainees: "You have no trainees who have shared their nutrition with you.",
    /** The roster read failed: nobody is offered, and "no trainees" would be false. */
    traineesLoadError: "Your trainees could not be loaded. Close this and try again.",
    /** AC4, verbatim. */
    confirmTitle: (template: string, first: string) => `Use “${template}” on ${first}?`,
    now: "Now",
    after: "After",
    /** A cell of the Now | After table. English prints the raw number, as the rows do. */
    amount: (value: number, unit: string) => `${value} ${unit}`,
    notSet: "Not set", // AC4, verbatim — the trainee has no targets yet
    /** AC4, verbatim. `weekStart` is the date the dialog-open read returned. */
    confirmBody: (first: string, weekStart: string) =>
      `${first}'s meals for this week (from ${weekStart}) are rebuilt to these targets straight away, with their own number of meals a day. Their allergies and dietary rules still apply. Meals they have locked or already eaten are kept.`,
    /** AC4, verbatim — when the template's calories are below 1500, the higher floor. */
    floorWarning: (first: string) =>
      `If this is below ${first}'s safe minimum, Evoli raises it to the minimum and tells you.`,
    reading: (first: string) => `Reading ${first}'s current targets…`,
    readFailed: (first: string) =>
      `${first}'s current targets could not be read, so nothing was sent. Close this and try again.`,
    confirm: "Confirm",
    applying: "Applying…",

    /* ── AC5's outcomes, shown on the trainee's nutrition page ────────────── */
    applied: (template: string, first: string) => `“${template}” is now ${first}'s plan.`,
    weekRateLimited: (first: string) =>
      `${first}'s targets are updated. Their meals weren't rebuilt: a week has already been applied for them today. Try again tomorrow.`,
    /**
     * The lead every WEEK_* outcome opens with, on its own: the 409
     * `WEEK_GENERATION_IN_PROGRESS` outcome follows it with `nutrition.weekGenerating`,
     * the week card's sentence, rather than a second wording of the same refusal.
     */
    targetsUpdated: (first: string) => `${first}'s targets are updated.`,
    /**
     * `applyLabel` is the button's OWN label, `nutrition.apply(truncateName(displayName))`,
     * built by the caller from the same display name the week card uses. PB-5
     * (2026-09-30): this quoted "Apply to {first name}" while the button reads the FULL
     * name, so the coach was sent to a button that is not on the page.
     */
    weekFailed: (first: string, applyLabel: string) =>
      `${first}'s targets are updated. Their meals couldn't be rebuilt. Use “${applyLabel}” to try again.`,
    weekUnknown: (first: string) =>
      `${first}'s targets are updated. We couldn't confirm whether their meals were rebuilt. Check their nutrition page before you try again.`,
    targetsFailed: (first: string) => `Nothing was changed for ${first}. Try again.`,
    targetsUnknown: (first: string) =>
      `We couldn't confirm whether ${first}'s targets changed. Check their nutrition page before you try again.`,
  },


  /**
   * /unavailable — a page load whose session rotation got no verdict from the api (it is
   * down, or its per-IP refresh throttle answered 429). The cookies were kept, so "not
   * signed out" is true. Only a GET or HEAD is ever shown this page — middleware answers
   * a server action or any other write with a bare 503 and no page (staff round 4) — and
   * a read refused before any page ran changed nothing, so "nothing was changed" is true
   * too. Do not route a write here: after a refused write the sentence could be false.
   */
  /**
   * EV-321b — step challenges (b-fit-api EV-321a). No story carries verbatim copy for the
   * portal half; the one wording the api's contract rules on is the source label: the
   * portal names where a number came from ("Health Connect", "Apple Health") and never
   * calls it "verified". Numbers arrive PRE-FORMATTED (`formatSteps`), so a sentence here
   * never groups digits itself.
   */
  challenges: {
    nav: "Challenges",
    title: "Challenges",
    // Any metric: the list holds WORKOUTS challenges too, so the subtitle names none.
    subtitle: "Challenges your clients join from the Evoli Fit app.",
    create: "New challenge",
    emptyTitle: "No challenges yet",
    emptyBody: "Set a daily step goal for a week and invite your clients. You see their progress once they accept.",
    loadError: "Your challenges could not be loaded.",
    /** One body for a foreign id, one that never existed and one deleted in another tab. */
    notYours: "That challenge is not in your list.",
    backToList: "Back to challenges",
    phase: {
      UPCOMING: "Upcoming",
      ACTIVE: "Active",
      ENDED: "Ended",
    },
    window: (start: string, end: string) => `${start} → ${end}`,
    days: (days: number) => `${days} day${days === 1 ? "" : "s"}`,
    stepsGoal: (steps: string) => `${steps} steps a day`,
    workoutsGoal: (count: string) => `${count} workouts in total`,
    counts: (participants: number, accepted: number) =>
      `${participants} invited · ${accepted} joined`,
    previous: "Previous",
    next: "Next",
    pageOf: (page: number, pages: number) => `Page ${page} of ${pages}`,

    /* ── the create dialog ─────────────────────────────────────────────────── */
    dialogTitle: "New challenge",
    dialogSub: "Your clients get an invitation in the Evoli Fit app.",
    titleLabel: "Title",
    titlePlaceholder: "e.g. 10,000 steps a day",
    metricLabel: "Type",
    metricSteps: "Daily steps",
    targetLabel: "Daily step goal",
    targetHint: (min: string, max: string) => `Between ${min} and ${max} steps.`,
    startLabel: "Starts on",
    endLabel: "Ends on",
    windowHint: "Up to 93 days, starting at most 14 days ago or 60 days ahead.",
    clientsLabel: "Clients to invite",
    clientsHint: "You see a client's steps only after they accept the invitation.",
    selectAll: "Select all",
    selectNone: "Clear",
    selected: (count: number) => `${count} selected`,
    noClients: "You have no linked clients yet. Invite a client from the roster first.",
    /** The roster read failed — not the same fact as having no clients. */
    clientsLoadError: "Your clients could not be loaded. Reload the page to try again.",
    submit: "Create and invite",
    submitting: "Creating…",
    cancel: "Cancel",
    problems: {
      titleRequired: "Give the challenge a title.",
      titleTooLong: (max: string) => `A title is at most ${max} characters.`,
      titleControl: "A title fits on one line.",
      titleInvalid: (max: string) => `A title is 1 to ${max} characters, on one line.`,
      targetInvalid: "Enter the goal as a whole number of steps.",
      targetRange: (min: string, max: string) => `The daily goal is between ${min} and ${max} steps.`,
      dateInvalid: "Choose a date.",
      endBeforeStart: "The end date is on or after the start date.",
      windowTooLong: (days: string) => `A challenge lasts at most ${days} days.`,
      startTooEarly: (days: string) => `The start date is at most ${days} days ago.`,
      startTooLate: (days: string) => `The start date is at most ${days} days ahead.`,
      startRange: (past: string, ahead: string) =>
        `The start date is between ${past} days ago and ${ahead} days ahead.`,
      endRange: (days: string) => `The end date is on or after the start, and a challenge lasts at most ${days} days.`,
      clientsRequired: "Choose at least one client.",
      clientsTooMany: (max: string) => `You can invite up to ${max} clients.`,
      clientsRange: (max: string) => `Choose between 1 and ${max} clients.`,
    },
    failures: {
      /** 403 COACH_ACCESS_DENIED — one body for foreign, revoked and unknown clients. */
      accessDenied:
        "One of these clients is no longer linked to you. Nothing was created. Reload the page and choose again.",
      /** 409 COACH_CHALLENGE_LIMIT_REACHED. */
      limitReached: (max: string) =>
        `You already have ${max} challenges that have not ended. Delete one to create another.`,
      invalid: "The challenge could not be created. Check the form and try again.",
      failed: "The challenge could not be created. Try again in a moment.",
    },
    created: "Challenge created. Your clients see the invitation in the Evoli Fit app.",

    /* ── the challenge page ───────────────────────────────────────────────── */
    refresh: "Refresh",
    refreshing: "Refreshing…",
    autoRefresh: "Updates every 45 seconds while this page is open.",
    /** EV-321b — the coach's own clock (`LoadedAt`, rendered in the browser), so no zone suffix. */
    loadedAt: (time: string) => `Updated at ${time}`,
    /**
     * What accepting shares, by metric — the api's `POST /me/challenges/{id}/accept`: a
     * STEPS challenge shares the daily step count, a WORKOUTS one the count of sessions
     * completed in the window. `consent` is the STEPS sentence; a WORKOUTS challenge must
     * never tell the coach a client shares steps.
     */
    consent: "Accepting the invitation is how a client agrees to share their steps with you.",
    consentWorkouts:
      "Accepting the invitation is how a client agrees to share with you how many sessions they complete during the challenge.",
    progressLabel: "Participants' progress",
    colRank: "Rank",
    colClient: "Client",
    colStatus: "Status",
    colToday: "Today",
    colDaysMet: "Days met",
    colTotal: "Total",
    /** The sync time, with the source ("Health Connect") under it. */
    colSynced: "Last sync",
    colDays: "Day by day",
    status: {
      INVITED: "Invitation sent",
      ACCEPTED: "Joined",
    },
    unnamed: "Unnamed client",
    /**
     * An INVITED row: no number, because accepting is the consent to share one. Picked by
     * metric like `consent`: an accepted WORKOUTS row shows sessions completed today and in
     * the window, never steps.
     */
    invitedNote: "Their steps appear here once they accept.",
    invitedNoteWorkouts: "Their completed sessions appear here once they accept.",
    rank: (rank: number) => `#${rank}`,
    todaySteps: (value: string, target: string) => `${value} / ${target} steps`,
    todayWorkouts: (value: string) => `${value} today`,
    todayBar: (name: string) => `${name}: today's steps against the daily goal`,
    daysMet: (met: number, elapsed: number) => `${met} / ${elapsed}`,
    daysMetLabel: (met: number, elapsed: number) =>
      `${met} of ${elapsed} day${elapsed === 1 ? "" : "s"} so far met the goal`,
    totalSteps: (steps: string) => `${steps} steps`,
    totalWorkouts: (count: string, target: string) => `${count} / ${target} workouts`,
    source: {
      HEALTH_CONNECT: "Health Connect",
      HEALTHKIT: "Apple Health",
      PEDOMETER: "Pedometer",
      MANUAL: "Manual entry",
    },
    dayStatus: {
      MET: "goal met",
      MISSED: "goal missed",
      IN_PROGRESS: "in progress",
      NO_DATA: "no data",
      FUTURE: "not yet",
    },
    dayLabel: (day: string, status: string) => `${day}: ${status}`,
    dayLabelSteps: (day: string, steps: string, status: string) => `${day}: ${steps} steps, ${status}`,
    daysList: (name: string) => `${name}, day by day`,
    legend: "Key",
    noParticipants:
      "Nobody is listed on this challenge. A client who declined, left or is no longer linked to you does not appear.",

    /* ── delete ───────────────────────────────────────────────────────────── */
    remove: "Delete challenge",
    deleteTitle: "Delete this challenge?",
    /**
     * Picked by metric like `consent`. The api's delete (BUG-458) purges shared steps for a
     * STEPS challenge only: a WORKOUTS challenge stores nothing, it counts sessions from the
     * client's own training log, and those are untouched. Nor does the WORKOUTS sentence say
     * the challenge leaves the clients' app: the app shows no WORKOUTS challenge at all
     * (b-fit-mobile `challengeCardState`, STEPS only).
     */
    deleteBody: (title: string) =>
      `“${title}” is deleted, and it disappears from your clients' app. The steps your clients shared for this challenge are deleted, except days another challenge they have joined still covers.`,
    deleteBodyWorkouts: (title: string) =>
      `“${title}” is deleted, with its invitations and participants. The sessions your clients completed are not deleted: this challenge only counted them.`,
    deleteConfirm: "Delete",
    deleteFailed: "The challenge could not be deleted. Try again in a moment.",
  },

  unavailable: {
    title: "We can't reach Evoli right now",
    body: "Nothing was changed and you have not been signed out. Try again in a moment.",
    /** EV-337k: "now", beside the automatic retry below. */
    retry: "Try again now",
    /**
     * EV-337k — the page reloads itself (a GET of the same URL: middleware only ever serves
     * this page to a GET or HEAD). Said once, never counted down: a number changing every
     * second is auto-updating content (WCAG 2.2.2).
     */
    autoRetry: (seconds: number) => `We'll try again automatically in ${seconds} seconds.`,
    /** After the tab's last automatic retries (`AutoRetry.tsx`), so the api is not polled for ever. */
    autoRetryStopped: "Automatic retries have stopped. Try again when you're ready.",
  },

  /**
   * EV-337k — /clients/denied. Its h1 stays EV-183 AC5's sentence (`client.notFound`); this
   * is the line under it. True by construction: the page makes no call for the client.
   */
  denied: {
    body: "None of this trainee's data was shown.",
  },

  /**
   * EV-241 — `app/not-found.tsx`: a URL that matches no page, served 404. A signed-in
   * coach gets the portal's frame and a way back to the roster; anybody else gets a way
   * to sign in, because every page but /login and /i/* sends them there anyway.
   */
  notFound: {
    title: "Page not found",
    body: "There is no page at this address. Check the link, or go back to your clients.",
    toRoster: "Back to your clients",
    bodySignedOut: "There is no page at this address. Check the link, or sign in to Evoli Pro.",
    toLogin: "Go to sign-in",
  },

  common: {
    loading: "Loading…",
    // The route-level error boundary catches renders from every page, not just the
    // roster, so it cannot claim the roster failed.
    unexpectedError: "Something went wrong.",
    tryAgain: "Try again",
    dash: "—",
    /** A modal's close button (was a literal in kit.tsx before EV-324). */
    close: "Close",
    /**
     * "Label: value" — a label and what it labels, in one string (BUG-461 / BUG-462). The
     * colon was composed in JSX ("{label}: {value}"), which gave French "Monter: …" where
     * French typography writes "Monter : …". English is unchanged.
     */
    labelled: (label: string, value: string) => `${label}: ${value}`,
  },

  /**
   * EV-324 AC5b (scope §10.2), verbatim — the legal line under every page. Nutrition is
   * not care: coaches may sell meal plans to healthy clients, and therapeutic nutrition
   * belongs to dietitians. Rendered once, sticky, by `LegalFooter` in the root layout.
   */
  legalFooter:
    "Meal plans for healthy people. They do not replace medical advice or care from a dietitian.",
  /** The footer landmark's accessible name. Ours, not story copy. */
  legalFooterLabel: "Legal notice",

  /**
   * The trainee's guardrail tokens as words (EV-324 moved them here from
   * `src/lib/guardrailLabels.ts`, which keeps the lookup and the humanising fallback).
   * b-fit-mobile's `equipment.*` strings, verbatim per language; ADR-0005 D1a's tokens.
   */
  guardrails: {
    equipment: {
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
    } as Record<string, string>,
    injuries: {
      KNEE: "Knees",
      LOWER_BACK: "Lower back",
      SHOULDER: "Shoulders",
      NECK: "Neck",
      WRIST: "Wrists",
      HIP: "Hips",
      ANKLE: "Ankles",
      ELBOW: "Elbows",
    } as Record<string, string>,
  },

  /**
   * BUG-489 — the exercise catalogue's muscle and equipment VALUES as words, for the picker's
   * two filters and the badges on a catalogue row. The api serves raw catalogue data
   * (`CoachCatalogPageResponse.muscles` / `.equipment`, `primaryMuscles` "quads,glutes",
   * `equipment` "DUMBBELLS"), and the picker printed it as it came: "t_spine", "NONE".
   *
   * Keys are NORMALISED (`src/lib/catalogLabels.ts`: lower case, spaces and hyphens as "_"),
   * so "BARBELL", "Barbell" and "barbell" are one entry.
   *
   * Two vocabularies, both witnessed:
   *   · PRODUCTION's is MuscleWiki's (`application.yml` `EXERCISE_PROVIDER:musclewiki`).
   *     `SyncExercisesUseCase.toEntry` stores the first primary muscle VERBATIM ("Anterior
   *     Deltoid", "Traps (mid-back)") and the category UPPER-CASED ("BOSU-BALL", "TRX").
   *     The rows under "MuscleWiki" are the values read off a local catalogue synced by that
   *     provider (staff review of `fix/portal-french-polish-2`, 2026-10-01).
   *   · A SEED-provider api (`EXERCISE_PROVIDER=seed`, local dev and the BUG-195c / EV-321b
   *     gate, `logs/b1-i6-copy-dump.json`) serves b-fit-api's seeded catalogue,
   *     `V21__exercise_library.sql`: 24 lower-case muscle tokens and 8 equipment values.
   * Anything neither list has is shown humanised when it is a token ("BOSU-BALL" → "Bosu
   * ball") and as served when it is already words (`catalogLabels.ts`); never dropped.
   *
   * Not the guardrail tables above: `user_profiles.equipment` and the catalogue's
   * `equipment` are two columns with two vocabularies (`guardrailLabels.ts`).
   */
  catalog: {
    muscles: {
      adductors: "Adductors",
      back: "Back",
      biceps: "Biceps",
      calves: "Calves",
      cardio: "Cardio",
      chest: "Chest",
      core: "Core",
      forearms: "Forearms",
      front_delts: "Front delts",
      full_body: "Full body",
      glutes: "Glutes",
      grip: "Grip",
      hamstrings: "Hamstrings",
      hip_flexors: "Hip flexors",
      hips: "Hips",
      lats: "Lats",
      legs: "Legs",
      obliques: "Obliques",
      quads: "Quads",
      rear_delts: "Rear delts",
      shoulders: "Shoulders",
      spine: "Spine",
      t_spine: "Thoracic spine",
      triceps: "Triceps",
      upper_back: "Upper back",
      // MuscleWiki
      abdominals: "Abdominals",
      lower_back: "Lower back",
      traps: "Traps",
      anterior_deltoid: "Anterior deltoid",
      lateral_deltoid: "Lateral deltoid",
      posterior_deltoid: "Posterior deltoid",
      lower_abdominals: "Lower abdominals",
      upper_abdominals: "Upper abdominals",
      tibialis: "Tibialis",
      "traps_(mid_back)": "Traps (mid-back)",
    } as Record<string, string>,
    equipment: {
      band: "Band",
      barbell: "Barbell",
      bodyweight: "Bodyweight",
      cable: "Cable",
      dumbbells: "Dumbbells",
      kettlebell: "Kettlebell",
      machine: "Machine",
      // An exercise that needs nothing — not "None", which reads as "no answer".
      none: "No equipment",
      // MuscleWiki
      cables: "Cables",
      kettlebells: "Kettlebells",
      plate: "Plate",
      smith_machine: "Smith machine",
      stretches: "Stretches",
      bosu_ball: "Bosu ball",
      medicine_ball: "Medicine ball",
      trx: "TRX",
      vitruvian: "Vitruvian",
      yoga: "Yoga",
      cardio: "Cardio",
    } as Record<string, string>,
  },
  /**
   * ADR-0033 follow-up (perf/coach-fast-routes-no-skeleton): the navigation progress
   * bar's accessible name. It shows only when a page change takes longer than 400 ms.
   */
  navProgress: {
    label: "Loading the page",
  },
} as const;

/**
 * EV-324 AC4 — the shape both languages share. `en` is `as const`, so its strings are
 * literal types; `Widen` turns every literal back into `string` (and keeps functions'
 * parameters) so that `fr` can say different words in the SAME shape. `fr` is declared
 * `satisfies Copy`: a key missing in French is a missing-property error, and a key French
 * has that English does not is an excess-property error — both fail `tsc`.
 *
 * `Record<string, string>` maps (the enum labels) cannot be checked key-by-key this way;
 * `qa/coach-i18n.spec.ts` compares the two dictionaries' key sets at run time too.
 */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends (...args: infer A) => infer R
      ? (...args: A) => Widen<R>
      : T extends object
        ? { readonly [K in keyof T]: Widen<T[K]> }
        : T;

export type Copy = Omit<Widen<typeof en>, "locale"> & { readonly locale: Locale };
