"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClientNoticeCard } from "@/components/client/ClientNoticeCard";
import { isBooted } from "@/components/shell/BootMark";
import { ShellFrame, sectionFor } from "@/components/shell/ShellFrame";
import { Button, Card } from "@/components/ui/kit";
import { isClientLoadError } from "@/lib/clientLoadError";
import { useCopy, useLocale } from "@/lib/i18n/client";

/**
 * Route-level error boundary. A render that throws shows this instead of a white
 * screen — edge case 3's spirit applied to the web surface.
 *
 * It catches every route under this segment, not only the roster, so it can only claim
 * "the roster could not be loaded" when the roster is what failed. Anywhere else — a
 * trainee overview, a route added later — it says something true and generic instead of
 * naming a screen the coach was not on.
 *
 * BUG-689 (audit A4) — the retry RECOVERS. In Next 14.2 `reset` only clears this
 * boundary's state and re-renders the SAME server payload, so after a server-side throw
 * it threw again and the button did nothing. `router.refresh()` asks the server for a new
 * render and `reset()` drops the error, in ONE transition, so the boundary clears only
 * when the fresh payload is in hand (Next's documented recovery for a server error).
 *
 * BUG-689 — the error is drawn INSIDE the shell (`ShellFrame`, the markup `CoachShell`
 * renders), so the sidebar, top bar and tab bar are there and a coach can leave by them.
 * The coach's name is not (no read is made here); the section is taken from the URL.
 * The signed-out and public screens (`/login`, `/activate`, `/unavailable`, `/i/*`) get
 * no shell: a navigation into the portal is not theirs to offer.
 *
 * BUG-672 — the sentence is the page's one `h1` (EV-337 X4: exactly one `h1` in the
 * loaded, empty and error states), drawn at the size and colour the `div` had.
 *
 * BUG-629 — one error is not a crash: `/clients/[id]` THROWS when the trainee overview read
 * failed with anything but a 403, so that the response is a 500 a monitor can see
 * (`src/lib/clientLoadError.ts`).
 * Recognised by its digest, it gets the page that branch always drew — `ClientNoticeCard`
 * with `copy.client.loadError` as the one h1 and the way back to the roster, in the shell
 * under « Clients » — not the generic sentence and its retry.
 *
 * EV-356d D.6 (ADR-0033 D33.13 point 8, R1-H) — that notice is shown only when it is the
 * server's FRESH answer. On an RSC request (a client-side navigation, a prefetch) Next 14.2.35
 * cannot answer non-OK: the page's throw travels as an error row inside a 200 flight, so the
 * router CACHES it. A roster row's hover prefetch made while the api failed, a TEMPORARY entry
 * from a failed click revisited inside 30 s, Back/Forward to it: each replayed « This trainee
 * could not be loaded. » with no request, after the api had recovered (witnessed: D.6, P5).
 *   · Arrival in a commit AFTER the document's first (`isBooted()`, `BootMark`): the error may
 *     be such a replay, so the document is reloaded once. A document load renders afresh and,
 *     if the read still fails, is BUG-629's 500 with this notice — then `isBooted()` is false
 *     again (new document, module memory) and nothing reloads: no loop by construction.
 *   · Arrival in the document's first render: the 500 itself; the notice, as before.
 * A reload, not `router.refresh()` + `reset()`: no transition entanglement, no guard, no
 * timeout, the browser's own progress, and an outage seen through a client navigation becomes
 * a 500 document a monitor can see. While it reloads the page shows the shell and an
 * `aria-busy` area with NO h1 and NO notice, deliberately: the sentence would be false.
 * The flag is read once (`useState`'s lazy initialiser, a pure read: an errored tree renders
 * twice before it commits); nothing is written during render. Never keep it in sessionStorage.
 * The generic branch below keeps BUG-689's manual retry.
 */
const SHELL_LESS = /^\/(login|activate|unavailable|i)(\/|$)/;

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const copy = useCopy();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const onRoster = pathname === "/";
  const clientLoad = isClientLoadError(error);
  const [reloading] = useState(isBooted);

  useEffect(() => {
    if (clientLoad && reloading) window.location.reload();
  }, [clientLoad, reloading]);

  const retry = () =>
    startRetry(() => {
      router.refresh();
      reset();
    });

  const card = (
    <Card>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          padding: "32px 16px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 14.5,
            fontWeight: 400,
            lineHeight: "inherit",
            letterSpacing: "normal",
            fontFamily: "inherit",
            color: "var(--ink-2)",
            margin: 0,
          }}
        >
          {onRoster ? copy.roster.loadError : copy.common.unexpectedError}
        </h1>
        <Button variant="secondary" icon="refresh" onClick={retry} disabled={retrying}>
          {onRoster ? copy.roster.retry : copy.common.tryAgain}
        </Button>
      </div>
    </Card>
  );

  if (clientLoad) {
    if (reloading) {
      return (
        <ShellFrame copy={copy} locale={locale} section="roster">
          <div aria-busy="true" data-client-load-reloading="" />
        </ShellFrame>
      );
    }
    return (
      <ShellFrame copy={copy} locale={locale} section="roster">
        <ClientNoticeCard message={copy.client.loadError} backHref="/" backLabel={copy.shell.backToRoster} asHeading />
      </ShellFrame>
    );
  }
  if (SHELL_LESS.test(pathname)) return <main className="page">{card}</main>;
  return (
    <ShellFrame copy={copy} locale={locale} section={sectionFor(pathname)}>
      {card}
    </ShellFrame>
  );
}
