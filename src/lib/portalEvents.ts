/**
 * The two EV-190 events that are only observable in the BROWSER.
 *
 * EV-181 (an analytics pipeline) is parked, and this story does not build one: the
 * analytics table in EV-190 says "structured log lines through the existing logger",
 * and api-side that is the api's logger. The portal has none, so this is it — one
 * JSON line per event, nothing sent anywhere, no vendor, no cookie, no identifier.
 *
 * What may NOT go in one of these: an exercise list, a meal name, an ingredient, an
 * allergy, a trainee's name or any free text they wrote (EV-190's own rule). The two
 * call sites pass counts and booleans only, and the type below is deliberately narrow
 * enough that adding a string property is a visible change rather than a slip.
 */
export type PortalEvent =
  | { event: "coach_targets_macro_mismatch"; delta_kcal: number; saved: boolean }
  | {
      event: "coach_unsaved_changes_prompted";
      route: "tabs" | "breadcrumb" | "back" | "unload";
      stayed: boolean;
    }
  /* ── EV-202b's three, from the story's own analytics table ────────────────
   *
   * ⚠ These carry two STRING properties where the two above carry none, and the
   * widening is deliberate rather than a slip. `coachId` and `clientId` are opaque
   * ids — the `coach_clients` row id and the coach's own id, both of which the coach's
   * browser is already holding — and EV-190's rule bans a trainee's NAME, an exercise,
   * a meal, an ingredient, an allergy or any free text they wrote. None of that can
   * reach these three lines: every other property is a boolean or a closed enum.
   *
   * `coachId` is NULLABLE, and null rather than a placeholder: `GET /coach-portal/me`
   * can fail, that read already degrades the header to a nameless one instead of
   * taking the page down, and an event still has to fire. A magic `"unknown"` in a
   * field typed as an opaque id is a value every future query has to know about; a
   * null is the absence it actually is.
   *
   * `coach_progress_bodyfat_absent` exists to be a KILL CONDITION, not a metric: EV-202
   * says in as many words that if it fires for nearly every trainee then the body-fat
   * half of this block is decoration and should be cut. It is the one event here whose
   * purpose is to argue for deleting the feature it measures.
   */
  | {
      event: "coach_progress_goal_set";
      coachId: string | null;
      clientId: string;
      hasStartDate: boolean;
      hasMilestone: boolean;
      changed: "start" | "milestone" | "both" | "cleared" | "unchanged";
    }
  | { event: "coach_progress_block_empty"; coachId: string | null; clientId: string }
  | { event: "coach_progress_bodyfat_absent"; coachId: string | null; clientId: string };

export function logPortalEvent(payload: PortalEvent): void {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(payload));
}
