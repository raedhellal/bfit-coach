import { expect, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";

/**
 * The zero-frame harness for ADR-0033 D33.14's witnesses (BUG-745), after D33.13's Q1.
 *
 * A body-wide `MutationObserver`, installed by `addInitScript` in EVERY document of tab 1 and
 * reporting through `exposeBinding` (which survives document loads), records:
 *  - a RECORD: a node containing the client's name, added while `html[data-session-leaving]`
 *    is ABSENT when the observer's callback runs. The callback runs at the end of the task that
 *    mutated the DOM, after a React commit's layout effects, so a node hidden in that same task
 *    never reached a paint and is not counted (staff 2.6);
 *  - the LAYER: the value of `data-session-leaving` / `data-session-ended` when first set;
 *  - each DOCUMENT, by an id, so an account switch can tell the old document's paints from the
 *    page the new session's server rendered.
 * Requests are logged by type: DOC (a document), FULL (an RSC navigation), AUTO (a prefetch),
 * ACTION (a server action POST).
 */

export const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
export const LINA_NAME = "Lina M.";
/** WORKOUTS-only, published plan, no draft: the template "Use on a trainee" target. */
export const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
export const YUSUF_NAME = "Yusuf A.";
export const SEEDED_TEMPLATE = "Upper / Lower split";

export type Lang = "en" | "fr";
export const LABELS = {
  en: {
    locale: "en-US",
    signOut: "Sign out",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    leave: "Leave without saving",
    banner: "Your session has ended. Copy your changes, then sign in again.",
    bannerButton: "Sign in again",
    use: "Use on a trainee",
    useConfirm: "Use this template",
    save: "Save template",
    templateName: "Template name",
    day: (n: number) => `Day ${n}`,
    addExercise: "Add exercise",
  },
  fr: {
    locale: "fr-FR",
    signOut: "Se déconnecter",
    email: "E-mail",
    password: "Mot de passe",
    signIn: "Se connecter",
    leave: "Quitter sans enregistrer",
    banner: "Votre session est terminée. Copiez vos modifications, puis reconnectez-vous.",
    bannerButton: "Se reconnecter",
    use: "Appliquer à un client",
    useConfirm: "Appliquer",
    save: "Enregistrer le modèle",
    templateName: "Nom du modèle",
    day: (n: number) => `Jour ${n}`,
    addExercise: "Ajouter un exercice",
  },
} as const;

export interface Seen {
  at: number;
  kind: "DOC" | "FULL" | "AUTO" | "ACTION";
  path: string;
  status?: number;
  /** Aborted before an answer (a later `location.replace` superseded it). */
  failed?: boolean;
}

export interface Report {
  kind: "doc" | "record" | "layer";
  doc: string;
  at: number;
  url: string;
  text?: string;
  attr?: string;
  value?: string;
}

export interface Tabs {
  context: BrowserContext;
  tab1: Page;
  tab2: Page;
  /** Everything tab 1's documents reported. */
  reports: Report[];
  /** Tab 1's requests. */
  seen: Seen[];
  /** `beforeunload` (and any other) dialogs tab 1 raised. */
  dialogs: string[];
  lang: Lang;
  baseURL: string;
}

export interface TabsOptions {
  lang?: Lang;
  /** Layer (d) on? Default OFF: the witnesses of (a)–(c) run without it (staff r2 S3, the M9 build). */
  wake?: boolean;
  /** W13: no BroadcastChannel in either tab. */
  noBroadcastChannel?: boolean;
  /** W12: no epoch cookie in the jar when the tabs load (a session from before the deploy). */
  noEpochAtLoad?: boolean;
  /** The name a record looks for (default Lina M.). */
  name?: string;
}

export function epochCookieName(baseURL: string): string {
  return baseURL.startsWith("https:") ? "__Host-evoli_pro_epoch" : "evoli_pro_epoch";
}

export async function openTabs(browser: Browser, baseURL: string, opts: TabsOptions = {}): Promise<Tabs> {
  const lang = opts.lang ?? "en";
  const L = LABELS[lang];
  const context = await browser.newContext({
    baseURL,
    locale: L.locale,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { "Accept-Language": L.locale },
  });
  const login = await context.request.post("/api/auth/login", {
    data: { email: "coach@evoli.fit", password: "Password123!" },
    maxRedirects: 0,
  });
  expect(login.status(), "fixture sign-in").toBe(200);
  // The language by its cookie too: a hand-made context can inherit the runner's English header
  // (web-engineer note `a-hand-made-context-inherits-the-runners-language`).
  await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL }]);
  if (!opts.wake) {
    await context.addCookies([{ name: "evoli_fixture_session_wake", value: "off", url: baseURL }]);
  }
  if (opts.noEpochAtLoad) {
    await context.clearCookies({ name: epochCookieName(baseURL) });
    expect((await context.cookies()).some((c) => c.name === epochCookieName(baseURL))).toBe(false);
  }
  if (opts.noBroadcastChannel) {
    await context.addInitScript(() => {
      delete (window as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;
    });
  }

  const tab1 = await context.newPage();
  const reports: Report[] = [];
  const seen: Seen[] = [];
  const dialogs: string[] = [];
  await tab1.exposeBinding("__epochReport", (_source, report: Report) => {
    reports.push(report);
  });
  await tab1.addInitScript((name: string) => {
    const doc = Math.random().toString(36).slice(2);
    const queue: unknown[] = [];
    const send = (r: Record<string, unknown>) => {
      const report = { doc, at: Date.now(), url: location.href, ...r };
      const fn = (window as unknown as { __epochReport?: (r: unknown) => void }).__epochReport;
      if (fn) {
        while (queue.length) fn(queue.shift());
        fn(report);
      } else queue.push(report);
    };
    send({ kind: "doc" });
    const leaving = () => document.documentElement?.hasAttribute("data-session-leaving") ?? false;
    new MutationObserver((mutations) => {
      const hidden = leaving();
      for (const m of mutations) {
        if (m.type === "attributes") {
          const el = m.target as Element;
          const value = el.getAttribute(m.attributeName!);
          if (value !== null && m.oldValue === null) send({ kind: "layer", attr: m.attributeName, value });
          continue;
        }
        if (hidden) continue;
        // A flight payload in an inline <script> is data, never painted.
        const inScript = (n: Node | null) => !!n && (n.nodeName === "SCRIPT" || n.parentNode?.nodeName === "SCRIPT");
        if (inScript(m.target)) continue;
        if (m.type === "characterData") {
          const text = (m.target as CharacterData).data;
          if (text.includes(name)) send({ kind: "record", text: text.slice(0, 120) });
          continue;
        }
        for (const node of Array.from(m.addedNodes)) {
          if (inScript(node)) continue;
          const text = node.textContent ?? "";
          if (text.includes(name)) send({ kind: "record", text: text.replace(/\s+/g, " ").slice(0, 120) });
        }
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["data-session-leaving", "data-session-ended"],
    });
  }, opts.name ?? LINA_NAME);
  tab1.on("request", (req) => {
    const url = new URL(req.url());
    const h = req.headers();
    let kind: Seen["kind"] | null = null;
    if (req.method() === "POST" && h["next-action"] !== undefined) kind = "ACTION";
    else if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) return;
    else if (req.isNavigationRequest()) kind = "DOC";
    else if (h["rsc"] === "1") kind = h["next-router-prefetch"] === "1" ? "AUTO" : "FULL";
    if (!kind) return;
    const entry: Seen = { at: Date.now(), kind, path: url.pathname };
    seen.push(entry);
    req
      .response()
      .then((res) => (entry.status = res?.status()))
      .catch(() => undefined);
  });
  tab1.on("requestfailed", (req) => {
    const entry = [...seen].reverse().find((s) => s.path === new URL(req.url()).pathname && s.status === undefined);
    if (entry) entry.failed = true;
  });
  tab1.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss().catch(() => undefined);
  });
  const tab2 = await context.newPage();
  return { context, tab1, tab2, reports, seen, dialogs, lang, baseURL };
}

