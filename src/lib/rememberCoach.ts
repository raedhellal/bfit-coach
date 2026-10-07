import "server-only";
import { coachApi } from "./coachApi";
import { writeCoachIdentity } from "./session";

/**
 * How long a sign-in waits for the name. The read is a nicety: it must never hold a
 * sign-in, and above all never the activation response, whose account is ALREADY
 * activated by the time this runs (the temporary password is spent) — a response that
 * hung there would make a client that gives up report a failure for a success. The
 * api answers `/coach-portal/me` in tens of ms; 1.5 s only bounds a stall.
 */
export const REMEMBER_COACH_TIMEOUT_MS = 1_500;

/**
 * EV-342k K.1 — the coach's name and id go into the identity cookie at SIGN-IN (the login
 * handler, and the activation handler that turns a PENDING session into a coach's), so
 * the pages after it make no `GET /coach-portal/me` for the header: one read per sign-in
 * instead of one per page.
 *
 * Route handlers only (it writes a cookie). A failure — a refusal, a lost connection, or
 * the deadline above — costs nothing but that saving: the sign-in still succeeds, and
 * with no cookie `readCoachMe` reads `/me` per request as before (K.4). The race is what
 * holds the bound for a fixture or any step the signal cannot reach; the signal is what
 * cancels the request itself. Never call it for a PENDING session: b-fit-api refuses that
 * token every `/coach-portal` read (EV-278c), and the activation spec pins that none is
 * made.
 */
export async function rememberCoach(accessToken: string): Promise<void> {
  const signal = AbortSignal.timeout(REMEMBER_COACH_TIMEOUT_MS);
  const deadline = new Promise<null>((resolve) => {
    signal.addEventListener("abort", () => resolve(null), { once: true });
  });
  try {
    const me = await Promise.race([coachApi.getMe(accessToken, signal), deadline]);
    if (!me) return;
    writeCoachIdentity(accessToken, { coachId: me.coachId, displayName: me.displayName });
  } catch {
    // No identity cookie; see above.
  }
}
