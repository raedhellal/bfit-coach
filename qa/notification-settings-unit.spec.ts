import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  asEmailSwitches,
  channelsBody,
  COACH_EMAIL_TYPES,
  createPreferenceSaver,
  readOutcome,
  saveOutcome,
  type CoachEmailType,
  type SaveOutcome,
  type SwitchView,
} from "../src/lib/notificationPreferences";

/**
 * EV-455k — the pure half of /settings/notifications (`src/lib/notificationPreferences.ts`), in the
 * default suite: no server call, no api. The page against a real api is
 * `qa/notification-settings.live.spec.ts`.
 */

const ALL_ON = {
  timezone: "Europe/Paris",
  quietHours: { start: "22:00", end: "08:00" },
  channels: {
    CLIENT_MESSAGE: { email: true },
    CLIENT_JOINED: { email: true },
    CLIENT_RED_FLAG: { email: true },
    CLIENT_SESSION_COMPLETED: { email: true },
  },
};

/** A `send` the test answers by hand, recording every request in order. */
function manualSend() {
  const sent: { type: CoachEmailType; on: boolean; answer: (o: SaveOutcome | Error) => void }[] = [];
  const send = (type: CoachEmailType, on: boolean) =>
    new Promise<SaveOutcome>((resolve, reject) => {
      sent.push({ type, on, answer: (o) => (o instanceof Error ? reject(o) : resolve(o)) });
    });
  return { sent, send };
}

