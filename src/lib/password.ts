/**
 * BUG-381 — b-fit-api's password rules for `POST /me/activate`, stated once so the form, the
 * route handler and the fixture api cannot drift from each other.
 *
 * `ActivateAccountRequest` (b-fit-api origin/main `5f368d7`):
 *   temporaryPassword  @NotBlank @Size(max = 128)
 *   newPassword        @NotBlank @Size(min = 8, max = 128)
 * and `AccountActivationUseCase` hashes `newPassword` AS SENT — nothing trims it, so a
 * space at either end is part of the password and this portal must not refuse it.
 *
 * `@Size` counts `CharSequence.length()`, i.e. UTF-16 code units, which is exactly
 * JavaScript's `String.length`.
 */
export const NEW_PASSWORD_MIN = 8;
export const NEW_PASSWORD_MAX = 128;

/**
 * Blank the way the api means it: Hibernate Validator 8.0.1's `NotBlankValidator` is
 * `toString().trim().length() > 0`, and Java's `String.trim()` strips every char whose code
 * is <= U+0020 (space, tab, CR, LF and the other C0 controls) — and nothing else.
 *
 * NOT JavaScript's `trim()`: that also strips U+00A0, U+2000–U+200A, U+3000, U+FEFF and
 * more, which the api ACCEPTS. Using it here would refuse eight no-break spaces the api
 * takes, a stricter rule than the one the portal is mirroring.
 */
export function isApiBlank(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x20) return false;
  }
  return true;
}
