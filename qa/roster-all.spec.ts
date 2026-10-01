import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import type { RosterClient, RosterPage } from "../src/lib/coachApi";
import { readWholeRoster } from "../src/lib/rosterAll";

/**
 * BUG-472 — `readWholeRoster`, driven WITHOUT a browser: every page is read, each once,
 * a row that arrives twice is kept once, a failed page fails the whole read, and a
 * roster past the page bound is refused rather than truncated.
 *
 * The browser half (the "New challenge" dialog offering the 101st client) is in
 * `qa/coach-challenges.spec.ts`, on the roster config.
 */

function row(n: number): RosterClient {
  return {
    id: `id-${n}`,
    traineeDisplayName: `Client ${n}`,
    scopes: [],
    currentPlanName: null,
    lastCompletedWorkoutDate: null,
    currentStreakDays: null,
    redFlagCount: null,
    status: "ACTIVE",
    since: "2026-09-01T00:00:00Z",
  };
}

/** The api's paging over `rows`: `size` per page, `totalPages` = ceil(n / size). */
function pagedApi(rows: RosterClient[], size: number) {
  const calls: number[] = [];
  const read = async (page: number): Promise<RosterPage> => {
    calls.push(page);
    return {
      items: rows.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: rows.length,
      totalPages: Math.ceil(rows.length / size),
    };
  };
  return { read, calls };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1));

test("a roster of 250 at 100 a page: all 250, in served order, each page read once", async () => {
  const api = pagedApi(range(250), 100);
  const rows = await readWholeRoster(api.read);
  expect(rows.map((r) => r.id)).toEqual(range(250).map((r) => r.id));
  expect([...api.calls].sort((a, b) => a - b)).toEqual([0, 1, 2]);
});

test("exactly one page (100) reads page 0 only", async () => {
  const api = pagedApi(range(100), 100);
  expect(await readWholeRoster(api.read)).toHaveLength(100);
  expect(api.calls).toEqual([0]);
});

test("an empty roster (totalPages 0) is an empty list after one read", async () => {
  const api = pagedApi([], 100);
  expect(await readWholeRoster(api.read)).toEqual([]);
  expect(api.calls).toEqual([0]);
});

test("a row that moved between two page reads is kept once", async () => {
  // Page 0 is read; then row 100 slides down a place and is served again on page 1.
  const read = async (page: number): Promise<RosterPage> => ({
    items: page === 0 ? range(100) : [row(100), row(101)],
    page,
    size: 100,
    totalElements: 101,
    totalPages: 2,
  });
  const rows = await readWholeRoster(read);
  expect(rows).toHaveLength(101);
  expect(new Set(rows.map((r) => r.id)).size).toBe(101);
});

test("a failed page fails the whole read — never a partial list", async () => {
  const api = pagedApi(range(150), 100);
  const read = async (page: number) => {
    if (page === 1) throw new Error("500");
    return api.read(page);
  };
  await expect(readWholeRoster(read)).rejects.toThrow("500");
});

test("past the page bound the read is refused, not truncated", async () => {
  const api = pagedApi(range(301), 100); // 4 pages
  await expect(readWholeRoster(api.read, 3)).rejects.toThrow(/4 pages/);
  expect(api.calls).toEqual([0]);
  expect(await readWholeRoster(pagedApi(range(300), 100).read, 3)).toHaveLength(300);
});
