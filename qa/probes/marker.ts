import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestInfo } from "@playwright/test";

/** A probe test's only effect: a file saying it ran. See single-worker.probe.config.ts. */
export function markRan(testInfo: TestInfo): void {
  const dir = process.env.PROBE_MARKER_DIR;
  if (!dir) throw new Error("PROBE_MARKER_DIR is not set — this probe only runs as a child of a spec");
  writeFileSync(join(dir, `${testInfo.title.replace(/\W+/g, "-")}-w${testInfo.workerIndex}`), "ran");
}
