import { createHash } from "node:crypto";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { signInThroughForm, type SignInLang } from "./sign-in";

/**
 * EV-341y2 — the intake page's test rig, for `qa/intake-routine-fields.spec.ts`. The same moves as
 * `qa/intake-interview.spec.ts` (EV-341b), which keeps its own copies: every seed PUT goes through
 * the portal's route handler, so the fixture's `intakePuts` journal sees what the api would.
 */

export const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
export const INTAKE = `/clients/${LINA}/intake`;

/** French no-break spaces read as spaces (whitespace KIND is asserted separately, on raw text). */
export const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

export type IntakePut = {
  clientId: string;
  section: string;
  body: { version: number; values: Record<string, unknown> };
  at: number;
};

export async function puts(page: Page, section?: string): Promise<IntakePut[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  const all = ((await res.json()) as { intakePuts: IntakePut[] }).intakePuts;
  return all.filter((p) => p.clientId === LINA && (!section || p.section === section));
}

export async function waitForPuts(page: Page, section: string, count: number, timeout = 10_000) {
  await expect.poll(async () => (await puts(page, section)).length, { timeout, intervals: [100] }).toBe(count);
}

/** The page's account header (`src/lib/sessionSubject.ts`), from the context's own access cookie. */
async function subjectHeader(page: Page): Promise<Record<string, string>> {
  const token = (await page.context().cookies()).find((c) => c.name === "evoli_pro_at")?.value ?? "";
  const sub = (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8") || "{}") as { sub?: string }).sub ?? "";
  return { "x-evoli-session-subject": createHash("sha256").update(`evoli-session-subject:${sub}`).digest("hex").slice(0, 32) };
}

export async function grant(page: Page): Promise<void> {
  const res = await page.request.post("/api/fixture/intake", { data: { clientId: LINA, answer: "grant" }, maxRedirects: 0 });
  expect(res.status(), "the trainee's grant").toBe(200);
}

/** A section write from "another tab", through the same route handler. Returns the HTTP status. */
export async function putSection(page: Page, section: string, version: number, values: Record<string, unknown>) {
  const res = await page.request.put(`/api/clients/${LINA}/intake/${section}`, {
    data: { version, values },
    headers: { "Content-Type": "application/json", ...(await subjectHeader(page)) },
    maxRedirects: 0,
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

export async function seedSection(page: Page, section: string, values: Record<string, unknown>, version = 0) {
  const res = await putSection(page, section, version, values);
  expect(res.status, `seed ${section}: ${JSON.stringify(res.body)}`).toBe(200);
}

export async function setSwitch(context: BrowserContext, page: Page, name: string, value: string) {
  await context.addCookies([{ name, value, url: new URL("/", page.url()).href }]);
}

export async function signIn(page: Page, lang: SignInLang = "en") {
  await signInThroughForm(page, { lang });
}

export async function openIntake(page: Page) {
  await page.goto(INTAKE);
  await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
  await expect(page.locator('[data-intake-ready="ready"]')).toHaveCount(1);
}

export function panel(page: Page, section: string): Locator {
  return page.locator(`[data-intake-panel="${section}"]`);
}

export function sectionTab(page: Page, section: string): Locator {
  return page.locator(`[data-intake-section="${section}"]`);
}

export function status(page: Page): Locator {
  return page.locator("[data-intake-status]");
}

/** Every save acknowledged: « Saved » / « Enregistré », and the guard's history entry gone. */
export async function settledSaved(page: Page, saved = "Saved") {
  await expect.poll(async () => plain(await status(page).textContent()), { timeout: 10_000, intervals: [50] }).toBe(saved);
  await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard !== true);
}
