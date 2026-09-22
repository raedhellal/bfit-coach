#!/usr/bin/env node
/**
 * `npm run spec:sync` — copy b-fit-api's canonical `openapi.yaml` into `spec/`, and
 * record the api commit it was taken from AND whether that commit has shipped.
 *
 * The same convention `b-fit-mobile` uses (`npm run spec:sync` →
 * `spec/b-fit-api.openapi.yaml`), for the same reason: the spec is checked in so the
 * contract test runs with no sibling repo, no api and no network, and it is a COPY so
 * that updating it is a commit somebody reviews rather than a file that silently
 * changed underneath a green test.
 *
 * The sha file is the whole point of the pair. A vendored spec with no provenance is a
 * claim about an api nobody can check; `spec/b-fit-api.sha` says exactly which
 * b-fit-api commit `qa/contract-drift.spec.ts` is asserting against, so a portal
 * deployed ahead of the api it was typed against is a visible fact rather than a
 * 500 a coach discovers. See the portal's own history for why that matters.
 *
 * ── EV-188b, 2026-09-21: the sha alone was not enough. ────────────────────────
 * This surface has now shipped TWICE against an api branch that had not merged
 * (EV-184b's write path is still broken against live because of it). A sha says
 * WHICH commit; it does not say whether that commit is on the api's `main`, and a
 * reader who does not happen to run `git merge-base` cannot tell a vendored release
 * from a vendored branch. So the file gained a provenance block:
 *
 *     <40-char sha>            ← line 1, unchanged, still the machine-read value
 *     # comment lines
 *     ref: <the api branch/tag this came from>
 *     on-api-main: YES | NO | UNKNOWN
 *     dirty: yes                ← only when the api worktree had uncommitted spec edits
 *
 * `qa/api-merge-condition.spec.ts` reads `on-api-main` and fails when the declaration
 * and the sibling repo disagree — in EITHER direction. A branch vendored as NO that
 * has since merged turns the suite red, which is the forcing function for re-running
 * this script against `main`, and is the only reason the marker cannot rot.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
/**
 * Where b-fit-api is — resolved the SAME way `qa/api-merge-condition.spec.ts` resolves
 * it, through `--git-common-dir`, rather than as `resolve(repo, "..")`.
 *
 * `resolve(repo, "..")` is the sibling of whatever directory this checkout happens to
 * sit in, which inside a `git worktree` is `<repo>/.claude/worktrees/` — so `spec:sync`
 * from a worktree tried to copy `…/.claude/worktrees/b-fit-api/openapi.yaml` and died
 * on ENOENT. Every agent branch on this surface is built in a worktree, so "vendor the
 * spec" is the first command of a story and was the first one to fail.
 */
function siblingApiDir() {
  const named = process.env.B_FIT_API_DIR;
  if (named) return named;
  try {
    const common = execFileSync(
      "git",
      ["-C", repo, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8" }
    ).trim();
    return resolve(dirname(common), "..", "b-fit-api");
  } catch {
    return resolve(repo, "..", "b-fit-api");
  }
}

const api = siblingApiDir();

const source = join(api, "openapi.yaml");
copyFileSync(source, join(repo, "spec", "b-fit-api.openapi.yaml"));

const git = (...args) => execFileSync("git", ["-C", api, ...args], { encoding: "utf8" }).trim();

const sha = git("rev-parse", "HEAD");
const status = git("status", "--porcelain", "openapi.yaml");

/** The branch or tag this HEAD is on, for a human. A detached worktree says so. */
let ref = "(detached)";
try {
  ref = git("rev-parse", "--abbrev-ref", "HEAD");
  if (ref === "HEAD") {
    const named = git("for-each-ref", "--points-at", "HEAD", "--format=%(refname:short)", "refs/heads");
    ref = named.split("\n").filter(Boolean).join(", ") || "(detached)";
  }
} catch {
  /* a worktree with no branch — "(detached)" is the honest answer */
}

/**
 * Is this commit on the api's shipped line? `origin/main` first, because that is what
 * deploys; `main` as the fallback for a clone with no remote. UNKNOWN when neither
 * ref resolves — an answer, not a guess.
 */
function onApiMain() {
  for (const branch of ["origin/main", "main"]) {
    try {
      git("rev-parse", "--verify", `${branch}^{commit}`);
    } catch {
      continue;
    }
    try {
      git("merge-base", "--is-ancestor", sha, branch);
      return "YES";
    } catch {
      return "NO";
    }
  }
  return "UNKNOWN";
}

const merged = onApiMain();

/**
 * ⚠ Line 1 is EXACTLY the sha and nothing else.
 *
 * It used to be `${sha} (dirty worktree)`, which collided with the reader's own rule
 * that line 1 is 40 hex characters — so a dirty api worktree produced an
 * unexplainable red in `qa/api-merge-condition.spec.ts` instead of the legible
 * provenance note the marker was written for. A warning that breaks the thing it is
 * warning inside is worse than no warning. It has its own field now.
 */
writeFileSync(
  join(repo, "spec", "b-fit-api.sha"),
  [
    sha,
    "# Provenance, written by scripts/spec-sync.mjs. Line 1 is the value; these are for you.",
    "# on-api-main: NO means the portal is typed against an api that has NOT shipped.",
    "# qa/api-merge-condition.spec.ts fails when this line and b-fit-api disagree.",
    `ref: ${ref}`,
    `on-api-main: ${merged}`,
    ...(status ? ["dirty: yes  # openapi.yaml had uncommitted edits — this sha does not name what was copied"] : []),
    "",
  ].join("\n")
);

console.log(
  `spec:sync ← ${source}\n         @ ${sha} (${ref})` +
    `\n         on-api-main: ${merged}${merged === "NO" ? "  ⚠ THIS PORTAL MAY NOT MERGE UNTIL IT IS YES" : ""}` +
    `${status ? "\n         DIRTY — commit the api side first" : ""}`
);
