import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-186b — « Régénérer avec l'IA » on the routine page (the panel, the brief, the running
 * state, refusal/failure copy, « Écarter », the STUB banner), in FIXTURE mode.
 *
 * The fixture ports b-fit-api main @ 19b6696e's contract (EV-186a)
 * (`src/lib/coachApi.fixture.ts`, block « EV-186b — THE ROUTINE AI PROPOSAL »). Switches are
 * cookies scoped to this browser context: `evoli_fixture_ai_caps`, `evoli_fixture_ai`,
 * `evoli_fixture_ai_error`, `evoli_fixture_ai_delay_ms`.
 *
 * Sentences are LITERALS from the story's copy table, never imported from `src/lib/copy.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const ROUTE = (id: string) => `/clients/${id}/routine`;
const SERVER_MESSAGE = "FIXTURE SERVER MESSAGE";
const FAILED = "We couldn't prepare this suggestion. Nothing was changed. Try again.";

async function cookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
}

const panel = (page: Page) => page.getByTestId("routine-ai-panel");
const openButton = (page: Page) => page.getByRole("button", { name: "Regenerate with AI", exact: true });

interface JournalEntry {
  op: string;
  arg: string | null;
}
interface AiPost {
  clientId: string;
  bodyKeys: string[];
  briefKeys: string[];
  outcome: string;
}
async function calls(page: Page): Promise<{ api: JournalEntry[]; aiPosts: AiPost[] }> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return (await res.json()) as { api: JournalEntry[]; aiPosts: AiPost[] };
}

async function openBrief(page: Page, id = LINA) {
  await page.goto(ROUTE(id));
  await openButton(page).click();
  await expect(panel(page).getByRole("heading", { name: "Regenerate with AI" })).toBeVisible();
}

test.describe("B1 — the panel exists only when aiProposals.routine is literally true", () => {
  for (const caps of ["(default: all false)", "absent", "string", "null", "partial", "truthy"]) {
    test(`caps ${caps}: no control, no panel, no AI read`, async ({ page }) => {
      await signIn(page);
      if (!caps.startsWith("(")) await cookie(page, "evoli_fixture_ai_caps", caps);
      await page.goto(ROUTE(LINA));
      await expect(page.getByText("Published plan")).toBeVisible();
      await expect(openButton(page)).toHaveCount(0);
      await expect(panel(page)).toHaveCount(0);
      const { api } = await calls(page);
      expect(api.filter((e) => /RoutineAi/.test(e.op))).toEqual([]);
    });
  }

  test("every flag-off shape renders the same page body (the panel adds nothing when off)", async ({ page }) => {
    await signIn(page);
    const bodies: string[] = [];
    for (const caps of ["", "absent", "string", "null", "partial", "truthy"]) {
      if (caps) await cookie(page, "evoli_fixture_ai_caps", caps);
      await page.goto(ROUTE(LINA));
      await expect(page.getByText("Published plan")).toBeVisible();
      bodies.push(await page.locator(".prog-editor").innerHTML());
    }
    for (const body of bodies) expect(body).toBe(bodies[0]);
  });

  test("caps on: « Regenerate with AI » is offered, and the page reads the proposal once", async ({ page }) => {
    await signIn(page);
    await cookie(page, "evoli_fixture_ai_caps", "on");
    await page.goto(ROUTE(LINA));
    await expect(openButton(page)).toBeVisible();
    const { api } = await calls(page);
    expect(api.filter((e) => e.op === "getRoutineAiProposal" && e.arg === LINA).length).toBeGreaterThanOrEqual(1);
  });

  test("French: « Régénérer avec l'IA »", async ({ page }) => {
    await signIn(page);
    await cookie(page, "evoli_fixture_ai_caps", "on");
    await cookie(page, "evoli_pro_locale", "fr");
    await page.goto(ROUTE(LINA));
    await expect(page.getByRole("button", { name: "Régénérer avec l'IA", exact: true })).toBeVisible();
  });
});

