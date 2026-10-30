/**
 * BUG-1067 — the shape checks for every build-stamp value, in ONE place.
 *
 * A port of b-fit-admin's `src/lib/version-shape.mjs` (BUG-242, admin `05babc51`), which fixed the
 * same unchecked inline this portal's `next.config.mjs` had: the admin's stamp was copied from here.
 *
 * Plain CommonJS JavaScript on purpose. `next.config.mjs` cannot import TypeScript (Next 14 has no
 * `next.config.ts`), and the config is where the stamp is inlined into the build output. Not
 * `.mjs` as in the admin: `next lint` does not read `.mjs`, and `qa/invariant-n-lint-bans.spec.ts`
 * refuses any `.mjs` under src (BUG-751). Not ESM syntax in a `.js` either: package.json has no
 * `"type": "module"`, so Node loads a `.js` as CommonJS. `exports.name = ...` is the form Node's
 * ESM loader reads named exports from, so `next.config.mjs` and `version.ts` both use
 * `import { ... }` on it. Before
 * BUG-1067 only `src/lib/version.ts` validated, at call time, so a mis-set `VERCEL_GIT_COMMIT_SHA`
 * or `VERCEL_ENV` (a `.env*` file, which Next loads before the config, or a CI `next build`) was
 * dropped from `/api/version` but written verbatim into the build: the compiled route, the webpack
 * cache and `required-server-files.json` (witnessed at coach `main` `75b6ff8`). No client chunk
 * carried it there, because no client module imports `@/lib/version`, but `next.config.mjs` `env`
 * is inlined into ANY bundle that reads the key, client ones included, so the guarantee cannot
 * rest on who imports what. Both the config (before inlining) and `version.ts` (at call time) now
 * use these functions, so the two apply one definition of each shape.
 *
 * Each function returns the validated value, or "" when the input is absent or mis-shaped. "" is
 * the "not stamped" value: `version.ts` turns it into its runtime fallback (validated with these
 * same functions), then "unknown" ("local" for the environment). Never the raw input.
 */

/** A git SHA: 7–40 hex characters. Returned lower-cased. */
const COMMIT_SHAPE = /^[0-9a-f]{7,40}$/i;

/** The three values Vercel's VERCEL_ENV takes. Anything else is not echoed. */
const ENVIRONMENTS = Object.freeze(["production", "preview", "development"]);
exports.ENVIRONMENTS = ENVIRONMENTS;

/** A Vercel region id: three lower-case letters and a digit ("cdg1", "iad1"). */
const REGION_SHAPE = /^[a-z]{3}\d$/;

/**
 * @param {string | undefined} raw
 * @returns {string}
 */
function trimmed(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * @param {string | undefined} raw
 * @returns {string} the trimmed, lower-cased SHA, or ""
 */
function shapedCommit(raw) {
  const value = trimmed(raw);
  return COMMIT_SHAPE.test(value) ? value.toLowerCase() : "";
}

/**
 * @param {string | undefined} raw
 * @returns {string} "production" | "preview" | "development", or ""
 */
function shapedEnvironment(raw) {
  const value = trimmed(raw);
  return ENVIRONMENTS.includes(value) ? value : "";
}

/**
 * @param {string | undefined} raw
 * @returns {string} an ISO-8601 timestamp that parses, or ""
 */
function shapedBuildTime(raw) {
  const value = trimmed(raw);
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)) ? value : "";
}

/**
 * @param {string | undefined} raw
 * @returns {string} a Vercel region id, or ""
 */
function shapedRegion(raw) {
  const value = trimmed(raw);
  return REGION_SHAPE.test(value) ? value : "";
}

exports.shapedCommit = shapedCommit;
exports.shapedEnvironment = shapedEnvironment;
exports.shapedBuildTime = shapedBuildTime;
exports.shapedRegion = shapedRegion;
