"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShellFrame, sectionFor } from "@/components/shell/ShellFrame";
import { Button, Card } from "@/components/ui/kit";
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
 */
const SHELL_LESS = /^\/(login|activate|unavailable|i)(\/|$)/;

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const copy = useCopy();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const onRoster = pathname === "/";

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

  if (SHELL_LESS.test(pathname)) return <main className="page">{card}</main>;
  return (
    <ShellFrame copy={copy} locale={locale} section={sectionFor(pathname)}>
      {card}
    </ShellFrame>
  );
}
