"use client";

import { useEffect } from "react";
import { discardOutcome } from "@/lib/nutritionTemplateUse";

/**
 * EV-273b (staff review, blocker 1) — mounted on /clients/denied. A "Use on a trainee"
 * outcome that was waiting for a trainee page the coach was redirected away from is
 * discarded here, unread, so it cannot surface on a later visit as if it were new.
 * Renders nothing.
 */
export function DiscardTemplateOutcome() {
  useEffect(() => {
    discardOutcome();
  }, []);
  return null;
}
