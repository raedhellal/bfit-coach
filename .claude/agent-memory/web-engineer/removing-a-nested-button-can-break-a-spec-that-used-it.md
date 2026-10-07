---
name: removing-a-nested-button-can-break-a-spec-that-used-it
description: BUG-616 — qa/pro-back-link.spec.ts told BackLink from ClientNotice's link by "has no <button>"; flattening the notice made the count 2. Grep specs for locator("button") first
metadata:
  type: project
---

When a `<Link><Button>` becomes one `.link-button` link, any spec that used the inner
`<button>` as a DISCRIMINATOR breaks by count, not by text. On 2026-10-07
`qa/pro-back-link.spec.ts` filtered `getByRole("link", { name }).filter({ hasNot: button })`
to skip ClientNotice's « Retour aux clients » on the "not yours" pages; after BUG-616 both
links matched (2/2 red). It now excludes `.link-button`.

**Why:** a fix that removes invalid markup also removes whatever a guard leaned on to tell
two same-named controls apart.

**How to apply:** before flattening nested controls, `grep -n 'locator("button")' qa/*.ts`
and run every spec that names the control's label in both languages. Two same-named links
on one page need a structural tell (class or landmark), never "the other one has a button".
See [[a-card-located-by-its-text-asserts-nothing]].
