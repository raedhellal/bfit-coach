import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { openEveryDay } from "./day-accordion";

/**
 * EV-186f — « Modifier avec l'IA » (the Update request box, a REVISE) on the routine page, in
 * FIXTURE mode. U1–U7 of the story (hub `EV-186-coach-draft-with-ai.md`, Part 2).
 *
 * The fixture ports b-fit-api main @ 731b1262 (EV-186e's REVISE, EV-376's id-scoped DELETE): see
 * the block « EV-186f: REVISE » in `src/lib/coachApi.fixture.ts`. Its reviser is the api's
 * `StubCoachRoutineReviser` (E5 restated): « échange » / « inverse » / « intervertis » / "swap"
 * gives ONE SWAP_DAYS of the two earliest training days; anything else gives no op → FAILED
 * COACH_AI_NOTHING_APPLIED. Lina's published plan: Mon « Upper Body A », Wed « Lower Body »,
 * Fri « Upper Body B » — so a swap exchanges Monday and Wednesday and leaves Friday alone.
 *
 * Switches (cookies): `evoli_fixture_ai_caps=instruction` (routine + instruction true),
 * `evoli_fixture_ai_ops_rejected=<n>` (U3), plus 186b's `evoli_fixture_ai*`.
 *
 * Sentences are LITERALS from the story's copy table, never imported from `src/lib/copy.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const ROUTE = (id: string) => `/clients/${id}/routine`;

const LABEL = "Your request — the AI reads this. Don't put anything here you wouldn't put in an email.";
const PLACEHOLDER = "e.g. swap Monday's and Thursday's sessions";
const PAIN_HINT_LINA =
  "Injuries the plan must always respect come from Lina's profile. This note only shapes this suggestion.";
const NOTHING_APPLIED = "The AI found no change to apply for this request. Nothing was changed. Rephrase it or try again.";
const FAILED = "We couldn't prepare this suggestion. Nothing was changed. Try again.";
const CHIPS = ["More upper body", "More lower body", "Add core", "Swap an exercise…"];
const NBSP = /[  ]/g;

async function cookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}

const panel = (page: Page) => page.getByTestId("routine-ai-panel");
const box = (page: Page) => panel(page).getByTestId("routine-ai-update");
const updateButton = (page: Page) => page.getByRole("button", { name: "Update with AI", exact: true });
const request = (page: Page) => box(page).getByLabel(LABEL);
const send = (page: Page) => box(page).getByRole("button", { name: "Generate" });

interface AiPost {
  clientId: string;
  bodyKeys: string[];
  briefKeys: string[];
  chips: string[];
  instructionLength: number | null;
  outcome: string;
}
interface AiDiscard {
  clientId: string;
  proposalId: string | null;
  touched: boolean;
}
async function calls(page: Page): Promise<{ aiPosts: AiPost[]; aiDiscards: AiDiscard[] }> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return (await res.json()) as { aiPosts: AiPost[]; aiDiscards: AiDiscard[] };
}

async function openUpdate(page: Page, id = LINA) {
  await page.goto(ROUTE(id));
  await updateButton(page).click();
  await expect(panel(page).getByRole("heading", { name: "Update with AI" })).toBeVisible();
}

async function sendAndSettle(page: Page, text: string, state: "ready" | "failed") {
  await request(page).fill(text);
  await send(page).click();
  await expect(panel(page)).toHaveAttribute("data-ai-state", state, { timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await cookie(page, "evoli_fixture_ai_delay_ms", "0");
});

test.describe("U1 — « Update with AI » opens the request box and the four chips", () => {
  test("offered only with aiProposals.instruction; routine alone keeps 186n's single control", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "on"); // routine true, instruction false
    await page.goto(ROUTE(LINA));
    await expect(page.getByRole("button", { name: "Regenerate with AI", exact: true })).toBeVisible();
    await expect(updateButton(page)).toHaveCount(0);

    await cookie(page, "evoli_fixture_ai_caps", "instruction");
    await page.goto(ROUTE(LINA));
    await expect(page.getByRole("button", { name: "Regenerate with AI", exact: true })).toBeVisible();
    await expect(updateButton(page)).toBeVisible();
  });

  test("the box: label, placeholder, counter, pain hint, four chips, nothing else typed", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
    await openUpdate(page);
    await expect(request(page)).toBeVisible();
    await expect(request(page)).toHaveAttribute("placeholder", PLACEHOLDER);
    await expect(box(page).getByTestId("routine-ai-update-counter")).toHaveText("0/500");
    await expect(box(page).getByTestId("routine-ai-pain-hint")).toHaveText(PAIN_HINT_LINA);
    await expect(box(page).getByTestId("routine-ai-chips").getByRole("button")).toHaveText(CHIPS);
    // One text field; no select, no checkbox, no injury or equipment control.
    const inputs = await box(page).locator("input, select, textarea").evaluateAll((els) => els.map((el) => el.tagName));
    expect(inputs).toEqual(["TEXTAREA"]);
  });

  test("a chip pre-fills its words and never sends on its own; the words are what travels", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
    await openUpdate(page);
    const chip = (name: string) => box(page).getByRole("button", { name, exact: true });
    await expect(chip("More upper body")).toHaveAttribute("aria-pressed", "false");

    await chip("More upper body").click();
    await expect(request(page)).toHaveValue("More upper body");
    await expect(chip("More upper body")).toHaveAttribute("aria-pressed", "true");
    await expect(request(page)).toBeFocused();
    await chip("Add core").click();
    await expect(request(page)).toHaveValue("More upper body\nAdd core");
    await chip("More upper body").click(); // already there: never written twice
    await expect(request(page)).toHaveValue("More upper body\nAdd core");
    // Pressing chips posted nothing.
    expect((await calls(page)).aiPosts).toEqual([]);
    await expect(panel(page)).toHaveAttribute("data-ai-state", "update");

    // Deleting a chip's words unselects it: only the chips whose words remain are sent.
    await request(page).fill("Add core, and keep Friday light");
    await expect(chip("More upper body")).toHaveAttribute("aria-pressed", "false");
    await send(page).click();
    await expect(panel(page)).not.toHaveAttribute("data-ai-state", "update");
    const [post] = (await calls(page)).aiPosts;
    expect(post.bodyKeys).toEqual(["chips", "instruction", "kind"]);
    expect(post.briefKeys).toEqual([]);
    expect(post.chips).toEqual(["ADD_CORE"]);
    expect(post.instructionLength).toBe("Add core, and keep Friday light".length);
    expect(post.outcome).toBe("202");
  });

  test("French: « Modifier avec l'IA », the table's label, placeholder, pain hint and chips", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
    await cookie(page, "evoli_pro_locale", "fr");
    await page.goto(ROUTE(LINA));
    await page.getByRole("button", { name: "Modifier avec l'IA", exact: true }).click();
    const frBox = box(page);
    const textarea = frBox.getByLabel(
      "Votre demande — l'IA lit ce texte. N'y mettez rien que vous ne mettriez pas dans un e-mail."
    );
    await expect(textarea).toBeVisible();
    expect(((await textarea.getAttribute("placeholder")) ?? "").replace(NBSP, " ")).toBe(
      "Ex. : échanger les séances de lundi et de jeudi"
    );
    await expect(frBox.getByTestId("routine-ai-pain-hint")).toHaveText(
      "Les blessures que le programme doit toujours respecter viennent du profil de Lina. Cette note n'oriente que cette suggestion."
    );
    await expect(frBox.getByTestId("routine-ai-chips").getByRole("button")).toHaveText([
      "Plus de haut du corps",
      "Plus de bas du corps",
      "Ajouter du gainage",
      "Remplacer un exercice…",
    ]);
    await expect(frBox.getByRole("button", { name: "Générer" })).toBeDisabled();
  });
});

test.describe("U2 — 500 sends, 501 reads « 501/500 » and cannot; nothing is truncated", () => {
  test.beforeEach(async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
  });

  test("the counter and the send button at the bound", async ({ page }) => {
    await openUpdate(page);
    const counter = box(page).getByTestId("routine-ai-update-counter");
    await expect(send(page)).toBeDisabled(); // empty
    await request(page).fill("   \n  ");
    await expect(send(page)).toBeDisabled(); // nothing visible: the api would answer EMPTY
    await request(page).fill("a".repeat(500));
    await expect(counter).toHaveText("500/500");
    await expect(send(page)).toBeEnabled();
    await request(page).fill("a".repeat(501));
    await expect(counter).toHaveText("501/500");
    await expect(send(page)).toBeDisabled();
    await expect(request(page)).toHaveValue("a".repeat(501)); // never truncated
  });

  test("counted as the api counts: 500 astral emoji are 500/500 and can be sent", async ({ page }) => {
    await openUpdate(page);
    await request(page).fill("💪".repeat(500));
    await expect(box(page).getByTestId("routine-ai-update-counter")).toHaveText("500/500");
    await expect(send(page)).toBeEnabled();
    await send(page).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", /running|failed/);
    const [post] = (await calls(page)).aiPosts;
    expect(post.instructionLength).toBe(500);
    expect(post.outcome).toBe("202");
  });
});

test.describe("U3 — rejected ops are counted above the comparison", () => {
  test.beforeEach(async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
  });

  test("three rejected: « 3 changes could not be applied. », above the diff", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_ops_rejected", "3");
    await openUpdate(page);
    await sendAndSettle(page, "swap Monday and Wednesday", "ready");
    const note = panel(page).getByTestId("routine-ai-ops-rejected");
    await expect(note).toHaveText("3 changes could not be applied.");
    const above = await panel(page).evaluate((root) => {
      const n = root.querySelector('[data-testid="routine-ai-ops-rejected"]');
      const d = root.querySelector('[data-testid="routine-ai-diff"]');
      return !!n && !!d && !!(n.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(above).toBe(true);
  });

  test("one rejected: the singular form", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_ops_rejected", "1");
    await openUpdate(page);
    await sendAndSettle(page, "swap", "ready");
    await expect(panel(page).getByTestId("routine-ai-ops-rejected")).toHaveText("1 change could not be applied.");
  });

  test("French, many: « 2 modifications n'ont pas pu être appliquées. »", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_ops_rejected", "2");
    await cookie(page, "evoli_pro_locale", "fr");
    await page.goto(ROUTE(LINA));
    await page.getByRole("button", { name: "Modifier avec l'IA", exact: true }).click();
    await box(page).getByRole("textbox").fill("échange lundi et mercredi");
    await box(page).getByRole("button", { name: "Générer" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
    await expect(panel(page).getByTestId("routine-ai-ops-rejected")).toHaveText(
      "2 modifications n'ont pas pu être appliquées."
    );
  });

  test("none rejected: no such line", async ({ page }) => {
    await openUpdate(page);
    await sendAndSettle(page, "swap", "ready");
    await expect(panel(page).getByTestId("routine-ai-ops-rejected")).toHaveCount(0);
  });
});

test.describe("U4 — no pain word refuses anything in the portal", () => {
  test("« genou douloureux, réduire la charge » is sent as typed", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
    await openUpdate(page);
    await request(page).fill("genou douloureux, réduire la charge");
    await expect(send(page)).toBeEnabled();
    await send(page).click();
    // Sent and accepted (202); the portal said nothing before the api answered.
    await expect(panel(page)).toHaveAttribute("data-ai-state", /running|failed/);
    await expect(panel(page).getByTestId("routine-ai-notice")).toHaveCount(0);
    const [post] = (await calls(page)).aiPosts;
    expect(post.outcome).toBe("202");
    expect(post.instructionLength).toBe("genou douloureux, réduire la charge".length);
  });
});

test.describe("U5 — COACH_AI_NOTHING_APPLIED has its own sentence and the box keeps the text", () => {
  test.beforeEach(async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
  });

  test("the sentence, not the generic Failed one; the coach rephrases in place and it applies", async ({ page }) => {
    await openUpdate(page);
    await sendAndSettle(page, "make it harder", "failed");
    await expect(panel(page).getByTestId("routine-ai-failed")).toHaveText(NOTHING_APPLIED);
    await expect(panel(page).getByText(FAILED)).toHaveCount(0);
    await expect(request(page)).toHaveValue("make it harder");
    await expect(box(page).getByTestId("routine-ai-update-counter")).toHaveText("14/500");
    // Rephrase in the same box and send again.
    await request(page).fill("make it harder: swap Monday and Wednesday");
    await send(page).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
  });

  test("after a reload the FAILED run still shows its sentence; the text was never stored", async ({ page }) => {
    await openUpdate(page);
    await sendAndSettle(page, "make it harder", "failed");
    await page.reload();
    await expect(panel(page).getByTestId("routine-ai-failed")).toHaveText(NOTHING_APPLIED);
    await expect(request(page)).toHaveValue("");
    // « Écarter » clears the run, by its id (EV-376).
    await box(page).getByRole("button", { name: "Discard" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
    const { aiDiscards } = await calls(page);
    expect(aiDiscards.at(-1)).toMatchObject({ clientId: LINA, touched: true });
    expect(aiDiscards.at(-1)?.proposalId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("a FAILED Update with another code renders that code's sentence", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "fail");
    await cookie(page, "evoli_fixture_ai_error", "COACH_AI_INVALID_OUTPUT");
    await openUpdate(page);
    await sendAndSettle(page, "swap", "failed");
    await expect(panel(page).getByTestId("routine-ai-failed")).toHaveText(FAILED);
    await expect(request(page)).toHaveValue("swap");
  });
});

test.describe("U6 — not offered without a draft or a published routine; COACH_PLAN_EMPTY has its sentence", () => {
  test.beforeEach(async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
  });

  test("Nils (no plan, no draft): Regenerate only; an unsaved blank plan is not a base; a saved draft is", async ({
    page,
  }) => {
    await page.goto(ROUTE(NILS));
    await expect(page.getByRole("button", { name: "Regenerate with AI", exact: true })).toBeVisible();
    await expect(updateButton(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Build a plan" }).click();
    await expect(updateButton(page)).toHaveCount(0);
    await addExercise(page, 0, "Goblet Squat");
    await addExercise(page, 1, "Push-Up");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await expect(updateButton(page)).toBeVisible();
  });

  test("the draft is discarded in another tab, then Generate: « Nils has no programme to change yet. … »", async ({
    page,
  }) => {
    await page.goto(ROUTE(NILS));
    await page.getByRole("button", { name: "Build a plan" }).click();
    await addExercise(page, 0, "Goblet Squat");
    await addExercise(page, 1, "Push-Up");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await updateButton(page).click();
    await request(page).fill("swap the first two sessions");

    const other = await page.context().newPage();
    await other.goto(ROUTE(NILS));
    await other.getByRole("button", { name: "Discard draft" }).click();
    await other.getByRole("dialog").getByRole("button", { name: "Discard draft" }).click();
    await expect(other.getByText("No active plan")).toBeVisible();
    await other.close();

    await send(page).click();
    await expect(panel(page).getByTestId("routine-ai-notice")).toHaveText(
      "Nils has no programme to change yet. Use “Regenerate with AI”."
    );
    await expect(request(page)).toHaveValue("swap the first two sessions");
    expect((await calls(page)).aiPosts.at(-1)?.outcome).toBe("COACH_PLAN_EMPTY");
  });
});

test.describe("U7 — the placeholder is Raed's swap, and on the stub a swap changes exactly two days", () => {
  test("« échange lundi et jeudi » → Monday and Wednesday exchanged, Friday unchanged; Keep lands it", async ({
    page,
  }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
    await openUpdate(page);
    await expect(request(page)).toHaveAttribute("placeholder", PLACEHOLDER);
    await sendAndSettle(page, "échange lundi et jeudi", "ready");
    const diff = panel(page).getByTestId("routine-ai-diff");
    await expect(diff.getByText("Compared with the published plan.")).toBeVisible();
    await expect(diff.locator('[data-day-kind="changed"]')).toHaveCount(2);
    await expect(diff.locator('[data-weekday="1"]')).toHaveAttribute("data-day-kind", "changed");
    await expect(diff.locator('[data-weekday="1"]')).toContainText("Focus: Upper Body A → Lower Body");
    await expect(diff.locator('[data-weekday="3"]')).toHaveAttribute("data-day-kind", "changed");
    await expect(diff.locator('[data-weekday="3"]')).toContainText("Focus: Lower Body → Upper Body A");
    // Friday is the one day left alone: folded into « 1 session unchanged ».
    await expect(diff.getByTestId("routine-ai-unchanged")).toContainText("1 session unchanged");
    await expect(diff.getByTestId("routine-ai-unchanged").locator('[data-weekday="5"]')).toHaveAttribute(
      "data-day-kind",
      "unchanged"
    );
    await expect(diff.getByTestId("routine-ai-settings")).toHaveCount(0); // N5: no subject-field rows

    await panel(page).getByRole("button", { name: "Keep" }).click();
    await expect(page.getByTestId("routine-ai-drafted")).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
    // Keep's clean-up DELETE names the kept proposal (EV-376).
    const { aiDiscards } = await calls(page);
    expect(aiDiscards.at(-1)?.proposalId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

test.describe("Refusals on an Update", () => {
  test.beforeEach(async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
  });

  test("429 scope=link names the 10 AI edits, not the 3 regenerations; the box keeps the text", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_link");
    await openUpdate(page);
    await request(page).fill("swap");
    await send(page).click();
    await expect(panel(page).getByTestId("routine-ai-notice")).toHaveText(
      "You've used today's 10 AI edits for Lina. You can still edit by hand, or try again tomorrow."
    );
    await expect(send(page)).toBeDisabled(); // held until Retry-After
    await expect(request(page)).toHaveValue("swap");
  });

  test("French 429 scope=link: « …les 10 modifications IA du jour pour Lina… »", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_link");
    await cookie(page, "evoli_pro_locale", "fr");
    await page.goto(ROUTE(LINA));
    await page.getByRole("button", { name: "Modifier avec l'IA", exact: true }).click();
    await box(page).getByRole("textbox").fill("échange");
    await box(page).getByRole("button", { name: "Générer" }).click();
    await expect(panel(page).getByTestId("routine-ai-notice")).toHaveText(
      "Vous avez utilisé les 10 modifications IA du jour pour Lina. Vous pouvez modifier à la main, ou réessayer demain."
    );
  });

  test("429 scope=coach and 503 BUSY keep their table sentences", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai", "rate_coach");
    await openUpdate(page);
    await request(page).fill("swap");
    await send(page).click();
    await expect(panel(page).getByTestId("routine-ai-notice")).toHaveText(
      "You've used all of today's AI suggestions across your clients. Try again tomorrow."
    );
    await cookie(page, "evoli_fixture_ai", "busy");
    await openUpdate(page);
    await request(page).fill("swap");
    await send(page).click();
    await expect(panel(page).getByTestId("routine-ai-notice")).toHaveText(
      "AI suggestions are busy right now. Try again in a minute."
    );
    await expect(send(page)).toBeEnabled(); // BUSY never holds the button
  });
});

test.describe("EV-376 — « Écarter » names the proposal on screen", () => {
  test("a run another tab started since is left RUNNING", async ({ page }) => {
    await cookie(page, "evoli_fixture_ai_caps", "instruction");
    await openUpdate(page);
    await sendAndSettle(page, "swap", "ready");

    // Another tab discards it and starts a fresh, long run.
    await cookie(page, "evoli_fixture_ai_delay_ms", "600000");
    const other = await page.context().newPage();
    await other.goto(ROUTE(LINA));
    await other.getByTestId("routine-ai-panel").getByRole("button", { name: "Discard" }).click();
    await expect(other.getByTestId("routine-ai-panel")).toHaveAttribute("data-ai-state", "idle");
    await other.getByRole("button", { name: "Update with AI", exact: true }).click();
    await other.getByTestId("routine-ai-update").getByRole("textbox").fill("swap");
    await other.getByTestId("routine-ai-update").getByRole("button", { name: "Generate" }).click();
    await expect(other.getByTestId("routine-ai-panel")).toHaveAttribute("data-ai-state", "running");

    // This tab still shows the first proposal; its « Écarter » must not cancel the other tab's run.
    await panel(page).getByRole("button", { name: "Discard" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
    const { aiDiscards } = await calls(page);
    expect(aiDiscards.at(-1)).toMatchObject({ clientId: LINA, touched: false });
    await other.reload();
    await expect(other.getByTestId("routine-ai-panel")).toHaveAttribute("data-ai-state", "running");
    await other.close();
  });
});

/** Adds one catalogue exercise to a day (`qa/coach-routine-draft.spec.ts`'s helper). */
async function addExercise(page: Page, dayIndex: number, name: string) {
  await openEveryDay(page);
  await page.getByRole("button", { name: "Add exercise" }).nth(dayIndex).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Search the catalog").fill(name);
  await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(picker.getByText(`Added ${name}.`)).toBeVisible();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
