"use server";

import { revalidatePath } from "next/cache";
import {
  coachApi,
  isForbidden,
  isMilestoneOutOfRange,
  type CoachProgressGoalRequest,
  type TraineeProgressGoal,
} from "./coachApi";

/**
 * EV-202b's write path — ONE action, one mapping, two values.
 *
 * What is absent and cannot be added without changing this file: no argument carries a
 * start weight, a current weight, a body-fat value, a milestone body fat, a milestone
 * waist or a milestone DATE. EV-202 Ruling 1 derives the four readings from the
 * trainee's own rows and rules the rest out by name; a signature with no parameter for
 * a number is how that survives the next refactor.
 *
 * 🔴 The body is a WHOLE REPRESENTATION and is built in exactly one place,
 * `buildProgressGoalRequest` in `src/lib/progressGoal.ts`. This action does not
 * construct, merge or default one — if it did, there would be two places a field could
 * go missing and only one of them would be tested.
 */

/**
 * ADR-0015 D5: the 403 body is undifferentiated across "no such id", "another coach's
 * client", "revoked" and "scope missing", so `ACCESS_DENIED` means the link ended and
 * nothing more. The WEIGH_INS sentence is decided from `overview.scopes` before this
 * form is rendered at all, and is never inferred from this failure.
 */
export type ProgressGoalFailure = "ACCESS_DENIED" | "OUT_OF_RANGE" | "FAILED";

export type SaveProgressGoalResult =
  | { ok: true; goal: TraineeProgressGoal }
  | { ok: false; code: ProgressGoalFailure };

export async function saveProgressGoalAction(
  clientId: string,
  body: CoachProgressGoalRequest
): Promise<SaveProgressGoalResult> {
  try {
    const goal = await coachApi.setProgressGoal(clientId, body);
    /**
     * The trainee's page, because that is where the block lives. The caller also holds
     * the recomputed block from this very response — `PUT` answers the SAME block the
     * `GET` embeds — so the screen updates without a refetch and this revalidation is
     * about the NEXT render (a reload, a back-navigation, a second tab), not about the
     * one the coach is looking at.
     */
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, goal };
  } catch (err) {
    /**
     * Edge case 6, and the order matters: a 400 `COACH_MILESTONE_OUT_OF_RANGE` is
     * NOT a failure to report generically. It means the api refused the number and
     * wrote NOTHING — including the start date that travelled in the same body — and
     * the coach has to be told that rather than left to assume half of it landed.
     * There is no clamp anywhere on this path, here or on the wire.
     */
    if (isMilestoneOutOfRange(err)) return { ok: false, code: "OUT_OF_RANGE" };
    if (isForbidden(err)) return { ok: false, code: "ACCESS_DENIED" };
    return { ok: false, code: "FAILED" };
  }
}