/** Lets every queued promise continuation run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const view = (views: SwitchView[], type: CoachEmailType) => views.find((v) => v.type === type)!;

test("the four coach email pairs, in the story's table order (AC-1)", () => {
  expect(COACH_EMAIL_TYPES).toEqual(["CLIENT_MESSAGE", "CLIENT_JOINED", "CLIENT_RED_FLAG", "CLIENT_SESSION_COMPLETED"]);
  expect(asEmailSwitches(ALL_ON)).toEqual([
    { type: "CLIENT_MESSAGE", on: true },
    { type: "CLIENT_JOINED", on: true },
    { type: "CLIENT_RED_FLAG", on: true },
    { type: "CLIENT_SESSION_COMPLETED", on: true },
  ]);
});

test("a type the page does not know is not shown; nor is a pair that is not a boolean (edge case)", () => {
  const body = {
    channels: {
      CLIENT_SESSION_COMPLETED: { email: false },
      CLIENT_MESSAGE: { email: true },
      COACH_PLAN_PUBLISHED: { push: true },
      CLIENT_FUTURE_TYPE: { email: true },
      CLIENT_JOINED: { email: "false" },
      CLIENT_RED_FLAG: { push: true },
    },
  };
  expect(asEmailSwitches(body)).toEqual([
    { type: "CLIENT_MESSAGE", on: true },
    { type: "CLIENT_SESSION_COMPLETED", on: false },
  ]);
});

test("a body with none of the four pairs is a FAILED read, never an empty page", () => {
  for (const body of [null, undefined, "x", 3, [], {}, { channels: null }, { channels: [] }, { channels: {} }, { channels: { COACH_MESSAGE: { push: true } } }]) {
    expect(asEmailSwitches(body), JSON.stringify(body)).toBeNull();
  }
});

test("the BFF's document carries the drawn pairs only, in the api's shape", () => {
  expect(channelsBody(asEmailSwitches({ ...ALL_ON, channels: { ...ALL_ON.channels, COACH_MESSAGE: { push: false } } })!)).toEqual({
    channels: ALL_ON.channels,
  });
});

test("a read: the document, a session that ended, or a failure (a 503 is never four switches)", () => {
  expect(readOutcome(200, "basic", ALL_ON)).toEqual({ kind: "read", switches: asEmailSwitches(ALL_ON) });
  expect(readOutcome(0, "opaqueredirect", null)).toEqual({ kind: "signedOut" });
  expect(readOutcome(307, "basic", null)).toEqual({ kind: "signedOut" });
  expect(readOutcome(401, "basic", { code: "SESSION_EXPIRED" })).toEqual({ kind: "signedOut" });
  for (const [status, body] of [
    [503, { code: "UNAVAILABLE" }],
    [502, { code: "UPSTREAM" }],
    [403, { code: "CROSS_ORIGIN" }],
    [200, null],
    [200, {}],
  ] as const) {
    expect(readOutcome(status, "basic", body), `${status} ${JSON.stringify(body)}`).toEqual({ kind: "failed" });
  }
});

test("a save: the STORED value of the pair it sent; a document without that pair is a failure", () => {
  const off = { channels: { ...ALL_ON.channels, CLIENT_MESSAGE: { email: false } } };
  expect(saveOutcome(200, "basic", off, "CLIENT_MESSAGE")).toEqual({ kind: "saved", on: false });
  expect(saveOutcome(200, "basic", { channels: { CLIENT_JOINED: { email: true } } }, "CLIENT_MESSAGE")).toEqual({ kind: "failed" });
  expect(saveOutcome(503, "basic", null, "CLIENT_MESSAGE")).toEqual({ kind: "failed" });
  expect(saveOutcome(400, "basic", { code: "INVALID_REQUEST" }, "CLIENT_MESSAGE")).toEqual({ kind: "failed" });
  expect(saveOutcome(401, "basic", null, "CLIENT_MESSAGE")).toEqual({ kind: "signedOut" });
  expect(saveOutcome(0, "opaqueredirect", null, "CLIENT_MESSAGE")).toEqual({ kind: "signedOut" });
});

test("one toggle is ONE request; the switch moves at once, then says saved (AC-2)", async () => {
  const { sent, send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);
  const seen: SwitchView[][] = [];
  saver.subscribe({ change: (v) => seen.push(v), signedOut: () => seen.push([]) });

  saver.toggle("CLIENT_MESSAGE");
  expect(view(saver.views(), "CLIENT_MESSAGE")).toEqual({ type: "CLIENT_MESSAGE", on: false, state: "saving" });
  expect(sent.map((s) => [s.type, s.on])).toEqual([["CLIENT_MESSAGE", false]]);

  sent[0].answer({ kind: "saved", on: false });
  await settle();
  expect(view(saver.views(), "CLIENT_MESSAGE")).toEqual({ type: "CLIENT_MESSAGE", on: false, state: "saved" });
  expect(sent).toHaveLength(1);
  // The other three never moved and never sent.
  for (const type of ["CLIENT_JOINED", "CLIENT_RED_FLAG", "CLIENT_SESSION_COMPLETED"] as const) {
    expect(view(saver.views(), type)).toEqual({ type, on: true, state: "idle" });
  }
  expect(seen.at(-1)).toEqual(saver.views());
});

test("a fast double toggle: never two requests of one pair at once, and the last position wins (edge case)", async () => {
  const { sent, send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);

  saver.toggle("CLIENT_MESSAGE"); // off, sent
  saver.toggle("CLIENT_MESSAGE"); // on, queued
  expect(sent).toHaveLength(1);
  expect(view(saver.views(), "CLIENT_MESSAGE").on).toBe(true);

  sent[0].answer({ kind: "saved", on: false });
  await settle();
  // The server holds off, the coach last chose on: the queue sends on.
  expect(sent.map((s) => s.on)).toEqual([false, true]);
  expect(view(saver.views(), "CLIENT_MESSAGE").state).toBe("saving");
  sent[1].answer({ kind: "saved", on: true });
  await settle();
  expect(view(saver.views(), "CLIENT_MESSAGE")).toEqual({ type: "CLIENT_MESSAGE", on: true, state: "saved" });
  expect(sent).toHaveLength(2);
});

test("three fast toggles send the first and nothing more once the server holds the last position", async () => {
  const { sent, send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);
  saver.toggle("CLIENT_JOINED");
  saver.toggle("CLIENT_JOINED");
  saver.toggle("CLIENT_JOINED");
  sent[0].answer({ kind: "saved", on: false });
  await settle();
  expect(sent.map((s) => s.on)).toEqual([false]);
  expect(view(saver.views(), "CLIENT_JOINED")).toEqual({ type: "CLIENT_JOINED", on: false, state: "saved" });
});

test("a failed save returns the switch to what the server confirmed and says failed (AC-3)", async () => {
  const { sent, send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);
  saver.toggle("CLIENT_MESSAGE");
  expect(view(saver.views(), "CLIENT_MESSAGE").on).toBe(false);
  sent[0].answer({ kind: "failed" });
  await settle();
  expect(view(saver.views(), "CLIENT_MESSAGE")).toEqual({ type: "CLIENT_MESSAGE", on: true, state: "failed" });

  // Toggling again is « Réessayez »: a new request, and the failure is no longer shown.
  saver.toggle("CLIENT_MESSAGE");
  expect(view(saver.views(), "CLIENT_MESSAGE")).toEqual({ type: "CLIENT_MESSAGE", on: false, state: "saving" });
  expect(sent).toHaveLength(2);
  sent[1].answer({ kind: "saved", on: false });
  await settle();
  expect(view(saver.views(), "CLIENT_MESSAGE").state).toBe("saved");
});

test("a failure drops what was queued behind it; a thrown send is a failure too", async () => {
  const { sent, send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);
  saver.toggle("CLIENT_RED_FLAG"); // off, sent
  saver.toggle("CLIENT_RED_FLAG"); // on, queued
  saver.toggle("CLIENT_RED_FLAG"); // off, queued
  sent[0].answer(new Error("network"));
  await settle();
  expect(view(saver.views(), "CLIENT_RED_FLAG")).toEqual({ type: "CLIENT_RED_FLAG", on: true, state: "failed" });
  expect(sent).toHaveLength(1);
});

test("the server's answer is the truth: a stored value other than the one asked is what the switch shows", async () => {
  const { sent, send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);
  saver.toggle("CLIENT_SESSION_COMPLETED");
  sent[0].answer({ kind: "saved", on: true });
  await settle();
  expect(view(saver.views(), "CLIENT_SESSION_COMPLETED")).toEqual({ type: "CLIENT_SESSION_COMPLETED", on: true, state: "saved" });
  expect(sent).toHaveLength(1);
});

test("two switches save side by side, each with its own request and its own state", async () => {
  const { sent, send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);
  saver.toggle("CLIENT_MESSAGE");
  saver.toggle("CLIENT_JOINED");
  expect(sent.map((s) => s.type)).toEqual(["CLIENT_MESSAGE", "CLIENT_JOINED"]);
  sent[1].answer({ kind: "failed" });
  sent[0].answer({ kind: "saved", on: false });
  await settle();
  expect(view(saver.views(), "CLIENT_MESSAGE")).toEqual({ type: "CLIENT_MESSAGE", on: false, state: "saved" });
  expect(view(saver.views(), "CLIENT_JOINED")).toEqual({ type: "CLIENT_JOINED", on: true, state: "failed" });
});

test("a session that ended is told to the listener (the island reloads), not drawn as a failure", async () => {
  const { sent, send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);
  let signedOut = 0;
  const changes: SwitchView[][] = [];
  saver.subscribe({ change: (v) => changes.push(v), signedOut: () => (signedOut += 1) });
  saver.toggle("CLIENT_MESSAGE");
  const before = changes.length;
  sent[0].answer({ kind: "signedOut" });
  await settle();
  expect(signedOut).toBe(1);
  expect(changes).toHaveLength(before);
  expect(view(saver.views(), "CLIENT_MESSAGE").state).not.toBe("failed");
});

test("after unsubscribe (unmount) no answer reaches the listener, and the queue still sends the last position", async () => {
  const { sent, send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);
  let calls = 0;
  const detach = saver.subscribe({ change: () => (calls += 1), signedOut: () => (calls += 1) });
  saver.toggle("CLIENT_MESSAGE"); // off, sent
  saver.toggle("CLIENT_MESSAGE"); // on, queued
  const atUnmount = calls;
  detach();
  sent[0].answer({ kind: "saved", on: false });
  await settle();
  expect(sent.map((s) => s.on), "the coach's last position is still sent").toEqual([false, true]);
  sent[1].answer({ kind: "signedOut" });
  await settle();
  expect(calls, "no callback after unmount").toBe(atUnmount);
});

test("a detached listener does not detach its successor", () => {
  const { send } = manualSend();
  const saver = createPreferenceSaver(asEmailSwitches(ALL_ON)!, send);
  let first = 0;
  let second = 0;
  const detachFirst = saver.subscribe({ change: () => (first += 1), signedOut: () => undefined });
  saver.subscribe({ change: () => (second += 1), signedOut: () => undefined });
  detachFirst();
  saver.toggle("CLIENT_JOINED");
  expect([first, second]).toEqual([0, 1]);
});
