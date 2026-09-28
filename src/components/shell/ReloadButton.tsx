"use client";

import { Button } from "@/components/ui/kit";

/**
 * A full reload of the URL in the address bar. On /unavailable that is the page the
 * person asked for (middleware's rewrite keeps it there), so the request passes through
 * middleware again and the rotation is retried with the same, still-present cookies.
 */
export function ReloadButton({ children }: { children: string }) {
  return (
    <Button variant="secondary" icon="refresh" onClick={() => window.location.reload()}>
      {children}
    </Button>
  );
}
