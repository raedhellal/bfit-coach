import Link from "next/link";
import { Card } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";

/**
 * `ClientNotice`'s markup with every word passed in (BUG-629), so the CLIENT error boundary
 * (`src/app/error.tsx`) can draw the overview's load error exactly as the page did: it
 * cannot call the server `getCopy()`. One markup, two callers, as with `ShellFrame`. No
 * `server-only` import may enter this module. The rationale for the card is on
 * `ClientNotice`.
 */
export function ClientNoticeCard({
  message,
  backHref,
  backLabel,
  asHeading = false,
}: {
  message: string;
  backHref: string;
  backLabel: string;
  asHeading?: boolean;
}) {
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
        <Link href={backHref} className="link-button" data-variant="secondary" data-notice-back="">
          <UiIcon name="arrowL" size={16.5} />
          {backLabel}
        </Link>
      </div>
    </Card>
  );
}
