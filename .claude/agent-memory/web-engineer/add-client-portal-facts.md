---
name: add-client-portal-facts
description: EV-204b « Ajouter un client » (2026-10-03) — what the coach-trainee initialisation api does and does not give the portal, the fixture switches and mail sink, and the copy/AC gaps that are Raed's or senior-po's
metadata:
  type: project
---

EV-204b (branch `feat/ev204b-coach-adds-trainee`, off `release/coach-held-merges` 474d2fd)
built « Ajouter un client » against b-fit-api `CoachTraineeInitialisationController`
(EV-204a2, merged 6cb2289, live at 2bf3b42). The vendored spec at c82e55b already carried the
four schemas, unchanged on 2bf3b42, so no re-vendor was needed.

**Why:** these are api constraints and gaps a later story will trip on, not things the code
states in one place.

**How to apply:**
- **There is no `GET /coach-portal/trainees/{id}`.** `/invited/[userId]` finds its row in the
  whole list (`src/lib/invited.ts`, every page, React `cache`). The list excludes activated AND
  expired accounts (no tombstone, D22.10d), so an Invited person who ACTIVATES disappears from
  the coach's view until they accept the nomination in the app — the portal cannot show
  "activated, not linked yet" (no read for it).
- **The `{id}` is a USER id**, the one place the portal addresses one: an Invited person has no
  `coach_clients` row (Ruling 2). They are not a roster group; nothing that counts clients
  (meter, nav count, filters, search) sees them — `qa/coach-add-client-roster.spec.ts` pins it.
- **Initialise does NOT check capacity** (no link is made); accept does
  (`NominationUseCase` skips the pre-check). A full plan keeps « Ajouter un client » enabled with
  `addClient.capacityNote`; the LINK invite is still capacity-refused.
- Refusal order: 400 (bean validation) → 503 `ACCOUNT_INITIALISATION_UNAVAILABLE` → 429 (30 an
  hour per coach, EVERY call charged, 409s included) → 409 `COACH_PROFILE_REQUIRED` → 409
  `ACCOUNT_EXISTS` (active and pending, one answer, no details). Resend: 503 → 429 (5 an hour
  per account) → 404 `PENDING_ACCOUNT_NOT_FOUND`. Withdraw: 404 only. Map by code.
- **The email's language is `locale` (en/fr only)** and the api does not store it, so Resend
  asks again (`EmailLanguageField`).
- **AC-P18's "link to the profile" cannot be built**: no coach-profile page in the portal and
  no endpoint to edit `coach_profiles.display_name` anywhere. The refusal says write to
  support@evoli.fit instead. Live, P18 is only reachable with a BLANK display name (a coach with
  no profile row gets 403 on `GET /coach-portal/me`, so the roster never loads).
- **AC-P11's control has no enabled state anywhere**: there is no coach measurement write on
  the api at all (EV-202 Ruling 1). The copy says nothing is recorded before consent and that
  the trainee enters their own; it deliberately does not say "until activation". A PO question.
- **No addressed invite exists** (`invited_email` was the pre-ADR-0022 shape, never built):
  the ACCOUNT_EXISTS branch opens the link/QR panel (`InviteLinkPanel`, shared with
  `InviteButton`), and the copy says "share a link", never "we emailed them".
- Fixture: `invited` map (hidden seeds only: expired `lapsed.invite@`, activated, another
  coach's), mail sink `GET /api/fixture/mail` WITH the temporary password (so P9 can prove it
  absent elsewhere). Switches: `evoli_fixture_initialise=unavailable|throttled|profile_required|fail`
  (`fail` writes, then 500 = unknown outcome), `evoli_fixture_invitation_write=unavailable|
  throttled|gone|fail` (`gone` ACTIVATES first, so the list drops the row like the api's),
  `evoli_fixture_invited_read=fail`. Existing addresses: `deja.client@example.com`, the seeded
  `coach@`/`user@`/`admin@evoli.fit`, every EV-278c pending account.
- Live: `BFIT_MAIL_ENABLED=false` makes `LoggingMailSender` log each invitation body, password
  included (`\n\n    <16 chars>\n`); `qa/coach-add-client.live.spec.ts` reads it via
  `EV204B_API_LOG`. Without `BFIT_OBJECTION_INBOX` every initialise/resend is 503.
- The Write tool and a bash heredoc both turned the escapes for U+2014, U+202E, U+200C and U+00A0 (backslash-u + hex) into
  literal characters again — scan every written file ([[unicode-escapes-in-written-source]]).

See [[activation-portal-facts]], [[coach-portal-fixture-mode]], [[stories-carry-verbatim-copy]].
