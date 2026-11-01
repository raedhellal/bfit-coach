import { CoachShell } from "@/components/shell/CoachShell";
import { Inbox } from "@/components/notifications/Inbox";
import { PageHead } from "@/components/ui/kit";
import { readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";
import { sessionSubjectTag } from "@/lib/sessionSubject";

/**
 * /notifications — EV-455f, the coach's inbox (story In scope 3 and 4).
 *
 * The page draws the frame (the shell, one `h1`) and hands the list to its island, `Inbox`, which
 * reads it through the BFF (`/api/bff/notifications`). The list is read in the browser, not in
 * this render, because everything after the first page is the island's anyway: « Charger plus »
 * follows the api's cursor, a click marks an item read, « Tout marquer comme lu » marks them all,
 * and the bell's count changes with each. One reader for every page of the list keeps its three
 * states (loading, error with « Réessayer », empty) in one place, and a failed read is retried
 * there without a reload (AC-9).
 *
 * `readCoachMe` is the identity cookie (EV-342k): no api call. The session subject is handed to
 * the island for its two writes (ADR-0033 D33.14 point 4). Nothing is cached (`force-dynamic`).
 */
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const copy = getCopy();
  const me = await readCoachMe();
  return (
    <CoachShell coachName={me?.displayName}>
      <PageHead title={copy.notifications.title} />
      <Inbox sessionSubject={sessionSubjectTag() ?? ""} />
    </CoachShell>
  );
}
