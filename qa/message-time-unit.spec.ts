import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { formatLocalDateTime } from "../src/lib/format";

/**
 * BUG-934 — `formatLocalDateTime`, the Messages thread's time, in node (like messages-unit).
 *
 * Raed, 2026-10-25: « yes switch messages to local time ». A message's header reads the COACH's
 * clock, with no zone label: « 24 oct. 2026, 16:50 » in Paris for 14:50 UTC. The zone is passed
 * explicitly here so the result does not depend on the runner's `TZ`; the component passes none,
 * which is the browser's own zone.
 *
 * Expected strings are LITERALS. The date half keeps the portal's two pinned departures from ICU
 * (BUG-210 « Sep », BUG-491 « 1er »), which `formatInstant` has and this must not lose.
 */

const AT = "2026-10-24T14:50:00Z";

test.describe("BUG-934 formatLocalDateTime", () => {
  test("Paris (CEST, UTC+2): 14:50 UTC reads 16:50, no « UTC »", () => {
    expect(formatLocalDateTime(AT, "fr", "Europe/Paris")).toBe("24 oct. 2026, 16:50");
    expect(formatLocalDateTime(AT, "en", "Europe/Paris")).toBe("24 Oct 2026, 16:50");
  });

  test("New York (EDT, UTC−4): 10:50", () => {
    expect(formatLocalDateTime(AT, "fr", "America/New_York")).toBe("24 oct. 2026, 10:50");
    expect(formatLocalDateTime(AT, "en", "America/New_York")).toBe("24 Oct 2026, 10:50");
  });

  test("UTC: 14:50, still with no label", () => {
    expect(formatLocalDateTime(AT, "fr", "UTC")).toBe("24 oct. 2026, 14:50");
    expect(formatLocalDateTime(AT, "en", "UTC")).toBe("24 Oct 2026, 14:50");
  });

  test("the DATE is the local one too: 22:30 UTC is the next day in Paris, 24-hour clock", () => {
    expect(formatLocalDateTime("2026-10-24T22:30:00Z", "fr", "Europe/Paris")).toBe("25 oct. 2026, 00:30");
    expect(formatLocalDateTime("2026-10-24T22:30:00Z", "en", "Europe/Paris")).toBe("25 Oct 2026, 00:30");
    // West of UTC the day goes back: 02:00 UTC on 1 Oct is 22:00 on 30 Sep in New York.
    expect(formatLocalDateTime("2026-10-01T02:00:00Z", "en", "America/New_York")).toBe("30 Sep 2026, 22:00");
    expect(formatLocalDateTime("2026-10-01T02:00:00Z", "fr", "America/New_York")).toBe("30 sept. 2026, 22:00");
  });

  test("BUG-491's « 1er » and BUG-210's « Sep » survive on the LOCAL day", () => {
    // 23:30 UTC on 30 Sep is 01:30 on 1 Oct in Paris: the French first of the month.
    expect(formatLocalDateTime("2026-09-30T23:30:00Z", "fr", "Europe/Paris")).toBe("1er oct. 2026, 01:30");
    expect(formatLocalDateTime("2026-09-08T09:05:00Z", "en", "Europe/Paris")).toBe("8 Sep 2026, 11:05");
  });

  test("no zone given: the runtime's own (in the browser, the coach's)", () => {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(formatLocalDateTime(AT, "fr")).toBe(formatLocalDateTime(AT, "fr", zone));
  });

  test("an absent or unreadable instant is the portal's dash", () => {
    expect(formatLocalDateTime(null, "fr", "Europe/Paris")).toBe("—");
    expect(formatLocalDateTime("", "en", "Europe/Paris")).toBe("—");
    expect(formatLocalDateTime("not a date", "en", "Europe/Paris")).toBe("—");
  });
});
