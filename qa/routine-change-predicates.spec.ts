import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { rosterPlanChanged, traineeChangeNotice } from "../src/lib/routineChange";

/** EV-283b — the two predicates behind the banner and the roster marker. */

/**
 * The portal's one date format (en-GB, UTC — `src/lib/format.ts`), built here from
 * `Intl` directly rather than imported, so a change to the portal's formatter is not
 * agreed with by construction. ICU spells September "Sept" in en-GB today and the portal
 * pins it to "Sep" (BUG-210), which is the one rewrite applied here.
 */
const onDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(iso))
    .replace(/\bSept\b/, "Sep");

const YUSUF_SENTENCE = `Yusuf changed this plan on ${onDay("2026-09-24T18:40:00Z")} (UTC). You're seeing their version.`;

/**
 * The half the fixture cannot reach: it always sends the fields, so a page that read
 * them fail-open would pass every browser test in
 * `coach-routine-changed.spec.ts`. An api that predates EV-283a
 * sends neither field (and the `legacy-api.mjs` stub is exactly that api), so absent,
 * null and anything that is not the literal enum must render nothing. No browser.
 */
test("only a literal TRAINEE with a readable instant makes a sentence", () => {
  const at = "2026-09-24T18:40:00Z";
  expect(traineeChangeNotice({ lastChangedBy: "TRAINEE", lastChangedAt: at }, "Yusuf A.", en)).toBe(
    YUSUF_SENTENCE
  );
  // The first name is the first word of the display name, whatever follows it.
  expect(traineeChangeNotice({ lastChangedBy: "TRAINEE", lastChangedAt: at }, "  Yusuf  ", en)).toBe(
    YUSUF_SENTENCE
  );
  for (const by of ["COACH", null, undefined, "trainee", 1, {}]) {
    expect(
      traineeChangeNotice({ lastChangedBy: by, lastChangedAt: at }, "Yusuf A.", en),
      JSON.stringify(by) ?? "undefined"
    ).toBeNull();
  }
  for (const when of [null, undefined, "", "not a date"]) {
    expect(
      traineeChangeNotice({ lastChangedBy: "TRAINEE", lastChangedAt: when }, "Yusuf A.", en),
      JSON.stringify(when) ?? "undefined"
    ).toBeNull();
  }
  expect(traineeChangeNotice({}, "Yusuf A.", en)).toBeNull();
  expect(traineeChangeNotice(null, "Yusuf A.", en)).toBeNull();
});

test("only a literal true puts the Plan changed marker on a roster row", () => {
  expect(rosterPlanChanged({ routineChangedSinceYourPublish: true })).toBe(true);
  for (const value of [false, null, undefined, "true", 1, {}]) {
    expect(
      rosterPlanChanged({ routineChangedSinceYourPublish: value }),
      JSON.stringify(value) ?? "undefined"
    ).toBe(false);
  }
  expect(rosterPlanChanged({})).toBe(false);
});
