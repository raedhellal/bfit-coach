import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoEnglish } from "./french";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";

/**
 * EV-337h — the challenges list and detail in the redesign (plan §5.5–5.6; X1–X7 of the
 * story; BUG-661; the detail h1 that read « 10 000 pas par jourEn cours »).
 *
 * POPULATED fixture (`playwright.roster.config.ts`): the three seeded challenges, one per
 * phase. ACTIVE "10 000 pas par jour" (day 5 of 7): Yusuf 1st (10 400 today, met), Lina 2nd
 * (6 150, in progress), Tobias 3rd (no row today), Mara and Sara invited.
 *
 * ⚠ The window position ("Day 5 of 7") is counted on the UTC date the fixture seeded its
 * challenges with when the dev server started. A run that crosses UTC midnight after the
 * server started reads day 6 — a fixture-clock artefact, not a product defect.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const ACTIVE = "c4a11e00-0000-4000-8000-000000000001";
const ENDED = "c4a11e00-0000-4000-8000-000000000002";
const UPCOMING = "c4a11e00-0000-4000-8000-000000000003";
/** `FIXTURE_EDGE_CHALLENGE_IDS`, served with `evoli_fixture_challenge_edges=1` (EV-337n). */
const EDGE_UPCOMING = "c4a11e00-0000-4000-8000-0000000000e1";
const EDGE_ENDED = "c4a11e00-0000-4000-8000-0000000000e2";
const EDGE_NEVER_SYNCED = "c4a11e00-0000-4000-8000-0000000000e3";
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
const EDGE_LAST_EVENING = "c4a11e00-0000-4000-8000-0000000000e4";
const EDGE_LAST_EVENING_NO_DATA = "c4a11e00-0000-4000-8000-0000000000e5";
const EDGE_LAST_EVENING_ALL = "c4a11e00-0000-4000-8000-0000000000e6";
const EDGE_FIRST_MORNING = "c4a11e00-0000-4000-8000-0000000000e7";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";
const MARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008";

/** X1's nine widths. */
const WIDTHS = [1440, 1280, 1279, 1024, 1023, 768, 767, 390, 320] as const;
const NNBSP = "\u202f";

const LANG = {
  en: {
    locale: "en-US",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    listH1: "Challenges",
    region: "Participants' progress",
    phase: { ACTIVE: "Active", UPCOMING: "Upcoming", ENDED: "Ended" },
    joined: "Joined",
    invited: "Invitation sent",
    noDataToday: "No data today",
    today: (v: string) => `${v} / 10,000 steps`,
    stats: {
      participants: "3 of 5 joined",
      pending: "2 invitations not accepted yet",
      met: "1 / 3",
      withoutData: "1 with no data today",
      average: "8,275 steps",
      withData: "over 2 clients with data",
      day: "5 / 7",
      allJoined: "3 of 3 joined",
      pastEnd2: "2 already past the last day",
      noDataAndPastEnd: "1 with no data today · 2 already past the last day",
      beforeStart1: "1 not yet at the first day",
    },
    dayOf: "Day 5 of 7",
    startsIn: "Starts in 3 days",
  },
  fr: {
    locale: "fr-FR",
    email: "E-mail",
    password: "Mot de passe",
    signIn: "Se connecter",
    listH1: "Défis",
    region: "Progression des participants",
    phase: { ACTIVE: "Actif", UPCOMING: "À venir", ENDED: "Terminé" },
    joined: "A rejoint",
    invited: "Invitation envoyée",
    noDataToday: "Aucune donnée aujourd'hui",
    today: (v: string) => `${v} / 10${NNBSP}000 pas`,
    stats: {
      participants: "3 sur 5 ont rejoint",
      pending: "2 invitations pas encore acceptées",
      met: "1 / 3",
      withoutData: "1 sans donnée aujourd'hui",
      average: `8${NNBSP}275 pas`,
      withData: "sur 2 clients avec données",
      day: "5 / 7",
      allJoined: "3 sur 3 ont rejoint",
      pastEnd2: "2 déjà après le dernier jour",
      noDataAndPastEnd: "1 sans donnée aujourd'hui · 2 déjà après le dernier jour",
      beforeStart1: "1 pas encore au premier jour",
    },
    dayOf: "Jour 5 sur 7",
    startsIn: "Commence dans 3\u00a0jours",
  },
} as const;
type Lang = keyof typeof LANG;

