"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/kit";
import { SESSION_SUBJECT_HEADER } from "@/lib/autosaveTransport";
import { useCopy } from "@/lib/i18n/client";
import {
  createPreferenceSaver,
  PREFERENCES_BFF,
  PREFERENCES_WAIT_MS,
  readOutcome,
  saveOutcome,
  type CoachEmailType,
  type PreferenceSaver,
  type ReadOutcome,
  type SaveOutcome,
  type SwitchView,
} from "@/lib/notificationPreferences";

/**
 * EV-455k — the settings page's island: the coach's four email switches (AC-1 to AC-3, AC-5).
 *
 * WHY THE BROWSER READS, NOT THE PAGE'S RENDER. The router cache keeps a dynamic page for 30 s
 * (`next.config.mjs` `staleTimes.dynamic`), so a document read in the server render would come
 * back from the inbox's « Réglages » link with the position from BEFORE the last toggle. The
 * island reads `GET /api/bff/notification-preferences` on every mount instead, as EV-455f's inbox
 * does, and so always draws what the api holds.
 *
 * STATES, none blank and none ambiguous: the read draws skeleton rows (`aria-busy`, a spoken
 * « Chargement… »); a failed read (any answer but the document, or none within
 * `PREFERENCES_WAIT_MS`) draws the load-error sentence and « Réessayer », never four switches it
 * could not read; then the switches. A 307 / 401 reloads into the middleware's sign-in redirect.
 *
 * A SWITCH is a `<button role="switch">` named by its visible label (`aria-labelledby`, AC-5);
 * the label is a `<label for>`, so a click on the words toggles it too. It saves on toggle through
 * `createPreferenceSaver` (one request per switch at a time; the last position wins), and shows
 * « Enregistré » in its own status line once saved. A failed save returns the switch to the
 * position the server last confirmed and shows the save-failed sentence as `role="alert"` under
 * it, named as the switch's description (AC-3); the switch stays where it is, so focus does too.
 *
 * FOCUS. « Réessayer » removes itself (the read starts again), so before it goes focus moves to
 * the island's region, which stays in the page in every state: focus never falls to `<body>`.
 *
 * UNMOUNT (staff's EV-455f lessons). The read is aborted, and a read that answers after it, or
 * after a newer read started (StrictMode mounts twice in development), is dropped. The saver's
 * listener is detached, so no save answer reaches React; the saves still finish (`keepalive`).
 */

type Load = "loading" | "failed" | "ready";

async function readPreferences(signal: AbortSignal): Promise<ReadOutcome> {
  try {
    const res = await fetch(PREFERENCES_BFF, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal,
    });
    const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
    return readOutcome(res.status, res.type, body);
  } catch {
    return { kind: "failed" };
  }
}

export function NotificationSettings({ sessionSubject }: { sessionSubject: string }) {
  const c = useCopy().notificationSettings;
  const [load, setLoad] = useState<Load>("loading");
  const [saver, setSaver] = useState<PreferenceSaver | null>(null);
  const [views, setViews] = useState<SwitchView[]>([]);
  const regionRef = useRef<HTMLDivElement | null>(null);
  /** The current read: a read whose number is not this one, or that ended after unmount, is dropped. */
  const readSeq = useRef(0);
  const readAbort = useRef<AbortController | null>(null);

  const send = useCallback(
    async (type: CoachEmailType, on: boolean): Promise<SaveOutcome> => {
      try {
        const res = await fetch(PREFERENCES_BFF, {
          method: "PUT",
          cache: "no-store",
          credentials: "same-origin",
          redirect: "manual",
          keepalive: true,
          signal: AbortSignal.timeout(PREFERENCES_WAIT_MS),
          headers: { "Content-Type": "application/json", Accept: "application/json", [SESSION_SUBJECT_HEADER]: sessionSubject },
          body: JSON.stringify({ type, email: on }),
        });
        const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
        return saveOutcome(res.status, res.type, body, type);
      } catch {
        return { kind: "failed" };
      }
    },
    [sessionSubject]
  );

  const read = useCallback(async () => {
    const seq = ++readSeq.current;
    readAbort.current?.abort();
    const abort = new AbortController();
    readAbort.current = abort;
    const timer = setTimeout(() => abort.abort(), PREFERENCES_WAIT_MS);
    setLoad("loading");
    let outcome: ReadOutcome;
    try {
      outcome = await readPreferences(abort.signal);
    } finally {
      clearTimeout(timer);
    }
    if (seq !== readSeq.current) return;
    if (outcome.kind === "signedOut") return window.location.reload();
    if (outcome.kind === "failed") return setLoad("failed");
    const next = createPreferenceSaver(outcome.switches, send);
    setViews(next.views());
    setSaver(next);
    setLoad("ready");
  }, [send]);

  useEffect(() => {
    void read();
    return () => {
      // Unmount: the read in flight is aborted and its answer, if any, dropped.
      readSeq.current += 1;
      readAbort.current?.abort();
    };
  }, [read]);

  useEffect(() => {
    if (!saver) return;
    setViews(saver.views());
    return saver.subscribe({ change: setViews, signedOut: () => window.location.reload() });
  }, [saver]);

  const retry = () => {
    regionRef.current?.focus();
    void read();
  };

  return (
    <div ref={regionRef} tabIndex={-1} className="prefs" aria-busy={load === "loading" ? "true" : undefined} data-prefs-state={load}>
      {load === "loading" && (
        <>
          <span className="sr-only" role="status">
            {c.loading}
          </span>
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="prefs-skeleton" aria-hidden="true" />
          ))}
        </>
      )}

      {load === "failed" && (
        <div className="prefs-state" role="alert" data-prefs-state="error">
          <p style={{ margin: 0 }}>{c.loadError}</p>
          <Button variant="secondary" onClick={retry}>
            {c.retry}
          </Button>
        </div>
      )}

      {load === "ready" && saver && (
        <ul className="prefs-list">
          {views.map((v) => {
            const id = `pref-${v.type}`;
            return (
              <li key={v.type} className="prefs-item" data-type={v.type} data-save-state={v.state}>
                <div className="prefs-row">
                  <label htmlFor={id} id={`${id}-label`} className="prefs-label">
                    {c.switch[v.type]}
                  </label>
                  <button
                    id={id}
                    type="button"
                    role="switch"
                    aria-checked={v.on}
                    aria-labelledby={`${id}-label`}
                    aria-describedby={v.state === "failed" ? `${id}-failed` : undefined}
                    className="prefs-switch"
                    onClick={() => saver.toggle(v.type)}
                  >
                    <span className="prefs-switch-track" aria-hidden="true">
                      <span className="prefs-switch-knob" />
                    </span>
                  </button>
                </div>
                {/* Always in the page, so its change is announced. */}
                <p role="status" className="prefs-saved">
                  {v.state === "saved" ? c.saved : ""}
                </p>
                {v.state === "failed" && (
                  <p role="alert" id={`${id}-failed`} className="prefs-failed">
                    {c.saveFailed}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
