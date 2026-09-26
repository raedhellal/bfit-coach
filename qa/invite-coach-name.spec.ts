import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { create as createQr } from "qrcode";

/**
 * EV-183 AC3 — the coach's name travels on the invite link.
 *
 * b-fit-api exposes no pre-accept lookup for an invite token (ADR-0012 D4: the token is
 * only resolvable by POSTing it at accept time), so the mobile consent screen cannot ask
 * the api who is inviting the trainee. The name is therefore composed into the link by
 * the back-office as an optional `?coach=` query and forwarded, unchanged, into the
 * deep link this page hands to the app. Without it the app says "Your coach".
 *
 * Three things this file is here to stop a refactor breaking silently:
 * the query must survive into the QR (the QR is what a trainee actually scans), the
 * landing page must forward it into the one custom-scheme href, and a link *without*
 * the query — an old QR, a messaging app that stripped it — must still work.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const TOKEN = "Zm9vYmFyLXRva2VuLTEyMzQ1Njc4OTA";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test("the QR encodes the full URL including ?coach=, not just the token path", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Invite a trainee" }).click();

  const url = await page.getByLabel("Invite link").inputValue();
  expect(url).toContain("?coach=");

  const qr = page.getByRole("img", { name: "QR code for the invite link" });
  await expect(qr).toBeVisible();
  const src = (await qr.getAttribute("src"))!;

  // Read the modules back out of the rendered PNG by sampling the centre of each cell,
  // and compare them with the matrix `qrcode` produces for a candidate string. Comparing
  // the data URLs byte-for-byte would not work — the browser's canvas PNG encoder and
  // node's are different encoders of the same image.
  const scanned = await page.evaluate(
    async ({ src, size, margin }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const ctx = canvas.getContext("2d")!;
      const cell = img.naturalWidth / (size + margin * 2);
      const out: number[] = [];
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const x = Math.floor((col + margin + 0.5) * cell);
          const y = Math.floor((row + margin + 0.5) * cell);
          const [r] = ctx.getImageData(x, y, 1, 1).data;
          out.push(r < 128 ? 1 : 0);
        }
      }
      return out;
    },
    { src, size: createQr(url, { errorCorrectionLevel: "M" }).modules.size, margin: 1 }
  );

  const matrixOf = (value: string) => {
    const { modules } = createQr(value, { errorCorrectionLevel: "M" });
    return Array.from(modules.data, (bit) => (bit ? 1 : 0));
  };

  // What was scanned is the URL that is displayed, query and all (AC2: shown and scanned
  // are one string) …
  expect(scanned).toEqual(matrixOf(url));
  // … and demonstrably not the bare link, which is what a regression would encode.
  expect(scanned).not.toEqual(matrixOf(url.split("?")[0]));
});

test("the landing page forwards ?coach= into the single deep link and names the coach", async ({
  page,
}) => {
  await page.goto(`/i/${TOKEN}?coach=${encodeURIComponent("Alex R.")}`);

  await expect(page.getByRole("heading", { name: "Alex R. invited you to Evoli Fit" })).toBeVisible();

  const open = page.getByRole("link", { name: "Open in Evoli Fit" });
  await expect(open).toHaveAttribute(
    "href",
    `evolifit://my-coach/invite/${TOKEN}?coach=Alex%20R.`
  );

  // Still exactly one link on the page, and the token still never printed as text.
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("href") || ""));
  expect(hrefs).toHaveLength(1);
  expect(await page.locator("body").innerText()).not.toContain(TOKEN);
});

test("a link without ?coach= still renders, with the generic headline", async ({ page }) => {
  const res = await page.goto(`/i/${TOKEN}`);

  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Your coach invited you to Evoli" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Evoli Fit" })).toHaveAttribute(
    "href",
    `evolifit://my-coach/invite/${TOKEN}`
  );
});

test("an empty or whitespace-only coach name falls back to the generic headline", async ({
  page,
}) => {
  await page.goto(`/i/${TOKEN}?coach=%20%20`);

  await expect(page.getByRole("heading", { name: "Your coach invited you to Evoli" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Evoli Fit" })).toHaveAttribute(
    "href",
    `evolifit://my-coach/invite/${TOKEN}`
  );
});

test("a hostile coach name is plain text, capped at 60 characters, and cannot split the deep link", async ({
  page,
}) => {
  // Markup, a newline that could fake a second line of copy, an `&` that could look like
  // a second query parameter, and far more than 60 characters.
  const hostile = `<img src=x onerror=alert(1)>&utm=evil\n${"A".repeat(80)}`;
  await page.goto(`/i/${TOKEN}?coach=${encodeURIComponent(hostile)}`);

  // Nothing was injected: no element came from the name.
  await expect(page.locator("img")).toHaveCount(0);

  const suffix = " invited you to Evoli Fit";
  const heading = await page.getByRole("heading").innerText();
  // Rendered as literal characters, not parsed as markup.
  expect(heading).toContain("<img src=x onerror=alert(1)>");
  expect(heading.endsWith(suffix)).toBe(true);
  expect(heading.length - suffix.length).toBeLessThanOrEqual(60);

  const href = await page.getByRole("link", { name: "Open in Evoli Fit" }).getAttribute("href");
  // One `?`, one `&`-free parameter: the name is encoded, so the app parses one query key.
  expect(href!.startsWith(`evolifit://my-coach/invite/${TOKEN}?coach=`)).toBe(true);
  const query = new URL(href!.replace("evolifit://", "https://")).searchParams;
  expect([...query.keys()]).toEqual(["coach"]);
  expect(query.get("coach")!.length).toBeLessThanOrEqual(60);
});

test("a bidi override in the coach name is stripped, not rendered", async ({ page }) => {
  // U+202E (RIGHT-TO-LEFT OVERRIDE) reverses everything after it, so a name can make
  // the headline read a word the coach never typed — invisible in the URL and in a
  // review. sanitiseCoachName drops U+202A–U+202E along with the other bidi controls.
  const rlo = "\u202E";
  const hostile = `Alex${rlo}moc.live${rlo} R.`;
  await page.goto(`/i/${TOKEN}?coach=${encodeURIComponent(hostile)}`);

  const heading = await page.getByRole("heading").innerText();
  expect(heading).not.toContain(rlo);
  expect(heading).toBe("Alex moc.live R. invited you to Evoli Fit");

  const href = await page.getByRole("link", { name: "Open in Evoli Fit" }).getAttribute("href");
  expect(href).not.toContain(rlo);
  expect(href).not.toContain("%E2%80%AE");
});
