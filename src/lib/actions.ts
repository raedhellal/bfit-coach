"use server";

import { revalidatePath } from "next/cache";
import { coachApi, isCapacityReached, type Invite } from "./coachApi";

/**
 * Server actions — the only way a client component in this app can reach the api.
 *
 * Everything here runs on the server with the session cookie in scope, so the invite
 * token and the bearer token both stay server-side; the client receives only what it
 * has to render.
 */

export type InviteResult =
  | { ok: true; invite: Invite }
  | { ok: false; code: "CAPACITY_REACHED" | "FAILED" };

export async function createInviteAction(): Promise<InviteResult> {
  try {
    const invite = await coachApi.createInviteWithUrl();
    return { ok: true, invite };
  } catch (err) {
    return { ok: false, code: isCapacityReached(err) ? "CAPACITY_REACHED" : "FAILED" };
  }
}

export type RevokeResult = { ok: true } | { ok: false };

export async function revokeClientAction(clientId: string): Promise<RevokeResult> {
  try {
    await coachApi.revokeClient(clientId);
    // AC6: the roster must be right on the very next request, so drop the route cache
    // for both screens rather than relying on a client-side refetch.
    revalidatePath("/");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
