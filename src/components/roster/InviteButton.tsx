"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import { InviteLinkPanel } from "./InviteLinkPanel";

/**
 * "Invite a trainee" + the invite modal (AC2).
 *
 * The invite is created when the modal opens, not on page load: an invite is a credential
 * with a 7-day single-use TTL, and minting one every time a coach looks at the roster would
 * leave a trail of live tokens nobody asked for. Each opening mounts a fresh
 * `InviteLinkPanel` (the `key`), which mints exactly one.
 *
 * `variant`: EV-204b puts « Ajouter un client » beside this button as the roster's primary
 * action, so here it can step down to `secondary`. The empty roster keeps the gradient.
 */
export function InviteButton({
  disabled,
  disabledReason,
  variant = "gradient",
}: {
  disabled?: boolean;
  disabledReason?: string;
  variant?: "gradient" | "secondary";
}) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);

  function onOpen() {
    setOpening((n) => n + 1);
    setOpen(true);
  }

  return (
    <>
      <Button
        variant={variant}
        icon="plus"
        onClick={onOpen}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        {copy.roster.invite}
      </Button>

      <Modal
        dirty={false}
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
        <InviteLinkPanel key={opening} disabledReason={disabledReason} />
      </Modal>
    </>
  );
}
