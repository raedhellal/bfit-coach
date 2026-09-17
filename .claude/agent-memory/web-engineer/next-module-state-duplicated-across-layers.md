---
name: next-module-state-duplicated-across-layers
description: Module-level state in a file reached from both a server component and a "use server" action is instantiated twice by Next 14 — writes and reads land in different copies
metadata:
  type: project
---

In Next.js 14 App Router, a module imported from **both** a server component and a
`"use server"` action file is compiled into two webpack layers and gets **two separate
instances**. Module-level `let` / `Map` state is therefore duplicated: the action writes
to one copy, the page render reads the other.

**Why this matters more than it sounds:** the symptoms are indistinguishable from product
bugs. In `b-fit-coach` this made a saved routine draft vanish on reload, a published plan
never appear, and a fixture's catalog outage invisible to the picker — three "defects"
with one cause, and each one looked like a state-management mistake in the component.

**How to apply:** any module with mutable state that is touched by a server action must
hang that state off `globalThis` under a `Symbol.for(...)` key (`Symbol.for` so a dev
hot-reload rebinds to the existing state instead of wiping it). This applies to
in-memory fixtures, caches and counters alike — see `src/lib/coachApi.fixture.ts`'s
`FIXTURE STATE` block for the shape. It is invisible to `tsc` and to `next lint`; only a
browser test that writes and then reloads catches it, which is an argument for writing
that test first. Related: [[coach-portal-fixture-mode]].
