---
name: a-failed-preload-poisons-the-url-in-webkit
description: EV-350 - preloading an async chunk in Next 14 App Router (buildId-named chunk + DefinePlugin), and the WebKit trap where a 404'd preload is served from memory cache to every later request, across a reload
metadata:
  type: feedback
---

**Rule: if a document `<link rel="preload">`s a URL that a retry/reload path may request again, test the
failure path in WebKit. A preload that got an HTTP error stays in WebKit's memory cache and answers every
later request for that URL with no network request: the same document's `<script>`, AND the next
document's after `location.reload()`, even with the hint stripped from the new HTML and the `<link>`
removed. `no-store` on the 404 does not help. `fetch(url, { cache: "reload" })` evicts it.**

**Why:** EV-350 (2026-10-08). The hint made M.6's "cold load, one 404 → one reload → hydrated" end on
React #329 in WebKit only; base `5e8d5aa` passed, Chromium passed. Found only by running the specs on a
`next build` in a WebKit project; `next dev` WebKit stayed green until the case was added. Witness script
pattern: hydrated page, append a preload that a route 404s once, (optionally evict), reload, append a
`<script>` for the same URL: `error` with 1 network hit vs `load` with the eviction.

**How to apply:**
- Next 14 compiles server BEFORE client, so a server component cannot know an async chunk's
  `[contenthash]`. What worked with no dependency and no Next patch: `webpackChunkName` on the `import()`,
  client `output.chunkFilename` as a function that names those chunks `<name>.<buildId>.js`, and a server
  `DefinePlugin` of the same URLs (the `webpack(config, { buildId })` hook gives both compilations the same
  id). Cost: URL changes every deploy. Fail the build in an `emit` hook if the named chunks are missing.
- Mirror Next's `?dpl=` suffix (`NEXT_DEPLOYMENT_ID`, `client/app-webpack.js`) or the hint never matches
  under Vercel skew protection.
- `preload()` in a layout also rides every RSC payload (navigations, server actions) into `<head>`. Skip
  it when the request has `RSC` or `Next-Action` headers, or a language switch preloads the OTHER chunk.
- webpack's `ChunkLoadError.request` is the absolute URL it asked for; webpack's script loader REUSES an
  existing `<script src>` with the same URL, so a `preinit` (async script) that already failed would hang
  `import()` for webpack's 120 s timeout. Preload, not preinit.
- WebKit on `next start` over plain http cannot sign in (session cookie is `Secure` in production); run
  WebKit prod-build checks through the EV-346 HTTPS front with `ignoreHTTPSErrors` and no globalSetup.

Related: [[ev342-kjm-portal-facts]], [[coach-portal-i18n-facts]].
