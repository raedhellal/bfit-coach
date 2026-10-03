import { expect, type BrowserContext, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { expectNoEnglish } from "./french";

/**
 * EV-337d — the redesigned roster (plan §5.1; Raed's rulings R6 « Inactif » = 7 days and R7
 * keep the sort toggle; D1–D5 and X1–X7 of the story).
 *
 * POPULATED fixture (`playwright.roster.config.ts`). The six seeded rows fall into three
 * groups: To review (Tobias 2 flags and 9 days silent, Sara, Lina), and Other clients
 * (Yusuf WORKOUTS only, Petra, Mara). `evoli_fixture_roster_boundary=1` adds three rows that
 * share everything and last trained exactly 6, 7 and 8 Paris days ago (Noé, Odile, Paul).
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const WIDTHS = [320, 390, 768, 1023, 1024, 1279, 1280, 1440] as const;

const LANG = {
  en: {
    locale: "en-US",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    h1: "Roster",
    nav: "Roster",
    groups: { attention: "To review", onTrack: "On track", inactive: "Inactive", other: "Other clients" },
    search: "Search clients",
    all: "All",
    flagged: "Flagged",
    inactive: "Inactive",
    noMatch: "No client matches.",
    clear: "Show all clients",
    sort: ["Needs attention", "Recently active"],
    inactiveFor: (d: number) => `Inactive for ${d}\u00a0days`,
    upToDate: "Up to date",
  },
  fr: {
    locale: "fr-FR",
    email: "E-mail",
    password: "Mot de passe",
    signIn: "Se connecter",
    h1: "Clients",
    nav: "Clients",
    groups: { attention: "À traiter", onTrack: "Sur la bonne voie", inactive: "Inactifs", other: "Autres clients" },
    search: "Rechercher un client",
    all: "Tous",
    flagged: "Alertes",
    inactive: "Inactifs",
    noMatch: "Aucun client ne correspond.",
    clear: "Afficher tous les clients",
    sort: ["À surveiller", "Actifs récemment"],
    inactiveFor: (d: number) => `Inactif depuis ${d}\u00a0j`,
    upToDate: "À jour",
  },
} as const;
type Lang = keyof typeof LANG;

async function signIn(page: Page, lang: Lang) {
  await signInThroughForm(page, { email: EMAIL, password: PASSWORD, lang });
}

async function boundaryRows(context: BrowserContext, baseURL: string | undefined) {
  await context.addCookies([{ name: "evoli_fixture_roster_boundary", value: "1", url: baseURL! }]);
}

/** Names per group, in render order. Guards against a reader that returns nothing. */
async function groups(page: Page): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = await page.locator("[data-roster-group]").evaluateAll((sections) =>
    Object.fromEntries(
      sections.map((s) => [
        s.getAttribute("data-roster-group"),
        Array.from(s.querySelectorAll(".roster-name")).map((n) => n.textContent?.trim() ?? ""),
      ])
    )
  );
  const total = Object.values(out).flat();
  expect(total.length, "group reader found rows").toBeGreaterThan(0);
  expect(total.every((n) => n.length > 0), "every row's name was read").toBe(true);
  return out;
}

