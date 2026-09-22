"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { asRosterSort, coachApi, isCapacityReached, type Invite } from "./coachApi";
import { ROSTER_SORT_COOKIE } from "./rosterSort";

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

export type SortResult = { ok: true } | { ok: false };

/**
 * EV-187 AC2 — flip the roster order with one control.
 *
 * A server action rather than a link, because the choice has to OUTLIVE the navigation
 * (a query string would be forgotten the moment the coach opens a trainee and comes
 * back) and the roster is a server component that needs the value before it calls the
 * api. `cookies().set` with no `maxAge` and no `expires` is a session cookie, which is
 * exactly the "for that browser session only" AC2 asks for.
 *
 * The value is re-validated here and not trusted from the client: the api answers 400
 * for a `sort` it does not know, which would turn the roster into its load-error card.
 */
export async function setRosterSortAction(sort: string): Promise<SortResult> {
  try {
    cookies().set({
      name: ROSTER_SORT_COOKIE,
      value: asRosterSort(sort),
      path: "/",
      sameSite: "lax",
    });
    revalidatePath("/");
    return { ok: true };
  } catch {
    return { ok: false };
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
