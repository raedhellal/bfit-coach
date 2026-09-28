import { UiIcon } from "@/components/ui/icons";

/**
 * EV-283b — "{first name} changed this plan on {date} (UTC). You're seeing their version."
 *
 * A server component with no state: the sentence comes from the page's routine read,
 * so a publish (which revalidates the route and `router.refresh()`es) re-renders the
 * page from an envelope whose `lastChangedBy` is COACH, and the banner goes. The editor
 * never learns about it and cannot keep a stale copy.
 *
 * `role="note"`: it is standing context for the content below, not a live change
 * (`status`) and not an error (`alert`). It is rendered ABOVE the editor and the
 * guardrails panel so it is the first thing read before Publish, which is its job.
 */
export function TraineeChangedBanner({ sentence }: { sentence: string }) {
  return (
    <p
      role="note"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        margin: "0 0 16px",
        padding: "12px 14px",
        borderRadius: "var(--r-lg)",
        background: "var(--warn-bg)",
        color: "var(--warn-ink)",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden="true" style={{ display: "inline-flex", paddingTop: 2, flexShrink: 0 }}>
        <UiIcon name="edit" size={16} color="var(--warn-ink)" />
      </span>
      <span style={{ minWidth: 0 }}>{sentence}</span>
    </p>
  );
}
