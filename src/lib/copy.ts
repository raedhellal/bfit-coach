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
    redFlags: "Red flags",
    noRedFlags: "No red flags", // AC5 block 5, verbatim
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
    footNote:
      "Read-only. Program editing and messaging are not part of this preview.",
    loadError: "This trainee could not be loaded.",
    notFound:
      "This trainee is not on your roster. They may have revoked access.",
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
