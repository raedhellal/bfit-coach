/**
 * Moves a node process's wall clock by `QA_CLOCK_SHIFT_MS` milliseconds — the Playwright
 * runner, its workers AND the `next dev` server the fixture configs start — so a gate can
 * be run "at 00:30 Paris" at any real hour. Loaded with `NODE_OPTIONS="--import <this>"`;
 * with no `QA_CLOCK_SHIFT_MS` it does nothing.
 *
 * Why it exists: the night-time false reds (00:00–02:00 Europe/Paris, while the UTC date is
 * still the day before) were only ever seen by a gate that happened to cross midnight. A
 * fixture date or a spec expectation built on the wrong calendar is now reproducible at
 * noon. `qa/fixture-test.ts` moves the BROWSER by the same amount (Playwright's
 * `page.clock`), because this file reaches node only.
 *
 * Only `new Date()` with no argument and `Date.now()` move: a date built from a value is
 * that value. Shift FORWARD (to the next 00:30): a backward shift makes the session cookie
 * the server mints look already expired to the real-clock cookie jar.
 *
 *   QA_CLOCK_SHIFT_MS=$(node -e 'console.log(Date.parse(process.argv[1]) - Date.now())' 2026-10-04T00:30:00+02:00) \
 *   NODE_OPTIONS="--import ./qa/clock-shift.mjs" TZ=Europe/Paris npx playwright test …
 */
const shift = Number(process.env.QA_CLOCK_SHIFT_MS || 0);

if (Number.isFinite(shift) && shift !== 0) {
  const RealDate = globalThis.Date;
  /**
   * A function, not a class: `Date()` without `new` must return the (shifted) date string as
   * the real one does, and a class throws there. `Reflect.construct` keeps `new.target`, so a
   * subclass of Date still gets its own prototype; `instanceof Date` holds on every result.
   */
  function ShiftedDate(...args) {
    if (!new.target) return new RealDate(RealDate.now() + shift).toString();
    return Reflect.construct(RealDate, args.length === 0 ? [RealDate.now() + shift] : args, new.target);
  }
  Object.setPrototypeOf(ShiftedDate, RealDate); // Date.parse, Date.UTC
  ShiftedDate.prototype = RealDate.prototype;
  ShiftedDate.now = () => RealDate.now() + shift;
  globalThis.Date = ShiftedDate;
  process.stderr.write(`[clock-shift] pid ${process.pid}: now reads ${new ShiftedDate().toISOString()}\n`);
}
