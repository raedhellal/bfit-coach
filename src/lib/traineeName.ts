import type { Copy } from "./copy";

/**
 * BUG-714 (ruling 714-R1) — a trainee with no name.
 *
 * The api's `displayNameOf` returns `users.full_name` as stored, and a trainee who registered
 * with no name has NULL there (the app's sign-up accepts a blank name, BUG-581, and nothing
 * can set one later, BUG-558). So `traineeDisplayName` is `string | null` on every read that
 * carries it, and a blank string is the same fact.
 *
 * The portal then says "Unnamed client" / « Client sans nom » (the strings the challenge table
 * already shipped as `copy.challenges.unnamed`) wherever the FULL name goes: the client header,
 * the roster row, the pickers, and every sentence built on the full name. Sentences built on
 * `firstName()` keep their own fallback, "This trainee" / « Ce client », and must be given the
 * WIRE value, never this label: `firstName("Unnamed client")` would be "Unnamed".
 *
 * NOT the e-mail (ADR-0012 D4 keeps contact details off the portal's reads), and never when the
 * read that carries the name FAILED: there the name is unknown, not absent, and the page shows
 * BUG-713's state. A caller that can be in that state passes `null` for the read, not a name
 * (`ClientHeader`'s `trainee`).
 */

/** True when the api sent no name: null, absent, empty or whitespace only. */
export function isUnnamed(traineeDisplayName: string | null | undefined): boolean {
  return (traineeDisplayName ?? "").trim() === "";
}

/** The trainee's full name as the portal prints it: the api's string as sent, or the label. */
export function fullNameOf(traineeDisplayName: string | null | undefined, copy: Pick<Copy, "challenges">): string {
  return isUnnamed(traineeDisplayName) ? copy.challenges.unnamed : (traineeDisplayName as string);
}