/** A page, hydrated (the nav-progress island marks it). */
export async function hydrated(page: Page, path: string): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `${path} loads`).toBe(200);
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
}

/** Roster → Lina's overview (a soft navigation) → back to the roster by the sidebar link. */
export async function openLinaThenRoster(t: Tabs): Promise<void> {
  await hydrated(t.tab1, "/");
  await t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
  await t.tab1.waitForURL(`**/clients/${LINA}`);
  await expect(t.tab1.locator("h1")).toHaveText(LINA_NAME);
  await t.tab1.locator('.shell-sidebar a[href="/"]').last().click();
  await t.tab1.waitForURL((u) => u.pathname === "/");
  await expect(t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`)).toBeVisible();
}

/** Tab 2: the shell's « Sign out ». Returns the timestamp taken just before the click. */
export async function signOutInTab2(t: Tabs): Promise<number> {
  if (!t.tab2.url().startsWith("http")) await hydrated(t.tab2, "/");
  await t.tab2.bringToFront();
  const at = Date.now();
  await t.tab2.getByRole("button", { name: LABELS[t.lang].signOut, exact: true }).click();
  await t.tab2.waitForURL((u) => u.pathname === "/login");
  await expect
    .poll(async () => (await t.context.cookies()).some((c) => c.name === "evoli_pro_at" && c.value !== ""))
    .toBe(false);
  return at;
}

/** Records made after `since` (all documents, or only the documents that existed before it). */
export function recordsAfter(t: Tabs, since: number, onlyOldDocuments = false): Report[] {
  const old = new Set(t.reports.filter((r) => r.kind === "doc" && r.at < since).map((r) => r.doc));
  return t.reports.filter((r) => r.kind === "record" && r.at >= since && (!onlyOldDocuments || old.has(r.doc)));
}

/** The first value tab 1 recorded for `attr` after `since`. */
export function layerAfter(t: Tabs, since: number, attr = "data-session-leaving"): string | null {
  return t.reports.find((r) => r.kind === "layer" && r.attr === attr && r.at >= since)?.value ?? null;
}

export const fmt = (seen: Seen[]) => seen.map((s) => `${s.kind} ${s.path} ${s.failed ? "aborted" : s.status ?? "?"}`);

/**
 * W1's expectations (the BUG-745 shape): tab 1 ends on /login, with ZERO records, no RSC
 * request for the client's page, at most one document request before /login, and the layer.
 * Then W11: ten seconds of watching, no further document load (no reload loop).
 */
export async function expectLeftToLogin(
  t: Tabs,
  since: number,
  layer: string,
  opts: { clientPath?: string; watch?: boolean; allowRefusedRsc?: boolean; reissued?: boolean; routerFallback?: boolean } = {}
): Promise<void> {
  const clientPath = opts.clientPath ?? `/clients/${LINA}`;
  // Polled, not `waitForURL`: a reload superseded by the popstate re-issue is an ABORTED
  // navigation, which `waitForURL` reports as a failure.
  await expect
    .poll(() => new URL(t.tab1.url()).pathname, { timeout: 15_000 })
    .toBe("/login")
    .catch(() => undefined); // judged below, after the records, so a red run shows both
  const after = t.seen.filter((s) => s.at >= since);
  const records = recordsAfter(t, since);
  expect.soft(records, `zero records; requests: ${fmt(after).join(", ")}`).toEqual([]);
  expect(new URL(t.tab1.url()).pathname, "tab 1 ends on /login").toBe("/login");
  await expect(t.tab1.getByLabel(LABELS[t.lang].email)).toBeVisible();
  const rsc = after.filter((s) => (s.kind === "FULL" || s.kind === "AUTO") && s.path.startsWith(clientPath));
  if (opts.allowRefusedRsc) {
    expect(rsc.filter((s) => s.status === 200), `no RSC answer for the client's page: ${fmt(after)}`).toEqual([]);
  } else {
    expect(rsc, `no RSC request for the client's page: ${fmt(after)}`).toEqual([]);
  }
  // Answered ones: a request a later `location.replace` aborted never loaded a document (the
  // popstate re-issue in W3's Back-then-Forward is such a case, by design).
  const firstLogin = after.find((s) => s.kind === "DOC" && s.path === "/login" && !s.failed)?.at ?? Infinity;
  const docsBeforeLogin = after.filter((s) => s.kind === "DOC" && s.path !== "/login" && !s.failed && s.at <= firstLogin);
  if (opts.reissued) {
    // A traversal queued while leaving re-issues the reload (D33.14 point 2): its document request
    // is a second one, and the first may already have been answered. Each is refused by middleware.
    expect(docsBeforeLogin.length, `at most the reload and its re-issue: ${fmt(after)}`).toBeLessThanOrEqual(2);
    expect(docsBeforeLogin.every((s) => s.status === 307), `every one refused (307): ${fmt(after)}`).toBe(true);
  } else {
    expect(docsBeforeLogin.length, `at most one document request before /login: ${fmt(after)}`).toBeLessThanOrEqual(1);
  }
  const fired = layerAfter(t, since);
  if (opts.routerFallback && fired === null) {
    // Next's own fallback: the refused RSC answer's redirect follow was aborted, so the router
    // made a document navigation to the target itself (no client commit for the guard to see).
    // Allowed only as a document request for the client's page that the server refused.
    const docs = after.filter((s) => s.kind === "DOC" && s.path.startsWith(clientPath));
    expect(docs.length, `the router's own document fallback: ${fmt(after)}`).toBe(1);
    expect(docs[0].status, `refused by middleware: ${fmt(after)}`).toBe(307);
    if (opts.watch !== false) await expectNoLoop(t, since);
    return;
  }
  expect(fired, `the layer that did the work; reports: ${JSON.stringify(t.reports.filter((r) => r.kind !== "doc" && r.at >= since))}`).toBe(layer);
  if (opts.watch !== false) await expectNoLoop(t, since);
}

