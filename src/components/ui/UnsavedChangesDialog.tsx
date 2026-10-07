"use client";

import { Button, Modal } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import type { useUnsavedChanges } from "@/lib/useUnsavedChanges";

/**
 * The « Quitter sans enregistrer ? » question, asked by `useUnsavedChanges`.
 *
 * The routine, training-template and recipe editors each draw this same modal inline (they
 * predate EV-342o and are not migrated by it). `useCoachForm` renders this one, so a form
 * built with the hook cannot forget to draw the question its guard asks. Same copy keys,
 * same buttons, same order as those three, so a coach meets one dialog everywhere.
 *
 * Rendered AFTER the form's own markup, so inside a form that is itself a `Modal` (« Nouveau
 * défi ») the question paints above the dialog it is asking about: both are `zIndex: 80`, and
 * the later one in the document wins.
 */
export function UnsavedChangesDialog({ leaving }: { leaving: ReturnType<typeof useUnsavedChanges> }) {
  const copy = useCopy();
  return (
    <Modal
      open={leaving.prompted}
      onClose={leaving.stay}
      title={copy.routine.leaveTitle}
      icon="shield"
      iconTone="amber"
      width={420}
      footer={
        <>
          <Button variant="secondary" onClick={leaving.stay}>
            {copy.routine.leaveStay}
          </Button>
          <Button variant="danger" onClick={leaving.leave}>
            {copy.routine.leaveConfirm}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
        {copy.routine.leaveBody}
      </p>
    </Modal>
  );
}
