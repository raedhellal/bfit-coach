"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "@/components/shell/NavigationProgress";
import { Button, Modal } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import { settled } from "@/lib/settled";
import { deleteChallengeAction } from "@/lib/challengeActions";
import type { ChallengeMetric } from "@/lib/coachApi";

/** How often the open page re-reads progress while it is visible. */
export const AUTO_REFRESH_MS = 45_000;

/**
 * EV-321b — Refresh, the quiet auto-refresh, and Delete, for one challenge page.
 *
 * Refresh is `router.refresh()`: the page is a server component, so a refresh re-runs its
 * read and the table re-renders with the api's new numbers — nothing is fetched here.
 * The auto-refresh does the same every 45 s, ONLY while the tab is visible (a hidden tab
 * polling the api all afternoon is load for nobody), and once on becoming visible again
 * if a tick was missed.
 */
export function ChallengeControls({ id, title, metric }: { id: string; title: string; metric: ChallengeMetric }) {
  const copy = useCopy();
  const c = copy.challenges;
  // What the delete takes with it depends on the metric (the api purges shared steps for
  // STEPS only). An unknown metric gets no sentence rather than a guessed one.
  const body = metric === "STEPS" ? c.deleteBody(title) : metric === "WORKOUTS" ? c.deleteBodyWorkouts(title) : null;
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(Date.now());

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      last.current = Date.now();
      startRefresh(() => router.refresh());
    };
    const timer = window.setInterval(tick, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current >= AUTO_REFRESH_MS) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  function refresh() {
    last.current = Date.now();
    startRefresh(() => router.refresh());
  }

  function remove() {
    startDelete(async () => {
      const result = await settled(deleteChallengeAction(id), { ok: false, failure: { code: "FAILED" } } as const);
      if (!result.ok) {
        setError(result.failure.code === "ACCESS_DENIED" ? c.notYours : c.deleteFailed);
        return;
      }
      setConfirm(false);
      // No `router.refresh()` (ADR-0033 branch 2a): `deleteChallengeAction` revalidates,
      // which purged the router cache, so this navigation renders the list fresh. The list
      // has no `loading.tsx` (EV-342a): the progress bar covers a slow read.
      startNavigationProgress("/challenges");
      router.replace("/challenges");
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Button variant="secondary" icon="refresh" onClick={refresh} disabled={refreshing}>
        {refreshing ? c.refreshing : c.refresh}
      </Button>
      <Button
        variant="dangerSoft"
        icon="trash"
        onClick={() => {
          setError(null);
          setConfirm(true);
        }}
      >
        {c.remove}
      </Button>
      <Modal
        dirty={false}
        open={confirm}
        onClose={() => setConfirm(false)}
        title={c.deleteTitle}
        icon="trash"
        iconTone="red"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {c.cancel}
            </Button>
            <Button variant="danger" onClick={remove} disabled={deleting}>
              {c.deleteConfirm}
            </Button>
          </>
        }
      >
        {body && <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>{body}</p>}
        {error && (
          <p role="alert" style={{ margin: body ? "12px 0 0" : 0, fontSize: 13, color: "var(--err-ink)" }}>
            {error}
          </p>
        )}
      </Modal>
    </div>
  );
}
