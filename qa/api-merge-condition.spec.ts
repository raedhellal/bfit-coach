import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MERGE CONDITION, MADE MECHANICAL.
 *
 * EV-188b was written against `b-fit-api` `feat/ev188a-template-library-api` @ 341f752
 * while that branch was APPROVEd, QA-PASSed and **not merged** — so every
 * `/coach-portal/templates` type in `src/lib/coachApi.ts` was a claim about a
 * deployment that did not exist yet, which is precisely the shape of the two failures
 * this surface has already shipped:
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
 * ✅ **THE CONDITION, AND ITS DISCHARGE — 2026-09-21.** It read:
 * *`feat/ev188b-template-library-portal` may not merge to `b-fit-coach` main until
 * `341f752` (or the commit that merges it) is an ancestor of `b-fit-api`
 * `origin/main`.* `b-fit-coach` main AUTO-DEPLOYS to Vercel, so merging early does not
 * risk a 500 — it ships one.
 *
 * It is satisfied: `b-fit-api` `origin/main` = `21ed43f`, the merge of that branch, and
 * `merge-base --is-ancestor 341f752 origin/main` succeeds. `spec/b-fit-api.sha` was
 * re-synced against the merged `main`, the sha CHANGED (`341f752` → `21ed43f`) and
 * `on-api-main` is now `YES` — and the vendored `openapi.yaml` did not move a byte,
 * because `341f752:openapi.yaml` and `21ed43f:openapi.yaml` are identical
 * (sha256 `13f0662…`). So the portal's types depend on nothing the merged spec lacks.
 *
 * **Nobody remembered to do that.** The rot-detector limb below went red on its first
 * run after the api merged, which is the whole reason it exists. The condition is left
 * written here rather than deleted: the mechanism is general, the next branch will need
 * it, and a spec that only says "everything is fine" teaches nothing.
 *
 * WHAT THIS CAN AND CANNOT PROVE:
 *   ✓ **the condition itself, at the moment it can be violated.** The second test asks
 *     whether THIS repo's HEAD is on `b-fit-coach`'s own shipped line; if it is, and
 *     the vendored api commit has not shipped, it fails. Before EV-188b's review that
 *     limb did not exist and this file's header claimed it did — the suite was green
 *     with the condition unsatisfied, and would have stayed green through a merge and
 *     a Vercel deploy, only going red afterwards when the api caught up. A rot detector
 *     described as an enforcement is exactly the unevidenced capability claim this
 *     project bans in prose; it is now both, and the limbs are separate tests so a
 *     reader can see which is which.
 *   ✓ the declaration in `spec/b-fit-api.sha` is FALSE in the merged direction — the
 *     api has shipped and the portal is still vendoring a branch. That is the case
 *     nobody would otherwise notice: the suite goes red and the fix is
 *     `npm run spec:sync` against `main`.
 *   ✓ the declaration is false in the unmerged direction — somebody hand-edited the
 *     marker to get a merge through.
 *   ✗ that either repo's `origin/main` is up to date with its remote. `git fetch` is
 *     not this suite's to run.
 *     ⚠ **"a stale ref is the safe direction" was WRONG and is fixed here.** The
 *     resolver used to `break` on the first ref that resolved, so with `origin/main`
 *     present it never consulted local `main` — and a clone whose LOCAL main carries
 *     the merge while `origin/main` is stale answered NOT-merged and passed. That is
 *     safe for the ship-a-500 risk and it is precisely the WRONG answer for the
 *     load-bearing direction: the api is merged, the vendored spec is stale, and the
 *     suite says nothing. It is also the likely case in this project, where merges
 *     land in the local checkout first and are pushed after. Both refs are now read
 *     and **merged-anywhere wins**, which is the fail-loud answer.
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
  /**
   * The env override gets the SAME sanity check as the derived path. It did not, and
   * the asymmetry was silly: a typo'd `B_FIT_API_DIR` produced a `git -C` failure deep
   * inside an assertion instead of this file's own "no checkout found" message.
   */
  const named = process.env.B_FIT_API_DIR;
  if (named) return existsSync(join(named, ".git")) ? named : null;
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

/** `git -C <repo> <args…>`, trimmed. Throws exactly as git does. */
function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

/**
 * Is `sha` on `repo`'s shipped line — `origin/main` OR local `main`?
 *
 * ⚠ **Both, not the first that resolves.** The earlier version broke out of this loop
 * on `origin/main` and never looked at `main`, so a checkout that had merged locally
 * and not yet pushed answered NOT-merged. Merged-anywhere is the fail-loud answer:
 * being wrong towards "it shipped" turns a suite red and costs a re-sync; being wrong
 * towards "it has not" is silence about a stale vendored spec, which is the whole
 * failure this file exists to prevent.
 *
 * `null` means neither ref resolves — an answer, not a guess, and its own failure.
 */