test.describe("B2 — the brief has AC1's five controls and the read-only profile, nothing else", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await cookie(page, "evoli_fixture_ai_caps", "on");
  });

  test("five controls, goal and length pre-filled from the plan, injuries/equipment as text", async ({ page }) => {
    await openBrief(page, DANA);
    const form = panel(page).locator("form");
    await expect(form.getByRole("combobox")).toHaveCount(3);
    await expect(form.getByLabel("Goal")).toHaveValue("BUILD_MUSCLE");
    await expect(form.getByLabel("Training days per week")).toHaveValue("2");
    await expect(form.getByLabel("Session length")).toHaveValue("45");
    await expect(form.getByRole("group", { name: "Emphasis (optional)" }).getByRole("checkbox").first()).toBeVisible();
    await expect(form.getByRole("textbox")).toHaveCount(1);
    await expect(
      form.getByLabel("Notes for this draft — the AI reads this. Don't put anything here you wouldn't put in an email.")
    ).toBeVisible();
    // Nothing else typed or chosen: 3 selects + the muscle checkboxes + 1 textarea.
    const inputs = await form.locator("input, select, textarea").evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).type || el.tagName.toLowerCase())
    );
    expect(inputs.filter((t) => t !== "checkbox").sort()).toEqual(["select-one", "select-one", "select-one", "textarea"]);
    const profile = panel(page).getByTestId("routine-ai-profile");
    await expect(profile).toContainText("From Dana's profile — applied automatically. You cannot change these here.");
    await expect(profile).toContainText("Sharp pain in the left shoulder on anything overhead");
  });

  test("the counter: 500 sends, 501 reads « 501/500 » and Generate is disabled", async ({ page }) => {
    await openBrief(page);
    const notes = panel(page).getByRole("textbox");
    const generate = panel(page).getByRole("button", { name: "Generate" });
    await notes.fill("a".repeat(500));
    await expect(panel(page).getByTestId("routine-ai-counter")).toHaveText("500/500");
    await expect(generate).toBeEnabled();
    await notes.fill("a".repeat(501));
    await expect(panel(page).getByTestId("routine-ai-counter")).toHaveText("501/500");
    await expect(generate).toBeDisabled();
    await expect(notes).toHaveValue("a".repeat(501)); // never truncated
  });

  test("the POST carries kind + brief keys only — no injury, equipment or id", async ({ page }) => {
    await openBrief(page, DANA);
    await panel(page).getByRole("checkbox").first().check();
    await panel(page).getByRole("textbox").fill("Sentinel-notes-zz");
    await panel(page).getByRole("button", { name: "Generate" }).click();
    await expect(panel(page).getByText(/^Preparing a suggestion for Dana… /)).toBeVisible();
    const { aiPosts } = await calls(page);
    expect(aiPosts).toHaveLength(1);
    expect(aiPosts[0].bodyKeys).toEqual(["brief", "kind"]);
    expect(aiPosts[0].briefKeys).toEqual(["days", "emphasis", "goal", "notes", "sessionLength"]);
    expect(aiPosts[0].outcome).toBe("202");
  });
});

