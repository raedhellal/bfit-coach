"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Modal, Skeleton } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { createInviteAction } from "@/lib/actions";
import type { Invite } from "@/lib/coachApi";

/**
 * "Invite a trainee" + the invite modal (AC2).
 *
 * The invite is created by a server action when the modal opens, not on page load: an
 * invite is a credential with a 7-day single-use TTL, and minting one every time a
 * coach looks at the roster would leave a trail of live tokens nobody asked for.
 *
 * The QR encodes the SAME string the link field shows — one `invite.url`, used twice —
 * because AC2 requires the scanned URL to be byte-identical to the displayed one.
 */
export function InviteButton({
  disabled,
  disabledReason,
}: {
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setInvite(null);
    setQr(null);
    setQrFailed(false);
    setCopied(false);
    const result = await createInviteAction();
    if (!result.ok) {
      setError(result.code === "CAPACITY_REACHED" ? copy.invite.capacityReached : copy.invite.error);
      return;
    }
    setInvite(result.invite);
  }, []);

  function onOpen() {
    setOpen(true);
    void load();
  }

  // The QR is drawn in the browser from a local dependency (`qrcode`, MIT). No image
  // service, nothing leaves the machine — the demo has to work on a laptop with the
  // phone on the same LAN and nothing else.
  useEffect(() => {
    if (!invite) return;
    let alive = true;
    import("qrcode")
      .then((mod) =>
        mod.toDataURL(invite.url, {
          width: 480,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#0F1729", light: "#FFFFFF" },
        })
      )
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQrFailed(true));
    return () => {
      alive = false;
    };
  }, [invite]);

  async function copyLink() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied (or an insecure origin): the link stays selectable.
      setCopied(false);
    }
  }

  return (
    <>
      <Button
        variant="gradient"
        icon="plus"
        onClick={onOpen}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        {copy.roster.invite}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={copy.invite.title}
        sub={copy.invite.subtitle}
        icon="users"
        width={460}
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {copy.invite.close}
          </Button>
        }
      >
        {error && (
          <div
            role="alert"
            style={{
              padding: "11px 13px",
              borderRadius: "var(--r-md)",
              background: "var(--err-bg)",
              color: "var(--err-ink)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {!error && !invite && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{copy.invite.creating}</span>
            <Skeleton h={40} r={11} />
            <Skeleton h={180} r={18} />
          </div>
        )}

        {!error && invite && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ink-2)",
                  marginBottom: 7,
                }}
              >
                {copy.invite.linkLabel}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
                <input
                  readOnly
                  value={invite.url}
                  aria-label={copy.invite.linkLabel}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    flex: "1 1 200px",
                    minWidth: 0,
                    height: 40,
                    padding: "0 12px",
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--border-2)",
                    background: "var(--surface-2)",
                    color: "var(--ink)",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                  }}
                />
                <Button variant="secondary" icon={copied ? "check" : "copy"} onClick={copyLink}>
                  {copied ? copy.invite.copied : copy.invite.copy}
                </Button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: 16,
                background: "var(--surface-2)",
                borderRadius: "var(--r-2xl)",
                border: "1px solid var(--border)",
              }}
            >
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- a runtime data: URL, nothing for next/image to optimise
                <img
                  src={qr}
                  alt={copy.invite.qrAlt}
                  width={200}
                  height={200}
                  style={{ display: "block", borderRadius: "var(--r-md)" }}
                />
              ) : qrFailed ? (
                <span style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center" }}>
                  {copy.invite.qrFailed}
                </span>
              ) : (
                <Skeleton w={200} h={200} r={11} />
              )}
              <Badge tone="neutral">{copy.invite.expiryChip}</Badge>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
              {copy.invite.expiry}
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                paddingTop: 4,
                borderTop: "1px solid var(--hairline)",
                marginTop: 2,
              }}
            >
              <Button
                variant="ghost"
                icon="mail"
                disabled
                title={copy.invite.sendByEmailTooltip}
                style={{ marginTop: 10 }}
              >
                {copy.invite.sendByEmail}
              </Button>
              <span style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 10 }}>
                <UiIcon
                  name="clock"
                  size={13}
                  color="var(--ink-3)"
                  style={{ display: "inline-block", verticalAlign: "-2px", marginRight: 4 }}
                />
                {copy.invite.sendByEmailTooltip}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
