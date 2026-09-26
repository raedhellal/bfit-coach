import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { recipePlacementOn } from "../src/lib/recipePlacement";

/**
 * EV-256e AC1, the half the fixture cannot reach: the fixture always serves a boolean,
 * so a page that read the flag FAIL-OPEN (`!== false`) would pass every browser test.
 * Production has the flag off, and an older api omits the field entirely — both must
 * hide the action. No browser, no server.
 */
test("only a literal true offers the action; absent, null and malformed values hide it", () => {
  expect(recipePlacementOn({ recipePlacementEnabled: true })).toBe(true);
  for (const value of [false, undefined, null, "true", 1, {}]) {
    expect(recipePlacementOn({ recipePlacementEnabled: value }), JSON.stringify(value) ?? "undefined").toBe(false);
  }
  expect(recipePlacementOn({})).toBe(false);
  expect(recipePlacementOn(null)).toBe(false);
});
