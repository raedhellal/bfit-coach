"use server";

import { revalidatePath } from "next/cache";
import { ApiError, coachApi, type CoachChallengeCreateRequest } from "./coachApi";
import { classifyChallengeError, type ChallengeFailure } from "./challengeDocument";

/**
 * EV-321b's two writes. The pages are server components; the create dialog and the
 * delete confirm are client islands, and these actions are the only way either reaches
 * b-fit-api — the bearer token and the unmerged paths stay on the server.
 *
 * Each returns a RESULT and never throws (`templateActions.ts` gives the reason: four
 * refusals with four sentences collapse into one error boundary if thrown), and every
 * call site wraps it in `settled()` — a server action whose request fails resolves
 * `undefined`, which would otherwise lose the dialog the coach just filled in.
 */

function refusalOf(err: unknown): ChallengeFailure {
  if (err instanceof ApiError) {
    return classifyChallengeError({
      status: err.status,
      code: err.code,
      details: err.details,
      message: err.message,
    });
  }
  return { code: "FAILED" };
}

export type CreateChallengeResult =
  | { ok: true; id: string }
  | { ok: false; failure: ChallengeFailure };

/**
 * The body arrives already built by `buildChallengeRequest` in the browser, and is sent
 * as it is: the api re-checks every rule, so a tampered body is the api's refusal to
 * make, not this action's.
 */
export async function createChallengeAction(body: CoachChallengeCreateRequest): Promise<CreateChallengeResult> {
  try {
    const created = await coachApi.createChallenge(body);
    revalidatePath("/challenges");
    return { ok: true, id: created.challenge.id };
  } catch (err) {
    return { ok: false, failure: refusalOf(err) };
  }
}

export type DeleteChallengeResult = { ok: true } | { ok: false; failure: ChallengeFailure };

export async function deleteChallengeAction(id: string): Promise<DeleteChallengeResult> {
  try {
    await coachApi.deleteChallenge(id);
    revalidatePath("/challenges");
    revalidatePath(`/challenges/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, failure: refusalOf(err) };
  }
}
