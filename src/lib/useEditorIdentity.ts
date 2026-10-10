"use client";

import { useCallback, useState } from "react";

/**
 * BUG-739 — which record an editor island is editing, when the URL no longer decides it.
 *
 * `/recipes/new` and `/recipes/{id}` (same for templates) are rewritten onto ONE route,
 * `/x/editor?id=…` (`next.config.mjs`). Next 14.2 keys a page by its segment without the search
 * params, so the editor stays mounted when its id changes. That is the point: a create corrects
 * the URL to `/x/{id}` and the next update's revalidating render arrives as new props for the
 * SAME island, so a rename typed during « Saving… », the saved notice and the leave guard all
 * survive. Before, `new/` and `[id]/` were two segments and that render re-mounted the editor.
 *
 * The cost: ANY soft navigation between two editor URLs now keeps the instance too. Without this
 * rule a `router.push("/recipes/B")` from A's editor showed A's draft under B's heading, and Save
 * on B's page POSTed to `/recipes/<B>` carrying A's id: A was renamed and B left unchanged (staff's
 * P4 + BUG-739 review probe, a never-re-key mutant, both engines). The editors seed their state
 * from props once, so the island has to be re-keyed when the record changes.
 *
 * The rule: the caller keys its inner editor by `gen`. `gen` moves when the id PROP changes, unless
 * the new prop is the id the editor itself `adopt`ed. A create calls `adopt(id)`, so the
 * `null` → `id` that its own next update brings is NOT a new record. `A` → `B`, `A` → `null` (New)
 * and a `null` → `A` nobody adopted are.
 *
 * Set during render, compared against stored state: React's "storing information from previous
 * renders" pattern. StrictMode's double render is idempotent (the second pass sees `prop` equal).
 * An effect would commit one frame of the old draft under the new record.
 *
 * NOT covered, stated: a DIRTY editor left by a programmatic navigation is not guarded. The leave
 * guard sees anchor clicks and Back only, and the re-keyed instance's cleanup hands its history
 * entry back. That is the same as any unmount-while-dirty today. No such navigation exists in the
 * portal (every link into an editor is on a list, a sheet or a picker, never on an editor page).
 */
export function useEditorIdentity(propId: string | null): { gen: number; adopt: (id: string) => void } {
  const [state, setState] = useState<{ prop: string | null; adopted: string | null; gen: number }>({
    prop: propId,
    adopted: null,
    gen: 0,
  });
  let current = state;
  if (propId !== state.prop) {
    const same = propId !== null && propId === state.adopted;
    current = { prop: propId, adopted: same ? state.adopted : null, gen: same ? state.gen : state.gen + 1 };
    setState(current);
  }
  const adopt = useCallback((id: string) => setState((s) => ({ ...s, adopted: id })), []);
  return { gen: current.gen, adopt };
}
