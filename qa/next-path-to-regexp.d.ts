/**
 * Next 14.2 ships its own copy of path-to-regexp (v6) with no type declarations. `qa/app-pages.ts`
 * compiles rewrite sources with it, the way `next/dist/shared/lib/router/utils/path-match.js`
 * does, so the check and the server cannot use two different parsers. Only what that file calls.
 */
declare module "next/dist/compiled/path-to-regexp" {
  export function pathToRegexp(
    path: string,
    keys?: unknown[],
    options?: { delimiter?: string; sensitive?: boolean; strict?: boolean }
  ): RegExp;
}
