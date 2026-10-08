import Link from "next/link";
import { Card } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { getCopy } from "@/lib/i18n/server";

/**
 * The overview's "there is nothing to show you here" card: one sentence and the way
 * back to the roster.
 *
 * Shared by the load-error branch of /clients/[id] and by /clients/[id]/denied so the
 * two cannot drift apart visually — they differ in one sentence and in the HTTP status
 * they are served under, and nothing else.
 *
 * `asHeading` renders the sentence as the page's `<h1>`, for a route where the notice IS
 * the whole page and nothing else could title it: /clients/denied, and the load-error
 * branch of /clients/[id]. Neither had any heading before.
 * Off by default: elsewhere the notice sits under a page or tab that already has its
 * heading, and a second h1 there would be wrong. `margin` and `fontWeight` pin the two h1
 * defaults the sentence's style did not already set, so the card renders as it did
 * (screenshots of /clients/denied before and after, EN and FR, are byte-identical).
 */
export function ClientNotice({
  message,
  back,
  asHeading = false,
}: {
  message: string;
  /** Where "back" goes. The roster unless the notice is inside another section. */
  back?: { href: string; label: string };
  /** Render the sentence as the page's h1. Only where the notice is the whole page. */
  asHeading?: boolean;
}) {
  const copy = getCopy();
  const Message = asHeading ? "h1" : "div";
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
        <Message
          style={{ margin: 0, fontSize: 14.5, fontWeight: 400, color: "var(--ink-2)", maxWidth: 380, lineHeight: 1.5 }}
        >
          {message}
        </Message>
        {/* BUG-616: one control, a link drawn as the secondary button. It was a <button>
            inside the link: two Tab stops and two announced controls for one action.
            EV-352: `data-notice-back` is this link's own marker. On the "not yours" pages it
            has the same name as the page's BackLink, and qa/pro-back-link.spec.ts tells the
            two apart by it; `.link-button` is shared by every button-styled link. */}
        <Link href={back?.href ?? "/"} className="link-button" data-variant="secondary" data-notice-back="">
          <UiIcon name="arrowL" size={16.5} />
          {back?.label ?? copy.shell.backToRoster}
        </Link>
      </div>
    </Card>
  );
}
