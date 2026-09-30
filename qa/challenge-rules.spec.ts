import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import { formatSteps } from "../src/lib/format";
import {
  buildChallengeRequest,
  challengeFailureMessage,
  challengeFieldOf,
  checkChallenge,
  classifyChallengeError,
  defaultChallengeForm,
  parseDailyTarget,
  type ChallengeForm,
} from "../src/lib/challengeDocument";

/**
 * EV-321b — the create dialog's rules, driven WITHOUT a browser: the one function that
 * builds `POST /coach-portal/challenges`' body, the local checks that mirror b-fit-api
 * EV-321a @ 1749060 (`CoachChallengeCreateRequest` + `CoachChallengeUseCase.checkRules`),
 * and the mapping from every api refusal to a sentence.
 *
 * Every bound is tested on BOTH sides of its edge, because a portal that refuses one day
 * or one step earlier than the api is a portal that says "no" to a valid challenge.
 * Expected sentences are literals, never read back from the dictionaries under test.
 */

const TODAY = "2026-10-03";
const LEA = "11111111-1111-4111-8111-111111111111";
const MARC = "22222222-2222-4222-8222-222222222222";

function form(patch: Partial<ChallengeForm> = {}): ChallengeForm {
  return {
    title: "10 000 pas par jour",
    dailyTarget: "10000",
    startsOn: TODAY,
    endsOn: "2026-10-09",
    clientIds: [LEA],
    ...patch,
  };
}

const reasons = (f: ChallengeForm) => checkChallenge(f, TODAY).map((p) => `${p.field}:${p.reason}`);

test.describe("the request builder", () => {
  test("builds the api's body: STEPS, the parsed goal, the window, each client once, no totalTarget", () => {
    const built = buildChallengeRequest(form({ title: "  10 000 pas par jour  ", clientIds: [LEA, MARC, LEA] }), TODAY);
    expect(built).toEqual({
      ok: true,
      body: {
        title: "10 000 pas par jour",
        metric: "STEPS",
        dailyTarget: 10000,
        startsOn: "2026-10-03",
        endsOn: "2026-10-09",
        clientIds: [LEA, MARC],
      },
    });
    // The api refuses a STEPS body that CARRIES a totalTarget, even null-valued keys are avoided.
    expect(built.ok && "totalTarget" in built.body).toBe(false);
  });

  test("the dialog's defaults are a valid week at 10 000 steps, once a title and a client are chosen", () => {
    const initial = defaultChallengeForm(TODAY, "fr");
    expect(initial.dailyTarget).toBe("10\u202f000");
    expect(initial.startsOn).toBe("2026-10-03");
    expect(initial.endsOn).toBe("2026-10-09"); // today + 6: seven days
    expect(reasons(initial)).toEqual(["title:titleRequired", "clientIds:clientsRequired"]);
    const built = buildChallengeRequest({ ...initial, title: "Défi", clientIds: [LEA] }, TODAY);
    expect(built.ok && built.body.dailyTarget).toBe(10000);
  });

  test("refuses to build while any problem stands, and names each one", () => {
    const built = buildChallengeRequest(form({ title: "", clientIds: [] }), TODAY);
    expect(built.ok).toBe(false);
    expect(built.ok ? [] : built.problems.map((p) => p.reason)).toEqual(["titleRequired", "clientsRequired"]);
  });
});

test.describe("the daily goal (@Min 1000 @Max 50000)", () => {
  test("reads the grouping a coach types, in either language", () => {
    for (const typed of ["10000", "10 000", "10\u00a0000", "10\u202f000", "10,000", "10.000", " 10000 "]) {
      expect(parseDailyTarget(typed), JSON.stringify(typed)).toBe(10000);
    }
  });
  test("never rounds a decimal or guesses at a mixed grouping", () => {
    for (const typed of ["10,5", "10.5", "1e4", "-10000", "", "abc", "10.000,000", "1 00 000"]) {
      expect(parseDailyTarget(typed), JSON.stringify(typed)).toBeNull();
    }
  });
  test("both edges, on both sides", () => {
    expect(reasons(form({ dailyTarget: "999" }))).toEqual(["dailyTarget:targetRange"]);
    expect(reasons(form({ dailyTarget: "1000" }))).toEqual([]);
    expect(reasons(form({ dailyTarget: "50000" }))).toEqual([]);
    expect(reasons(form({ dailyTarget: "50001" }))).toEqual(["dailyTarget:targetRange"]);
    expect(reasons(form({ dailyTarget: "dix mille" }))).toEqual(["dailyTarget:targetInvalid"]);
  });
});

test.describe("the window (checkRules, on the api's UTC day)", () => {
  test("a window is 0 to 92 days after its start — 93 days at most", () => {
    expect(reasons(form({ endsOn: TODAY }))).toEqual([]); // a one-day challenge
    expect(reasons(form({ endsOn: "2027-01-03" }))).toEqual([]); // +92
    expect(reasons(form({ endsOn: "2027-01-04" }))).toEqual(["endsOn:windowTooLong"]); // +93
    expect(reasons(form({ endsOn: "2026-10-02" }))).toEqual(["endsOn:endBeforeStart"]);
  });
  test("the start is at most 14 days back and 60 days ahead", () => {
    expect(reasons(form({ startsOn: "2026-09-19", endsOn: "2026-09-25" }))).toEqual([]); // −14
    expect(reasons(form({ startsOn: "2026-09-18", endsOn: "2026-09-25" }))).toEqual(["startsOn:startTooEarly"]); // −15
    expect(reasons(form({ startsOn: "2026-12-02", endsOn: "2026-12-08" }))).toEqual([]); // +60
    expect(reasons(form({ startsOn: "2026-12-03", endsOn: "2026-12-09" }))).toEqual(["startsOn:startTooLate"]); // +61
  });
  test("a date that is not a calendar day is refused, not normalised", () => {
    expect(reasons(form({ endsOn: "2026-02-30" }))).toEqual(["endsOn:dateInvalid"]);
    expect(reasons(form({ startsOn: "" }))).toEqual(["startsOn:dateInvalid"]);
  });
});

