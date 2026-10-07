import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-342c (audit A2, portal half) — the Programme tab reads the routine and the draft
 * TOGETHER, and `hasDraft` only decides whether the draft's answer is used.
 *
 * The round counts (C.1: 3 with a draft started from a template, 2 without) are pinned by
 * `page-read-budget.spec.ts`, which needs the populated scenario. This file holds the
 * failure rules (C.2, C.3) on the default `empty` scenario, where Lina's per-trainee reads
 * still answer (the fixture is addressable by id).
 *
 * `evoli_fixture_draft_read=<mode>:<clientId>` (`coachApi.fixture.ts`, `draftReadSwitch`)
 * changes ONLY the draft read: `500`, `403`, or `orphan` (a document although no draft is
 * stored, so the routine read says `hasDraft: false`).
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const ROUTINE = `/clients/${LINA}/routine`;
const LOAD_ERROR = "This trainee's routine could not be loaded.";
const DRAFT_BADGE = "Draft — not yet published";

interface Entry {
  op: string;
  document: boolean;
  request: string;
}

async function signIn(page: Page) {
  const login = await page.request.post("/api/auth/login", {
    data: { email: "coach@evoli.fit", password: "Password123!" },
    maxRedirects: 0,
  });
  expect(login.status()).toBe(200);
}

async function journal(page: Page): Promise<Entry[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { api: Entry[] }).api;
}

async function draftRead(page: Page, mode: "500" | "403" | "orphan") {
  await page.context().addCookies([
    { name: "evoli_fixture_draft_read", value: `${mode}:${LINA}`, url: new URL("/", page.url()).href },
  ]);
}

/** The document render's ops for one load of the routine tab. */
async function load(page: Page): Promise<string[]> {
  const before = (await journal(page)).length;
  const res = await page.goto(ROUTINE);
  expect(res?.status()).toBe(200);
  const mine = (await journal(page)).slice(before).filter((e) => e.document);
  return mine.map((e) => e.op).sort();
}

test.describe("EV-342c — the routine and the draft are read together", () => {
  test("without a draft, the draft read is made in the same render and its answer is not shown", async ({ page }) => {
    await signIn(page);
    // The control: the published plan's name, with no switch.
    expect(await load(page)).toEqual(["getClient", "getMe", "getRoutine", "getRoutineDraft"]);
    const planName = await page.locator("#plan-name").inputValue();
    expect(planName.length).toBeGreaterThan(0);
    await expect(page.getByText(DRAFT_BADGE, { exact: true })).toHaveCount(0);

    // C.2 — `hasDraft: false` and a draft endpoint answering a document: published plan only.
    await draftRead(page, "orphan");
    expect(await load(page), "the draft read was made (and answered a document)").toContain("getRoutineDraft");
    await expect(page.locator("#plan-name")).toHaveValue(planName);
    await expect(page.getByText(DRAFT_BADGE, { exact: true })).toHaveCount(0);
    await expect(page.getByText(LOAD_ERROR, { exact: true })).toHaveCount(0);
  });

  test("C.3 — without a draft, a failed draft read alone leaves the tab as it was", async ({ page }) => {
    await signIn(page);
    await page.goto(ROUTINE);
    const planName = await page.locator("#plan-name").inputValue();
    await draftRead(page, "500");
    expect(await load(page)).toContain("getRoutineDraft");
    await expect(page.locator("#plan-name")).toHaveValue(planName);
    await expect(page.getByText(LOAD_ERROR, { exact: true })).toHaveCount(0);
  });

  test("C.3 — with a draft, a failed draft read is today's load error, never a blank page", async ({ page }) => {
    await signIn(page);
    // From the seed (EV-223): Lina has a published plan and no draft. One edit and a save
    // make one.
    await page.goto(ROUTINE);
    await page.getByLabel("Sets").first().fill("5");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await page.reload();
    await expect(page.getByText(DRAFT_BADGE, { exact: true })).toBeVisible();

    await draftRead(page, "500");
    await load(page);
    await expect(page.getByText(LOAD_ERROR, { exact: true })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("#plan-name")).toHaveCount(0);
  });

  test("C.3 — a 403 on the draft read is today's denial, with or without a draft", async ({ page }) => {
    await signIn(page);
    await page.goto(ROUTINE);
    await draftRead(page, "403");
    await page.goto(ROUTINE);
    await page.waitForURL("/clients/denied");
  });
});
