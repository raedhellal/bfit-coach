---
name: create-to-edit-by-replacestate-remounts-on-next-save
description: BUG-735 review — template/recipe creates become edits with a raw replaceState (history.state carries __NA, so Next's patch passes it through); Next still thinks it is on /new, and the FIRST revalidating update afterwards re-renders the [id] segment and remounts the editor — late edit and "saved" notice gone, Back unasked. Pre-existing; a fix's spec that only loads /{id} directly cannot see it.
metadata:
  type: feedback
---

**The pattern.** `TemplateEditor`/`RecipeEditor` turn a create into an edit WITHOUT a router
navigation: `release(() => { setId(id); history.replaceState(history.state, "", "/x/{id}") }, "stays")`.
`history.state` holds Next's `__NA`, so Next 14.2's patched `replaceState`
(`app-router.js` ~447-451) passes it straight through and never learns the URL. `app/x/new/page.tsx`
and `app/x/[id]/page.tsx` are different segments, so the next update action's revalidated render
swaps the segment and REMOUNTS the island. Measured 2026-10-09 (b-fit-coach, BUG-735 review at
`ec66662`, base `d717e57` identical): after a clean create, the first update's answer drops the
expando I set on the name input (`sameInput: false`), "Recipe saved."/"Template saved" is gone 1.5 s
later, a keystroke typed during « Saving… » is lost with no badge, and Back leaves with no
question (the old guard's unmount cleanup steps its sentinel back). It also leaves a forward
history entry at `/x/new`. Direct-load updates (`/x/{id}` opened from the list) do not remount.

**Why it matters for reviews:** BUG-735's fix and spec were green on "update" (direct load) and
"create" (the create itself) and still lose the late edit on create→update, the commonest real
sequence. The comment "with a late edit the sentinel stays where it is" is false on that path.

**How to apply:** for any editor fix in b-fit-coach, run the create→first-update sequence as its
own case. Witness a remount with an expando on a field (`el.__staff = 1` before, read after), not
by value: the server echo can equal the typed value. Other facts from the same review:
Playwright WebKit 2359 HAS the Navigation API (`navigation.currentEntry.index` works there);
a Back/Leave during an in-flight action marks it discarded (`action-queue.js` ~121) but the
caller's promise still resolves, so editor callbacks run after unmount — probe that interleaving.
Related: [[continuation-presence-is-not-intent]], [[collapsible-form-close-branch-unwitnessed]].
