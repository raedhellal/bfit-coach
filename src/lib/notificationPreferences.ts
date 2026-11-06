/**
 * EV-455k — the coach's notification settings (/settings/notifications): which switches the page
 * draws, how a BFF answer is read, and the save queue behind each switch. Pure, and safe in a
 * client island (no `server-only` import): the BFF route, the page's island and
 * `qa/notification-settings-unit.spec.ts` read the same code.
 *
 * THE SWITCHES. The four coach email pairs of EV-455h, in the story's table order. Each is the
 * api's `channels.<TYPE>.email`; `CLIENT_SESSION_COMPLETED` is the daily digest (EV-455j). Any
 * other entry the api lists (a trainee's push pair for a coach who also trains, or a type a later
 * api adds before this portal knows it) is NOT drawn (story edge case): the portal has no label
 * for it, and a switch it cannot name would be a guess. The inbox itself has no switch (X8).
 *
 * NO QUIET HOURS, NO TIME ZONE (story 2026-10-27 (ar) ruling, Out of scope). The page sends only
 * the one pair a switch changed. EV-455h's `PUT` is a MERGE (`openapi.yaml`: "an absent field
 * keeps its value", taken under the row's `lockForUpdate` in `MyNotificationPreferencesUseCase`),
 * so a toggle never clears `quietHours` or `timezone`, and two switches saved at once cannot
 * undo each other: each request names its own pair only.
 */

export const COACH_EMAIL_TYPES = [
  "CLIENT_MESSAGE",
  "CLIENT_JOINED",
  "CLIENT_RED_FLAG",
  "CLIENT_SESSION_COMPLETED",
] as const;

export type CoachEmailType = (typeof COACH_EMAIL_TYPES)[number];

export function isCoachEmailType(value: unknown): value is CoachEmailType {
  return typeof value === "string" && (COACH_EMAIL_TYPES as readonly string[]).includes(value);
}

/** One drawn switch: a coach email pair and its stored value. */
export type EmailSwitch = { type: CoachEmailType; on: boolean };

/**
 * The switches an api (or BFF) document holds, rebuilt field by field, in table order. A pair
 * whose value is not a boolean is not drawn. `null` when the body is not a preferences document
 * or holds none of the four pairs: for a coach session that is not the contract (EV-455h AC-1
 * gives every coach all four), so it is a FAILED read, never an empty page.
 */
export function asEmailSwitches(body: unknown): EmailSwitch[] | null {
  if (!body || typeof body !== "object") return null;
  const channels = (body as Record<string, unknown>).channels;
  if (!channels || typeof channels !== "object" || Array.isArray(channels)) return null;
  const out: EmailSwitch[] = [];
  for (const type of COACH_EMAIL_TYPES) {
    const pair = (channels as Record<string, unknown>)[type];
    const email = pair && typeof pair === "object" ? (pair as Record<string, unknown>).email : undefined;
    if (typeof email === "boolean") out.push({ type, on: email });
  }
  return out.length > 0 ? out : null;
}

/** The BFF's own document: the drawn pairs only, in the api's shape (`channels.<TYPE>.email`). */
export function channelsBody(switches: readonly EmailSwitch[]): { channels: Record<string, { email: boolean }> } {
  const channels: Record<string, { email: boolean }> = {};
  for (const s of switches) channels[s.type] = { email: s.on };
  return { channels };
}

/* ── the BFF path, and how long a request may take ─────────────────────────────────────── */

export const PREFERENCES_BFF = "/api/bff/notification-preferences";

/**
 * The bound on every request the page makes (staff's EV-455f lesson: bound every wait). A read
 * past it is a failed read (its « Réessayer » shows); a save past it is a failed save (the switch
 * returns, the alert shows). The fetch is aborted at the same bound, so nothing is left waiting.
 */
export const PREFERENCES_WAIT_MS = 10_000;

/* ── reading the BFF's answers ─────────────────────────────────────────────────────────── */

/**
 * The middleware answers a session it cannot continue with a 307 to /login, which a
 * `redirect: "manual"` fetch sees as an opaque redirect; a handler's own 401 is the same fact.
 */
function signedOut(status: number, type: string): boolean {
  return type === "opaqueredirect" || (status >= 300 && status < 400) || status === 401;
}

export type ReadOutcome = { kind: "read"; switches: EmailSwitch[] } | { kind: "signedOut" } | { kind: "failed" };

export function readOutcome(status: number, type: string, body: unknown): ReadOutcome {
  if (signedOut(status, type)) return { kind: "signedOut" };
  if (status !== 200) return { kind: "failed" };
  const switches = asEmailSwitches(body);
  return switches ? { kind: "read", switches } : { kind: "failed" };
}

