"use server";

import { coachApi, isForbidden, isIntakeAlreadyGranted, isIntakeRequestLimit } from "./coachApi";
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