/** Every interactive element of the page's main column that is on screen, with its size. */
async function undersizedTargets(page: Page) {
  return page.locator("main").evaluate((main) => {
    const out: string[] = [];
    let measured = 0;
    for (const el of Array.from(main.querySelectorAll("a, button, input, [role=radio], label.roster-search"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      measured += 1;
      // The search input sits inside its 44 px label, which is the target.
      if (el.tagName === "INPUT" && el.closest("label.roster-search")) continue;
      if (r.width < 44 || r.height < 44) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return { out, measured };
  });
}

for (const lang of ["fr", "en"] as const) {
  test.describe(`the roster in ${lang.toUpperCase()}`, () => {
    test.use({ locale: LANG[lang].locale });

    test(`X1–X4 + D4 at ${WIDTHS.join("/")}: no sideways scroll, one h1, 44 px targets, cards below 768`, async ({
      page,
      context,
      baseURL,
    }) => {
      await boundaryRows(context, baseURL);
      await signIn(page, lang);
      const l = LANG[lang];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.goto("/");
        const at = `${lang} ${width}px`;
        await expect(page.locator(".roster-row")).toHaveCount(9);
        await expectNoSidewaysScroll(page, at);
        await expect(page.locator("h1"), `${at}: one h1`).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1, name: l.h1, exact: true })).toBeVisible();
        // Each group is an h2 (plan §5.1 a11y).
        for (const name of Object.values(l.groups)) {
          await expect(page.getByRole("heading", { level: 2, name, exact: true }), `${at}: ${name}`).toBeVisible();
        }

        // X2: the navigation kind flips at 1024.
        const wide = width >= 1024;
        await expect(page.locator(".shell-sidebar"), at).toBeVisible({ visible: wide });
        await expect(page.locator(".shell-tabbar"), at).toBeVisible({ visible: !wide });

        // D4: a card below 768 (the status sits BELOW the name, the card has its own frame);
        // a row from 768 (name, cells and status share one line).
        const lina = page.locator(".roster-row", { hasText: "Lina M." });
        const geom = await lina.evaluate((row) => {
          const name = row.querySelector(".roster-id")!.getBoundingClientRect();
          const status = row.querySelector(".roster-status")!.getBoundingClientRect();
          const last = row.querySelector(".roster-last")!.getBoundingClientRect();
          const cs = getComputedStyle(row);
          return {
            statusBelowName: status.top >= name.bottom - 0.5,
            lastBelowName: last.top >= name.bottom - 0.5,
            ownBorder: cs.borderTopWidth !== "0px" && cs.borderTopStyle !== "none",
            sameLine: status.top < name.bottom && status.bottom > name.top && last.top < name.bottom && last.bottom > name.top,
          };
        });
        if (width < 768) {
          expect(geom, `${at}: a card`).toMatchObject({ statusBelowName: true, lastBelowName: true, ownBorder: true });
        } else {
          expect(geom, `${at}: a row`).toMatchObject({ sameLine: true, ownBorder: false });
        }

        // X3: every target in the page column is at least 44 × 44, measured.
        const targets = await undersizedTargets(page);
        expect(targets.measured, `${at}: measured nothing`).toBeGreaterThan(9 + 4);
        expect(targets.out, `${at}: targets under 44 px`).toEqual([]);

        // The first row and the search field are not painted under a bar.
        await expectUnoccluded(page, page.locator(".roster-row").first(), { label: `${at}: first row` });
        await expectUnoccluded(page, page.getByRole("searchbox", { name: l.search }), { label: `${at}: search` });
      }
    });

    test("D1/R6: 6 and 7 days are on track, 8 is inactive, a flagged 9 stays to review", async ({ page, context, baseURL }) => {
      await boundaryRows(context, baseURL);
      await signIn(page, lang);
      const l = LANG[lang];
      const g = await groups(page);
      expect(g.attention).toEqual(["Tobias R.", "Sara P.", "Lina M."]);
      expect(g.onTrack?.sort()).toEqual(["Noé B.", "Odile C."]);
      expect(g.inactive).toEqual(["Paul D."]);
      expect(g.other?.sort()).toEqual(["Mara D.", "Petra L.", "Yusuf A."]);

      const row = (name: string) => page.locator(".roster-row", { hasText: name });
      await expect(row("Paul D.").locator(".status-pill")).toHaveText(l.inactiveFor(8));
      await expect(row("Odile C.").locator(".status-pill")).toHaveText(l.upToDate);
      await expect(row("Noé B.").locator(".status-pill")).toHaveText(l.upToDate);
      // Tobias trained 9 days ago and has 2 flags: listed once, to review, R6's fact on the row.
      await expect(row("Tobias R.")).toHaveCount(1);
      await expect(row("Tobias R.").locator(".roster-notes")).toContainText(l.inactiveFor(9));
      // A client who does not share PROGRESS is never inactive (Petra, Mara, Yusuf).
      for (const name of ["Petra L.", "Mara D.", "Yusuf A."]) {
        await expect(row(name)).not.toContainText(lang === "fr" ? "Inactif" : "Inactive");
      }
    });

    test("D5: search and each filter narrow the list; no adherence or invitations filter (G1, G2)", async ({ page }) => {
      await signIn(page, lang);
      const l = LANG[lang];
      const filters = page.getByRole("group", { name: lang === "fr" ? "Filtrer les clients" : "Filter clients" });
      await expect(filters.getByRole("button")).toHaveText([`${l.all} · 6`, `${l.flagged} · 3`, `${l.inactive} · 1`]);
      await expect(page.getByText(/Adhérence|Adherence|Invitations|Invites/)).toHaveCount(0);

      await filters.getByRole("button", { name: `${l.flagged} · 3` }).click();
      await expect(filters.getByRole("button", { name: `${l.flagged} · 3` })).toHaveAttribute("aria-pressed", "true");
      await expect(filters.getByRole("button", { name: `${l.all} · 6` })).toHaveAttribute("aria-pressed", "false");
      expect((await groups(page)).attention).toEqual(["Tobias R.", "Sara P.", "Lina M."]);
      await expect(page.locator(".roster-row")).toHaveCount(3);

      await filters.getByRole("button", { name: `${l.inactive} · 1` }).click();
      await expect(page.locator(".roster-row")).toHaveCount(1);
      await expect(page.locator(".roster-row .roster-name")).toHaveText("Tobias R.");

      await filters.getByRole("button", { name: `${l.all} · 6` }).click();
      const search = page.getByRole("searchbox", { name: l.search });
      await search.fill("PUSH pull"); // plan name, any case
      await expect(page.locator(".roster-row .roster-name")).toHaveText(["Tobias R."]);
      await search.fill("lina");
      await expect(page.locator(".roster-row .roster-name")).toHaveText(["Lina M."]);
      await expect(page.locator(".roster-browser").getByRole("status")).toHaveText(lang === "fr" ? "1 client affiché" : "1 client shown");

      await search.fill("zzz");
      await expect(page.locator(".roster-row")).toHaveCount(0);
      await expect(page.getByText(l.noMatch, { exact: true })).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await page.getByRole("button", { name: l.clear }).click();
      await expect(page.locator(".roster-row")).toHaveCount(6);
      await expect(search).toHaveValue("");
    });

    test("D2/R7: the sort toggle is kept and reorders inside the groups", async ({ page }) => {
      await signIn(page, lang);
      const [needs, recent] = LANG[lang].sort;
      await expect(page.getByRole("radio", { name: needs })).toBeChecked();
      expect((await groups(page)).attention).toEqual(["Tobias R.", "Sara P.", "Lina M."]);
      await page.getByRole("radio", { name: recent }).click();
      await expect(page.getByRole("radio", { name: recent })).toBeChecked();
      // Most recent first, inside « to review »: Lina yesterday, Tobias 9 days ago, Sara never.
      await expect.poll(async () => (await groups(page)).attention).toEqual(["Lina M.", "Tobias R.", "Sara P."]);
    });

    /**
     * D3, restated 2026-10-02 (PO ruling 1): the count is the FLAGGED rows — the same number
     * as the « À traiter » chip and the subtitle's « n à traiter » — never the rows listed.
     * The boundary cookie makes the two differ (9 rows, 3 flagged), so a count of rows is red.
     */
    test("D3: the « Clients » count is the clients to review, and is on the roster only", async ({ page, context, baseURL }) => {
      await boundaryRows(context, baseURL);
      await signIn(page, lang);
      const l = LANG[lang];
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        const nav = page.getByRole("navigation", { name: lang === "fr" ? "Portail" : "Portal" });
        const link = nav.getByRole("link", { name: l.nav, exact: true });
        await expect(link, `${width}: the count does not change the link's name`).toHaveAttribute("aria-current", "page");
        await expect(page.locator(".roster-row")).toHaveCount(9);
        const flagged = await page.locator('[data-roster-group="attention"] .roster-row').count();
        expect(flagged).toBe(3);
        await expect(link.locator(".shell-nav-count")).toHaveText(String(flagged));
        // The same number as the group's chip and the subtitle.
        await expect(page.locator('[data-roster-group="attention"] .roster-group-count [aria-hidden="true"]')).toHaveText("3");
        await expect(page.getByText(lang === "fr" ? "9 clients · 3 à traiter" : "9 clients · 3 to review", { exact: true })).toBeVisible();
        await expect(link).toHaveAccessibleDescription(lang === "fr" ? "3 clients à traiter" : "3 clients to review");
        // Search and filters do not change it: it counts the roster, not the view.
        await page.getByRole("searchbox", { name: l.search }).fill("lina");
        await expect(page.locator(".roster-row")).toHaveCount(1);
        await expect(link.locator(".shell-nav-count")).toHaveText("3");
        await page.getByRole("searchbox", { name: l.search }).fill("");
        await page.getByRole("button", { name: `${l.inactive} · 2` }).click();
        await expect(link.locator(".shell-nav-count")).toHaveText("3");
      }
      // Any other page: no roster read, so no count — never a 0.
      for (const path of ["/templates", `/clients/${LINA}`]) {
        await page.goto(path);
        await expect(page.locator(".shell-nav-count")).toHaveCount(0);
      }
    });

    test("D3: a failed roster read shows no count, and the error card", async ({ page, context, baseURL }) => {
      await signIn(page, lang);
      await context.addCookies([{ name: "evoli_fixture_roster", value: "fail", url: baseURL! }]);
      await page.goto("/");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(
        page.getByText(lang === "fr" ? "La liste des clients n'a pas pu être chargée." : "The roster could not be loaded.")
      ).toBeVisible();
      await expect(page.locator(".shell-nav-count")).toHaveCount(0);
      await expect(page.locator(".roster-row")).toHaveCount(0);
    });

    test("many clients: 46 rows render and are searchable; the count stays the 3 to review", async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "evoli_fixture_roster_extra", value: "40", url: baseURL! }]);
      await signIn(page, lang);
      const l = LANG[lang];
      await expect(page.locator(".roster-row")).toHaveCount(46);
      await expect(page.locator(".shell-nav-count").first()).toHaveText("3");
      expect((await groups(page)).other).toHaveLength(43);
      await page.getByRole("searchbox", { name: l.search }).fill("client 037");
      await expect(page.locator(".roster-row .roster-name")).toHaveText(["Client 037"]);
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expectNoSidewaysScroll(page, `${lang} many at ${width}`);
      }
    });

    test("keyboard: search, chips, then one stop per row; Enter opens the client", async ({ page }) => {
      await signIn(page, lang);
      const l = LANG[lang];
      await page.setViewportSize({ width: 1280, height: 900 });
      const search = page.getByRole("searchbox", { name: l.search });
      await search.focus();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: `${l.all} · 6` })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: `${l.flagged} · 3` })).toBeFocused();
      await page.keyboard.press("Space");
      await expect(page.getByRole("button", { name: `${l.flagged} · 3` })).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      // One tab stop per client: the row link, named by the client.
      const first = page.getByRole("link", { name: "Tobias R.", exact: true });
      await expect(first).toBeFocused();
      const outline = await first.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).toBe("solid");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Sara P.", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/clients\//);
      await expect(page.locator("h1")).toHaveText("Sara P.");
    });

    test("X6: no string of the other language on the roster", async ({ page, context, baseURL }) => {
      await boundaryRows(context, baseURL);
      await signIn(page, lang);
      if (lang === "fr") {
        await expectNoEnglish(page, "the redesigned roster");
      } else {
        const fr = ["À traiter", "Sur la bonne voie", "Inactifs", "Autres clients", "Rechercher", "Tous ·", "Dernière séance", "Inactif depuis", "À jour", "Traiter", "Ouvrir"];
        const text = await page.locator("body").innerText();
        expect(fr.filter((w) => text.includes(w))).toEqual([]);
      }
    });
  });
}

