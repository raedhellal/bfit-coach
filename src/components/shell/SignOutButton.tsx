"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/kit";
import { crossSessionBoundary } from "@/lib/clientSession";
import { useCopy } from "@/lib/i18n/client";

/**
 * Sign-out — a HARD navigation (ADR-0033 D33.7, `crossSessionBoundary`).
 *
 * `location.replace("/login")`, not `router.replace` + `router.refresh()`: a soft
 * navigation keeps the App Router's in-memory cache of every page the coach visited, and
 * (from branch 2) a client query cache with trainee data in it. A document load drops all
 * of it. `replace`, not `assign`: the page the coach signed out from must not be reachable
 * with the Back button.
 */
export function SignOutButton({ block = false }: { block?: boolean }) {
  const copy = useCopy();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    // Whatever the answer, leave: a failed POST still must not leave the portal on screen,
    // and the guard on /login decides from the cookies that are actually there.
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    crossSessionBoundary("/login");
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      icon="logout"
      onClick={signOut}
      disabled={busy}
      full={block}
      style={block ? { justifyContent: "flex-start", padding: "0 12px" } : undefined}
    >
      {copy.shell.signOut}
    </Button>
  );
}

/**
 * A page restored from the back/forward cache is a SNAPSHOT: no request is made, so the
 * middleware's session guard never runs and a signed-out browser can show a portal page by
 * pressing Back. `pageshow` with `persisted` is exactly that restore; reloading turns it
 * into a real request, which the guard answers (a 307 to /login when the session is gone).
 *
 * Mounted once by the shell. Renders nothing.
 */
export function BackForwardCacheGuard() {
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return null;
}
