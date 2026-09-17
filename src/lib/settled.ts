/**
 * The one way this portal calls a server action from a client component.
 *
 * ⚠️ Measured, not assumed: when the request that carries a server action FAILS — a
 * 500, a dropped connection, a proxy in the way — Next's client **resolves the call
 * with `undefined`**. It does not reject. So the natural-looking `const result = await
 * xAction(); if (!result.ok)` throws a `TypeError` inside the transition, React hands
 * it to the route's error boundary, and the whole screen is replaced by "Something
 * went wrong." — taking every piece of un-submitted client state with it.
 *
 * In the routine editor that state is the coach's working copy of a trainee's plan,
 * which is the exact loss EV-190 U2 exists to prevent, arriving through the error path
 * instead of through a navigation. The catalogue search made it likelier still: it runs
 * behind a debounce on every keystroke, so one 500 while typing a search destroyed a
 * plan the coach had been editing for ten minutes.
 *
 * The boundary is therefore drawn at EVERY call site in the app rather than at the ones
 * whose loss we happened to notice: a failed action becomes the ordinary failure result
 * the component already knows how to render, and the component keeps its state.
 *
 * `next lint` cannot enforce this, so the rule is: **no `await …Action(` outside a
 * `settled(...)`**, which `grep -rn "await [a-zA-Z]*Action(" src/ | grep -v settled`
 * checks in one line.
 */
export async function settled<T extends { ok: boolean }>(
  call: Promise<T>,
  fallback: T
): Promise<T> {
  return (await call.catch(() => undefined)) ?? fallback;
}