/**
 * QA NB-2 (branch 1): the « Clients » nav item is current on every client page and on the
 * denial page — a coach on a client's programme is still in Clients.
 */
test.describe("NB-2: « Clients » is the current section under /clients", () => {
  test.use({ locale: "fr-FR" });
  for (const path of [`/clients/${LINA}`, `/clients/${LINA}/routine`, `/clients/${LINA}/nutrition`, "/clients/denied"]) {
    test(path, async ({ page }) => {
      await signIn(page, "fr");
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const nav = page.getByRole("navigation", { name: "Portail" });
        await expect(nav.getByRole("link", { name: "Clients", exact: true })).toHaveAttribute("aria-current", "page");
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      }
    });
  }
});

/**
 * EV-187 AC4 in French, on the POPULATED roster (the default suite's roster is empty, so its
 * vocabulary scan reads no rows). The whole document, RSC payload included.
 */
test.describe("EV-187 AC4: the French roster names no pain signal", () => {
  test.use({ locale: "fr-FR" });
  test("the document carries no « douleur » claim", async ({ page, context, baseURL }) => {
    await boundaryRows(context, baseURL);
    await signIn(page, "fr");
    const html = await (await page.request.get("/")).text();
    expect(html).toContain("À traiter");
    expect(html).not.toMatch(/douleur/i);
    expect(html).not.toMatch(/\bpain\b/i);
  });
});

