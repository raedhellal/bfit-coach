/**
 * EV-341b B17 — one cookie's value in a `Set-Cookie` list as Next forwards a middleware's
 * cookies to the request (`x-middleware-set-cookie`: comma-joined, each `name=value; attributes`).
 * Read by `handlerAccessToken` (src/lib/handlerSession.ts); pure, so
 * `qa/intake-autosave-unit.spec.ts` pins it in node.
 *
 * The value is read up to the first `;` or `,`: the tokens it is used for (a JWT) hold neither,
 * and an `Expires=Thu, 15 Oct …` attribute comes after the `;`. An empty value is the cookie
 * being CLEARED (a sign-out), never a value.
 */
export function cookieFromSetCookieList(header: string | null, name: string): string | null {
  if (!header) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|,)\\s*${escaped}=([^;,]*)`).exec(header);
  const value = match?.[1]?.trim();
  return value ? value : null;
}
