"use client";

import { usePathname } from "next/navigation";
import { Button, Card } from "@/components/ui/kit";
import { copy } from "@/lib/copy";

/**
 * Route-level error boundary. A render that throws shows this instead of a white
 * screen — edge case 3's spirit applied to the web surface.
 *
 * It catches every route under this segment, not only the roster, so it can only claim
 * "the roster could not be loaded" when the roster is what failed. Anywhere else — a
 * trainee overview, a route added later — it says something true and generic instead of
 * naming a screen the coach was not on.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const pathname = usePathname();
  const onRoster = pathname === "/";
  return (
    <main className="page">
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
          <div style={{ fontSize: 14.5, color: "var(--ink-2)" }}>
            {onRoster ? copy.roster.loadError : copy.common.unexpectedError}
          </div>
          <Button variant="secondary" icon="refresh" onClick={reset}>
            {onRoster ? copy.roster.retry : copy.common.tryAgain}
          </Button>
        </div>
      </Card>
    </main>
  );
}