async function signIn(page: Page, lang: Lang) {
  const l = LANG[lang];
  await page.goto("/login");
  await page.getByLabel(l.email).fill(EMAIL);
  await page.getByLabel(l.password).fill(PASSWORD);
  await page.getByRole("button", { name: l.signIn }).click();
  await page.waitForURL("/");
}

const participant = (page: Page, id: string) => page.locator(`li[data-participant="${id}"]`);

/**
 * Every link and button on the page that is rendered, with its measured box. Inline links in
 * a sentence are X3's only exception, and these pages have none.
 */
async function undersized(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    let measured = 0;
    for (const el of Array.from(document.querySelectorAll("a, button, input, select, textarea"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      measured += 1;
      if (r.width < 44 || r.height < 44) {
        out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return { out, measured };
  });
}

/**
 * Every word inside `scope` that the browser laid out on more than one line — a word broken
 * mid-word. Measured with a Range per word, so it sees what was painted, not the CSS.
 */
async function brokenWords(scope: Locator): Promise<string[]> {
  const out: string[] = [];
  for (const el of await scope.all()) {
    out.push(
      ...(await el.evaluate((root) => {
        const broken: string[] = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? "";
          for (const m of Array.from(text.matchAll(/[^\s\u00a0\u202f]+/g))) {
            const range = document.createRange();
            range.setStart(node, m.index ?? 0);
            range.setEnd(node, (m.index ?? 0) + m[0].length);
            const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)));
            if (tops.size > 1) broken.push(m[0]);
          }
        }
        return broken;
      }))
    );
  }
  return out;
}

/** Where a participant's "today" block sits against its name, and whether it has its own frame. */
async function participantGeometry(page: Page, id: string) {
  return participant(page, id).evaluate((li) => {
    const who = li.querySelector(".participant-id")!.getBoundingClientRect();
    const today = li.querySelector(".participant-today")!.getBoundingClientRect();
    const cs = getComputedStyle(li);
    return {
      todayBelowName: today.top >= who.bottom - 0.5,
      todayBesideName: today.left >= who.right - 0.5 && today.top < who.bottom,
      ownBorder: cs.borderTopWidth !== "0px" && cs.borderTopStyle !== "none" && cs.borderLeftWidth !== "0px",
    };
  });
}

