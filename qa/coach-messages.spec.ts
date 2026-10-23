import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Locator, type Page, type Request } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoEnglish } from "./french";

/**
 * EV-095b — « Messages » in the coach portal (AC-B1, AC-B3, AC-B5, AC-B6; AC-B4's dot is
 * `roster-unread-dot.spec.ts`, roster config). Fixture mode, the default suite.
 *
 * The client's half (writing from the phone) is `POST /api/fixture/messages`; the stored thread,
 * with BOTH read positions, is `GET /api/fixture/messages?clientId=` (a witness the portal never
 * receives). Polls are counted as the browser's own `GET /api/bff/clients/{id}/messages`.
 *
 * Expected sentences are LITERALS, never read from `src/lib/copy.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const page_ = (id: string) => `/clients/${id}/messages`;
const BFF = (id: string) => `/api/bff/clients/${id}/messages`;

const T = {
  en: {
    locale: "en-US",
    tab: "Messages",
    h2: "Messages",
    log: "Messages with Lina",
    empty: "No messages with Lina yet.",
    composer: "Message to Lina",
    send: "Send",
    retry: "Retry",
    sending: "Sending…",
    you: "You",
    failed: "We couldn't confirm the message was sent. Retrying without changing it won't send it twice.",
    rate: "You have sent 60 messages in this conversation in the last hour. You can send again in 15 minutes.",
    invisible: "The message contains an invisible formatting character that cannot be sent. Retype the part you pasted.",
    loadError: "The messages could not be loaded. Reload the page to try again.",
    older: "Show earlier messages",
  },
  fr: {
    locale: "fr-FR",
    tab: "Messages",
    h2: "Messages",
    log: "Messages avec Lina",
    empty: "Aucun message avec Lina pour l'instant.",
    composer: "Message à Lina",
    send: "Envoyer",
    retry: "Réessayer",
    sending: "Envoi…",
    you: "Vous",
    failed: "L'envoi n'a pas pu être confirmé. Réessayer sans modifier le message ne l'enverra pas deux fois.",
    rate: "Vous avez envoyé 60 messages dans cette conversation en une heure. Vous pourrez de nouveau écrire dans 15 minutes.",
    invisible: "Le message contient un caractère de mise en forme invisible qui ne peut pas être envoyé. Retapez la partie collée.",
    loadError: "Les messages n'ont pas pu être chargés. Rechargez la page pour réessayer.",
    older: "Afficher les messages précédents",
  },
} as const;
type Lang = keyof typeof T;

const plain = (text: string | null) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");

type Stored = {
  messages: { seq: number; author: "COACH" | "TRAINEE"; body: string; clientMessageId: string | null }[];
  coachReadSeq: number;
  traineeReadSeq: number;
};

async function stored(page: Page, id = LINA): Promise<Stored> {
  const res = await page.request.get(`/api/fixture/messages?clientId=${id}`, { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/messages (fixture mode only)").toBe(200);
  return (await res.json()) as Stored;
}

async function traineeWrites(page: Page, body: string, id = LINA): Promise<number> {
  const res = await page.request.post("/api/fixture/messages", { data: { clientId: id, body }, maxRedirects: 0 });
  expect(res.status(), "the client's message").toBe(200);
  return ((await res.json()) as { seq: number }).seq;
}

async function setSwitch(page: Page, name: string, value: string | null): Promise<void> {
  const url = new URL("/", page.url()).href;
  if (value === null) await page.context().clearCookies({ name });
  else await page.context().addCookies([{ name, value, url }]);
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/** Every poll the PAGE sends for one client's thread, with its time. */
function recordPolls(page: Page, id = LINA): number[] {
  const at: number[] = [];
  page.on("request", (r: Request) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && url.pathname === BFF(id)) at.push(Date.now());
  });
  return at;
}

function log(page: Page, lang: Lang = "en"): Locator {
  return page.getByRole("log", { name: T[lang].log, exact: true });
}
function composer(page: Page, lang: Lang = "en"): Locator {
  return page.getByRole("textbox", { name: T[lang].composer, exact: true });
}
function sendButton(page: Page, name: string): Locator {
  return page.locator("form.msg-composer").getByRole("button", { name, exact: true });
}

