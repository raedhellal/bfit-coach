---
name: a-whole-representation-put-needs-a-required-nullable-type
description: b-fit-api's coach PUTs replace the whole record, so an omitted field is a silent wipe — type the request's fields required-and-nullable and build it in one place
metadata:
  type: project
---

`PUT /coach-portal/clients/{id}/progress-goal` (EV-202a) — and any coach-portal PUT
written the same way — is a **whole representation**: `{}` clears every value and
answers `200`. There is no audit trail and no previous value.

**Why it bites harder than it sounds:** the damage from a wiped field is often
*invisible*. A cleared `startedOn` falls back to the link date with
`startedOnSource: LINK_DEFAULT`, so the screen goes on showing **a plausible wrong
date** rather than a blank. Nobody notices.

**How to apply:**
- Type the request's fields as **required and nullable** (`startedOn: string | null`),
  never optional (`?:`). A call site that builds a body from "the field that changed"
  is then a compile error.
- Build the body in exactly ONE pure function that takes the current contents of every
  field. There is no "changed field" parameter to pass.
- Pin it twice: a unit-style assertion on `Object.keys(body)` in every branch, and a
  browser test that edits ONE field, saves, reloads and asserts the other survived.
  The second only works if the FIXTURE also clears what it is not sent — a forgiving
  fixture makes the whole property untestable.
- Render the fallback with its provenance ("…so this is the date the link was
  accepted"), which is what turns a silent wipe into a visible one.
- A 400 that means "nothing was written, including the field that travelled in the
  same body" needs its own sentence; collapsing it into a generic failure invites a
  retry of half the form. Related: [[coach-portal-reads-scopes-never-a-status]].
