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
    };

export function logPortalEvent(payload: PortalEvent): void {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(payload));
}
