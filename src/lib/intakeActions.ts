"use server";

import { revalidatePath } from "next/cache";
import { ApiError, coachApi, isForbidden, isIntakeAlreadyGranted, isIntakeRequestLimit } from "./coachApi";
import { isClientId } from "./clientOverview";
import { INTAKE_REQUEST_ENABLED } from "./env";
import { liveForMs, type AskOutcome, type CancelOutcome } from "./intakeConsent";

/**
 * EV-341w — the card's two writes. Server actions, as every write on this portal is
 * (ADR-0033 D33.6); the poll is a GET route handler instead (`/api/bff/…`), because actions
 * are dispatched one at a time per client and a read every 3 s would queue behind, and hold,
 * every other action and navigation on the page (ADR-0033 option D, rejected for reads).
 *
 * ⚠ **No `revalidatePath`, on purpose, and the cost is named.** Neither write changes
 * anything the overview renders except this card's own starting state, which the island owns
 * from the first render on. A revalidation would render the whole overview in the action's
 * answer (getClient, the monitoring read, both summaries: ADR-0033 A1) for a card that needs
 * none of it, and W2/W3 count the card's requests. The cost: a client-side return to the
 * overview within the router cache's 30 s (`staleTimes.dynamic`) re-renders the card from
 * the pre-ask read. The card covers the case that matters, a request still live, from an
 * in-memory note of its deadline (`IntakeConsentCard`, never storage: W9); an answer that
 * arrived while the coach was away shows at the first poll.
 *
 * Neither action is retried by anything: a second POST supersedes the first and spends one of
 * the three requests a day (PR3, PR5).
 */

export async function askIntakeConsentAction(clientId: string): Promise<AskOutcome> {
  if (!INTAKE_REQUEST_ENABLED) return { ok: false, code: "FAILED" };
  if (!isClientId(clientId)) return { ok: false, code: "ACCESS_DENIED" };
  try {
    const request = await coachApi.requestIntakeConsent(clientId);
    return { ok: true, liveForMs: liveForMs(request?.requestedAt, request?.expiresAt) };
  } catch (err) {
    if (isForbidden(err)) return { ok: false, code: "ACCESS_DENIED" };
    if (isIntakeRequestLimit(err)) return { ok: false, code: "LIMIT" };
    if (isIntakeAlreadyGranted(err)) {
      /**
       * W7 — re-read the status rather than trusting the 409 alone, so the card shows what the
       * api holds now. A re-read that fails still shows the grant: the 409 is the api saying so.
       * Done here, in the same action, so it costs the browser one round trip, not two.
       */
      const status = await coachApi.getIntakeConsent(clientId).catch(() => null);
      return { ok: false, code: "ALREADY_GRANTED", granted: typeof status?.granted === "boolean" ? status.granted : true };
    }
    return { ok: false, code: "FAILED" };
  }
}

export async function cancelIntakeConsentAction(clientId: string): Promise<CancelOutcome> {
  if (!INTAKE_REQUEST_ENABLED) return { ok: false, code: "FAILED" };
  if (!isClientId(clientId)) return { ok: false, code: "ACCESS_DENIED" };
  try {
    await coachApi.cancelIntakeConsentRequest(clientId);
    return { ok: true };
  } catch (err) {
    return { ok: false, code: isForbidden(err) ? "ACCESS_DENIED" : "FAILED" };
  }
}

/**
 * EV-341c — what « Terminer l'entretien » answers the island. `SIGNED_OUT`: the api refused the
 * bearer with a 401 (no token the portal could rotate), which the island shows as B15's session
 * sentence rather than as « Réessayez » (staff N1 on fb2374f).
 */
export type FinishOutcome =
  | { ok: true; completedAt: string }
  | { ok: false; code: "ACCESS_DENIED" | "SIGNED_OUT" | "FAILED" };

/**
 * EV-341c C5 — « Terminer l'entretien »: `POST …/intake/complete`, then **revalidated**, unlike the
 * two writes above and unlike every autosave (ADR-0034 D34.10 (3): "Only « Terminer l'entretien »
 * revalidates. It stays a server action with `revalidatePath`, because it changes the overview's
 * summary card", which keeps ADR-0033 D33.6 literally true).
 *
 * The overview and the interview page are both revalidated so that the overview's summary card
 * (C6, cut to EV-374) can read the finished line on a client-side return made within the router
 * cache's window. That is the INTENT, and it is not yet witnessed: nothing the overview renders
 * on this branch depends on the finish, so no test can tell these two calls from their absence.
 * EV-374's card owes that witness (its finished line read after a client-side return within
 * 30 s). Kept now because EV-374 depends on it; staff F2 on fb2374f.
 *
 * The island shows the finished line from THIS answer, not from the revalidated props, and keeps
 * its own form state (EV-341b's `acked` is the client's own).
 *
 * Idempotent on the api (the first `completedAt` stays, EV-341a AC9), so a second press is harmless.
 */
export async function finishIntakeAction(clientId: string): Promise<FinishOutcome> {
  if (!INTAKE_REQUEST_ENABLED) return { ok: false, code: "FAILED" };
  if (!isClientId(clientId)) return { ok: false, code: "ACCESS_DENIED" };
  let completedAt: string;
  try {
    const done = await coachApi.completeIntake(clientId);
    if (typeof done?.completedAt !== "string") return { ok: false, code: "FAILED" };
    completedAt = done.completedAt;
  } catch (err) {
    if (isForbidden(err)) return { ok: false, code: "ACCESS_DENIED" };
    return { ok: false, code: err instanceof ApiError && err.status === 401 ? "SIGNED_OUT" : "FAILED" };
  }
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/intake`);
  return { ok: true, completedAt };
}
