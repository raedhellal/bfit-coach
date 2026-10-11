import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { launch, setSwitch, signedInContext, type Engine } from "./start-build";

/**
 * QA-S3N-1 (P3, introduced by EV-356g) — a DOCUMENT load of a library page whose connection drops
 * while the roster read is still pending.
 *
 * EV-356g streams the roster to the client picker as an unresolved promise. On a client
 * navigation a cut stream rejects it and the picker says BUG-738's sentence. On a document load
 * the answer travels as inline scripts that Next closes only when the document ends; a dropped
 * connection never ends it (`document.readyState` stays "loading"), the promise never settles,
 * and the picker said « Chargement de vos clients… » FOREVER (senior-qa s3n, 30 s witnessed).
 *
 * The fix bounds the wait (`useRosterRead`): the server's own bound, `API_READ_TIMEOUT_MS` = 8 s
 * per sequential api call, plus 4 s for delivery. 12 s on /templates and /nutrition-templates,
 * 20 s on /challenges (the whole roster: page 0, then the rest). Past it the picker says
 * « Vos clients n'ont pas pu être chargés. Rechargez la page pour réessayer. »
 *
 * Rig (QA's `zz-s3n-proxy.mjs`, committed here): `next start` (fixture, populated) behind a proxy
 * this spec starts on an ephemeral port. It forwards everything, and DESTROYS the response socket
 * of the document GET of the library path 1 s after the head was forwarded. The roster is held
 * 5 s (`evoli_fixture_roster_delay`, the switch's cap), so the cut lands while it is pending.
 * French, as QA's repro.
 *
 * Chromium (asserted, per page):
 *   C1 the list is painted and the picker, opened early, says it is loading;
 *   C2 the document never finishes (`readyState` "loading"): the case, not a slow read;
 *   C3 the failure sentence appears NO EARLIER than the deadline from the navigation's start (a
 *      read the server could still answer is never called failed) and no later than the
 *      deadline + 2 s from hydration; with its role (alert, status on /challenges); the act
 *      button disabled; no client offered;
 *   C4 never « no clients », never the error boundary; the list stays;
 *   C5 nothing is requested after the cut: no document, no RSC, no action, no `/api/` call
 *      (no refetch; ADR-0033 D33.13 invariant N untouched).
 * WebKit: C4 is asserted; the rest is RECORDED (annotations). WebKit usually runs no script until
 * the document ends, so after a drop the page never hydrates (QA-S3N-2, ruled accepted, out of
 * scope); when it hydrated early, C3 is asserted too. An inert WebKit cell passes on C4 alone and
 * is NOT evidence for the deadline: only a cell whose annotation says "picker opened" is (staff
 * N4). Whether WebKit hydrates early is chance (3/3 inert in staff's run, 1/3 early in ours).
 *
 * Red on 3c76491 (no deadline): C3 times out in all three Chromium cells, the picker still says
 * it is loading (and in a WebKit cell that hydrated early). A /challenges dialog given the
 * one-call deadline fails C3's lower bound (failure at 12 082 ms, deadline 20 000).
 *
 * Sentences are literals, never imports from `src/lib/copy*.ts`.
 */

const ROSTER_HOLD_MS = 5_000;
const CUT_AFTER_HEAD_MS = 1_000;
/** 8 s (`API_READ_TIMEOUT_MS`) per sequential api call + 4 s delivery margin. Literals on purpose. */
const ONE_CALL_DEADLINE_MS = 12_000;
const WHOLE_ROSTER_DEADLINE_MS = 20_000;
/** Hydration to the failure sentence, beyond the deadline: a timer and a commit. */
const LATE_SLACK_MS = 2_000;

const LOADING = "Chargement de vos clients…";
const FAILED = "Vos clients n'ont pas pu être chargés. Rechargez la page pour réessayer.";
const BOUNDARY = "Une erreur est survenue.";

type PageKey = "templates" | "nutrition" | "challenges";

interface LibraryPage {
  path: string;
  listRow: string;
  opener: (page: Page) => Locator;
  dialogName: string;
  /** How many clients the dialog offers (0 = none, the only right answer here). */
  offeredCount: (dialog: Locator) => Promise<number>;
  act: string | null;
  failedRole: "alert" | "status";
  none: string;
  deadlineMs: number;
}