/** W11: exactly one document load per boundary, then stable for 10 s. */
export async function expectNoLoop(t: Tabs, since: number): Promise<void> {
  const docsNow = t.seen.filter((s) => s.at >= since && s.kind === "DOC").length;
  const url = t.tab1.url();
  await t.tab1.waitForTimeout(10_000);
  const docsLater = t.seen.filter((s) => s.at >= since && s.kind === "DOC").length;
  expect(docsLater, `no further document load in 10 s: ${fmt(t.seen.filter((s) => s.at >= since))}`).toBe(docsNow);
  expect(t.tab1.url()).toBe(url);
}

/**
 * Hold the NEXT response matching `match` until `release()`: the request reaches the server
 * (with whatever session the browser sent), and its answer is kept back. `reached` resolves
 * when the server has answered.
 */
export async function holdResponse(
  page: Page,
  match: (route: Route) => boolean
): Promise<{ reached: Promise<void>; release: () => void }> {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  let arrived!: () => void;
  const reached = new Promise<void>((r) => (arrived = r));
  let held = false;
  await page.route("**/*", async (route) => {
    if (held || !match(route)) return route.fallback();
    held = true;
    const response = await route.fetch();
    arrived();
    await released;
    await route.fulfill({ response });
  });
  return { reached, release };
}