async function open(page: Page, id = LINA, lang: Lang = "en"): Promise<void> {
  await page.goto(page_(id));
  await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
  await expect(page.locator("section.msg")).toHaveCount(1);
  if (id === LINA) await expect(log(page, lang)).toBeVisible();
}

async function sendText(page: Page, text: string, lang: Lang = "en"): Promise<void> {
  await composer(page, lang).fill(text);
  await sendButton(page, T[lang].send).click();
}

test.describe("EV-095b (EN)", () => {
  test.use({ locale: "en-US" });

  test("AC-B1: the « Messages » tab links to the thread, under the client's name, with a composer", async ({ page }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${LINA}`);
    const nav = page.getByRole("main").getByRole("navigation", { name: "Trainee sections", exact: true });
    const tab = nav.getByRole("link", { name: T.en.tab, exact: true });
    await expect(tab).toHaveAttribute("href", page_(LINA));
    await tab.click();
    await expect(page).toHaveURL(new RegExp(`${page_(LINA)}$`));
    await expect(nav.locator('[aria-current="page"]')).toHaveText(T.en.tab);
    await expect(page.locator("h1")).toHaveText("Lina M.");
    await expect(page.getByRole("heading", { level: 2, name: T.en.h2, exact: true })).toBeVisible();
    await expect(log(page)).toBeVisible();
    await expect(log(page).getByText(T.en.empty, { exact: true })).toBeVisible();
    await expect(composer(page)).toBeEditable();
    await expect(sendButton(page, T.en.send)).toBeDisabled();
  });

  test("a send: the message shows, the composer clears, \\r\\n went as \\n, one stored message", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === BFF(LINA)) posts.push(r.postData() ?? "");
    });
    // A pasted Windows line break: the composer sends `\n`, never `\r` (the api refuses it).
    await composer(page).evaluate((el: HTMLTextAreaElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(el, "First line\r\nsecond line");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sendButton(page, T.en.send).click();
    const item = log(page).locator('li[data-author="COACH"]');
    await expect(item).toHaveCount(1);
    await expect(item.locator(".msg-body")).toHaveText("First line\nsecond line");
    await expect(item.locator(".msg-author")).toHaveText(T.en.you);
    await expect(composer(page)).toHaveValue("");
    expect(posts, "one POST").toHaveLength(1);
    const sent = JSON.parse(posts[0]) as { clientMessageId: string; body: string };
    expect(sent.body).toBe("First line\nsecond line");
    expect(sent.body.includes("\r"), "no \\r on the wire").toBe(false);
    expect(sent.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
    const s = await stored(page);
    expect(s.messages.map((m) => [m.author, m.body])).toEqual([["COACH", "First line\nsecond line"]]);
    // The coach's own send is read by the coach (D38.4 step 6).
    expect(s.coachReadSeq).toBe(1);
  });

  test("AC-B5: a failed send keeps the text, offers « Retry », and the retry sends it once", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    await setSwitch(page, "evoli_fixture_messages_send", "fail");
    await sendText(page, "Are you free on Thursday?");
    await expect(page.locator("[data-messages-failure]")).toHaveText(T.en.failed);
    await expect(composer(page)).toHaveValue("Are you free on Thursday?");
    await expect(sendButton(page, T.en.retry)).toBeEnabled();
    await expect(log(page).locator("li")).toHaveCount(0);
    expect((await stored(page)).messages, "the failure stored nothing").toEqual([]);

    await setSwitch(page, "evoli_fixture_messages_send", null);
    await sendButton(page, T.en.retry).click();
    await expect(log(page).locator('li[data-author="COACH"] .msg-body')).toHaveText(["Are you free on Thursday?"]);
    await expect(composer(page)).toHaveValue("");
    await expect(page.locator("[data-messages-failure]")).toHaveCount(0);
    await expect(sendButton(page, T.en.send)).toBeVisible();
    expect((await stored(page)).messages).toHaveLength(1);
  });

  test("AC-B5 / AC-A5: an answer lost after the api stored it — the retry reuses the id, still one message", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    const ids: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === BFF(LINA)) ids.push(JSON.parse(r.postData() ?? "{}").clientMessageId);
    });
    await setSwitch(page, "evoli_fixture_messages_send", "lost");
    await sendText(page, "See you at 6.");
    await expect(page.locator("[data-messages-failure]")).toHaveText(T.en.failed);
    await expect(composer(page)).toHaveValue("See you at 6.");
    expect((await stored(page)).messages, "the api DID store it").toHaveLength(1);

    await setSwitch(page, "evoli_fixture_messages_send", null);
    await sendButton(page, T.en.retry).click();
    await expect(composer(page)).toHaveValue("");
    await expect(log(page).locator("li .msg-body")).toHaveText(["See you at 6."]);
    expect(ids, "two POSTs, one id").toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    expect((await stored(page)).messages, "the replay wrote nothing").toHaveLength(1);
  });

  test("AC-B5: a changed text after a failure is a new message id", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    const ids: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === BFF(LINA)) ids.push(JSON.parse(r.postData() ?? "{}").clientMessageId);
    });
    await setSwitch(page, "evoli_fixture_messages_send", "fail");
    await sendText(page, "Draft one");
    await expect(sendButton(page, T.en.retry)).toBeVisible();
    await setSwitch(page, "evoli_fixture_messages_send", null);
    await composer(page).fill("Draft two");
    // A different text is not a retry of the failed one.
    await sendButton(page, T.en.send).click();
    await expect(composer(page)).toHaveValue("");
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  /** Every POST the page sends for Lina's thread: its id and its body, in order. */
  function recordPosts(page: Page): { clientMessageId: string; body: string }[] {
    const posts: { clientMessageId: string; body: string }[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === BFF(LINA)) posts.push(JSON.parse(r.postData() ?? "{}"));
    });
    return posts;
  }

  test("AC-B7: an answer lost, then only a trailing space and line break added — « Retry » stays, same id, one message", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    const posts = recordPosts(page);
    await setSwitch(page, "evoli_fixture_messages_send", "lost");
    await sendText(page, "See you at 6.");
    await expect(page.locator('[data-messages-failure="sendFailed"]')).toHaveText(T.en.failed);
    expect((await stored(page)).messages, "the api DID store it").toHaveLength(1);
    await setSwitch(page, "evoli_fixture_messages_send", null);

    // The api would store "See you at 6. \n" as "See you at 6." (String.strip): the same message.
    await composer(page).fill("See you at 6. \n");
    await expect(sendButton(page, T.en.retry), "« Retry » is still offered").toBeEnabled();
    await expect(page.locator('[data-messages-failure="sendFailed"]')).toHaveText(T.en.failed);
    await sendButton(page, T.en.retry).click();
    await expect(composer(page)).toHaveValue("");
    await expect(page.locator("[data-messages-failure]")).toHaveCount(0);
    await expect(log(page).locator("li .msg-body")).toHaveText(["See you at 6."]);
    expect(posts.map((p) => p.body)).toEqual(["See you at 6.", "See you at 6. \n"]);
    expect(posts[1].clientMessageId, "the retry is a replay: the same clientMessageId").toBe(posts[0].clientMessageId);
    const s = await stored(page);
    expect(s.messages.map((m) => m.body), "exactly one stored message").toEqual(["See you at 6."]);
  });

  test("AC-B7: a visible-character edit after a lost answer takes a new id (two messages)", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    const posts = recordPosts(page);
    await setSwitch(page, "evoli_fixture_messages_send", "lost");
    await sendText(page, "See you at 6.");
    await expect(page.locator('[data-messages-failure="sendFailed"]')).toHaveText(T.en.failed);
    await setSwitch(page, "evoli_fixture_messages_send", null);

    await composer(page).fill("See you at 7. ");
    await expect(sendButton(page, T.en.send), "a different text is not a retry").toBeEnabled();
    await sendButton(page, T.en.send).click();
    await expect(composer(page)).toHaveValue("");
    expect(posts).toHaveLength(2);
    expect(posts[1].clientMessageId).not.toBe(posts[0].clientMessageId);
    expect((await stored(page)).messages.map((m) => m.body)).toEqual(["See you at 6.", "See you at 7."]);
  });

  test("AC-B7: a trailing no-break space is NOT the same text (Java's strip keeps U+00A0)", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    const posts = recordPosts(page);
    await setSwitch(page, "evoli_fixture_messages_send", "lost");
    await sendText(page, "See you at 6.");
    await expect(page.locator('[data-messages-failure="sendFailed"]')).toHaveText(T.en.failed);
    await setSwitch(page, "evoli_fixture_messages_send", null);

    await composer(page).fill("See you at 6.\u00a0");
    await expect(sendButton(page, T.en.send), "not « Retry »: the api would store another text").toBeEnabled();
    await sendButton(page, T.en.send).click();
    await expect(composer(page)).toHaveValue("");
    await expect(page.locator("[data-messages-failure]")).toHaveCount(0);
    expect(posts).toHaveLength(2);
    expect(posts[1].clientMessageId, "a new id, so no 409 MESSAGE_ID_REUSED").not.toBe(posts[0].clientMessageId);
    // The fixture stores what the api stores: the NBSP is kept.
    expect((await stored(page)).messages.map((m) => m.body)).toEqual(["See you at 6.", "See you at 6.\u00a0"]);
  });

  test("AC-B5: a 429 has its own sentence, with the api's Retry-After in minutes; the text stays", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    await setSwitch(page, "evoli_fixture_messages_send", "ratelimit");
    await sendText(page, "One more thing");
    await expect(page.locator('[data-messages-failure="rateLimited"]')).toHaveText(T.en.rate);
    await expect(composer(page)).toHaveValue("One more thing");
    await expect(sendButton(page, T.en.retry)).toBeVisible();
  });

  test("AC-B5: the composer is not cleared while the send is out — only by its 2xx", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(`**${BFF(LINA)}`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await held;
      await route.fallback();
    });
    await sendText(page, "Held send");
    await expect(sendButton(page, T.en.sending)).toBeVisible();
    await page.waitForTimeout(1_500);
    await expect(composer(page)).toHaveValue("Held send");
    release();
    await expect(composer(page)).toHaveValue("");
    await expect(log(page).locator("li .msg-body")).toHaveText(["Held send"]);
  });

  test("a bidi control is refused before sending, with a sentence; no request goes out", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === BFF(LINA)) posts.push(r.url());
    });
    await sendText(page, "abc \u202e fed");
    await expect(page.locator('[data-messages-failure="invisible"]')).toHaveText(T.en.invisible);
    await expect(composer(page)).toHaveValue("abc \u202e fed");
    await page.waitForTimeout(500);
    expect(posts).toEqual([]);
  });

  test("message bodies are bidi-isolated: an RTL message cannot reorder its author and time", async ({ page }) => {
    await signInThroughForm(page);
    const rtl = "שלום Lina, 3 sets of 12";
    await traineeWrites(page, rtl);
    await open(page);
    const item = log(page).locator('li[data-author="TRAINEE"]');
    await expect(item.locator(".msg-body")).toHaveText(rtl);
    const probe = await item.evaluate((li) => {
      const body = li.querySelector(".msg-body") as HTMLElement;
      const meta = li.querySelector(".msg-meta") as HTMLElement;
      return {
        dir: body.getAttribute("dir"),
        bidi: getComputedStyle(body).unicodeBidi,
        separate: !meta.contains(body) && !body.contains(meta),
        author: (li.querySelector(".msg-author") as HTMLElement).textContent,
      };
    });
    expect(probe).toEqual({ dir: "auto", bidi: "plaintext", separate: true, author: "Lina" });
  });

  test("a message from the client arrives by the poll, within one 15 s period", async ({ page }) => {
    test.setTimeout(60_000);
    await signInThroughForm(page);
    await open(page);
    await traineeWrites(page, "Can we move Thursday to Friday?");
    await expect(log(page).locator('li[data-author="TRAINEE"] .msg-body')).toHaveText(["Can we move Thursday to Friday?"], {
      timeout: 20_000,
    });
    // The coach is looking: it is marked read (the roster's dot goes on its next load).
    await expect.poll(async () => (await stored(page)).coachReadSeq, { timeout: 5_000 }).toBe(1);
  });

  test("the cursor: a client message written between a poll and the coach's send is not skipped", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    // seq 1 lands before any poll has read it; the coach's send is then seq 2. A cursor taken
    // from the send's lastSeq (2) would make every later poll ask for seq > 2, and seq 1 would
    // never be shown.
    await traineeWrites(page, "Written before your send");
    await sendText(page, "Sent after it");
    await expect(composer(page)).toHaveValue("");
    await expect(log(page).locator("li .msg-body")).toHaveText(["Written before your send", "Sent after it"], {
      timeout: 12_000,
    });
  });

  test("AC-B3: 15 s visible, none hidden, one at once on return, none after leaving the page", async ({ page }) => {
    test.setTimeout(150_000);
    await signInThroughForm(page);
    await open(page);
    const polls = recordPolls(page);
    const t0 = Date.now();
    await page.waitForTimeout(32_000);
    const idle = polls.filter((t) => t >= t0);
    // Visible and idle: one GET every 15 s, so 32 s holds 2 (at ~15 and ~30).
    expect(idle.length, "GETs over 32 s, visible").toBeGreaterThanOrEqual(2);
    expect(idle.length, "GETs over 32 s, visible").toBeLessThanOrEqual(3);
    const gaps = idle.slice(1).map((t, i) => t - idle[i]);
    for (const g of gaps) expect(g, "no faster than 15 s while idle").toBeGreaterThanOrEqual(14_000);

    await setHidden(page, true);
    await page.waitForTimeout(500);
    const hiddenFrom = polls.length;
    await page.waitForTimeout(20_000);
    expect(polls.length - hiddenFrom, "GETs over 20 s hidden").toBe(0);

    const back = Date.now();
    await setHidden(page, false);
    await expect.poll(() => polls.filter((t) => t >= back).length, { timeout: 2_500, message: "one read on return" }).toBe(1);

    // Leaving the page (another tab of the client) stops the poll.
    await page.getByRole("main").getByRole("navigation").getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${LINA}$`));
    const left = polls.length;
    await page.waitForTimeout(20_000);
    expect(polls.length - left, "GETs over 20 s after leaving").toBe(0);
  });

  test("AC-B3: hidden while a read is out — that read does not schedule another", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page);
    await open(page);
    const polls = recordPolls(page);
    // Hold the next poll's answer, hide the page while it is out, then let it answer.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let caught = false;
    await page.route(`**${BFF(LINA)}?after=*`, async (route) => {
      if (!caught) {
        caught = true;
        await held;
      }
      await route.fallback();
    });
    await expect.poll(() => caught, { timeout: 20_000, message: "the first poll is out" }).toBe(true);
    await setHidden(page, true);
    release();
    await page.waitForTimeout(500);
    const after = polls.length;
    await page.waitForTimeout(20_000);
    expect(polls.length - after, "GETs over 20 s hidden, after the held read answered").toBe(0);
  });

  test("AC-B3: leaving the page while a read is out — no poll after it", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page);
    await open(page);
    const polls = recordPolls(page);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let caught = false;
    await page.route(`**${BFF(LINA)}?after=*`, async (route) => {
      if (!caught) {
        caught = true;
        await held;
      }
      await route.fallback().catch(() => undefined);
    });
    await expect.poll(() => caught, { timeout: 20_000, message: "the first poll is out" }).toBe(true);
    await page.getByRole("main").getByRole("navigation").getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${LINA}$`));
    release();
    await page.waitForTimeout(500);
    const after = polls.length;
    await page.waitForTimeout(20_000);
    expect(polls.length - after, "GETs over 20 s after leaving with a read out").toBe(0);
  });

  test("AC-B3: every 5 s for the 60 s after a send, then 15 s again", async ({ page }) => {
    test.setTimeout(150_000);
    await signInThroughForm(page);
    await open(page);
    const polls = recordPolls(page);
    await sendText(page, "Starting the 60 seconds");
    await expect(composer(page)).toHaveValue("");
    const sentAt = Date.now();
    await page.waitForTimeout(90_000);
    const fast = polls.filter((t) => t >= sentAt && t < sentAt + 58_000);
    const slow = polls.filter((t) => t >= sentAt + 66_000);
    // ~5 s apart inside the window: 58 s holds 11 (at 5, 10, … 55), allow ±2 for a loaded machine.
    expect(fast.length, "GETs in the 58 s after the send").toBeGreaterThanOrEqual(9);
    expect(fast.length, "GETs in the 58 s after the send").toBeLessThanOrEqual(12);
    const fastGaps = fast.slice(1).map((t, i) => t - fast[i]);
    for (const g of fastGaps) expect(g, "never faster than 5 s").toBeGreaterThanOrEqual(4_500);
    // After the window: back to 15 s (66–90 s holds at most 2).
    expect(slow.length, "GETs from 66 s to 90 s after the send").toBeLessThanOrEqual(2);
    const slowGaps = slow.slice(1).map((t, i) => t - slow[i]);
    for (const g of slowGaps) expect(g, "15 s again after the window").toBeGreaterThanOrEqual(14_000);
  });

  test("mark read only while visible: a page loaded hidden marks nothing until it is shown", async ({ page }) => {
    await signInThroughForm(page);
    await traineeWrites(page, "Hello coach");
    await page.addInitScript(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    });
    await page.goto(page_(LINA));
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await expect(log(page).locator('li[data-author="TRAINEE"]')).toHaveCount(1);
    await page.waitForTimeout(2_000);
    expect((await stored(page)).coachReadSeq, "hidden: not read").toBe(0);
    await setHidden(page, false);
    await expect.poll(async () => (await stored(page)).coachReadSeq, { timeout: 5_000 }).toBe(1);
  });

  test("a long thread: the latest 50, then « Show earlier messages » loads the rest", async ({ page }) => {
    await signInThroughForm(page);
    await open(page, DANA);
    const items = page.locator("ol.msg-list > li");
    await expect(items).toHaveCount(50);
    await expect(items.first()).toHaveAttribute("data-message-seq", "6");
    await page.getByRole("button", { name: T.en.older, exact: true }).click();
    await expect(items).toHaveCount(55);
    await expect(items.first()).toHaveAttribute("data-message-seq", "1");
    await expect(page.getByRole("button", { name: T.en.older, exact: true })).toHaveCount(0);
  });

  test("the page's read fails: its notice and the composer; the next good read replaces the notice", async ({ page }) => {
    await signInThroughForm(page);
    await traineeWrites(page, "Are you there?");
    await setSwitch(page, "evoli_fixture_messages_read", "fail");
    await page.goto(page_(LINA));
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await expect(page.locator('[data-messages-notice="loadError"]')).toHaveText(T.en.loadError);
    await expect(composer(page)).toBeEditable();
    await setSwitch(page, "evoli_fixture_messages_read", null);
    await setHidden(page, true);
    await setHidden(page, false); // a read at once
    await expect(log(page).locator("li .msg-body")).toHaveText(["Are you there?"]);
    await expect(page.locator("[data-messages-notice]")).toHaveCount(0);
  });

  test("403 COACH_ACCESS_DENIED on a poll: the link ended, the layout's denial page", async ({ page }) => {
    await signInThroughForm(page);
    await open(page);
    await setSwitch(page, "evoli_fixture_link", "ended");
    await setHidden(page, true);
    await setHidden(page, false);
    await expect(page).toHaveURL(/\/clients\/denied$/, { timeout: 10_000 });
  });

  test("the BFF refuses a send with no session subject, a foreign origin, and a non-UUID id — before the api", async ({ page, baseURL }) => {
    await signInThroughForm(page);
    await open(page);
    const body = { clientMessageId: "11111111-1111-4111-8111-111111111111", body: "x" };
    const noSubject = await page.request.post(BFF(LINA), { data: body, maxRedirects: 0 });
    expect(noSubject.status()).toBe(401);
    expect(await noSubject.json()).toEqual({ code: "SESSION_CHANGED" });
    const foreign = await page.request.post(BFF(LINA), {
      data: body,
      headers: { Origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(foreign.status()).toBe(403);
    const notJson = await page.request.post(BFF(LINA), { data: "x", headers: { "Content-Type": "text/plain" }, maxRedirects: 0 });
    expect(notJson.status()).toBe(415);
    const badId = await page.request.post(`/api/bff/clients/not-a-uuid/messages`, { data: body, maxRedirects: 0 });
    expect(badId.status()).toBe(403);
    const both = await page.request.get(`${BFF(LINA)}?after=1&before=3`, { maxRedirects: 0 });
    expect(both.status()).toBe(400);
    expect((await stored(page)).messages, "nothing reached the api").toEqual([]);
    expect(baseURL).toBeTruthy();
  });
});

test.describe("EV-095b (FR)", () => {
  test.use({ locale: "fr-FR" });

  test("AC-B6: the tab, the page and a failed send in French, with « Réessayer »", async ({ page }) => {
    await signInThroughForm(page, { lang: "fr" });
    await page.goto(`/clients/${LINA}`);
    await page
      .getByRole("main")
      .getByRole("navigation", { name: "Sections du client", exact: true })
      .getByRole("link", { name: T.fr.tab, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${page_(LINA)}$`));
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: T.fr.h2, exact: true })).toBeVisible();
    await expect(log(page, "fr").getByText(T.fr.empty, { exact: true })).toBeVisible();
    await expectNoEnglish(page, "the empty thread");
    await setSwitch(page, "evoli_fixture_messages_send", "fail");
    await sendText(page, "Bonjour Lina", "fr");
    await expect(page.locator("[data-messages-failure]")).toHaveText(T.fr.failed);
    await expect(sendButton(page, T.fr.retry)).toBeVisible();
    await expect(composer(page, "fr")).toHaveValue("Bonjour Lina");
    await setSwitch(page, "evoli_fixture_messages_send", "ratelimit");
    await sendButton(page, T.fr.retry).click();
    await expect.poll(async () => plain(await page.locator('[data-messages-failure="rateLimited"]').textContent())).toBe(plain(T.fr.rate));
    await setSwitch(page, "evoli_fixture_messages_send", null);
    await sendButton(page, T.fr.retry).click();
    await expect(log(page, "fr").locator('li[data-author="COACH"] .msg-author')).toHaveText([T.fr.you]);
    await expect(composer(page, "fr")).toHaveValue("");
    await expectNoEnglish(page, "the thread with one message");
  });
});