export type SaveOutcome = { kind: "saved"; on: boolean } | { kind: "signedOut" } | { kind: "failed" };

/** A save's answer: the STORED value of the pair it sent (the api answers the stored document). */
export function saveOutcome(status: number, type: string, body: unknown, sent: CoachEmailType): SaveOutcome {
  if (signedOut(status, type)) return { kind: "signedOut" };
  if (status !== 200) return { kind: "failed" };
  const stored = asEmailSwitches(body)?.find((s) => s.type === sent);
  return stored ? { kind: "saved", on: stored.on } : { kind: "failed" };
}

/* ── the save queue ────────────────────────────────────────────────────────────────────── */

/** What one switch shows. `saved`: the last save of this switch succeeded and nothing is pending. */
export type SwitchState = "idle" | "saving" | "saved" | "failed";
export type SwitchView = { type: CoachEmailType; on: boolean; state: SwitchState };

export interface SaverListener {
  change(views: SwitchView[]): void;
  /** A save found the session ended: the page reloads into the middleware's sign-in redirect. */
  signedOut(): void;
}

export interface PreferenceSaver {
  views(): SwitchView[];
  toggle(type: CoachEmailType): void;
  /** One listener at a time; the returned function detaches it (the island's unmount). */
  subscribe(listener: SaverListener): () => void;
}

/**
 * Saves on toggle (story In scope), ONE request per switch at a time:
 *
 * - A toggle flips what the switch shows at once and, if no save of that switch is out, sends the
 *   new value: one click is one `PUT` (AC-2).
 * - A toggle while that switch's save is out sends nothing yet. When the save answers, the queue
 *   sends the switch's CURRENT value if it differs from what the server now holds, and repeats.
 *   So a fast double toggle never has two requests of one pair racing, and the last position
 *   wins on reload (story edge case). Toggles that cancel out send nothing more.
 * - A save that fails (any answer but the stored document: a 503, a 502, no answer, past
 *   `PREFERENCES_WAIT_MS`) returns the switch to the last value the SERVER confirmed, drops what
 *   was queued, and marks it `failed`, which the island draws as the save-failed alert (AC-3).
 *   Known limit, stated: a request that timed out may still have been stored; the page then shows
 *   the previous value until a reload reads the truth, and a toggle re-sends the wanted value
 *   (a `PUT` of one pair is idempotent).
 * - The server's answer is the truth: the stored value becomes the confirmed one.
 *
 * Unmount (staff's EV-455f lesson: no callback from a component that has unmounted): the island
 * detaches its listener, so no answer reaches React after it; the queue still finishes what the
 * coach asked (each request is `keepalive`), so leaving the page right after a click keeps it.
 */
export function createPreferenceSaver(
  initial: readonly EmailSwitch[],
  send: (type: CoachEmailType, on: boolean) => Promise<SaveOutcome>
): PreferenceSaver {
  type Row = { type: CoachEmailType; confirmed: boolean; wanted: boolean; inFlight: boolean; state: SwitchState };
  const rows: Row[] = initial.map((s) => ({ type: s.type, confirmed: s.on, wanted: s.on, inFlight: false, state: "idle" }));
  let listener: SaverListener | null = null;

  const views = (): SwitchView[] => rows.map((r) => ({ type: r.type, on: r.wanted, state: r.state }));
  const emit = () => listener?.change(views());

  async function flush(row: Row): Promise<void> {
    row.inFlight = true;
    try {
      while (row.wanted !== row.confirmed) {
        const asked = row.wanted;
        let outcome: SaveOutcome;
        try {
          outcome = await send(row.type, asked);
        } catch {
          outcome = { kind: "failed" };
        }
        if (outcome.kind === "signedOut") {
          listener?.signedOut();
          return;
        }
        if (outcome.kind === "failed") {
          row.wanted = row.confirmed;
          row.state = "failed";
          emit();
          return;
        }
        row.confirmed = outcome.on;
        // The server stored something other than what was asked and nothing newer is wanted:
        // show what it holds rather than loop on a value it will not take.
        if (outcome.on !== asked && row.wanted === asked) row.wanted = outcome.on;
      }
      row.state = "saved";
      emit();
    } finally {
      row.inFlight = false;
    }
  }

  return {
    views,
    toggle(type) {
      const row = rows.find((r) => r.type === type);
      if (!row) return;
      row.wanted = !row.wanted;
      row.state = row.wanted === row.confirmed && !row.inFlight ? "idle" : "saving";
      emit();
      if (!row.inFlight && row.wanted !== row.confirmed) void flush(row);
    },
    subscribe(next) {
      listener = next;
      return () => {
        if (listener === next) listener = null;
      };
    },
  };
}