function isOnShippedLine(repo: string, sha: string): boolean | null {
  let resolvedAny = false;
  for (const branch of ["origin/main", "main"]) {
    try {
      git(repo, "rev-parse", "--verify", `${branch}^{commit}`);
    } catch {
      continue;
    }
    resolvedAny = true;
    try {
      git(repo, "merge-base", "--is-ancestor", sha, branch);
      return true;
    } catch {
      /* not an ancestor of THIS ref; keep looking at the others */
    }
  }
  return resolvedAny ? false : null;
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
  /**
   * A dirty copy is provenance nobody can reproduce: the sha does not name what was
   * copied. It is its own field rather than a suffix on line 1, because a suffix broke
   * the 40-hex rule above and turned a legible warning into an unexplainable red.
   */
  expect(
    readFileSync(join(ROOT, "spec", "b-fit-api.sha"), "utf8"),
    "spec/b-fit-api.sha was taken from a DIRTY b-fit-api worktree. Commit the api side and re-run `npm run spec:sync`."
  ).not.toContain("dirty:");
});

test("the vendored api commit's merge state is what spec/b-fit-api.sha claims", () => {
  const { sha, ref, onApiMain } = shaFile();
  const api = apiDir();

  expect(
    api,
    "No b-fit-api checkout found beside this repo and B_FIT_API_DIR is unset or wrong, so " +
      "the merge condition on this branch cannot be checked. That is a FAILURE and not a skip: " +
      "this portal is typed against an api branch, and a condition that disappears when nobody " +
      "can verify it is how EV-184b's write path shipped broken and stayed broken."
  ).not.toBeNull();

  // The commit must at least EXIST in that repo, or we are comparing against nothing.
  expect(
    () => git(api as string, "rev-parse", "--verify", `${sha}^{commit}`),
    `${sha} is not a commit in ${api}`
  ).not.toThrow();

  const observed = isOnShippedLine(api as string, sha);
  expect(observed, `neither origin/main nor main resolves in ${api}`).not.toBeNull();

  expect(
    observed ? "YES" : "NO",
    observed
      ? `b-fit-api ${sha} (${ref}) HAS shipped — it is an ancestor of origin/main or of main — ` +
          `but spec/b-fit-api.sha still says on-api-main: NO. Re-run \`npm run spec:sync\` against ` +
          `b-fit-api main, expect the sha to CHANGE, and re-run the contract-drift suite: the ` +
          `portal's types must not depend on anything the merged spec does not have. This is the ` +
          `forcing function, and it is the only reason the marker cannot rot.`
      : `spec/b-fit-api.sha claims on-api-main: YES, but ${sha} is NOT an ancestor of b-fit-api's ` +
          `origin/main or main. Either the marker was hand-edited or the spec was vendored from a ` +
          `branch — and this portal auto-deploys from main, so shipping on that claim ships a 500.`
  ).toBe(onApiMain);
});

/**
 * 🔴 THE CONDITION ITSELF, not the honesty of the marker.
 *
 * The test above compares a declaration with a repository and is a ROT DETECTOR: it
 * fires when the api catches up. It cannot fire at the moment the rule is broken,
 * because at that moment the declaration and the repo AGREE — `on-api-main: NO`, api
 * not merged — and the thing that changed is that this portal shipped anyway.
 *
 * So this limb asks the other question: **is this commit on `b-fit-coach`'s own shipped
 * line?** If it is, the vendored api commit must have shipped too. A feature branch
 * answers "not on the shipped line" and the check stands down — which is correct, and
 * is why the two limbs are separate tests rather than one with a branch in it: a reader
 * can see at a glance which one is asserting today and which one is waiting.
 *
 * `b-fit-coach` main AUTO-DEPLOYS to Vercel, so the instant this is an ancestor of main
 * the code is in front of real coaches. That is the moment this must be red, and it is.
 */
test("a commit on b-fit-coach's own main may not vendor an unshipped api", () => {
  const { sha, ref, onApiMain } = shaFile();

  const head = git(ROOT, "rev-parse", "HEAD");
  const shipped = isOnShippedLine(ROOT, head);
  expect(
    shipped,
    "neither origin/main nor main resolves in b-fit-coach, so whether this commit has " +
      "shipped cannot be established — and an unestablished answer is not permission"
  ).not.toBeNull();

  if (!shipped) {
    /**
     * A feature branch. Recorded rather than silent, so a green run does not read as
     * "the condition was checked and satisfied" when it was "not yet applicable".
     */
    test.info().annotations.push({
      type: "merge-condition",
      description:
        `${head.slice(0, 7)} is not on b-fit-coach's main yet. The condition stands: it may not ` +
        `merge until b-fit-api ${sha.slice(0, 7)} (${ref}) is an ancestor of b-fit-api's main. ` +
        `Declared on-api-main: ${onApiMain}.`,
    });
    return;
  }

  expect(
    onApiMain,
    `${head.slice(0, 7)} IS on b-fit-coach's main — which auto-deploys to Vercel — while ` +
      `spec/b-fit-api.sha says the api it is typed against (${sha}, ${ref}) has NOT shipped. ` +
      `Every /coach-portal/templates type in src/lib/coachApi.ts is now a claim about a ` +
      `deployment that does not exist, in front of real coaches. This is the merge condition, ` +
      `and it has been broken.`
  ).toBe("YES");
});
