import { CoachShell } from "@/components/shell/CoachShell";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { BackLink } from "@/components/ui/BackLink";
import { PageHead } from "@/components/ui/kit";
import { readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";
import { sessionSubjectTag } from "@/lib/sessionSubject";

/**
 * /settings/notifications — EV-455k, the coach's email settings: the URL every EV-455i/j email
 * footer names (« Les gérer : {portal}/settings/notifications »), reached in the portal from the
 * inbox header (« Réglages »).
 *
 * The page draws the frame (the shell, a back link to the inbox, one `h1`, the story's intro
 * sentence) and hands the switches to their island, `NotificationSettings`, which reads and
 * writes them through the BFF (`/api/bff/notification-preferences`). Read in the browser, not in
 * this render: the island's comment says why (the router cache would replay a stale position).
 *
 * Signed out, the middleware's guard sends the request to /login before this runs (AC-4).
 * `readCoachMe` is the identity cookie (EV-342k): no api call. The session subject is handed to
 * the island for its writes (ADR-0033 D33.14 point 4). Nothing is cached (`force-dynamic`).
 */
export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const copy = getCopy();
  const me = await readCoachMe();
  return (
    <CoachShell coachName={me?.displayName}>
      <BackLink href="/notifications" label={copy.notifications.title} flush />
      <PageHead title={copy.notificationSettings.title} sub={copy.notificationSettings.intro} />
      <NotificationSettings sessionSubject={sessionSubjectTag() ?? ""} />
    </CoachShell>
  );
}
