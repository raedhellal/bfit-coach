"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InvitedActions, type InvitedOutcome, type InvitedTarget } from "@/components/roster/InvitedActions";
import { startNavigationProgress } from "@/components/shell/NavigationProgress";

/**
 * EV-204b — Resend and Withdraw on the person's own page, with the page's live region.
 * A Withdraw deletes the account the page is about, so it returns to the roster, where the
 * row is already gone (the action revalidated `/`).
 */
export function InvitedPageActions({ target }: { target: InvitedTarget }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<InvitedOutcome | null>(null);

  function onResult(next: InvitedOutcome) {
    if (next.kind === "withdrawn") {
      startNavigationProgress("/");
      router.replace("/");
      return;
    }
    setOutcome(next);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <InvitedActions target={target} onResult={onResult} />
      <p
        role="status"
        className="invited-notice"
        data-tone={outcome?.kind === "refused" ? "err" : outcome ? "ok" : undefined}
        hidden={!outcome}
      >
        {outcome?.message ?? ""}
      </p>
    </div>
  );
}