test.describe("B3 — running, leaving and coming back, and « Écarter »", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await cookie(page, "evoli_fixture_ai_caps", "on");
  });

  test("Generate → the Running sentence → a reload resumes the SAME run → the proposal arrives", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_delay_ms", "5000");
    await openBrief(page);
    await panel(page).getByRole("button", { name: "Generate" }).click();
    const running = "Preparing a suggestion for Lina… This can take up to two minutes.";
    await expect(panel(page).getByText(running)).toBeVisible();
    await page.goto("/");
    await page.goto(ROUTE(LINA));
    await expect(panel(page).getByText(running)).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 15_000 });
    await expect(panel(page).getByTestId("routine-ai-diff")).toBeVisible();
    // One POST only: the reload resumed, it did not start a second run.
    expect((await calls(page)).aiPosts).toHaveLength(1);
  });

  test("« Discard » while running sends DELETE and closes the panel; the run does not come back", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_delay_ms", "60000");
    await openBrief(page);
    await panel(page).getByRole("button", { name: "Generate" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "running");
    await panel(page).getByRole("button", { name: "Discard" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
    await expect(openButton(page)).toBeVisible();
    const { api } = await calls(page);
    expect(api.some((e) => e.op === "discardRoutineAiProposal" && e.arg === LINA)).toBe(true);
    await page.reload();
    await expect(openButton(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
  });

  test("« Discard » on a READY proposal closes the panel too", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_delay_ms", "0");
    await openBrief(page);
    await panel(page).getByRole("button", { name: "Generate" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
    await panel(page).getByRole("button", { name: "Discard" }).click();
    await expect(openButton(page)).toBeVisible();
  });

  test("409 COACH_AI_PROPOSAL_RUNNING from a second tab: its sentence, then that run's running state", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_delay_ms", "60000");
    await openBrief(page);
    const other = await page.context().newPage();
    await other.goto(ROUTE(LINA));
    await other.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
    await other.getByTestId("routine-ai-panel").getByRole("button", { name: "Generate" }).click();
    await expect(other.getByTestId("routine-ai-panel")).toHaveAttribute("data-ai-state", "running");
    await panel(page).getByRole("button", { name: "Generate" }).click();
    await expect(panel(page).getByTestId("routine-ai-notice")).toHaveText("A suggestion is already being prepared for Lina.");
    await expect(panel(page)).toHaveAttribute("data-ai-state", "running");
    await other.close();
  });
});

test.describe("B4 — each refusal renders its sentence; the server message never shows", () => {
  const POST_REFUSALS: [string, string][] = [
    ["unavailable", "AI suggestions are switched off on this server."],
    ["busy", "AI suggestions are busy right now. Try again in a minute."],
    ["catalog", "The exercise catalog is unavailable. Try again shortly."],
    ["rate_link", "You've used today's 3 AI regenerations for Lina. You can still edit by hand, or try again tomorrow."],
    ["rate_coach", "You've used all of today's AI suggestions across your clients. Try again tomorrow."],
    ["off", "AI suggestions are switched off on this server."],
  ];
  for (const [mode, sentence] of POST_REFUSALS) {
    test(`POST ${mode}`, async ({ page }) => {
      await signIn(page);
      await cookie(page, "evoli_fixture_ai_caps", "on");
      await openBrief(page);
      await cookie(page, "evoli_fixture_ai", mode);
      await panel(page).getByRole("button", { name: "Generate" }).click();
      await expect(panel(page).getByTestId("routine-ai-notice")).toHaveText(sentence);
      await expect(page.getByText(SERVER_MESSAGE)).toHaveCount(0);
      const generate = panel(page).getByRole("button", { name: "Generate" });
      // A spent quota holds Generate (Retry-After = next midnight); BUSY leaves it live.
      if (mode.startsWith("rate_")) await expect(generate).toBeDisabled();
      if (mode === "busy") await expect(generate).toBeEnabled();
      // Nothing was started.
      const { aiPosts } = await calls(page);
      expect(aiPosts.every((p) => p.outcome !== "202")).toBe(true);
    });
  }

  const FAILURES: [string, string][] = [
    ["COACH_AI_TIMEOUT", FAILED],
    ["COACH_AI_INVALID_OUTPUT", FAILED],
    ["COACH_AI_SOMETHING_NEW", FAILED],
    ["COACH_AI_NOTHING_APPLIED", "The AI found no change to apply for this request. Nothing was changed. Rephrase it or try again."],
  ];
  for (const [code, sentence] of FAILURES) {
    test(`FAILED ${code}`, async ({ page }) => {
      await signIn(page);
      await cookie(page, "evoli_fixture_ai_caps", "on");
      await cookie(page, "evoli_fixture_ai", "fail");
      await cookie(page, "evoli_fixture_ai_error", code);
      await cookie(page, "evoli_fixture_ai_delay_ms", "0");
      await openBrief(page);
      await panel(page).getByRole("button", { name: "Generate" }).click();
      await expect(panel(page)).toHaveAttribute("data-ai-state", "failed", { timeout: 10_000 });
      await expect(panel(page).getByRole("alert")).toHaveText(sentence);
      await expect(page.getByText(code)).toHaveCount(0);
      // EV-186n N4: « Try again » starts a new Regenerate with the same brief.
      await panel(page).getByRole("button", { name: "Try again" }).click();
      await expect
        .poll(async () => (await calls(page)).aiPosts.filter((p) => p.outcome === "202").length)
        .toBe(2);
    });
  }
});

test.describe("B5 — the STUB banner sits above the proposal", () => {
  test("engine STUB", async ({ page }) => {
    await signIn(page);
    await cookie(page, "evoli_fixture_ai_caps", "on");
    await cookie(page, "evoli_fixture_ai", "stub");
    await cookie(page, "evoli_fixture_ai_delay_ms", "0");
    await openBrief(page);
    await panel(page).getByRole("button", { name: "Generate" }).click();
    const banner = panel(page).getByTestId("routine-ai-stub-banner");
    await expect(banner).toHaveText("Test suggestion — AI is off on this server.", { timeout: 10_000 });
    const proposal = panel(page).getByTestId("routine-ai-diff");
    const [b, p] = [await banner.boundingBox(), await proposal.boundingBox()];
    expect(b && p && b.y + b.height <= p.y).toBe(true);
  });

  test("engine AI: no banner", async ({ page }) => {
    await signIn(page);
    await cookie(page, "evoli_fixture_ai_caps", "on");
    await cookie(page, "evoli_fixture_ai_delay_ms", "0");
    await openBrief(page);
    await panel(page).getByRole("button", { name: "Generate" }).click();
    await expect(panel(page).getByTestId("routine-ai-diff")).toBeVisible({ timeout: 10_000 });
    await expect(panel(page).getByTestId("routine-ai-stub-banner")).toHaveCount(0);
  });
});
