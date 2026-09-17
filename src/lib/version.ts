/**
 * The deployment's identity — what GET /api/version serves.
 *
 * Why this exists: on 2026-09-17 the portal was deployed ahead of b-fit-api and every
 * coach opening a trainee hit a server error, unnoticed for hours, because nothing on
 * this surface could say WHICH commit was serving. The api has /actuator/info with
 * `build.commit`; this is the portal's equivalent, and it exists to be polled after a
 * push until it reports the expected SHA. A 200 from the site proves nothing — the
 * previous build answers 200 too.
 *
 * Sources, in order:
 *  1. the build-time inline from next.config.mjs (`COACH_BUILD_*`),
 *  2. the runtime Vercel system variable, if the inline was empty,
 *  3. "unknown".
 *
 * Confirmed against Vercel's "System environment variables" documentation:
 * `VERCEL_GIT_COMMIT_SHA` — "The git SHA of the commit the deployment was triggered
 * by", available at both build and runtime — and `VERCEL_ENV` — production | preview
 * | development. Nothing else is read, and nothing is invented: outside Vercel the
 * commit is "unknown", which is a truthful answer and a useful one (it says "this is
 * not a Vercel deployment").
 */

export interface VersionInfo {
  /** Full 40-character git SHA of the deployed commit, or "unknown". */
  commit: string;
  /** First 7 characters of `commit`, to compare against `git rev-parse --short HEAD`. */
  commitShort: string;
  /** ISO-8601 timestamp of when this build was produced, or "unknown". */
  buildTime: string;
  /** "production" | "preview" | "development" on Vercel, otherwise "local". */
  environment: string;
}

const UNKNOWN = "unknown";

const ENVIRONMENTS = ["production", "preview", "development"] as const;

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = (value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function getVersionInfo(): VersionInfo {
  // A SHA, and only a SHA: anything that is not hex is discarded rather than echoed,
  // so a mis-set variable cannot turn this public endpoint into a way to read a value
  // out of the deployment's environment.
  const rawCommit = firstNonEmpty(
    process.env.COACH_BUILD_COMMIT,
    process.env.VERCEL_GIT_COMMIT_SHA
  );
  const commit = /^[0-9a-f]{7,40}$/i.test(rawCommit) ? rawCommit.toLowerCase() : UNKNOWN;

  const rawTime = firstNonEmpty(process.env.COACH_BUILD_TIME);
  const buildTime = Number.isNaN(Date.parse(rawTime)) ? UNKNOWN : rawTime;

  // Whitelisted, for the same reason: only the three values Vercel documents get
  // through; anything else reads as a local run.
  const rawEnv = firstNonEmpty(process.env.COACH_BUILD_ENV, process.env.VERCEL_ENV);
  const environment = (ENVIRONMENTS as readonly string[]).includes(rawEnv) ? rawEnv : "local";

  return {
    commit,
    commitShort: commit === UNKNOWN ? UNKNOWN : commit.slice(0, 7),
    buildTime,
    environment,
  };
}