const PAGES: Record<PageKey, LibraryPage> = {
  templates: {
    path: "/templates",
    listRow: 'ul.tpl-list [role="group"][aria-label="Upper / Lower split"]',
    opener: (page) =>
      page
        .getByRole("group", { name: "Upper / Lower split", exact: true })
        .getByRole("button", { name: "Appliquer à un client", exact: true }),
    dialogName: "Appliquer à un client",
    offeredCount: (dialog) => dialog.locator("select option").count(),
    act: "Appliquer",
    failedRole: "alert",
    none: "Aucun de vos clients n'a partagé ses séances avec vous.",
    deadlineMs: ONE_CALL_DEADLINE_MS,
  },
  nutrition: {
    path: "/nutrition-templates",
    listRow: '[role="group"][aria-label="Cut 1800"]',
    opener: (page) =>
      page
        .getByRole("group", { name: "Cut 1800", exact: true })
        .getByRole("button", { name: "Utiliser pour un client", exact: true }),
    dialogName: "Utiliser pour un client",
    offeredCount: (dialog) => dialog.getByRole("list").getByRole("button").count(),
    act: null,
    failedRole: "alert",
    none: "Aucun de vos clients n'a partagé sa nutrition avec vous.",
    deadlineMs: ONE_CALL_DEADLINE_MS,
  },
  challenges: {
    path: "/challenges",
    listRow: "ul.challenge-grid li[data-challenge-id]",
    opener: (page) => page.getByRole("button", { name: "Nouveau défi", exact: true }),
    dialogName: "Nouveau défi",
    offeredCount: (dialog) => dialog.getByRole("checkbox").count(),
    act: "Créer et inviter",
    failedRole: "status",
    none: "Vous n'avez encore aucun client lié. Invitez d'abord un client depuis la liste des clients.",
    deadlineMs: WHOLE_ROSTER_DEADLINE_MS,
  },
};

interface CuttingProxy {
  origin: string;
  /** `Date.now()` of each cut, with the path. */
  cuts: { at: number; path: string }[];
  close: () => Promise<void>;
}

/**
 * Forwards everything to `target`; the DOCUMENT GET of `cutPath` (no `RSC` header) has its
 * response socket destroyed `CUT_AFTER_HEAD_MS` after its head was forwarded.
 */
async function startCuttingProxy(target: URL, cutPath: string): Promise<CuttingProxy> {
  const cuts: CuttingProxy["cuts"] = [];
  const sockets = new Set<Socket>();
  const server = http.createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    const cut = req.method === "GET" && path === cutPath && !req.headers["rsc"];
    const up = http.request(
      { host: target.hostname, port: target.port, path: req.url, method: req.method, headers: req.headers },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.rawHeaders);
        answer.pipe(res);
        if (cut) {
          setTimeout(() => {
            cuts.push({ at: Date.now(), path });
            res.destroy();
            answer.destroy();
          }, CUT_AFTER_HEAD_MS);
        }
      }
    );
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://localhost:${port}`,
    cuts,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

/**
 * In the page from its first script: when (`performance.now()`, from the navigation's start) each
 * sentence was first SEEN in an open dialog or in the visible page, and when the app hydrated
 * (`data-nav-progress-ready`). `innerText`, never `textContent`: the inline Flight payload carries
 * the copy too, and a script's text is not a painted sentence.
 */
function sentenceWatcher(texts: { loading: string; failed: string; none: string; boundary: string }): void {
  const w = window as unknown as { __seen: Record<string, number> };
  w.__seen = {};
  const mark = (key: string) => {
    if (w.__seen[key] === undefined) w.__seen[key] = performance.now();
  };
  const scan = () => {
    if (document.querySelector("[data-nav-progress-ready]")) mark("hydrated");
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).map((d) => (d as HTMLElement).innerText);
    const inDialog = dialogs.join("\n");
    if (inDialog.includes(texts.loading)) mark("loading");
    if (inDialog.includes(texts.failed)) mark("failed");
    if (inDialog.includes(texts.none)) mark("none");
    if (document.body && document.body.innerText.includes(texts.boundary)) mark("boundary");
  };
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  setInterval(scan, 100);
}

const seen = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Record<string, number> }).__seen);

/** Requests that are not static assets, from `since` (`Date.now()`). */
function trackRequests(context: BrowserContext): { at: number; line: string }[] {
  const log: { at: number; line: string }[] = [];
  context.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith("/_next/static/") || url.pathname === "/favicon.ico") return;
    const h = req.headers();
    const kind = req.isNavigationRequest() ? "DOC" : h["next-action"] ? "ACTION" : h["rsc"] === "1" ? "RSC" : req.resourceType();
    log.push({ at: Date.now(), line: `${kind} ${req.method()} ${url.pathname}` });
  });
  return log;
}

