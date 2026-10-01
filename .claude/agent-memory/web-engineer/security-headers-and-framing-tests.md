---
name: security-headers-and-framing-tests
description: EV-229 — next.config headers() reaches middleware's own 307/405 and /api/auth; a framing test is vacuous unless the framer is a real loopback server (Chromium local-network-access); --ink-3 is a deliberate fork of the admin palette
metadata:
  type: project
---

Facts from `fix/portal-headers-and-narrow-widths` (2026-10-01, EV-229 + BUG-252/270/300/301):

- **`headers()` in `next.config.mjs` with `source: "/:path*"` covers everything**,
  witnessed on `next dev` and `next start`: pages, `/api/version`, `/api/auth/*` (outside
  middleware's matcher), `/_next/static/*`, AND the answers middleware builds itself (the
  signed-out 307 to /login, the bare 405 on `POST /api/version`). Do not ALSO set them in
  middleware: a header sent twice ("DENY, DENY") is one a browser may reject.
  `qa/security-headers.spec.ts` asserts each header with `toBe`, so a duplicate fails.
- **A framing test needs a real loopback framer.** A framer page fulfilled by
  `page.route`, or served from a public host, is refused by Chromium BEFORE the portal
  answers: `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`. That test passes on main
  for the wrong reason. Use a `node:http` server on `127.0.0.1:0` (not `localhost`, so
  the origin differs) and assert the portal's response arrived (status 200) before
  asserting the frame is `chrome-error://` with no form. Red on main was witnessed.
- **The full CSP is still out of scope** (story's Out of scope): only `frame-ancestors`.
- **`--ink-3` is `#646C82` in this repo only** (BUG-301). The admin and mobile keep
  `#8A92A6` (3.11:1 on white). That is the one deliberate fork from the ported palette.
  Any re-port from the admin must keep it, and the admin likely has the same miss.
- **CardHead's action slot cannot shrink**: a `nowrap` Badge or a fixed-height Button
  there overflows at phone widths. The fix used per card is `style={{ flexWrap: "wrap" }}`
  on that CardHead (targets card and meal-week card). A 40-char trainee name in
  "Apply to {name}" can still exceed a 252 px line at 320 px.
- Number + unit: `unitSpace` is U+00A0 in BOTH locales since BUG-270; `toHaveText`
  normalises it to a space, so only a Range-rect probe (`qa/narrow-widths.spec.ts`
  `splitNumberUnits`) or a unit `toBe` can see it.

See [[unicode-escapes-in-written-source]]: the Write tool landed `\u00a0` as the literal
character twice on this branch as well. Scan after every Write.
