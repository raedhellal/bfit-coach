import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MERGE CONDITION, MADE MECHANICAL.
 *
 * EV-188b is written against `b-fit-api` `feat/ev188a-template-library-api` @ 341f752,
 * which is APPROVEd and QA-PASSed and **not merged** — a merge there is a production
 * deploy and it is Raed's to run. So every `/coach-portal/templates` type in
 * `src/lib/coachApi.ts` is a claim about a deployment that does not exist yet, which is
 * precisely the shape of the two failures this surface has already shipped:
 *
 *   · 2026-09-16 — `hasScope(scopes, …)` on a field production did not send: a 500
 *     inside a server component's render, for every trainee on the roster.
 *   · 2026-09-18 — `CoachRoutineResponse.trainingProfile`, a whole envelope the api has
 *     never sent. Its write half is STILL broken against live and registered in
 *     `qa/contract-deviations.ts` a year of Fridays later.
 *
 * `qa/contract-drift.spec.ts` proves the portal agrees with the VENDORED spec. This
 * spec proves the vendored spec is one a coach can actually reach — and, when it is
 * not, it keeps saying so until somebody fixes it.
 *
 * 🔴 **THE CONDITION ON THIS BRANCH, in one sentence:**
 * `feat/ev188b-template-library-portal` may not merge to `b-fit-coach` main until
 * `341f752` (or the commit that merges it) is an ancestor of `b-fit-api` `origin/main`.
 * `b-fit-coach` main AUTO-DEPLOYS to Vercel, so merging early does not risk a 500 — it
 * ships one.
 *
 * WHAT THIS CAN AND CANNOT PROVE:
 *   ✓ the declaration in `spec/b-fit-api.sha` is FALSE in the merged direction — the
 *     api has shipped and the portal is still vendoring a branch. That is the case that
 *     matters after the merge, because it is the one nobody would otherwise notice: the
 *     suite goes red and the fix is `npm run spec:sync` against `main`.
 *   ✓ the declaration is false in the unmerged direction — somebody hand-edited the
 *     marker to get a merge through.
 *   ✗ that b-fit-api `origin/main` is up to date with its remote. `git fetch` is not
 *     this suite's to run; a stale `origin/main` reads as NOT-merged, which is the safe
 *     direction to be wrong in.
 *   ✗ anything at all without a `b-fit-api` checkout beside this repo. That case FAILS
 *     rather than skipping: a merge condition that evaporates when the evidence is
 *     missing is not a condition.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ROOT = join(__dirname, "..");

/** Line 1 is the value; the rest of the file is the provenance block for a human. */
function shaFile(): { sha: string; ref: string; onApiMain: string } {
  const lines = readFileSync(join(ROOT, "spec", "b-fit-api.sha"), "utf8").split("\n");
  const field = (key: string) =>
    lines.find((l) => l.startsWith(`${key}:`))?.slice(key.length + 1).trim() ?? "";
  return { sha: (lines[0] ?? "").trim(), ref: field("ref"), onApiMain: field("on-api-main") };
}

/**
 * Where b-fit-api is. `B_FIT_API_DIR` first (the same variable `spec:sync` honours),
 * then the sibling of this repo's MAIN working tree — derived through
 * `--git-common-dir` so the answer is the same whether this runs in the checkout or in
 * a `git worktree`, which is where the EV-188b work was actually done.
 */
function apiDir(): string | null {
  if (process.env.B_FIT_API_DIR) return process.env.B_FIT_API_DIR;
  try {
    const common = execFileSync(
      "git",
      ["-C", ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8" }
    ).trim();
    const candidate = resolve(dirname(common), "..", "b-fit-api");
    return existsSync(join(candidate, ".git")) ? candidate : null;
  } catch {
    return null;
  }
}

test("the vendored spec records the b-fit-api commit it came from", () => {
  const { sha, ref, onApiMain } = shaFile();
  expect(sha, "spec/b-fit-api.sha line 1 must be a plain 40-character commit sha").toMatch(
    /^[0-9a-f]{40}$/
  );
  expect(ref, "spec/b-fit-api.sha must name the ref it was taken from").not.toBe("");
  expect(
    ["YES", "NO"],
    "spec/b-fit-api.sha must declare on-api-main. UNKNOWN means spec:sync could not resolve b-fit-api's main at all, and a portal that cannot tell whether its api has shipped may not merge on the strength of that."
  ).toContain(onApiMain);
});

test("the vendored api commit's merge state is what spec/b-fit-api.sha claims", () => {
  const { sha, ref, onApiMain } = shaFile();
  const api = apiDir();

  expect(
    api,
    "No b-fit-api checkout found beside this repo and B_FIT_API_DIR is unset, so the merge " +
      "condition on this branch cannot be checked. That is a FAILURE and not a skip: this portal " +
      "is typed against an api branch, and a condition that disappears when nobody can verify it " +
      "is how EV-184b's write path shipped broken and stayed broken."
  ).not.toBeNull();

  const run = (...args: string[]) =>
    execFileSync("git", ["-C", api as string, ...args], { encoding: "utf8" }).trim();

  // The commit must at least EXIST in that repo, or we are comparing against nothing.
  expect(() => run("rev-parse", "--verify", `${sha}^{commit}`), `${sha} is not a commit in ${api}`)
    .not.toThrow();

  let observed: "YES" | "NO" | null = null;
  for (const branch of ["origin/main", "main"]) {
    try {
      run("rev-parse", "--verify", `${branch}^{commit}`);
    } catch {
      continue;
    }
    try {
      run("merge-base", "--is-ancestor", sha, branch);
      observed = "YES";
    } catch {
      observed = "NO";
    }
    break;
  }
  expect(observed, `neither origin/main nor main resolves in ${api}`).not.toBeNull();

  expect(
    observed,
    observed === "YES"
      ? `b-fit-api ${sha} (${ref}) HAS shipped — it is now an ancestor of main — but spec/b-fit-api.sha ` +
          `still says on-api-main: NO. Re-run \`npm run spec:sync\` against b-fit-api main, expect the ` +
          `sha to CHANGE, and re-run the contract-drift suite: the portal's types must not depend on ` +
          `anything the merged spec does not have. This is the forcing function, and it is the only ` +
          `reason the marker cannot rot.`
      : `spec/b-fit-api.sha claims on-api-main: YES, but ${sha} is NOT an ancestor of b-fit-api's main. ` +
          `Either the marker was hand-edited or the spec was vendored from a branch — and this portal ` +
          `auto-deploys from main, so shipping on that claim ships a 500.`
  ).toBe(onApiMain);

  // 🔴 The condition itself, restated where a red run will print it.
  if (observed === "NO") {
    test.info().annotations.push({
      type: "merge-condition",
      description:
        `b-fit-api ${sha} (${ref}) has NOT shipped. feat/ev188b-template-library-portal may not ` +
        `merge to b-fit-coach main until it has.`,
    });
  }
});
