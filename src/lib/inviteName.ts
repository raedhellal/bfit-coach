/**
 * The coach's display name as it travels on the invite link.
 *
 * EV-183 AC3 says the trainee must see *who* is inviting them before they accept, and
 * b-fit-api exposes no pre-accept lookup: an invite token can only be resolved by
 * POSTing it at accept time (ADR-0012 D4). So the name rides along as an optional
 * `?coach=` query on the link, composed once at invite-creation time and forwarded
 * untouched to the app. It is a display hint, never a claim — the app still shows the
 * authoritative name once the accept call answers, and falls back to "Your coach".
 *
 * This module is the single place that decides what a usable name is, so the string the
 * back-office puts in the URL and the string the landing page prints follow one rule.
 */

/** A name longer than this is a paste, not a name. Long enough for "Jean-Baptiste M." */
export const COACH_NAME_MAX = 60;

/**
 * Plain text only: control characters — including the newlines that would let a name
 * fake a second line of copy — are dropped, whitespace is collapsed, and the result is
 * capped. Returns null when nothing usable is left, which is the "Your coach" fallback.
 *
 * No HTML escaping here on purpose: React escapes text children, and escaping twice
 * would render "&amp;" for a coach called "Ben & Co".
 */
export function sanitiseCoachName(raw: string | string[] | undefined | null): string | null {
  // A repeated query param arrives as an array; one name is one name, so take the first.
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  return cleaned.length > COACH_NAME_MAX ? cleaned.slice(0, COACH_NAME_MAX).trim() : cleaned;
}
