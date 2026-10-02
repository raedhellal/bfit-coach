"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { IS_PROD } from "../env";
import { LOCALE_COOKIE, isLocale } from "./locale";

export type SetLocaleResult = { ok: true } | { ok: false };

/**
 * The language switch (Evoli Pro redesign, branch 1).
 *
 * A server action, not a route handler + `router.refresh()`: setting a cookie in an action
 * makes Next re-render the current route IN THE SAME RESPONSE — `<html lang>` and every
 * string with it — and drop the client router cache, so a page visited a moment ago in the
 * other language is fetched again rather than replayed. `revalidatePath("/", "layout")`
 * says the same for the server side: every route's output depends on this cookie.
 *
 * The value is re-validated here and never trusted from the client. One year, because it is
 * a standing preference; not httpOnly-sensitive (it is not a credential) but set httpOnly
 * anyway, since nothing in the browser needs to read it — `getLocale` reads it on the server.
 */
export async function setLocaleAction(locale: string): Promise<SetLocaleResult> {
  if (!isLocale(locale)) return { ok: false };
  try {
    cookies().set({
      name: LOCALE_COOKIE,
      value: locale,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: IS_PROD,
      maxAge: 60 * 60 * 24 * 365,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
