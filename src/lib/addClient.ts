/**
 * EV-204b — « Ajouter un client »: the form's rules and the outcomes of its three writes.
 *
 * Pure, and imported by BOTH sides: the dialog checks before it sends (a coach who left the
 * name empty is told so without a round trip, and without spending one of the 30 calls an
 * hour the api charges for every initialisation), and the server action checks again,
 * because a client island is not a boundary. The api is still the authority: these rules
 * are `InitialiseTraineeRequest`'s, copied, so the portal refuses nothing the api accepts.
 *
 * The temporary password appears NOWHERE in this module, or in any type the dialog
 * receives (AC-P9): the api never returns it and the portal never asks.
 */
import { isApiBlank } from "./password";
import type { Locale } from "./i18n/locale";

/** `@Size(max = 120)` on `fullName` — Java counts UTF-16 units, as `String.length` does. */
export const FULL_NAME_MAX = 120;
/** `@Size(max = 254)` on `email`. */
export const EMAIL_MAX = 254;

/**
 * `InitialiseTraineeRequest.NAME_TEXT`, the JavaScript spelling openapi.yaml publishes:
 * no control character, line separator or invisible format character, except ZWNJ/ZWJ
 * (orthography in Persian and Indic names).
 */
const NAME_TEXT = new RegExp("^(?:[^\\p{Cc}\\p{Cf}\\u2028\\u2029]|[\\u200C\\u200D])*$", "u");
/** `InitialiseTraineeRequest.EMAIL_TEXT` (BUG-390): no Cc, Cf, Zl or Zp at all. */
const EMAIL_TEXT = new RegExp("^[^\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}]*$", "u");
/**
 * A loose shape check, deliberately looser than the api's `@Email`: one `@` with something
 * on both sides and no space. The portal must never refuse an address the api would take;
 * anything subtler is the api's 400, which the dialog maps to the same sentence.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/** Java `String.trim()`: code points <= U+0020 only (BUG-381's rule; see `password.ts`). */
export function javaTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start++;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end--;
  return value.slice(start, end);
}

export interface AddClientForm {
  fullName: string;
  email: string;
  /** The invitation email's language. Defaults to the portal's. */
  locale: Locale;
}

export type AddClientField = "fullName" | "email";
export type AddClientProblem =
  | "nameBlank"
  | "nameTooLong"
  | "nameInvisible"
  | "emailBlank"
  | "emailInvalid"
  | "emailTooLong";

export function checkAddClient(form: Pick<AddClientForm, "fullName" | "email">): {
  field: AddClientField;
  problem: AddClientProblem;
}[] {
  const out: { field: AddClientField; problem: AddClientProblem }[] = [];
  if (isApiBlank(form.fullName)) out.push({ field: "fullName", problem: "nameBlank" });
  else if (form.fullName.length > FULL_NAME_MAX) out.push({ field: "fullName", problem: "nameTooLong" });
  else if (!NAME_TEXT.test(form.fullName)) out.push({ field: "fullName", problem: "nameInvisible" });

  const email = javaTrim(form.email);
  if (isApiBlank(form.email)) out.push({ field: "email", problem: "emailBlank" });
  else if (form.email.length > EMAIL_MAX) out.push({ field: "email", problem: "emailTooLong" });
  else if (!EMAIL_TEXT.test(form.email) || !EMAIL_SHAPE.test(email)) out.push({ field: "email", problem: "emailInvalid" });
  return out;
}

/** The body `POST /coach-portal/trainees` gets: the two typed values (Java-trimmed) and the language. */
export function initialiseBody(form: AddClientForm): { email: string; fullName: string; locale: Locale } {
  return { email: javaTrim(form.email), fullName: javaTrim(form.fullName), locale: form.locale };
}

/** `Retry-After` seconds → whole minutes, rounded UP (599 s → 10), as EV-204 AC-P5c rules. */
export function retryMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/**
 * Every answer « Ajouter un client » can get, as the dialog needs it. `UNKNOWN` is any answer
 * the portal cannot read as a refusal that wrote nothing (a 5xx, a dropped connection): the
 * account MAY exist, so its sentence never says "nothing was created".
 */
export type AddClientFailure =
  | { code: "EXISTS" }
  | { code: "PROFILE_REQUIRED" }
  | { code: "THROTTLED"; retryAfterSeconds: number | null }
  | { code: "UNAVAILABLE" }
  | { code: "INVALID"; field: AddClientField | null }
  | { code: "UNKNOWN" };

/** What the dialog shows after a 201. Never a password: the response has none. */
export interface AddedClient {
  userId: string;
  fullName: string;
  email: string;
  expiresAt: string;
}

export type AddClientResult = { ok: true; added: AddedClient } | { ok: false; failure: AddClientFailure };

/** Resend and Withdraw. `GONE` is the api's one 404: activated, expired, withdrawn elsewhere. */
export type InvitationWriteFailure =
  | { code: "GONE" }
  | { code: "THROTTLED"; retryAfterSeconds: number | null }
  | { code: "UNAVAILABLE" }
  | { code: "UNKNOWN" };

export type ResendResult =
  | { ok: true; email: string; expiresAt: string; passwordIssuedAt: string }
  | { ok: false; failure: InvitationWriteFailure };

export type WithdrawResult = { ok: true } | { ok: false; failure: InvitationWriteFailure };
