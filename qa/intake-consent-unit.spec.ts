import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { intakeRequestEnabled } from "../src/lib/intakeRequestGate";
import {
  INTAKE_REQUEST_TTL_MS,
  asIntakeStatus,
  intakeConsentPath,
  liveForMs,
  pollOutcome,
} from "../src/lib/intakeConsent";

/**
 * EV-341w — the « Entretien » card's pure parts, in node: the release-hold switch, the read's
 * body guard, the deadline arithmetic and the poll's classification. The browser half is
 * `intake-consent.spec.ts`.
 */

test.describe("the release hold (COACH_INTAKE_REQUEST)", () => {
  test("is ON for exactly `on`, and OFF for absent, empty and every near miss", () => {
    expect(intakeRequestEnabled("on")).toBe(true);
    for (const raw of [undefined, null, "", "ON", "On", " on", "on ", "true", "1", "yes", "enabled", "off"]) {
      expect(intakeRequestEnabled(raw), `COACH_INTAKE_REQUEST=${JSON.stringify(raw)}`).toBe(false);
    }
  });
});

test.describe("the read's body", () => {
  test("is accepted only as exactly two booleans", () => {
    expect(asIntakeStatus({ granted: false, pending: true })).toEqual({ granted: false, pending: true });
    expect(asIntakeStatus({ granted: true, pending: false })).toEqual({ granted: true, pending: false });
    for (const body of [
      null,
      undefined,
      "granted",
      [],
      [true, false],
      {},
      { granted: true },
      { pending: false },
      { granted: "true", pending: false },
      { granted: 1, pending: 0 },
      { granted: null, pending: null },
    ]) {
      expect(asIntakeStatus(body), JSON.stringify(body)).toBeNull();
    }
  });

  test("drops any third field instead of carrying it to the card (PR12: no reason on the wire, none here)", () => {
    expect(asIntakeStatus({ granted: false, pending: false, closedReason: "DISMISSED" })).toEqual({
      granted: false,
      pending: false,
    });
  });
});

test.describe("how long a request made now stays live", () => {
  test("is the difference of the 201's own two instants, never the browser's clock", () => {
    expect(liveForMs("2026-10-12T10:00:00Z", "2026-10-12T10:15:00Z")).toBe(15 * 60 * 1000);
    expect(liveForMs("2026-10-12T10:00:00.000Z", "2026-10-12T10:00:06.000Z")).toBe(6_000);
  });

  test("falls back to the api's 15 minutes on anything unusable, and never exceeds them", () => {
    for (const [a, b] of [
      [undefined, undefined],
      ["2026-10-12T10:00:00Z", null],
      ["not a date", "2026-10-12T10:15:00Z"],
      ["2026-10-12T10:15:00Z", "2026-10-12T10:00:00Z"],
      ["2026-10-12T10:00:00Z", "2026-10-12T10:00:00Z"],
    ] as const) {
      expect(liveForMs(a, b), `${a} → ${b}`).toBe(INTAKE_REQUEST_TTL_MS);
    }
    expect(liveForMs("2026-10-12T10:00:00Z", "2026-10-12T12:00:00Z")).toBe(INTAKE_REQUEST_TTL_MS);
  });
});

test.describe("a poll's outcome", () => {
  test("a 200 with the two booleans is the answer; a malformed 200 is a failed read, never an answer", () => {
    expect(pollOutcome(200, "basic", { granted: true, pending: false })).toEqual({
      kind: "status",
      status: { granted: true, pending: false },
    });
    expect(pollOutcome(200, "basic", "<html>login</html>")).toEqual({ kind: "failed" });
    expect(pollOutcome(200, "basic", null)).toEqual({ kind: "failed" });
  });

  test("the middleware's redirect to /login is a session that ended, not an answer", () => {
    expect(pollOutcome(0, "opaqueredirect", null)).toEqual({ kind: "signedOut" });
    expect(pollOutcome(307, "basic", null)).toEqual({ kind: "signedOut" });
    // EV-341b (staff r2 N3): the poll route's own 401 SESSION_EXPIRED is the same session end.
    expect(pollOutcome(401, "basic", { code: "SESSION_EXPIRED" })).toEqual({ kind: "signedOut" });
  });

  test("403 is the link ending (W8); every other status keeps the wait going", () => {
    expect(pollOutcome(403, "basic", { code: "COACH_ACCESS_DENIED" })).toEqual({ kind: "denied" });
    for (const status of [400, 404, 429, 500, 502, 503, 504]) {
      expect(pollOutcome(status, "basic", null), String(status)).toEqual({ kind: "failed" });
    }
  });

  test("the poll's path names the client in the URL and nowhere else", () => {
    expect(intakeConsentPath("6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001")).toBe(
      "/api/bff/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001/intake-consent"
    );
    expect(intakeConsentPath("a/b?c")).toBe("/api/bff/clients/a%2Fb%3Fc/intake-consent");
  });
});
