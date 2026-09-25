import Link from "next/link";
import { Button, Card } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";

/**
 * The overview's "there is nothing to show you here" card: one sentence and the way
 * back to the roster.
 *
 * Shared by the load-error branch of /clients/[id] and by /clients/[id]/denied so the
 * two cannot drift apart visually — they differ in one sentence and in the HTTP status
 * they are served under, and nothing else.
 */
export function ClientNotice({
  message,
  back,
}: {
  message: string;
  /** Where "back" goes. The roster unless the notice is inside another section. */
  back?: { href: string; label: string };
}) {
  return (
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
        <UiIcon name="ban" size={26} color="var(--err-ink)" />
        <div style={{ fontSize: 14.5, color: "var(--ink-2)", maxWidth: 380, lineHeight: 1.5 }}>
          {message}
        </div>
        <Link href={back?.href ?? "/"}>
          <Button variant="secondary" icon="arrowL">
            {back?.label ?? copy.shell.backToRoster}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