for (const engine of ["chromium", "webkit"] as Engine[]) {
  test.describe(`QA-S3N-1, ${engine}: the connection drops while the roster read is pending`, () => {
    let browser: Browser;
    test.beforeAll(async () => {
      browser = await launch(engine);
    });
    test.afterAll(async () => {
      await browser?.close();
    });

    for (const key of ["templates", "nutrition", "challenges"] as PageKey[]) {
      const lib = PAGES[key];
      const deadline = lib.deadlineMs;

      test(`${lib.path} (document load): the picker stops saying it is loading at the deadline, ${deadline} ms, and says to reload`, async ({
        baseURL,
      }) => {
        test.setTimeout(deadline + 45_000);
        const proxy = await startCuttingProxy(new URL(baseURL!), lib.path);
        const context = await signedInContext(browser, baseURL!, "fr-FR");
        try {
          await setSwitch(context, baseURL!, "evoli_pro_locale", "fr");
          await setSwitch(context, baseURL!, "evoli_fixture_roster_delay", String(ROSTER_HOLD_MS));
          context.setDefaultTimeout(10_000);
          const requests = trackRequests(context);
          const page = await context.newPage();
          await page.addInitScript(sentenceWatcher, { loading: LOADING, failed: FAILED, none: lib.none, boundary: BOUNDARY });

          const res = await page.goto(`${proxy.origin}${lib.path}`, { waitUntil: "commit" });
          expect(res?.status(), `${lib.path} answers through the proxy`).toBe(200);
          await expect(page.locator(lib.listRow).first()).toBeVisible();

          // Open the picker as soon as a click can reach it. WebKit may never get there.
          const dialog = page.getByRole("dialog", { name: lib.dialogName, exact: true });
          const tryUntil = Date.now() + (engine === "chromium" ? 5_000 : deadline + 3_000);
          while (!(await dialog.isVisible()) && Date.now() < tryUntil) {
            await lib.opener(page).click({ timeout: 250 }).catch(() => undefined);
            await page.waitForTimeout(150);
          }
          const opened = await dialog.isVisible();

          await expect.poll(() => proxy.cuts.length, { timeout: 5_000, message: "the proxy cut the document" }).toBe(1);
          const cutAt = proxy.cuts[0].at;

          if (opened) {
            await expect(dialog.getByRole("status").filter({ hasText: LOADING })).toHaveText(LOADING);
            // C3: the failure sentence, at the deadline.
            const failure = dialog.getByRole(lib.failedRole).filter({ hasText: FAILED });
            await expect(failure).toHaveText(FAILED, { timeout: deadline + LATE_SLACK_MS + 5_000 });
          } else {
            // Inert WebKit (QA-S3N-2): wait the deadline out, then record what there is.
            await page.waitForTimeout(Math.max(0, deadline + LATE_SLACK_MS - (Date.now() - cutAt)));
          }

          const at = await seen(page);
          const readyState = await page.evaluate(() => document.readyState);
          const hydrated = at.hydrated !== undefined;
          test.info().annotations.push({
            type: `QA-S3N-1 ${engine} ${lib.path}`,
            description:
              `readyState ${readyState}; hydrated ${hydrated ? `${Math.round(at.hydrated)} ms` : "never"}; ` +
              `picker ${opened ? "opened" : "never opened (inert)"}; loading seen ${fmtAt(at.loading)}; ` +
              `failure seen ${fmtAt(at.failed)}; deadline ${deadline} ms`,
          });

          // C4, both engines: never "no clients", never the boundary, the list stays.
          expect(at.none, "never « no clients »").toBeUndefined();
          expect(at.boundary, "never the error boundary").toBeUndefined();
          await expect(page.locator(lib.listRow).first()).toBeVisible();

          if (engine === "chromium") {
            expect(opened, "Chromium hydrates early: the picker opens while the roster is pending").toBe(true);
            // C2: this is the dropped document, not a slow read that finished.
            expect(readyState, "the document never finished: the case QA-S3N-1 is about").toBe("loading");
          }
          if (opened) {
            // C1: the loading line came first; C3: the failure no earlier than the deadline from the
            // navigation's start, and no later than the deadline + slack from hydration.
            expect(at.loading, "the loading line was shown").toBeDefined();
            expect(at.hydrated, "the app hydrated").toBeDefined();
            expect(at.failed, "the failure sentence was shown").toBeDefined();
            expect(at.failed, "never called failed before the server's own bound + margin").toBeGreaterThanOrEqual(deadline);
            expect(at.failed, "failed at the deadline, counted from hydration").toBeLessThanOrEqual(
              at.hydrated + deadline + LATE_SLACK_MS
            );
            expect(await lib.offeredCount(dialog), "nobody is offered: the roster never answered").toBe(0);
            if (lib.act) await expect(dialog.getByRole("button", { name: lib.act, exact: true })).toBeDisabled();
          }

          // C5: no refetch, nothing at all asked of the server after the cut.
          const after = requests.filter((r) => r.at > cutAt).map((r) => r.line);
          expect(after, "nothing is requested after the cut").toEqual([]);
        } finally {
          await context.close();
          await proxy.close();
        }
      });
    }
  });
}

function fmtAt(ms: number | undefined): string {
  return ms === undefined ? "never" : `${Math.round(ms)} ms`;
}
