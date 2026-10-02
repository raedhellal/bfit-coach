#!/usr/bin/env node
/**
 * BUG-678 / EV-337n N5 — the /i 404s, checked on a DEPLOYMENT (Vercel), not under `next start`.
 *
 *   node qa/probes/invite-404-deployment.mjs https://<deployment>
 *
 * The defect was Vercel-only: `/i/tok/extra` answered from the global `/_not-found` (Evoli Pro
 * title and icons) while `next start` drew the trainee page. So the Playwright suites, which
 * run Next locally, cannot go red on it; this script is the witness. Red on production
 * `46eb8b7`, green on a deployment of the fix. Signed out, three Accept-Language variants.
 * Read-only GETs, no cookies. Exit code 0 = every check held.
 *
 * `x-matched-path` is Vercel's routing header: which route served the response. Under
 * `next start` it is absent, and the script says so instead of failing on it.
 */

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: node qa/probes/invite-404-deployment.mjs https://<deployment>");
  process.exit(2);
}

const TOKEN = "Qm9fN2xRk4TzW8vYh1sLc3pGd6uJx0aEoB5nVi-_tKw";
const BODY = {
  en: "There is no invitation at this address. Check the link, or ask your coach to send it to you again.",
  fr: "Aucune invitation ne correspond à cette adresse. Vérifiez le lien, ou demandez à votre coach de vous le renvoyer.",
};
const LANGS = [
  { name: "en", header: "en-US,en;q=0.9", h1: "Page not found", body: BODY.en },
  { name: "fr", header: "fr-FR,fr;q=0.9", h1: "Page introuvable", body: BODY.fr },
  { name: "none", header: null, h1: "Page introuvable", body: BODY.fr },
];
const NOT_INVITATIONS = [
  { path: "/i", matched: "/i" },
  { path: "/i/tok/extra", matched: "/i/no-invitation" },
  { path: "/i/a/b/c", matched: "/i/no-invitation" },
  { path: `/i/${TOKEN}/x`, matched: "/i/no-invitation" },
];

const say = (line) => process.stdout.write(`${line}\n`);
const decode = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
let failures = 0;
const check = (ok, what) => {
  if (!ok) failures++;
  say(`  ${ok ? "ok  " : "FAIL"} ${what}`);
};

async function get(path, header) {
  const res = await fetch(base + path, { redirect: "manual", headers: header ? { "Accept-Language": header } : {} });
  const html = await res.text();
  const titles = Array.from(html.matchAll(/<title>([^<]*)<\/title>/g), (m) => decode(m[1]));
  const icons = Array.from(html.matchAll(/<link\b[^>]*>/g), (m) => m[0])
    .filter((t) => /\brel="(icon|apple-touch-icon)"/.test(t))
    .map((t) => /\bhref="([^"]*)"/.exec(t)?.[1] ?? "");
  const h1s = Array.from(html.matchAll(/<h1\b[^>]*>([^<]*)<\/h1>/g), (m) => decode(m[1]));
  const main = /<main\b[\s\S]*?<\/main>/.exec(html)?.[0] ?? "";
  return { res, html, titles, icons, h1s, main, matched: res.headers.get("x-matched-path") };
}

for (const lang of LANGS) {
  for (const { path, matched } of NOT_INVITATIONS) {
    const r = await get(path, lang.header);
    say(`${path}  [Accept-Language: ${lang.header ?? "none"}]  ${r.res.status}  x-matched-path=${r.matched ?? "(absent)"}`);
    check(r.res.status === 404, `status 404 (got ${r.res.status})`);
    if (r.matched !== null) check(r.matched === matched, `x-matched-path ${matched} (got ${r.matched})`);
    check(r.titles.length === 1 && r.titles[0] === "Evoli Fit", `title Evoli Fit (got ${JSON.stringify(r.titles)})`);
    check(
      r.icons.length === 2 && r.icons.includes("/i/icon.svg") && r.icons.includes("/i/apple-icon.png"),
      `icons /i/icon.svg + /i/apple-icon.png (got ${JSON.stringify(r.icons)})`
    );
    check(r.h1s.length === 1 && r.h1s[0] === lang.h1, `h1 ${lang.h1} (got ${JSON.stringify(r.h1s)})`);
    check(r.res.headers.get("x-frame-options") === "DENY", "X-Frame-Options DENY");
    check(r.res.headers.get("content-security-policy") === "frame-ancestors 'none'", "frame-ancestors 'none'");
    check((r.res.headers.get("cache-control") ?? "").includes("no-store"), "Cache-Control no-store");
  }
}

{
  const r = await get(`/i/${TOKEN}`, "en-US,en;q=0.9");
  say(`/i/<token>  ${r.res.status}  x-matched-path=${r.matched ?? "(absent)"}`);
  check(r.res.status === 200, `status 200 (got ${r.res.status})`);
  if (r.matched !== null) check(r.matched === "/i/[token]", `x-matched-path /i/[token] (got ${r.matched})`);
  check(r.titles[0] === "Your coach invited you to Evoli", `title (got ${JSON.stringify(r.titles)})`);
}
{
  const r = await get("/nope", "en-US,en;q=0.9");
  say(`/nope  ${r.res.status}  location=${r.res.headers.get("location")}`);
  check(r.res.status === 307 && /\/login$/.test(r.res.headers.get("location") ?? ""), "a guarded unknown path still 307s to /login");
}

say(failures === 0 ? "\nALL CHECKS HELD" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
