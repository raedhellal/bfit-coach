# Memory index

- [Coach portal is a fourth surface](coach-portal-surface.md) — b-fit-coach / Evoli Pro on :3300, mine to build, not in the hub's four-surface table
- [Fixture mode](coach-portal-fixture-mode.md) — COACH_API_MODE=fixture, scenario selected by trainee id, Playwright needs workers:1
- [Next duplicates module state across layers](next-module-state-duplicated-across-layers.md) — server-action writes and page reads hit different copies; use globalThis + Symbol.for
- [Client islands go stale after a server write](client-islands-go-stale-after-a-server-write.md) — router.refresh() updates props, not useState; re-seed on identity change
- [Stories carry verbatim copy](stories-carry-verbatim-copy.md) — EV-* ACs are final sentences QA checks character by character; omissions are deliberate too
