"use client";

import { useEffect, useState } from "react";
import { useCopy } from "@/lib/i18n/client";

/**
 * EV-337k (plan §5.10, design screen 17) — /unavailable tries again by itself.
 *
 * WHAT is retried: `window.location.reload()` of the document in the address bar. That
 * document is always a GET: middleware rewrites only a GET or HEAD onto /unavailable and
 * answers every other method — a server action above all — with a bare 503 and no page
 * (staff round 4 on EV-278c). So no write is ever replayed from here; the story's « retries
 * GET requests only » holds by construction, and `qa/coach-activation.stub.spec.ts` watches
 * the method of the request the timer sends.
 *
 * HOW OFTEN: once, `AUTO_RETRY_SECONDS` after the page shows, and at most `AUTO_RETRY_MAX`
 * times in a row per tab (sessionStorage, not a cookie: it is nobody's business but this
 * tab's). Every coach's session rotation leaves from the portal server's one IP, and the
 * api's refresh throttle is per IP (`AuthRateLimitGuard.onRefresh`), so an open tab that
 * retried for ever would keep the throttle hot for everybody. After the last one the line
 * says the retries stopped, and the button still works. A run of retries is forgotten once
 * the last one is `RESET_AFTER_MS` old.
 *
 * The sentence is rendered only after mount: without JavaScript nothing retries, so the
 * server render must not promise it. It is stated once, never counted down (WCAG 2.2.2).
 */
export const AUTO_RETRY_SECONDS = 30;
export const AUTO_RETRY_MAX = 10;
const RESET_AFTER_MS = 5 * 60_000;
const KEY = "evoli_pro_unavailable_retries";

type Run = { count: number; at: number };

function readRun(): Run {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Partial<Run> | null;
    const count = typeof parsed?.count === "number" && parsed.count >= 0 ? parsed.count : 0;
    const at = typeof parsed?.at === "number" ? parsed.at : 0;
    return Date.now() - at > RESET_AFTER_MS ? { count: 0, at: 0 } : { count, at };
  } catch {
    return { count: 0, at: 0 };
  }
}

function writeRun(run: Run) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    // Storage refused (private mode, quota): the retry still happens, uncounted.
  }
}

export function AutoRetry() {
  const copy = useCopy();
  const [state, setState] = useState<"idle" | "scheduled" | "stopped">("idle");

  useEffect(() => {
    const run = readRun();
    if (run.count >= AUTO_RETRY_MAX) {
      setState("stopped");
      return;
    }
    setState("scheduled");
    const timer = window.setTimeout(() => {
      writeRun({ count: run.count + 1, at: Date.now() });
      window.location.reload();
    }, AUTO_RETRY_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  if (state === "idle") return null;
  return (
    <p className="auth-meta" data-testid="unavailable-auto-retry">
      {state === "stopped" ? copy.unavailable.autoRetryStopped : copy.unavailable.autoRetry(AUTO_RETRY_SECONDS)}
    </p>
  );
}
