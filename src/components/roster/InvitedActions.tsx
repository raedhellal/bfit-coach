"use client";

import { useState, useTransition } from "react";
import { Button, Modal } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import { settled } from "@/lib/settled";
import { formatExpiryUtc } from "@/lib/format";
import { logPortalEvent } from "@/lib/portalEvents";
import { resendInvitationAction, withdrawInvitationAction } from "@/lib/addClientActions";
import { retryMinutes, type InvitationWriteFailure } from "@/lib/addClient";
import type { Copy } from "@/lib/copy";
import { EmailLanguageField } from "./EmailLanguageField";

/**
 * EV-204b — « Renvoyer » (AC-P7) and « Retirer » (AC-P13) for one Invited account, each
 * behind a confirmation that says what it does:
 *   · Resend emails a NEW temporary password; the old one and its sessions stop working;
 *     the expiry does NOT move (D22.9c), and the dialog and the result both say the date.
 *   · Withdraw hard-deletes the account now (D22.10c): the erasure-on-request path for a
 *     person who objects through their coach.
 *
 * The outcome goes to `onResult`, whose caller owns the live region: on the roster the row
 * this island sits in disappears after a Withdraw (the action revalidates `/`), and a
 * sentence rendered inside it would vanish with it.
 */
export interface InvitedTarget {
  userId: string;
  fullName: string;
  email: string;
  expiresAt: string;
}

export type InvitedOutcome = { kind: "resent" | "withdrawn" | "refused"; message: string };

function outcomeOf(f: InvitationWriteFailure): "gone" | "throttled" | "unavailable" | "unknown" {
  return f.code === "GONE" ? "gone" : f.code === "THROTTLED" ? "throttled" : f.code === "UNAVAILABLE" ? "unavailable" : "unknown";
}

function resendFailureLine(f: InvitationWriteFailure, copy: Copy): string {
  const c = copy.invited;
  switch (f.code) {
    case "GONE":
      return c.gone;
    case "THROTTLED":
      return f.retryAfterSeconds ? c.resendThrottled(retryMinutes(f.retryAfterSeconds)) : c.resendThrottledNoTime;
    case "UNAVAILABLE":
      return c.resendUnavailable;
    case "UNKNOWN":
      return c.resendUnknown;
  }
}

export function InvitedActions({
  target,
  onResult,
  compact = false,
}: {
  target: InvitedTarget;
  onResult: (outcome: InvitedOutcome) => void;
  /** The roster row's small buttons; the person's page draws them at full size. */
  compact?: boolean;
}) {
  const copy = useCopy();
  const c = copy.invited;
  const [dialog, setDialog] = useState<"resend" | "withdraw" | null>(null);
  const [locale, setLocale] = useState<Locale>(copy.locale);
  const [pending, startTransition] = useTransition();
  const expiry = formatExpiryUtc(target.expiresAt, copy.locale);

  function openResend() {
    setLocale(copy.locale);
    setDialog("resend");
  }

  function resend() {
    startTransition(async () => {
      const result = await settled(resendInvitationAction(target.userId, locale), {
        ok: false,
        failure: { code: "UNKNOWN" },
      } as const);
      setDialog(null);
      if (result.ok) {
        logPortalEvent({ event: "coach_invitation_resent", outcome: "resent" });
        // The date is the api's answer, not the row's: "unchanged" is what it says, not what we assume.
        onResult({ kind: "resent", message: c.resent(result.email, formatExpiryUtc(result.expiresAt, copy.locale)) });
        return;
      }
      logPortalEvent({ event: "coach_invitation_resent", outcome: outcomeOf(result.failure) });
      onResult({ kind: "refused", message: resendFailureLine(result.failure, copy) });
    });
  }

  function withdraw() {
    startTransition(async () => {
      const result = await settled(withdrawInvitationAction(target.userId), {
        ok: false,
        failure: { code: "UNKNOWN" },
      } as const);
      setDialog(null);
      if (result.ok) {
        logPortalEvent({ event: "coach_invitation_withdrawn", outcome: "withdrawn" });
        onResult({ kind: "withdrawn", message: c.withdrawn(target.fullName) });
        return;
      }
      logPortalEvent({ event: "coach_invitation_withdrawn", outcome: outcomeOf(result.failure) });
      onResult({ kind: "refused", message: result.failure.code === "GONE" ? c.gone : c.withdrawUnknown });
    });
  }

  const size = compact ? "sm" : "md";
  return (
    <>
      <span className="invited-actions" data-align={compact ? undefined : "start"}>
        <Button variant="secondary" size={size} icon="send" onClick={openResend} ariaLabel={c.resendFor(target.fullName)}>
          {c.resend}
        </Button>
        <Button variant="dangerSoft" size={size} icon="trash" onClick={() => setDialog("withdraw")} ariaLabel={c.withdrawFor(target.fullName)}>
          {c.withdraw}
        </Button>
      </span>

      <Modal
        open={dialog === "resend"}
        onClose={() => !pending && setDialog(null)}
        // BUG-699 — `openResend` sets the page's language; another one is the coach's choice.
        dirty={locale !== copy.locale}
        title={c.resendTitle(target.fullName)}
        icon="send"
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={pending}>
              {c.cancel}
            </Button>
            <Button onClick={resend} disabled={pending}>
              {pending ? c.resending : c.resend}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
            {c.resendBody(target.email, expiry)}
          </p>
          <EmailLanguageField label={copy.addClient.languageLabel} value={locale} onChange={setLocale} />
        </div>
      </Modal>

      <Modal
        dirty={false}
        open={dialog === "withdraw"}
        onClose={() => !pending && setDialog(null)}
        title={c.withdrawTitle(target.fullName)}
        icon="trash"
        iconTone="red"
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={pending}>
              {c.cancel}
            </Button>
            <Button variant="danger" onClick={withdraw} disabled={pending}>
              {pending ? c.withdrawing : c.withdraw}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>{c.withdrawBody(target.email)}</p>
      </Modal>
    </>
  );
}
