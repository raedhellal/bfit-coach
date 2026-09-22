---
name: an-island-must-re-seed-from-props-not-from-its-own-save
description: A client island that compares incoming props against the value it last SAVED undoes its own write for the few hundred ms before router.refresh() lands
metadata:
  type: project
---

The re-seed guard that keeps a client island from going stale
([[client-islands-go-stale-after-a-server-write]]) has a wrong version that looks
identical and is worse than no guard at all:

```
// WRONG — `seen` is set from the action's RESPONSE
if (sig(props) !== seen) { setSeen(sig(props)); reseed(props); }
```

After a save, the island's state is AHEAD of the server's props — the route has not
re-rendered yet. Comparing against what it saved makes every prop signature "new", so
the island **re-seeds itself back to the pre-save values**, then forward again when the
refresh lands. In EV-202b's progress form the observable symptom was: save, start
typing, and ~300 ms later the keystrokes vanish. A Playwright spec that saved and then
filled a field had its input silently reverted, and the failure read as "the save did
not happen".

**How to apply:**
- The state variable tracks **the last prop this island was given**, never the last
  value it wrote. Then props being stale is a no-op and a genuine server change
  re-seeds.
- Ask whether the refresh is needed at all. If the write's response IS the new
  representation (a PUT that answers the recomputed block), the island already holds
  the truth; `revalidatePath` in the action covers the next navigation, and dropping
  `router.refresh()` removes the re-seed window entirely. Keep the refresh for
  `ACCESS_DENIED`, where the point is to re-run the layout and reach the denial
  redirect.
