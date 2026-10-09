---
name: unnamed-trainee-is-absent-not-unknown
description: traineeDisplayName is string|null on the wire (BUG-714); fullNameOf for full-name slots, firstName gets the RAW value; a failed read is null input, never ""; fixture __null__ switch
metadata:
  type: project
---

The api's `displayNameOf` passes `users.full_name` through, so a trainee registered with no name arrives as
`traineeDisplayName: null` on the roster, overview AND nutrition reads, although the vendored openapi marks only
the nutrition one `nullable` (roster and overview say plain `string`: the spec lies, a java-engineer item).
Before BUG-714 (fix 174f57c, 2026-10-09) one such trainee crashed the whole roster (`Avatar` `null.split`).

Rules now in b-fit-coach: `src/lib/traineeName.ts` `fullNameOf(raw, copy)` gives "Unnamed client" / « Client sans
nom » (`copy.challenges.unnamed`) for null/""/whitespace, used for every FULL-name slot and sentence. `firstName()`
must get the RAW value: `firstName("Unnamed client")` is "Unnamed", not "This trainee". `Avatar unnamed` draws the
person glyph; Avatar deliberately does NOT infer the glyph from a null name (it draws no letters instead), so a
caller that passes the raw null is a visible defect, which is what QA's mutant needs to go red.

**Why:** "name unknown" (the read failed, BUG-713) and "name absent" (read succeeded, NULL) both used to reach
`ClientHeader` as `""`. The ruling (714-R1) shows the label only in the second case.

**How to apply:** pass the READ (`trainee={overview}`, null = failed) rather than a string wherever both cases can
occur. Fixture: `evoli_fixture_display_name=<clientId>:__null__` serves JSON null, `:%20%20` a blank name; the
fixture's roster sort runs after the served name, so it must stay null-safe. Spec:
`qa/pro-roster-unnamed-client.spec.ts` (roster config). See [[client-header-name-slot-is-the-h1]].
