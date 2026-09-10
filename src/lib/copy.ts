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
    inviteFull: "Starter includes 2 profiles.", // edge case 5, verbatim
    colTrainee: "Trainee",
    colPlan: "Plan",
    colLastWorkout: "Last workout",
    colStreak: "Streak",
    colFlags: "Flags",
    colStatus: "Status",
    noPlan: "No plan",
    noWorkout: "No workouts yet",
    streak: (days: number) => `${days} day${days === 1 ? "" : "s"}`,
    noStreak: "No streak",
    flagCount: (n: number) => `${n} red flag${n === 1 ? "" : "s"}`,
    noFlags: "None",
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
    sendByEmail: "Send by email",
    sendByEmailTooltip: "coming later",
    close: "Close",
    error: "The invite could not be created.",
    capacityReached: "Starter includes 2 profiles.",
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
    // AC5's three rules, verbatim. The api sends the code; this maps it.
    redFlagLabels: {
      MISSED_SESSIONS: "Missed 2 or more planned sessions this week",
      PAIN_REPORTED: "Reported pain in a session",
      NO_WEIGH_IN: "No weigh-in for 14 days",
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
    dash: "—",
  },
} as const;