/**
 * QA PB-1 on EV-337d (P3): a row's status pill cut its reason with an ellipsis and no
 * tooltip — « Aucune séance pour l'instant », « Alertes non partagées », « Activité non
 * partagée », "Inactive for 8 days" at 320, 768 and 1024. The label was `nowrap` +
 * `text-overflow: ellipsis` inside the narrow status column (globals.css). The reason is
 * the whole point of the pill in « Autres clients » (PO ruling 3), so it must always be
 * read in full: the label wraps instead.
 *
 * Witness: every pill label's text fits its own box (scrollWidth ≤ clientWidth) and the
 * pill sits inside its row, at the story's widths, in both languages, with the boundary
 * rows (6/7/8 days) present. Red on 08f6e90 (the clipped labels named above), green here.
 */
for (const lang of ["en", "fr"] as const) {
  test.describe(`PB-1: a status pill is read in full (${lang.toUpperCase()})`, () => {
    test.use({ locale: LANG[lang].locale });

    test("no pill label is clipped at any width", async ({ page, context, baseURL }) => {
      await boundaryRows(context, baseURL);
      await signIn(page, lang);
      const pills = page.locator(".roster-row .status-pill");
      await expect(pills.first()).toBeVisible();
      for (const width of [320, 360, 390, 767, 768, 1023, 1024, 1279, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const read = await pills.evaluateAll((els) =>
          els.map((pill) => {
            const label = pill.querySelector(".status-pill-label") as HTMLElement | null;
            const row = pill.closest(".roster-row") as HTMLElement;
            const p = pill.getBoundingClientRect();
            const r = row.getBoundingClientRect();
            return {
              text: label?.textContent ?? "",
              clipped: label ? label.scrollWidth - label.clientWidth : -1,
              outside: Math.max(0, p.right - r.right, r.left - p.left),
            };
          })
        );
        // A reader that found nothing would make the next two checks vacuous.
        expect(read.length, `pills found at ${width}px`).toBeGreaterThanOrEqual(6);
        expect(read.filter((x) => x.text === ""), `a pill with no label at ${width}px`).toEqual([]);
        expect(
          read.filter((x) => x.clipped > 1).map((x) => x.text),
          `pill labels cut short at ${width}px`
        ).toEqual([]);
        expect(
          read.filter((x) => x.outside > 0.5).map((x) => x.text),
          `pills running outside their row at ${width}px`
        ).toEqual([]);
        await expectNoSidewaysScroll(page, `the roster at ${width}px`);
      }
    });
  });
}
