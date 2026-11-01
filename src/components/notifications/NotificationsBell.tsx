"use client";

import { usePathname } from "next/navigation";
import Link from "@/components/ui/Link";
import { UiIcon } from "@/components/ui/icons";
import { useCopy } from "@/lib/i18n/client";
import { badgeText } from "@/lib/notifications";
import { useNotifications } from "./NotificationsProvider";

/**
 * EV-455f — the bell, in the shell of every signed-in page (story In scope 2, AC-1, AC-2, AC-10).
 *
 * A LINK to /notifications: it opens a page, so it is a link (Tab reaches it, Enter opens it),
 * not a button that would have to script a navigation.
 *
 * - Its NAME is the api's count: « Notifications, 3 non lues » / "Notifications, 3 unread", or
 *   « Notifications » at 0, and also while the count is loading or its read FAILED: then it claims
 *   no number at all (AC-9, never a false 0).
 * - Its BADGE is drawn `aria-hidden` (the name already says it): hidden at 0, `1`…`9`, then `9+`.
 * - `data-count-state` (`loading` | `known` | `failed`) and `data-unread-count` (when known) say
 *   which of those it is, so a failed read and a 0 are told apart by more than their look.
 */
export function NotificationsBell({ size = 20 }: { size?: number }) {
  const copy = useCopy();
  const pathname = usePathname();
  const { unread } = useNotifications();
  const count = unread.kind === "known" ? unread.count : null;
  const badge = count === null ? null : badgeText(count);
  const label = count === null ? copy.notifications.title : copy.notifications.bellLabel(count);
  return (
    <Link
      href="/notifications"
      className="shell-bell"
      aria-label={label}
      aria-current={pathname === "/notifications" ? "page" : undefined}
      data-count-state={unread.kind}
      data-unread-count={count ?? undefined}
    >
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        <UiIcon name="bell" size={size} />
      </span>
      {badge !== null && (
        <span className="shell-bell-badge" aria-hidden="true" data-badge={badge}>
          {badge}
        </span>
      )}
    </Link>
  );
}
