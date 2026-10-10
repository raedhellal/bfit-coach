---
name: read-not-measured-label-is-not-a-reading-check
description: A "read, not measured" comment can still be inverted - BUG-739's router.replace rationale named the wrong history entry; a one-line mutant + navigation.entries() dump settles it in minutes
metadata:
  type: feedback
---

A comment honestly labelled "read from source, not measured" still owes a reading check, and a probe
cited for a two-part claim may witness only one part.

**Why:** BUG-739 (2026-10-11, `TemplateEditor.tsx:192-195` @6fe19fc). The comment said `router.replace`, which
writes history at commit after the guard's sentinel push, "so that entry [the guard's] would keep `/new`".
Measured with a one-line mutant (create uses `router.replace`) and a `navigation.entries()` dump:
the commit `replaceState`s the CURRENT entry. That is the guard's entry: it gets `/{id}` and loses
`evoliUnsavedGuard`, because navigate sets `preserveCustomHistoryState=false`. The page's own entry
underneath keeps `/new`. In the same review, `useEditorIdentity.ts` cited "staff's probe P4" for "showed A's
draft AND Save wrote A". P4 never saved. The save half needed its own mutant run: the POST went to
`/recipes/<B>` carrying A's id.

**How to apply:** for any history-entry or URL-order claim in prose, run the mutant and dump
`navigation.entries()` plus `Object.keys(history.state)`. It costs one dev server and about 5 minutes. For a cited
probe, check that the probe's output contains every clause the sentence hangs on it.
Related: [[defect-pattern-cited-seam-does-not-exist]], [[harmless-variant-falsifies-the-coverage-claim]].