/* The default config's project is Chromium; WebKit is launched here, like intake-consent.spec.ts. */
test.describe("EV-095b in WebKit", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  for (const lang of ["en", "fr"] as const) {
    test(`AC-B6: open the tab, fail a send, retry it, receive a reply: WebKit, ${lang}`, async ({ baseURL }) => {
      test.setTimeout(90_000);
      const context = await browser.newContext({ baseURL, locale: T[lang].locale });
      await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL as string }]);
      const page = await context.newPage();
      try {
        await signInThroughForm(page, { lang });
        await open(page, LINA, lang);
        await setSwitch(page, "evoli_fixture_messages_send", "fail");
        await sendText(page, "WebKit check", lang);
        await expect(page.locator("[data-messages-failure]")).toHaveText(T[lang].failed);
        await expect(composer(page, lang)).toHaveValue("WebKit check");
        await setSwitch(page, "evoli_fixture_messages_send", null);
        await sendButton(page, T[lang].retry).click();
        await expect(composer(page, lang)).toHaveValue("");
        await traineeWrites(page, "Reply from the app");
        // Within the 5 s cadence that follows the coach's own send.
        await expect(log(page, lang).locator('li[data-author="TRAINEE"] .msg-body')).toHaveText(["Reply from the app"], {
          timeout: 10_000,
        });
      } finally {
        await context.close();
      }
    });
  }
});
