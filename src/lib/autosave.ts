/**
 * EV-341b B3–B5a, B7, B14, B15, B16 (ADR-0034 D34.10 (2)) — the autosave engine: one queue
 * per section, no React, an injected clock.
 *
 * Pure enough to run in node (`qa/intake-autosave-unit.spec.ts`, B18): the transport and the
 * timers come in through `AutosaveOptions`, and nothing here touches the DOM. `useAutosave`
 * wraps it for a component.
 *
 * ═══ THE RULES, EACH ONE AN AC ═══════════════════════════════════════════════════════════
 *
 *   · B3 — a change is saved `idleMs` (1.5 s) after the LAST change of its section, or at once
 *     on `flush` (the field lost focus). Each section has its own queue: a change in section 1
 *     and one in section 2 put two saves in flight at once.
 *   · At most ONE save in flight per section. A change during a save waits for it; however
 *     many changes arrive meanwhile, they make ONE more save, of the newest values.
 *   · B4 — a network failure or a 5xx is retried 3 times (4 attempts in all) after 1, 2 and
 *     4 s; from the first failure the section is `retrying`, after the fourth `failed`
 *     (« Réessayer » = `retry()`). The values are never touched: they are the form's. A 4xx
 *     other than the four below is `invalid` and is NOT retried (one request only).
 *   · B5 / B5a — a 409 stops that section: no save of it is sent, and no change is even
 *     queued, until `reload(section, version)` (« Recharger »). `reload` drops anything that
 *     was waiting, so the first save after it is built from the values the form holds THEN
 *     (the stored ones, plus whatever the coach changes after) and never from what was typed
 *     before the conflict. (staff H1 on the parked `4c3b4e5`: its `resolveConflict` re-armed
 *     the timer with the stale pending payload, last-writer-wins with a delay.)
 *   · B14 — a 403 is "access ended": every queue stops for good, nothing is dirty any more
 *     (nothing can ever be saved, and the intake is already deleted on the api), and
 *     `onAccessEnded` runs once. The consumer ends access through its form
 *     (`form.endAccess(() => router.refresh(), "leaves")`, staff H2).
 *   · B15 — a 401, a redirect or a non-JSON 2xx is "session ended": every queue stops, the
 *     work stays DIRTY (it is genuinely unsaved), and `retry()` sends every section that has
 *     something waiting once the coach has signed in again.
 *   · B16 — `block(section)` (a note over 1,000 code points, a number out of bounds): that
 *     section sends nothing, and anything waiting is dropped, until its next valid `change`.
 *
 * `dirty` (B7, B7a) is true while ANY section has a change waiting, a save in flight, a
 * failure, a conflict, a block, or the session has ended; false after access ended.
 */

/** What one save came back as (`autosaveTransport.ts` classifies the response). */
export type SaveOutcome =
  | { kind: "saved"; version: number; updatedAt: string }
  /** 409 INTAKE_VERSION_CONFLICT. `version` is the stored one when the answer said it. */
  | { kind: "conflict"; version: number | null }
  /** Any other 4xx but 401 / 403: the request itself is refused. Never retried. */
  | { kind: "invalid"; field: string | null }
  /** 403: the access ended (revoked, consent withdrawn). */
  | { kind: "denied" }
  /** 401, a redirect to /login, or a 2xx that is not the handler's JSON: the session ended. */
  | { kind: "signedOut" }
  /** A network failure, a 5xx, no answer: worth retrying. */
  | { kind: "failed" };

export type SectionStatus =
  /** Nothing waiting, nothing ever saved in this document. */
  | "idle"
  /** A change is waiting for its idle time. */
  | "pending"
  | "saving"
  | "saved"
  /** A save failed; another attempt is scheduled (B4). */
  | "retrying"
  /** Four attempts failed (B4). */
  | "failed"
  | "invalid"
  | "conflict"
  | "signedOut"
  /** The values cannot be sent as they stand (B16). */
  | "blocked";

export interface AutosaveTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutosaveOptions<K extends string, P> {
  /** B3: 1.5 s after the last change. */
  idleMs?: number;
  /** B4: the waits before retries 1, 2 and 3 (so 4 attempts in all). */
  retryDelaysMs?: readonly number[];
  /** Sends one section. Must not throw; a throw is read as `failed`. */
  send(key: K, version: number, payload: P): Promise<SaveOutcome>;
  /** The server holds `payload` for `key` now, at `version`. */
  onSaved?(key: K, payload: P, version: number): void;
  /** B14: called once, on the first 403. */
  onAccessEnded?(): void;
  /** Anything in the snapshot changed. */
  onChange?(): void;
  timers?: AutosaveTimers;
}

