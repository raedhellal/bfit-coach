---
name: identity compared before the server's normalisation
description: client decides "same request" (idempotency key reuse) on raw text while the server compares normalised text
type: feedback
---
EV-095b AC-B7: the portal reused `clientMessageId` only on raw-equal text; the api compares after
Java `String.strip()` (MessageBody.java:32, MessageThreadService.java:84). A whitespace-only edit
after a lost answer took a new id -> duplicate message. Fix (1bd10bb): `javaStrip` in
src/lib/messages.ts, verified exhaustively vs `Character.isWhitespace` over all code points (0 diffs).

**Why:** JS `trim()` != Java `strip()` != Java `trim()` (NBSP/U+2007/U+202F/U+FEFF kept by strip,
U+001C..U+001F stripped by it). Three rules in one repo (`javaTrim` in addClient.ts is trim()).
**How to apply:** any client-side "same as before?" check must use the server's exact normaliser;
verify with a jshell enumeration diff, not a sample list. Also check the fixture uses the same one.
