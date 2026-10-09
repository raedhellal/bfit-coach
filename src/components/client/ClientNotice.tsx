import { ClientNoticeCard } from "@/components/client/ClientNoticeCard";
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
 *
 * BUG-629: the markup is `ClientNoticeCard`, which the client error boundary draws too.
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
  return (
    <ClientNoticeCard
      message={message}
      backHref={back?.href ?? "/"}
      backLabel={back?.label ?? copy.shell.backToRoster}
      asHeading={asHeading}
    />
  );
}
