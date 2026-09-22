# Memory index

- [Coach portal is a fourth surface](coach-portal-surface.md) — b-fit-coach / Evoli Pro on :3300, mine to build, not in the hub's four-surface table
- [Fixture mode](coach-portal-fixture-mode.md) — COACH_API_MODE=fixture, scenario selected by trainee id, Playwright needs workers:1
- [Next duplicates module state across layers](next-module-state-duplicated-across-layers.md) — server-action writes and page reads hit different copies; use globalThis + Symbol.for
- [Client islands go stale after a server write](client-islands-go-stale-after-a-server-write.md) — router.refresh() updates props, not useState; re-seed on identity change
- [Stories carry verbatim copy](stories-carry-verbatim-copy.md) — EV-* ACs are final sentences QA checks character by character; omissions are deliberate too
- [Worktrees have no node_modules; spec:sync](coach-portal-node-modules-and-spec-sync.md) — resolution walks up to the main checkout; vendor the spec and raise SCHEMAS_EXPECTED
- [A card located by its text asserts nothing](a-card-located-by-its-text-asserts-nothing.md) — div-filtered-by-text finds the title; give blocks a named landmark
- [Copy for a capability that does not exist](copy-for-a-capability-that-does-not-exist.md) — delete the label, guard the concept not one spelling
- [The portal reads scopes, never a status](coach-portal-reads-scopes-never-a-status.md) — one block can 403 while the page is 200; blocks need the endpoint's scope AND their own
