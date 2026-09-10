"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton, Modal } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { revokeClientAction } from "@/lib/actions";

/**
 * The overflow menu and its confirm dialog (AC6's coach side).
 *
 * This is the ONLY control on the trainee overview that does anything other than
 * navigate — AC5 requires the page to hold no editable control, no message box, no AI
 * button and no publish action, and QA asserts that by inspection. Adding a second
 * interactive element to this page is a story change, not a tweak.
 */
export function RevokeMenu({ clientId, displayName }: { clientId: string; displayName: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function revoke() {
    setBusy(true);
    setError(null);
    const result = await revokeClientAction(clientId);
    if (!result.ok) {
      setError(copy.client.revokeError);
      setBusy(false);
      return;
    }
    // Back to the roster, which the action already revalidated.
    router.replace("/");
    router.refresh();
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <IconButton
        icon="moreV"
        title={copy.client.menu}
        onClick={() => setMenuOpen((o) => !o)}
      />
      {menuOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: 42,
            zIndex: 30,
            minWidth: 180,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--e-2)",
            padding: 6,
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "9px 10px",
              borderRadius: "var(--r-sm)",
              border: "none",
              background: "transparent",
              color: "var(--err-ink)",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {copy.client.revoke}
          </button>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title={copy.client.revokeTitle}
        icon="ban"
        iconTone="red"
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>
              {copy.client.revokeCancel}
            </Button>
            <Button variant="danger" onClick={revoke} disabled={busy}>
              {busy ? copy.client.revoking : copy.client.revokeConfirm}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {copy.client.revokeBody(displayName)}
        </p>
        {error && (
          <p role="alert" style={{ marginTop: 12, fontSize: 13, color: "var(--err-ink)" }}>
            {error}
          </p>
        )}
      </Modal>
    </div>
  );
}
