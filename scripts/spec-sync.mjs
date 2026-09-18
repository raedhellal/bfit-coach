#!/usr/bin/env node
/**
 * `npm run spec:sync` — copy b-fit-api's canonical `openapi.yaml` into `spec/`, and
 * record the api commit it was taken from.
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
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const api = process.env.B_FIT_API_DIR || resolve(repo, "..", "b-fit-api");

const source = join(api, "openapi.yaml");
copyFileSync(source, join(repo, "spec", "b-fit-api.openapi.yaml"));

const sha = execFileSync("git", ["-C", api, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const status = execFileSync("git", ["-C", api, "status", "--porcelain", "openapi.yaml"], {
  encoding: "utf8",
}).trim();

// A spec copied out of a DIRTY working tree is not the spec that sha names. Say so in
// the file rather than letting the next reader assume provenance we do not have.
writeFileSync(join(repo, "spec", "b-fit-api.sha"), `${sha}${status ? " (dirty worktree)" : ""}\n`);

console.log(`spec:sync ← ${source}\n         @ ${sha}${status ? " (DIRTY — commit the api side first)" : ""}`);
