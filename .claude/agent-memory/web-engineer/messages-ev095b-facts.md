---
name: messages-ev095b-facts
description: EV-095b « Messages » (2026-10-20) — where the thread lives, the api shapes it consumes, the poll/cursor/idempotency rules, the fixture rigs, and the traps hit
metadata:
  type: project
---

`feat/ev095b-coach-messages` (b-fit-coach, off 385d960). First vendored from the UNMERGED api
branch `feat/ev095-coach-messaging` @ 69697c38 (`on-api-main: NO`); EV-095a merged to api main
(0507b3be) the same day, `qa/api-merge-condition.spec.ts` went red on the stale NO exactly as
designed, and the spec was re-synced from 0507b3be (`on-api-main: YES`). Merged is not deployed:
the story's gate is still the api's `/actuator/info` (unreachable from the cloud container).
Check `git -C b-fit-api merge-base --is-ancestor <sha> origin/main` after `git fetch` before
trusting a NO you wrote hours ago.

**Where:**
- `src/app/clients/[id]/messages/page.tsx` (server: overview + `getMessages` in parallel, depth 1);
  `src/components/messages/MessageThread.tsx` (island: poll, send, mark read, older page).
- `src/lib/messages.ts` (client-safe, pure: cadence, `normaliseNewlines`, `draftProblem`,
  `asThread`/`asMessage`, `threadOutcome`/`sendOutcome`, paths). Unit: `qa/messages-unit.spec.ts`.
- BFF: `src/app/api/bff/clients/[id]/messages/route.ts` (GET `?after|before`, POST send) and
  `…/messages/read/route.ts` (POST `{seq}`). Never server actions (ADR-0038 D38.1).
- Roster dot: `(roster)/page.tsx` reads `listMessageUnread()` beside the roster (settled: a
  failure costs the dots only); `RosterRows.tsx` `unread` prop, wrapper only on unread rows.
- `ClientTabs` gained `{ key: "messages", path: "/messages" }` (no scope).

**API shapes (EV-095a):** GET → `CoachClientThread {threadState, canSend, lastSeq, unread,
hasOlder, hasMore, messages[CoachClientMessage{id, seq, author COACH|TRAINEE, body, sentAt}]}`;
POST `{clientMessageId uuid, body}` → 201 stored / 200 same-body replay `{message, lastSeq}`;
400 VALIDATION_ERROR|INVALID_REQUEST, 409 MESSAGE_ID_REUSED, 429 MESSAGE_RATE_LIMIT + Retry-After
(1..3600), 403 COACH_ACCESS_DENIED; `/messages/read {seq}` → 204; `GET /coach-portal/messages/unread`
→ `[{clientId, count>0}]`. `MESSAGING_CLOSED` is trainee-only (coach gets 403).

**Rules that are easy to break:**
- The poll cursor moves only to the last seq of a page READ, or to a sent seq == cursor+1. Taking
  a send's `lastSeq` as the cursor skips a client message written between the last poll and the send.
- `clientMessageId` is bound to the TEXT: same text → same id (a lost answer retried is the api's
  replay, witnessed with `evoli_fixture_messages_send=lost`); new text or a 409 → new id.
- `crypto.randomUUID` is secure-context only; `newMessageId()` falls back to getRandomValues.
- Mark read only while visible; a page loaded hidden marks on its first read after showing.
- Bidi: body `<p dir="auto">` + `unicode-bidi: plaintext`, author/time in a separate element.

**Rigs:** `evoli_fixture_messages_read=fail`, `_send=fail|lost|ratelimit`, `_unread=fail`;
`POST /api/fixture/messages {clientId, body}` is the client writing; `GET ?clientId=` shows both
read positions. Seeds: Yusuf 2 messages / 1 unread (the roster dot), Dana 55 read (older page).

**Traps:** the Write tool landed `‮`, ` `, `ㅤ`… as LITERAL characters in about half
the places (see [[unicode-escapes-in-written-source]]) — scan Cc/Cf/Zs after every write. WebKit
cannot be installed in the cloud container (cdn.playwright.dev is 403 at the proxy); Chromium 1194
must be dressed as 1243 with a symlinked `PLAYWRIGHT_BROWSERS_PATH`. The default suite is 2,530
tests: run a targeted list, not the whole thing, when the clock matters.
🔴 **Stopping a run: kill the RUNNER by pid** (`ps -eo pid,args | grep "playwright test"`). A
`pkill -f "playwright test …"` with the quoted pattern missed it; killing only its `next dev` let
the old runner carry on against the NEXT run's server on the same port, and its per-test store
resets turned ~33 unrelated tests red (journal counts of −1, `pristine: false` in node-only specs).
Those reds are the rig, not the product: a negative journal delta is the tell.

Related: [[intake-interview-341b-facts]], [[coach-portal-fixture-mode]], [[coach-portal-node-modules-and-spec-sync]].