for (const lang of ["fr", "en"] as const) {
  test.describe(`challenges in ${lang.toUpperCase()}`, () => {
    test.use({ locale: LANG[lang].locale });

    test(`X1–X4 at ${WIDTHS.join("/")}: no sideways scroll, one h1, 44 px targets, participant cards below 768`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const l = LANG[lang];
      await signIn(page, lang);
      for (const width of WIDTHS) {
        const at = `${lang} ${width}px`;
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });

        // The list.
        await page.goto("/challenges");
        await expect(page.getByRole("list", { name: l.listH1 }).getByRole("listitem")).toHaveCount(3);
        await expectNoSidewaysScroll(page, `${at} list`);
        await expect(page.locator("h1"), `${at} list: one h1`).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1, name: l.listH1, exact: true })).toBeVisible();
        const wide = width >= 1024;
        await expect(page.locator(".shell-sidebar"), at).toBeVisible({ visible: wide });
        await expect(page.locator(".shell-tabbar"), at).toBeVisible({ visible: !wide });
        // Cards per row: 3 from 1280, 2 from 768, 1 below.
        await expect(page.locator(".challenge-grid"), `${at}: the card grid`).toHaveCount(1);
        const columns = await page
          .locator(".challenge-grid")
          .evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length);
        expect(columns, `${at}: list columns`).toBe(width >= 1280 ? 3 : width >= 768 ? 2 : 1);
        let t = await undersized(page);
        expect(t.measured, `${at} list: measured nothing`).toBeGreaterThan(3);
        expect(t.out, `${at} list: targets under 44 px`).toEqual([]);

        // The detail.
        await page.goto(`/challenges/${ACTIVE}`);
        await expect(participant(page, LINA)).toBeVisible();
        await expectNoSidewaysScroll(page, `${at} detail`);
        await expect(page.locator("h1"), `${at} detail: one h1`).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1, name: "10 000 pas par jour", exact: true })).toBeVisible();
        await expect(page.locator(".challenge-head [data-phase]")).toHaveText(l.phase.ACTIVE);
        t = await undersized(page);
        expect(t.measured, `${at} detail: measured nothing`).toBeGreaterThan(8);
        expect(t.out, `${at} detail: targets under 44 px`).toEqual([]);

        // Cards below 768 (own frame, "today" under the name); rows from 768 ("today" beside it).
        for (const id of [YUSUF, LINA, TOBIAS]) {
          const geom = await participantGeometry(page, id);
          if (width < 768) {
            expect(geom, `${at}: ${id} is a card`).toMatchObject({ todayBelowName: true, ownBorder: true });
          } else {
            expect(geom, `${at}: ${id} is a row`).toMatchObject({ todayBesideName: true, ownBorder: false });
          }
        }
        await expectUnoccluded(page, participant(page, LINA).locator("[data-participant-link]"), {
          label: `${at}: Lina's name link`,
        });
      }
    });

    /**
     * BUG-661 at 390 and 1440: each challenge card link and each participant name link is
     * at least 44 × 44. On 99dc73b the title link measured 21 px and a name link 16 px.
     */
    test("BUG-661: the challenge links and the participant name links are 44 × 44", async ({ page }) => {
      const l = LANG[lang];
      await signIn(page, lang);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/challenges");
        const cards = page.getByRole("list", { name: l.listH1 }).getByRole("link");
        await expect(cards).toHaveCount(3);
        for (const link of await cards.all()) {
          const box = (await link.boundingBox())!;
          expect(box.height, `${width}: ${await link.getAttribute("href")} height`).toBeGreaterThanOrEqual(44);
          expect(box.width, `${width}: ${await link.getAttribute("href")} width`).toBeGreaterThanOrEqual(44);
        }
        // The link's NAME is the title: a screen reader and a test still find it by it.
        await expect(page.getByRole("link", { name: "10 000 pas par jour", exact: true })).toHaveAttribute(
          "href",
          `/challenges/${ACTIVE}`
        );

        await page.goto(`/challenges/${ACTIVE}`);
        const region = page.getByRole("region", { name: l.region });
        const names = region.getByRole("link");
        await expect(names).toHaveCount(5);
        for (const link of await names.all()) {
          const box = (await link.boundingBox())!;
          const name = (await link.textContent())?.trim();
          expect(box.height, `${width}: ${name} height`).toBeGreaterThanOrEqual(44);
          expect(box.width, `${width}: ${name} width`).toBeGreaterThanOrEqual(44);
        }
        await expect(region.getByRole("link", { name: "Lina M.", exact: true })).toHaveAttribute("href", `/clients/${LINA}`);
      }
    });

    /** The h1 is the challenge's name alone; the phase is a pill beside it, in every phase. */
    test("the detail h1's accessible name is the challenge name only, the phase beside it", async ({ page }) => {
      const l = LANG[lang];
      await signIn(page, lang);
      for (const [id, title, phase] of [
        [ACTIVE, "10 000 pas par jour", l.phase.ACTIVE],
        [ENDED, "Semaine de rentrée", l.phase.ENDED],
        [UPCOMING, "Objectif 8 000 pas", l.phase.UPCOMING],
      ] as const) {
        await page.goto(`/challenges/${id}`);
        const h1 = page.getByRole("heading", { level: 1 });
        await expect(h1).toHaveCount(1);
        await expect(h1).toHaveAccessibleName(title);
        await expect(h1).toHaveText(title);
        await expect(h1).not.toContainText(phase);
        // The status is still on screen, as a word with an icon — never colour alone.
        const pill = page.locator(".challenge-head [data-phase]");
        await expect(pill).toHaveText(phase);
        await expect(pill.locator("svg")).toHaveCount(1);
        expect(await pill.evaluate((el, h) => !h!.contains(el), await h1.elementHandle())).toBe(true);
      }
    });

    test("the stat cards and the participants read the api's numbers; missing data is named, never 0", async ({ page }) => {
      const l = LANG[lang];
      await signIn(page, lang);
      await page.goto(`/challenges/${ACTIVE}`);
      const stats = page.locator(".challenge-stats .stat-card");
      await expect(stats).toHaveCount(4);
      await expect(stats.nth(0).locator(".stat-card-value")).toHaveText(l.stats.participants);
      await expect(stats.nth(0).locator(".stat-card-foot")).toHaveText(l.stats.pending);
      await expect(stats.nth(1).locator(".stat-card-value")).toHaveText(l.stats.met);
      await expect(stats.nth(1).locator(".stat-card-foot")).toHaveText(l.stats.withoutData);
      await expect(stats.nth(2).locator(".stat-card-value")).toHaveText(l.stats.average);
      await expect(stats.nth(2).locator(".stat-card-foot")).toHaveText(l.stats.withData);
      await expect(stats.nth(3).locator(".stat-card-value")).toHaveText(l.stats.day);
      // No decline count: the api has no DECLINED state (G20).
      await expect(page.locator("main")).not.toContainText(lang === "fr" ? /déclin|décliné/ : /declin/i);

      await expect(participant(page, YUSUF).locator("[data-today]")).toContainText(l.today(lang === "fr" ? `10${NNBSP}400` : "10,400"));
      await expect(participant(page, TOBIAS).locator("[data-today]")).toHaveText(l.noDataToday);
      await expect(participant(page, TOBIAS).getByRole("progressbar")).toHaveCount(0);
      await expect(participant(page, YUSUF).locator(".status-pill")).toHaveText(l.joined);
      await expect(participant(page, MARA).locator(".status-pill")).toHaveText(l.invited);
      if (lang === "fr") await expectNoEnglish(page, "the challenge page");

      // The list card says where the window stands, from the dates.
      await page.goto("/challenges");
      const list = page.getByRole("list", { name: l.listH1 });
      await expect(list.locator(`[data-challenge-id="${ACTIVE}"] [data-window-position]`)).toContainText(l.dayOf);
      await expect(list.locator(`[data-challenge-id="${UPCOMING}"] [data-window-position]`)).toHaveText(l.startsIn);
      if (lang === "fr") await expectNoEnglish(page, "the challenge list");
    });

    test("an ended or upcoming challenge has no « today » to report; nobody's day is called missing, nothing is counted before day 1", async ({ page }) => {
      const l = LANG[lang];
      await signIn(page, lang);
      await page.goto(`/challenges/${ENDED}`);
      await expect(page.locator("li[data-participant]")).toHaveCount(2);
      await expect(page.locator(".participant-today")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText(l.noDataToday);
      await expect(page.locator(".challenge-stats .stat-card")).toHaveCount(2);

      await page.goto(`/challenges/${UPCOMING}`);
      // Staff nit 3: before day 1 `syncedAt` is null for everyone, so no sync line at all
      // (it read « Rien de synchronisé pour l'instant », which a coach may take as a phone fault).
      await expect(participant(page, YUSUF)).toHaveAttribute("data-status", "ACCEPTED");
      await expect(participant(page, YUSUF).locator(".participant-sync, [data-synced]")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText(lang === "fr" ? "Rien de synchronisé" : "Nothing synced");
      await expect(page.locator(".participant-today")).toHaveCount(0);
      // Nothing counted before the first day: no « 0 sur 0 », no « 0 pas » total.
      await expect(participant(page, YUSUF).locator("[data-total], [data-days-met]")).toHaveCount(0);
      expect(await participant(page, YUSUF).innerText()).not.toMatch(/\b0 (steps|pas)\b|\b0 (\/|sur) 0\b/);
    });

    /**
     * QA PB-1 on 6269343: the row followed the trainee's own today, the head the api's UTC
     * phase. `evoli_fixture_challenge_edges=1` serves the two edges QA built live: Yusuf in
     * Tokyo already on day 1 (5 000 of 10 000) of a challenge that starts tomorrow (UTC), and
     * Lina in Los Angeles (6 000 of 5 000) and Tobias with no zone, both still on the last day
     * of one that ended yesterday (UTC).
     */
    test("PB-1: under an UPCOMING or ENDED head no row shows a today; nothing is counted or ranked before the start", async ({
      page,
      context,
      baseURL,
    }) => {
      const l = LANG[lang];
      await context.addCookies([{ name: "evoli_fixture_challenge_edges", value: "1", url: baseURL! }]);
      await signIn(page, lang);

      await page.goto(`/challenges/${EDGE_UPCOMING}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Commence demain");
      await expect(page.locator(".challenge-head [data-phase]")).toHaveText(l.phase.UPCOMING);
      const tokyo = participant(page, YUSUF);
      await expect(tokyo).toHaveAttribute("data-status", "ACCEPTED");
      // His day 1 is real and dated in the strip; nothing reads it as « today » or counts it.
      await expect(tokyo.locator(`[data-status="IN_PROGRESS"][data-value="5000"]`)).toHaveCount(1);
      await expect(page.locator(".participant-today, [data-today]")).toHaveCount(0);
      await expect(page.locator("[data-days-met], [data-total]")).toHaveCount(0);
      await expect(page.locator("[data-rank-label]")).toHaveCount(0);
      await expect(page.locator(".participant-sync, [data-synced]")).toHaveCount(0);
      expect(await tokyo.innerText()).not.toMatch(/5[\s\u202f,]000/);
      await expect(page.locator(".challenge-stats .stat-card")).toHaveCount(2);

      await page.goto(`/challenges/${EDGE_ENDED}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fini hier");
      await expect(page.locator(".challenge-head [data-phase]")).toHaveText(l.phase.ENDED);
      await expect(participant(page, LINA)).toHaveAttribute("data-status", "ACCEPTED");
      await expect(page.locator(".participant-today, [data-today]")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText(l.noDataToday);
      expect(await page.locator("main").innerText()).not.toMatch(/6[\s\u202f,]000 \/ 5[\s\u202f,]000/);
      // An ended challenge keeps its final standings: days met over the whole window, ranked.
      await expect(participant(page, LINA).locator("[data-days-met]")).toHaveText(lang === "fr" ? "5 sur 7" : "5 / 7");
      await expect(participant(page, LINA).locator("[data-rank-label]")).toHaveText(lang === "fr" ? "1er" : "#1");
      await expect(page.locator(".challenge-stats .stat-card")).toHaveCount(2);
      if (lang === "fr") await expectNoEnglish(page, "an ended challenge");
    });

    /**
     * QA PB-2 on 6269343: Petra joined and never synced; on day 4 her row read « Total 0 pas »
     * beside « Rien de synchronisé pour l'instant ». The api's total is then a sum over no row
     * (`syncedAt` null), so no total is shown. Lina's manual 0 on day 1 is a real zero, shown.
     */
    test("PB-2: a participant who never synced shows no total; a synced zero still does", async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "evoli_fixture_challenge_edges", value: "1", url: baseURL! }]);
      await signIn(page, lang);
      await page.goto(`/challenges/${EDGE_NEVER_SYNCED}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pas encore synchronisé");
      const petra = participant(page, PETRA);
      await expect(petra).toHaveAttribute("data-status", "ACCEPTED");
      await expect(petra.locator("[data-synced]")).toHaveText(lang === "fr" ? "Rien de synchronisé pour l'instant" : "Nothing synced yet");
      // The days are still counted (none met is a true count), but no total is invented.
      await expect(petra.locator("[data-days-met]")).toHaveText(lang === "fr" ? "0 sur 4" : "0 / 4");
      await expect(petra.locator("[data-total]")).toHaveCount(0);
      expect(await petra.innerText()).not.toMatch(/\b0 (pas|steps)\b/);
      await expect(participant(page, LINA).locator("[data-total]")).toHaveText(lang === "fr" ? "0 pas" : "0 steps");
    });

    /**
     * Ruling 8 (EV-337n N1): on the last evening the met card counts only the trainees whose
     * own today is still the last day, and its foot names the rest. The fixture's edges
     * (`evoli_fixture_challenge_edges=1`) put Yusuf and Tobias east of UTC, already the day
     * after a window that ends today (UTC), and Lina on UTC; and on the first morning Tobias
     * west of UTC, the day before a window that starts today.
     */
    test("N1: the met card's foot says who is past the last day or not yet at the first", async ({ page, context, baseURL }) => {
      const l = LANG[lang];
      await context.addCookies([{ name: "evoli_fixture_challenge_edges", value: "1", url: baseURL! }]);
      await signIn(page, lang);
      const stats = page.locator(".challenge-stats .stat-card");

      // Lina met her last day; the other two are past it.
      await page.goto(`/challenges/${EDGE_LAST_EVENING}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dernier soir");
      await expect(stats).toHaveCount(4);
      await expect(stats.nth(0).locator(".stat-card-value")).toHaveText(l.stats.allJoined);
      await expect(stats.nth(1).locator(".stat-card-value")).toHaveText("1 / 1");
      await expect(stats.nth(1).locator(".stat-card-foot")).toHaveText(l.stats.pastEnd2);
      // The rows agree: only Lina has a today cell.
      await expect(page.locator(".participant-today")).toHaveCount(1);
      await expect(participant(page, LINA).locator(".participant-today")).toHaveCount(1);

      // Lina has nothing today: the existing part first, then the new one.
      await page.goto(`/challenges/${EDGE_LAST_EVENING_NO_DATA}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dernier soir sans donnée");
      await expect(stats.nth(1).locator(".stat-card-value")).toHaveText("0 / 1");
      await expect(stats.nth(1).locator(".stat-card-foot")).toHaveText(l.stats.noDataAndPastEnd);
      // The longest foot, at the narrowest width (French is ~20 % longer): it wraps, never clips.
      await page.setViewportSize({ width: 320, height: 844 });
      await expectNoSidewaysScroll(page, `${lang} 320px: the met card's longest foot`);
      const clipped = await stats
        .nth(1)
        .locator(".stat-card-foot")
        .evaluate((el) => el.scrollWidth > el.clientWidth + 0.5 || el.getBoundingClientRect().right > window.innerWidth);
      expect(clipped, `${lang} 320px: the foot is clipped`).toBe(false);
      // Edge case 3 (French is longer): no word on the cards is broken across two lines. The
      // group average reads « Aucune donnée aujourd'hui » here, and at 20 px it broke as
      // « aujourd'h / ui » (EV-337n N4).
      expect(await brokenWords(stats), `${lang} 320px: words broken mid-word on the stat cards`).toEqual([]);
      await page.setViewportSize({ width: 1280, height: 900 });

      // Nobody is still in the window: no today card at all (unchanged).
      await page.goto(`/challenges/${EDGE_LAST_EVENING_ALL}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dernier soir pour tous");
      await expect(stats).toHaveCount(2);
      await expect(page.locator(".participant-today")).toHaveCount(0);

      // The first morning's mirror.
      await page.goto(`/challenges/${EDGE_FIRST_MORNING}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Premier matin");
      await expect(stats).toHaveCount(4);
      await expect(stats.nth(1).locator(".stat-card-value")).toHaveText("1 / 2");
      await expect(stats.nth(1).locator(".stat-card-foot")).toHaveText(l.stats.beforeStart1);

      // Everyone in the window (the seeded challenge): neither new part.
      await page.goto(`/challenges/${ACTIVE}`);
      await expect(stats.nth(1).locator(".stat-card-foot")).toHaveText(l.stats.withoutData);
      if (lang === "fr") await expectNoEnglish(page, "the challenge page");
    });

    /**
     * EV-337n N2 (X3, staff nit on EV-337h): the list's pager only renders past one page of 50
     * (`CHALLENGE_PAGE_SIZE`), which the seeds never reach, so its links had never been
     * measured. `evoli_fixture_challenge_extra=60` makes 63 challenges: two pages.
     */
    test("N2: at 390 px the challenges pager's links measure at least 44 × 44", async ({ page, context, baseURL }) => {
      const l = LANG[lang];
      const words = lang === "fr" ? { previous: "Précédent", next: "Suivant" } : { previous: "Previous", next: "Next" };
      const pageOf = (n: number) => (lang === "fr" ? `Page ${n} sur 2` : `Page ${n} of 2`);
      await context.addCookies([{ name: "evoli_fixture_challenge_extra", value: "60", url: baseURL! }]);
      await page.setViewportSize({ width: 390, height: 844 });
      await signIn(page, lang);

      const measure = async (name: string, at: string) => {
        const link = page.getByRole("link", { name, exact: true });
        await expect(link, `${at}: « ${name} »`).toHaveCount(1);
        await expectUnoccluded(page, link, { label: `${at}: « ${name} »` });
        const box = (await link.boundingBox())!;
        expect(box.width, `${at}: « ${name} » width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${at}: « ${name} » height`).toBeGreaterThanOrEqual(44);
      };

      await page.goto("/challenges");
      const list = page.getByRole("list", { name: l.listH1 }).getByRole("listitem");
      await expect(list).toHaveCount(50);
      const pager = page.getByRole("navigation", { name: pageOf(1) });
      await expect(pager).toContainText(pageOf(1));
      await expect(pager.getByRole("link", { name: words.previous, exact: true })).toHaveCount(0);
      await measure(words.next, `${lang} page 1`);
      await expectNoSidewaysScroll(page, `${lang} 390px: the pager, page 1`);

      await page.getByRole("link", { name: words.next, exact: true }).click();
      await page.waitForURL(/\/challenges\?page=1$/);
      await expect(list).toHaveCount(13);
      await expect(page.getByRole("navigation", { name: pageOf(2) })).toContainText(pageOf(2));
      await expect(page.getByRole("link", { name: words.next, exact: true })).toHaveCount(0);
      await measure(words.previous, `${lang} page 2`);
      await expectNoSidewaysScroll(page, `${lang} 390px: the pager, page 2`);
      if (lang === "fr") await expectNoEnglish(page, "the challenges list, page 2");
    });

    /**
     * Ruling 13 (EV-337n N6): « Premier matin » starts today (UTC). Tobias is west of UTC and
     * still the day before the start: no days met, no total — and no rank, which the api
     * computes from the same zeros (it ranks him 3rd). His row stays where the api puts it.
     */
    test("N6: on the first morning, a trainee whose day 1 has not begun shows no rank; the api's order stands", async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([{ name: "evoli_fixture_challenge_edges", value: "1", url: baseURL! }]);
      await signIn(page, lang);
      await page.goto(`/challenges/${EDGE_FIRST_MORNING}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Premier matin");
      await expect(page.locator(".challenge-head [data-phase]")).toHaveText(LANG[lang].phase.ACTIVE);
      // The api's order: Lina (1 met), Yusuf (0 met, 4 000), Tobias (nothing yet).
      await expect(page.locator('li[data-participant][data-status="ACCEPTED"]')).toHaveCount(3);
      const order = await page.locator("li[data-participant]").evaluateAll((els) => els.map((el) => el.getAttribute("data-participant")));
      expect(order).toEqual([LINA, YUSUF, TOBIAS]);

      const tobias = participant(page, TOBIAS);
      await expect(tobias).toHaveAttribute("data-status", "ACCEPTED");
      await expect(tobias.locator("[data-rank-label]")).toHaveCount(0);
      await expect(tobias).toHaveAttribute("data-rank", "");
      await expect(tobias.locator("[data-days-met], [data-total]")).toHaveCount(0);
      expect(await tobias.innerText()).not.toMatch(lang === "fr" ? /\b3e\b/ : /#3/);

      // Every counted row keeps its rank.
      await expect(participant(page, LINA).locator("[data-rank-label]")).toHaveText(lang === "fr" ? "1er" : "#1");
      await expect(participant(page, YUSUF).locator("[data-rank-label]")).toHaveText(lang === "fr" ? "2e" : "#2");
    });
  });
}

/**
 * "The 45 s poll still runs" — on the card layout. A phone at 390 px: Lina's card reads
 * 6 150; her today row moves to 9 950 on the api (fixture switch); 45 s later, with the
 * page untouched, the CARD shows 9 950. The clock is Playwright's, so the tick is the
 * component's own `setInterval`, not a reload.
 */
test.describe("the poll on the cards", () => {
  test.use({ locale: "en-US", viewport: { width: 390, height: 844 } });

  test("at 390 px the participant cards re-read the api every 45 s", async ({ page, context, baseURL }) => {
    await page.clock.install();
    await signIn(page, "en");
    await page.goto(`/challenges/${ACTIVE}`);
    const lina = participant(page, LINA);
    await expect(lina, "Lina's participant card").toHaveCount(1);
    expect((await participantGeometry(page, LINA)).ownBorder, "a card at 390").toBe(true);
    await expect(lina.locator("[data-today]")).toContainText("6,150 / 10,000 steps");
    const stamp = page.locator("[data-loaded-at]");
    const before = await stamp.getAttribute("data-loaded-at");

    await context.addCookies([{ name: "evoli_fixture_today_steps", value: "9950", url: baseURL! }]);
    await page.clock.fastForward(44_000);
    // Not before the tick.
    await page.waitForTimeout(500);
    await expect(lina.locator("[data-today]")).toContainText("6,150 / 10,000 steps");

    await page.clock.fastForward(1_500);
    await expect(lina.locator("[data-today]")).toContainText("9,950 / 10,000 steps");
    await expect(stamp).not.toHaveAttribute("data-loaded-at", before ?? "");
    expect((await participantGeometry(page, LINA)).ownBorder, "still a card after the refresh").toBe(true);
  });
});