export interface AutosaveSnapshot<K extends string> {
  statuses: Record<K, SectionStatus>;
  dirty: boolean;
  accessEnded: boolean;
  signedOut: boolean;
}

interface Section<P> {
  version: number;
  /** The newest values not yet handed to `send`. */
  pending: { payload: P } | null;
  inFlight: boolean;
  /** The idle timer fired (or a flush came) while a save was in flight: send again when it lands. */
  queued: boolean;
  idleTimer: unknown;
  retryTimer: unknown;
  /** Failed attempts of the current values (B4). */
  failures: number;
  status: SectionStatus;
}

const DEFAULT_IDLE_MS = 1_500;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

const DIRTY: ReadonlySet<SectionStatus> = new Set(["retrying", "failed", "invalid", "conflict", "signedOut", "blocked"]);

export class AutosaveEngine<K extends string, P> {
  private readonly sections = new Map<K, Section<P>>();
  private readonly idleMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly timers: AutosaveTimers;
  private accessEnded = false;
  private signedOut = false;
  private disposed = false;

  constructor(
    private readonly options: AutosaveOptions<K, P>,
    /** Each section's version as last read (`GET …/intake`). */
    versions: Record<K, number>
  ) {
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.timers = options.timers ?? {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    for (const key of Object.keys(versions) as K[]) {
      this.sections.set(key, {
        version: versions[key],
        pending: null,
        inFlight: false,
        queued: false,
        idleTimer: null,
        retryTimer: null,
        failures: 0,
        status: "idle",
      });
    }
  }

  snapshot(): AutosaveSnapshot<K> {
    const statuses = {} as Record<K, SectionStatus>;
    let dirty = false;
    for (const [key, s] of this.sections) {
      statuses[key] = s.status;
      if (s.pending !== null || s.inFlight || DIRTY.has(s.status)) dirty = true;
    }
    return { statuses, dirty: !this.accessEnded && (dirty || this.signedOut), accessEnded: this.accessEnded, signedOut: this.signedOut };
  }

  /** The section's version as the engine will send it next (for a test, and for a reload's caller). */
  version(key: K): number {
    return this.section(key).version;
  }

  /** B3: the coach changed a field of `key`; `payload` is the whole section as it stands now. */
  change(key: K, payload: P): void {
    if (this.stopped()) return;
    const s = this.section(key);
    // B5a: after a 409 nothing of this section is queued, not even the newest values.
    if (s.status === "conflict") return;
    s.pending = { payload };
    s.failures = 0;
    this.clearRetry(s);
    if (this.signedOut) {
      // B15: kept for « Réessayer », not sent.
      s.status = "signedOut";
      this.emit();
      return;
    }
    this.clearIdle(s);
    s.idleTimer = this.timers.setTimeout(() => {
      s.idleTimer = null;
      this.fire(key);
    }, this.idleMs);
    if (!s.inFlight) s.status = "pending";
    this.emit();
  }

  /** B16: the section's values cannot be sent; drop what was waiting, send nothing until the next `change`. */
  block(key: K): void {
    if (this.stopped()) return;
    const s = this.section(key);
    if (s.status === "conflict") return;
    s.pending = null;
    s.queued = false;
    s.failures = 0;
    this.clearIdle(s);
    this.clearRetry(s);
    s.status = "blocked";
    this.emit();
  }

  /** B3: the field lost focus — send what is waiting now, without the idle time. */
  flush(key: K): void {
    if (this.stopped() || this.signedOut) return;
    const s = this.section(key);
    if (s.pending === null || s.status === "conflict" || s.status === "blocked") return;
    if (s.retryTimer !== null) return; // a retry is already scheduled for these values
    this.clearIdle(s);
    this.fire(key);
  }

  /** B4 / B15 « Réessayer »: every section with something waiting is sent again, from attempt one. */
  retry(): void {
    if (this.stopped()) return;
    this.signedOut = false;
    for (const [key, s] of this.sections) {
      if (s.status === "conflict" || s.status === "blocked") continue;
      if (s.pending === null) {
        if (s.status === "signedOut") s.status = s.inFlight ? "saving" : "idle";
        continue;
      }
      s.failures = 0;
      this.clearRetry(s);
      this.clearIdle(s);
      this.fire(key);
    }
    this.emit();
  }

  /**
   * B5 « Recharger »: the form now shows what the server holds for `key`, at `version`. Saving
   * resumes from the next change; nothing that was waiting is sent (B5a).
   */
  reload(key: K, version: number): void {
    if (this.stopped()) return;
    const s = this.section(key);
    s.version = version;
    s.pending = null;
    s.queued = false;
    s.failures = 0;
    this.clearIdle(s);
    this.clearRetry(s);
    s.status = s.inFlight ? "saving" : "idle";
    this.emit();
  }

  /** Undoes `dispose` (React's development StrictMode unmounts once and mounts again). */
  resume(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    for (const s of this.sections.values()) {
      this.clearIdle(s);
      this.clearRetry(s);
    }
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private section(key: K): Section<P> {
    const s = this.sections.get(key);
    if (!s) throw new Error(`autosave: unknown section ${String(key)}`);
    return s;
  }

  private stopped(): boolean {
    return this.disposed || this.accessEnded;
  }

  private clearIdle(s: Section<P>): void {
    if (s.idleTimer !== null) this.timers.clearTimeout(s.idleTimer);
    s.idleTimer = null;
  }

  private clearRetry(s: Section<P>): void {
    if (s.retryTimer !== null) this.timers.clearTimeout(s.retryTimer);
    s.retryTimer = null;
  }

  private emit(): void {
    if (!this.disposed) this.options.onChange?.();
  }

  /** Send what is waiting, unless a save of this section is out: then once it lands. */
  private fire(key: K): void {
    if (this.stopped() || this.signedOut) return;
    const s = this.section(key);
    if (s.pending === null || s.status === "conflict") return;
    if (s.inFlight) {
      s.queued = true;
      return;
    }
    const { payload } = s.pending;
    s.pending = null;
    s.queued = false;
    s.inFlight = true;
    if (s.failures === 0) s.status = "saving";
    this.emit();
    const version = s.version;
    let sent: Promise<SaveOutcome>;
    try {
      sent = this.options.send(key, version, payload);
    } catch {
      sent = Promise.resolve({ kind: "failed" });
    }
    void sent
      .catch((): SaveOutcome => ({ kind: "failed" }))
      .then((outcome) => this.land(key, payload, outcome));
  }

  private land(key: K, payload: P, outcome: SaveOutcome): void {
    const s = this.section(key);
    s.inFlight = false;
    if (this.stopped()) return;
    switch (outcome.kind) {
      case "saved": {
        s.version = outcome.version;
        s.failures = 0;
        this.options.onSaved?.(key, payload, outcome.version);
        if (s.status === "conflict" || s.status === "blocked") break;
        if (s.pending !== null) {
          if (this.signedOut) s.status = "signedOut";
          else if (s.queued || s.idleTimer === null) {
            // Changes arrived during the save and their time has come: ONE more save, now.
            this.fire(key);
          } else s.status = "pending";
        } else {
          s.status = "saved";
        }
        break;
      }
      case "conflict":
        // B5a: everything that was waiting for this section is dropped, nothing is re-armed.
        s.pending = null;
        s.queued = false;
        s.failures = 0;
        this.clearIdle(s);
        this.clearRetry(s);
        s.status = "conflict";
        break;
      case "invalid":
        if (s.status === "blocked") break;
        if (s.pending === null) s.pending = { payload };
        s.queued = false;
        s.failures = 0;
        this.clearIdle(s);
        s.status = "invalid";
        break;
      case "denied":
        this.endAccess();
        return;
      case "signedOut":
        this.signedOut = true;
        if (s.pending === null) s.pending = { payload };
        for (const other of this.sections.values()) {
          this.clearIdle(other);
          this.clearRetry(other);
          other.queued = false;
          if (other.pending !== null || other.inFlight) other.status = "signedOut";
        }
        break;
      case "failed": {
        if (s.status === "blocked") break;
        // Newer values typed meanwhile are what a retry sends; otherwise these.
        if (s.pending === null) s.pending = { payload };
        s.queued = false;
        if (this.signedOut) {
          s.status = "signedOut";
          break;
        }
        s.failures += 1;
        if (s.failures <= this.retryDelaysMs.length) {
          s.status = "retrying";
          this.clearIdle(s);
          this.clearRetry(s);
          s.retryTimer = this.timers.setTimeout(() => {
            s.retryTimer = null;
            this.fire(key);
          }, this.retryDelaysMs[s.failures - 1]);
        } else {
          this.clearIdle(s);
          s.status = "failed";
        }
        break;
      }
    }
    this.emit();
  }

  private endAccess(): void {
    if (this.accessEnded) return;
    this.accessEnded = true;
    for (const s of this.sections.values()) {
      this.clearIdle(s);
      this.clearRetry(s);
      s.pending = null;
      s.queued = false;
    }
    this.emit();
    this.options.onAccessEnded?.();
  }
}
