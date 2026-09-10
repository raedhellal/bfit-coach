"use client";

import { Button, Card } from "@/components/ui/kit";
import { copy } from "@/lib/copy";

/**
 * Route-level error boundary. A render that throws shows this instead of a white
 * screen — edge case 3's spirit applied to the web surface.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
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
          <div style={{ fontSize: 14.5, color: "var(--ink-2)" }}>{copy.roster.loadError}</div>
          <Button variant="secondary" icon="refresh" onClick={reset}>
            {copy.roster.retry}
          </Button>
        </div>
      </Card>
    </main>
  );
}
