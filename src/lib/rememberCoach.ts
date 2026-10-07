import "server-only";
import { coachApi } from "./coachApi";
import { writeCoachIdentity } from "./session";

/**
 * EV-342k K.1 — the coach's name and id go into the identity cookie at SIGN-IN (the login
 * handler, and the activation handler that turns a PENDING session into a coach's), so
 * the pages after it make no `GET /coach-portal/me` for the header: one read per sign-in
 * instead of one per page.
 *
 * Route handlers only (it writes a cookie). A failure costs nothing but that saving: the
 * sign-in still succeeds, and with no cookie `readCoachMe` reads `/me` per request as
 * before (K.4). Never call it for a PENDING session: b-fit-api refuses that token every
 * `/coach-portal` read (EV-278c), and the activation spec pins that none is made.
 */
export async function rememberCoach(accessToken: string): Promise<void> {
  try {
    const me = await coachApi.getMe(accessToken);
    writeCoachIdentity(accessToken, { coachId: me.coachId, displayName: me.displayName });
  } catch {
    // No identity cookie; see above.
  }
}