test.describe("the title (@LibraryName) and the clients (@Size 1..50)", () => {
  test("1 to 80 characters after the api's normalisation, on one line", () => {
    expect(reasons(form({ title: "   " }))).toEqual(["title:titleRequired"]);
    expect(reasons(form({ title: "a".repeat(80) }))).toEqual([]);
    expect(reasons(form({ title: "a".repeat(81) }))).toEqual(["title:titleTooLong"]);
    expect(reasons(form({ title: "10 000\npas" }))).toEqual(["title:titleControl"]);
  });
  test("one to fifty distinct clients", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(reasons(form({ clientIds: [] }))).toEqual(["clientIds:clientsRequired"]);
    expect(reasons(form({ clientIds: ids(50) }))).toEqual([]);
    expect(reasons(form({ clientIds: ids(51) }))).toEqual(["clientIds:clientsTooMany"]);
    expect(reasons(form({ clientIds: [...ids(50), ids(1)[0]] }))).toEqual([]); // a duplicate counts once
  });
});

test.describe("the api's refusals, mapped to sentences", () => {
  test("the field comes from details.field OR leads the message; nothing else is read as a field", () => {
    expect(challengeFieldOf({ field: "startsOn" }, "startsOn must be at most 60 days after today")).toBe("startsOn");
    expect(challengeFieldOf(null, "dailyTarget must be less than or equal to 50000")).toBe("dailyTarget");
    expect(challengeFieldOf(null, "clientIds[3] must not be null")).toBe("clientIds");
    expect(challengeFieldOf(null, "La valeur doit être positive")).toBeNull();
    expect(challengeFieldOf({ field: "somethingElse" }, null)).toBeNull();
  });

  test("each status and code is its own outcome", () => {
    const v = (details: Record<string, unknown> | null, message: string) =>
      classifyChallengeError({ status: 400, code: "VALIDATION_ERROR", details, message });
    expect(v({ field: "endsOn" }, "endsOn must be at most 92 days after startsOn")).toEqual({ code: "INVALID", field: "endsOn" });
    expect(v(null, "title must be 1-80 characters")).toEqual({ code: "INVALID", field: "title" });
    expect(classifyChallengeError({ status: 403, code: "COACH_ACCESS_DENIED", details: null, message: "Forbidden" })).toEqual({
      code: "ACCESS_DENIED",
    });
    expect(
      classifyChallengeError({ status: 409, code: "COACH_CHALLENGE_LIMIT_REACHED", details: null, message: "cap" })
    ).toEqual({ code: "LIMIT_REACHED" });
    expect(classifyChallengeError({ status: 500, code: null, details: null, message: "boom" })).toEqual({ code: "FAILED" });
    expect(classifyChallengeError({ status: 401, code: "UNAUTHORIZED", details: null, message: "" })).toEqual({ code: "FAILED" });
  });

  test("the sentences, in English", () => {
    expect(challengeFailureMessage({ code: "ACCESS_DENIED" }, en)).toEqual({
      field: "clientIds",
      message: "One of these clients is no longer linked to you. Nothing was created. Reload the page and choose again.",
    });
    expect(challengeFailureMessage({ code: "LIMIT_REACHED" }, en)).toEqual({
      field: null,
      message: "You already have 20 challenges that have not ended. Delete one to create another.",
    });
    expect(challengeFailureMessage({ code: "INVALID", field: "dailyTarget" }, en)).toEqual({
      field: "dailyTarget",
      message: "The daily goal is between 1,000 and 50,000 steps.",
    });
    expect(challengeFailureMessage({ code: "INVALID", field: "startsOn" }, en).message).toBe(
      "The start date is between 14 days ago and 60 days ahead."
    );
    expect(challengeFailureMessage({ code: "INVALID", field: "metric" }, en)).toEqual({
      field: null,
      message: "The challenge could not be created. Check the form and try again.",
    });
    expect(challengeFailureMessage({ code: "FAILED" }, en).message).toBe(
      "The challenge could not be created. Try again in a moment."
    );
  });

  test("the sentences, in French, with French number grouping", () => {
    expect(challengeFailureMessage({ code: "ACCESS_DENIED" }, fr).message).toBe(
      "L'un de ces clients n'est plus lié à vous. Rien n'a été créé. Rechargez la page et choisissez à nouveau."
    );
    expect(challengeFailureMessage({ code: "LIMIT_REACHED" }, fr).message).toBe(
      "Vous avez déjà 20 défis qui ne sont pas terminés. Supprimez-en un pour en créer un autre."
    );
    // fr-FR groups with U+202F, four digits too (read from Chrome's DOM, not from a screenshot).
    expect(challengeFailureMessage({ code: "INVALID", field: "dailyTarget" }, fr).message).toBe(
      "L'objectif quotidien est compris entre 1\u202f000 et 50\u202f000 pas."
    );
    expect(challengeFailureMessage({ code: "INVALID", field: "endsOn" }, fr).message).toBe(
      "La fin est le jour du début ou après, et un défi dure 93 jours au maximum."
    );
  });

  test("step counts print in the page's locale", () => {
    expect(formatSteps(10000, "fr")).toBe("10\u202f000");
    expect(formatSteps(10000, "en")).toBe("10,000");
    expect(formatSteps(43570, "fr")).toBe("43\u202f570");
    expect(formatSteps(6150, "fr")).toBe("6\u202f150"); // four digits are grouped too
  });
});
