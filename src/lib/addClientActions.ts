"use server";

import { revalidatePath } from "next/cache";
import {
  ApiError,
  coachApi,
  isAccountExists,
  isCoachProfileRequired,
  isInitialisationUnavailable,
  isPendingAccountNotFound,
  isRateLimited,
  validationField,
} from "./coachApi";
import {
  checkAddClient,
  initialiseBody,
  type AddClientField,
  type AddClientResult,
  type InvitationWriteFailure,
  type ResendResult,
  type WithdrawResult,
} from "./addClient";
import { isLocale, type Locale } from "./i18n/locale";

/**
 * EV-204b — the three writes of « Ajouter un client », as server actions (ADR-0033: the
 * session cookie and the bearer stay on the server; the island gets what it renders).
 *
 * 🔴 AC-P9: none of these returns, logs or forwards a temporary password. The api never
 * sends one to the coach (`InitialisedAccountResponse` has no such component, pinned by
 * its own shape test), and every result type below is built field by field from the
 * response rather than spread, so a field the api added tomorrow could not ride along.
 *
 * Every refusal is read by CODE (`coachApi.ts`), never by message. Nothing here is retried:
 * the api charges every initialisation to the coach's hourly window, refused or not.
 */

/** The api's `locale` for the email: the portal's two languages only, French by default. */
function emailLocale(value: unknown): Locale {
  return isLocale(value) ? value : "fr";
}

function invitationFailure(err: unknown): InvitationWriteFailure {
  if (isPendingAccountNotFound(err)) return { code: "GONE" };
  if (isRateLimited(err)) {
    return { code: "THROTTLED", retryAfterSeconds: err instanceof ApiError ? err.retryAfterSeconds : null };
  }
  if (isInitialisationUnavailable(err)) return { code: "UNAVAILABLE" };
  return { code: "UNKNOWN" };
}

/** Both screens an Invited row appears on: the roster, and the person's own page. */
function revalidateInvited(userId: string | null): void {
  revalidatePath("/");
  if (userId) revalidatePath(`/invited/${userId}`);
}

export async function addClientAction(input: { fullName: unknown; email: unknown; locale: unknown }): Promise<AddClientResult> {
  const form = {
    fullName: typeof input?.fullName === "string" ? input.fullName : "",
    email: typeof input?.email === "string" ? input.email : "",
    locale: emailLocale(input?.locale),
  };
  // The island checked already; this is the boundary's own check, and it costs no api call.
  const problems = checkAddClient(form);
  if (problems.length > 0) return { ok: false, failure: { code: "INVALID", field: problems[0].field } };

  try {
    const account = await coachApi.initialiseTrainee(initialiseBody(form));
    revalidateInvited(account.userId);
    return {
      ok: true,
      added: {
        userId: account.userId,
        fullName: account.fullName,
        email: account.email,
        expiresAt: account.expiresAt,
      },
    };
  } catch (err) {
    if (isAccountExists(err)) return { ok: false, failure: { code: "EXISTS" } };
    if (isCoachProfileRequired(err)) return { ok: false, failure: { code: "PROFILE_REQUIRED" } };
    if (isRateLimited(err)) {
      return {
        ok: false,
        failure: { code: "THROTTLED", retryAfterSeconds: err instanceof ApiError ? err.retryAfterSeconds : null },
      };
    }
    if (isInitialisationUnavailable(err)) return { ok: false, failure: { code: "UNAVAILABLE" } };
    const field = validationField(err);
    if (field !== null) {
      const known: AddClientField | null = field === "email" || field === "fullName" ? field : null;
      return { ok: false, failure: { code: "INVALID", field: known } };
    }
    // A 5xx or a lost answer: the account may exist. Let the roster say whether it does.
    revalidateInvited(null);
    return { ok: false, failure: { code: "UNKNOWN" } };
  }
}

export async function resendInvitationAction(userId: string, locale: unknown): Promise<ResendResult> {
  try {
    const account = await coachApi.resendInvitation(String(userId), { locale: emailLocale(locale) });
    revalidateInvited(account.userId);
    return {
      ok: true,
      email: account.email,
      expiresAt: account.expiresAt,
      passwordIssuedAt: account.passwordIssuedAt,
    };
  } catch (err) {
    const failure = invitationFailure(err);
    // GONE: the row is stale (activated, expired, withdrawn in another tab), so the list is
    // re-read and the row the coach pressed disappears with the sentence that explains it.
    if (failure.code === "GONE") revalidateInvited(String(userId));
    return { ok: false, failure };
  }
}

export async function withdrawInvitationAction(userId: string): Promise<WithdrawResult> {
  try {
    await coachApi.withdrawInvitation(String(userId));
    revalidateInvited(String(userId));
    return { ok: true };
  } catch (err) {
    const failure = invitationFailure(err);
    if (failure.code === "GONE" || failure.code === "UNKNOWN") revalidateInvited(String(userId));
    return { ok: false, failure };
  }
}
