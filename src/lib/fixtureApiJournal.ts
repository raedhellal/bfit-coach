import "server-only";
import { cache } from "react";

/**
 * The fixture's API JOURNAL: every `CoachApi` operation the fixture answered, with when
 * it started and ended. It is the instrument behind `qa/page-read-budget.spec.ts`.
 *
 * Fixture mode ONLY. `coachApi.ts` wraps the fixture with `journalled()` and leaves the
 * live client alone, so nothing here runs on Vercel.
 *
 * In fixture mode one `CoachApi` call is what one b-fit-api request is in live mode:
 * every live method is a single `apiFetch`. So the journal counts what a page costs the
 * api, and the timestamps show which calls ran one after another.
 *
 * Three facts are recorded with each entry:
 *   · `document`. True when the render was a browser document load
 *     (`Sec-Fetch-Dest: document`), false for an RSC fetch: a `<Link>` prefetch or a
 *     client-side navigation. Next removes `Next-Router-Prefetch` from `headers()`, so
 *     a prefetch cannot be named directly. On a `next start` build a prefetch renders
 *     down to the first `loading.tsx` below the segment the two URLs share, and its
 *     calls are real api traffic that the coach did not ask for.
 *   · `request`. One tag per server render, from React `cache` (one value per request).
 *     Entries that share a tag were made by the same render.
 *   · `start` / `end`, in ms. A call that starts after another one in the same request
 *     has ended is a waterfall step.
 *
 * ⚠ The `evoli_fixture_api_latency=<ms>` cookie (capped at 2 s, ONE browser context)
 * holds EVERY call for that long before the fixture answers. A fixture call takes
 * microseconds, so without it a waterfall costs nothing and cannot be seen. With it,
 * a page's wall time is roughly (sequential steps × latency). It stands in for the
 * round trip from the functions (pinned to cdg1 since main 8d72e4c) to b-fit-api in
 * EU West. The 80 / 120 ms the specs use is a deliberately EXAGGERATED value, chosen
 * so one waterfall step is far larger than timer noise, not a prediction of
 * production latency.
 *
 * Outside `FixtureState`, like the other journals in `coachApi.fixture.ts`, so the seed
 * check is not affected by a read. Emptied by `DELETE /api/fixture/state`. Kept on
 * `globalThis` under `Symbol.for` because Next gives the RSC layer and the route-handler
 * layer separate module instances.
 */
export interface ApiJournalEntry {
  /** The `CoachApi` method name, e.g. `getMe`, `listClients`. */
  op: string;
  /** The first argument when it is a string or number (an id, a sort), else null. */
  arg: string | null;
  /** True for a document load, false for an RSC fetch (a prefetch or a navigation). */
  document: boolean;
  /** One tag per server render. Entries with the same tag came from one request. */
  request: string;
  start: number;
  end: number | null;
}

const JOURNAL_KEY = Symbol.for("evoli.coach.fixture.apiJournal");
type GlobalWithJournal = typeof globalThis & Record<symbol, ApiJournalEntry[] | undefined>;

function journal(): ApiJournalEntry[] {
  return ((globalThis as GlobalWithJournal)[JOURNAL_KEY] ??= []);
}

/** Every entry since the last reset, in start order (copies). */
export function apiJournal(): ApiJournalEntry[] {
  return journal().map((entry) => ({ ...entry }));
}

export function resetApiJournal(): void {
  (globalThis as GlobalWithJournal)[JOURNAL_KEY] = [];
}

let nextRequestTag = 0;
/** One value per request inside a React server render. Outside a render (a route handler
 *  or a server action) React has no request scope, so every call gets a new tag. */
const requestTag = cache((): string => `r${++nextRequestTag}`);

async function requestFacts(): Promise<{ document: boolean; latencyMs: number }> {
  try {
    const { cookies, headers } = await import("next/headers");
    const document = headers().get("sec-fetch-dest") === "document";
    const raw = Number(cookies().get("evoli_fixture_api_latency")?.value);
    const latencyMs = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 2_000) : 0;
    return { document, latencyMs };
  } catch {
    return { document: false, latencyMs: 0 }; // outside a request
  }
}

function firstArg(args: unknown[]): string | null {
  const a = args[0];
  return typeof a === "string" || typeof a === "number" ? String(a) : null;
}

/**
 * The same object with every method journalled. Synchronous methods (there are none
 * today; every `CoachApi` method returns a promise) would become async here, which is
 * why the wrapper is typed to the async shape and only applied in fixture mode.
 */
export function journalled<T extends object>(api: T): T {
  const out: Record<string, unknown> = {};
  for (const [op, value] of Object.entries(api)) {
    if (typeof value !== "function") {
      out[op] = value;
      continue;
    }
    const fn = value as (...args: unknown[]) => Promise<unknown>;
    out[op] = async (...args: unknown[]) => {
      const { document, latencyMs } = await requestFacts();
      const entry: ApiJournalEntry = {
        op,
        arg: firstArg(args),
        document,
        request: requestTag(),
        start: Date.now(),
        end: null,
      };
      journal().push(entry);
      try {
        if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
        return await fn.apply(api, args);
      } finally {
        entry.end = Date.now();
      }
    };
  }
  return out as T;
}
