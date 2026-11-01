import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import type { CoachNotification } from "../src/lib/coachApi";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import {
  badgeText,
  countOutcome,
  isShown,
  itemText,
  pageOutcome,
  relativeTime,
  shownItems,
  targetOf,
  type ShownNotification,
} from "../src/lib/notifications";

/**
 * EV-455f — the pure half of the bell and the inbox (`src/lib/notifications.ts`), in the default
 * suite: no server, no api. The live behaviour is `qa/notifications.live.spec.ts`. Expected
 * sentences are LITERALS.
 */

const LINK = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

function item(type: string, over: Partial<CoachNotification> = {}): CoachNotification {
  return {
    id: over.id ?? `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`,
    type,
    createdAt: "2026-11-01T10:00:00Z",
    readAt: null,
    count: 1,
    actor: { displayName: "Lina M." },
    target: { coachClientId: LINK, planId: null, weekStart: null },
    ...over,
  };
}

test("the badge: none at 0, 1…9, then 9+ (In scope 2)", () => {
  expect([0, 1, 9, 10, 12, 250].map(badgeText)).toEqual([null, "1", "9", "9+", "9+", "9+"]);
  expect(badgeText(-1)).toBeNull();
  expect(badgeText(1.5)).toBeNull();
});

test("a count read that is not a count is FAILED, never 0 (AC-9)", () => {
  expect(countOutcome(200, "basic", { count: 3 })).toEqual({ kind: "count", count: 3 });
  expect(countOutcome(200, "basic", { count: 0 })).toEqual({ kind: "count", count: 0 });
  for (const [status, body] of [
    [503, { code: "UNAVAILABLE" }],
    [502, { code: "UPSTREAM" }],
    [200, null],
    [200, {}],
    [200, { count: "3" }],
    [200, { count: -1 }],
    [200, { count: 1.5 }],
  ] as const) {
    expect(countOutcome(status, "basic", body), `${status} ${JSON.stringify(body)}`).toEqual({ kind: "failed" });
  }
  // The middleware's 307 to /login (an opaque redirect to a manual fetch) and a 401: signed out.
  expect(countOutcome(0, "opaqueredirect", null)).toEqual({ kind: "signedOut" });
  expect(countOutcome(401, "basic", { code: "SESSION_EXPIRED" })).toEqual({ kind: "signedOut" });
});

test("a page that is not a page is FAILED, never the empty inbox", () => {
  expect(pageOutcome(200, "basic", { items: [], nextCursor: null })).toEqual({ kind: "page", page: { items: [], nextCursor: null } });
  expect(pageOutcome(200, "basic", { nextCursor: null })).toEqual({ kind: "failed" });
  expect(pageOutcome(200, "basic", null)).toEqual({ kind: "failed" });
  expect(pageOutcome(503, "basic", { items: [] })).toEqual({ kind: "failed" });
  expect(pageOutcome(0, "opaqueredirect", null)).toEqual({ kind: "signedOut" });
});

test("only the coach catalogue's rows are shown; an unknown or trainee type is not, and not counted as shown", () => {
  const pages = [
    {
      items: [
        item("CLIENT_MESSAGE", { id: "a" }),
        item("COACH_PLAN_PUBLISHED", { id: "b" }),
        item("SOMETHING_NEW", { id: "c" }),
        item("CLIENT_JOINED", { id: "d" }),
      ],
      nextCursor: "x",
    },
    // A collapsed item that moved up is on page 1 AND on a later page: shown once, the newest copy.
    { items: [item("CLIENT_MESSAGE", { id: "a", readAt: "2026-11-01T09:00:00Z" }), item("CLIENT_RED_FLAG", { id: "e" })], nextCursor: null },
  ];
  const shown = shownItems(pages);
  expect(shown.map((i) => i.id)).toEqual(["a", "d", "e"]);
  expect(shown[0].readAt).toBeNull();
  expect(isShown(item("COACH_MESSAGE"))).toBe(false);
});

test("the catalogue texts, EN and FR, the client as the roster names them", () => {
  const cases: [string, string, string][] = [
    ["CLIENT_MESSAGE", "New message from Lina M.", "Nouveau message de Lina M."],
    ["CLIENT_JOINED", "Lina M. accepted your invitation", "Lina M. a accepté votre invitation"],
    ["CLIENT_SESSION_COMPLETED", "Lina M. completed a session", "Lina M. a terminé une séance"],
    ["CLIENT_RED_FLAG", "Something to check for Lina M.", "Un point à vérifier pour Lina M."],
  ];
  for (const [type, english, french] of cases) {
    const it = item(type) as ShownNotification;
    expect(itemText(it, en)).toBe(english);
    expect(itemText(it, fr)).toBe(french);
  }
  // No name (BUG-714): the roster's label, never an empty name.
  const unnamed = item("CLIENT_JOINED", { actor: { displayName: "  " } }) as ShownNotification;
  expect(itemText(unnamed, en)).toBe("Unnamed client accepted your invitation");
  expect(itemText(unnamed, fr)).toBe("Client sans nom a accepté votre invitation");
});

test("the bell's name, EN and FR (copy table), the api's count", () => {
  expect(en.notifications.bellLabel(0)).toBe("Notifications");
  expect(en.notifications.bellLabel(3)).toBe("Notifications, 3 unread");
  expect(en.notifications.bellLabel(12)).toBe("Notifications, 12 unread");
  expect(fr.notifications.bellLabel(0)).toBe("Notifications");
  expect(fr.notifications.bellLabel(3)).toBe("Notifications, 3 non lues");
  expect(fr.notifications.bellLabel(12)).toBe("Notifications, 12 non lues");
});

test("where an item opens (the catalogue's « Opens »): the thread for a message, the client otherwise", () => {
  expect(targetOf(item("CLIENT_MESSAGE") as ShownNotification)).toBe(`/clients/${LINK}/messages`);
  for (const type of ["CLIENT_JOINED", "CLIENT_SESSION_COMPLETED", "CLIENT_RED_FLAG"]) {
    expect(targetOf(item(type) as ShownNotification)).toBe(`/clients/${LINK}`);
  }
  expect(targetOf(item("CLIENT_JOINED", { target: { coachClientId: null, planId: null, weekStart: null } }) as ShownNotification)).toBeNull();
  expect(targetOf(item("CLIENT_JOINED", { target: { coachClientId: "../x", planId: null, weekStart: null } }) as ShownNotification)).toBeNull();
});

test("relative time: now, minutes, hours, days, then the date; a future time is now", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  expect(relativeTime("2026-11-01T11:59:40Z", now, "en")).toBe("now");
  expect(relativeTime("2026-11-01T11:55:00Z", now, "en")).toBe("5 minutes ago");
  expect(relativeTime("2026-11-01T09:00:00Z", now, "fr")).toBe("il y a 3 heures");
  expect(relativeTime("2026-10-30T12:00:00Z", now, "en")).toBe("2 days ago");
  expect(relativeTime("2026-11-01T12:05:00Z", now, "en")).toBe("now");
  expect(relativeTime("2026-10-01T12:00:00Z", now, "en")).toBe("1 Oct");
  expect(relativeTime("not a date", now, "en")).toBe("");
});
