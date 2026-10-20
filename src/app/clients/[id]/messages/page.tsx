import { redirect } from "next/navigation";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientHeader, headerHasName } from "@/components/client/ClientHeader";
import { ClientNotice } from "@/components/client/ClientNotice";
import { MessageThread } from "@/components/messages/MessageThread";
import { coachApi, isForbidden, type CoachClientThread } from "@/lib/coachApi";
import { isClientId, readClientOverview, readCoachMe } from "@/lib/clientOverview";
import { firstName } from "@/lib/format";
import { getCopy } from "@/lib/i18n/server";
import { asThread } from "@/lib/messages";
import { sessionSubjectTag } from "@/lib/sessionSubject";

/**
 * /clients/[id]/messages — EV-095b « Messages »: the coach's thread with one client, under the
 * client's name (AC-B1), and a composer.
 *
 * The frame is the other tabs': one `h1`, the client's name, from `ClientHeader`; the tab's `h2`.
 *
 * Reads, on the server, in parallel: the overview (the layout's 403 decision, repeated for a tab
 * change, BUG-671), the coach's name, and the thread's latest page
 * (`GET /coach-portal/clients/{id}/messages`). Messaging needs an ACTIVE link and NO data scope
 * (ADR-0038 S3, D-CHAT-2), so no scope gates this page or its read. A 403 from the thread read is
 * the link ending: the denial page. Any other failure of it is the thread's own load notice, with
 * the composer still drawn: the island's poll replaces the notice on its first good read.
 *
 * Everything after this render is the island's (`MessageThread`), through the BFF route handlers,
 * never a server action (ADR-0038 D38.1): the visibility-bound poll (AC-B3), the sends (AC-B5) and
 * the mark-read that clears the roster's dot (AC-B4).
 *
 * Nothing here is cached (`force-dynamic`): a revoked link must 403 on the next request.
 */
export const dynamic = "force-dynamic";

export default async function MessagesPage({ params }: { params: { id: string } }) {
  const copy = getCopy();
  // BUG-600: a segment that is not a UUID asks the api nothing (the layout denies it).
  const valid = isClientId(params.id);
  const threadRead = valid
    ? coachApi.getMessages(params.id).then(
        (value): { ok: true; thread: CoachClientThread | null } => ({ ok: true, thread: asThread(value) }),
        (err): { ok: false; forbidden: boolean } => ({ ok: false, forbidden: isForbidden(err) })
      )
    : null;
  const [me, { overview, forbidden }] = await Promise.all([readCoachMe(), readClientOverview(params.id)]);
  if (forbidden || !valid) redirect("/clients/denied");
  const read = threadRead ? await threadRead : null;
  if (read && !read.ok && read.forbidden) redirect("/clients/denied");

  const trainee = overview ? { traineeDisplayName: overview.traineeDisplayName } : null;
  const first = firstName(overview?.traineeDisplayName, copy.locale);
  const initial = read?.ok ? read.thread : null;

  return (
    <CoachShell coachName={me?.displayName} section="roster">
      <ClientHeader clientId={params.id} trainee={trainee} since={overview?.since} active="messages" />
      <h2 className="nut-title">{copy.messages.title}</h2>
      {/* The overview failed: the name is unknown, the tab says so (as its siblings do). */}
      {!overview && <ClientNotice message={copy.client.loadError} asHeading={!headerHasName(trainee)} />}
      <MessageThread
        // A new client is a new island (BUG-739: a path-segment change remounts anyway).
        key={params.id}
        clientId={params.id}
        sessionSubject={sessionSubjectTag() ?? ""}
        firstName={first}
        initial={initial}
      />
    </CoachShell>
  );
}
