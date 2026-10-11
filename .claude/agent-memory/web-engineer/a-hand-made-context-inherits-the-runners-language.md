---
name: a-hand-made-context-inherits-the-runners-language
description: a webkit.launch() + browser.newContext({ locale: "fr-FR" }) inside a coach spec still got English (html lang=en); set the evoli_pro_locale cookie, as every WebKit spec does
metadata:
  type: feedback
---

Inside a coach Playwright spec, a context made by hand (`webkit.launch()` then
`browser.newContext({ baseURL, locale: "fr-FR" })`) still served the ENGLISH portal:
witnessed `<html lang="en">` and the English login form (BUG-738, 2026-10-10). The
likely cause is that the runner applies the project's context options to hand-made
contexts too, including `qa/fixture-test.ts`'s `Accept-Language: en-US` header. The
same script run with plain node outside the runner got French. The failure shows up as
`signInThroughForm`'s "never hydrated?" timeout, because the French labels are never
found. No request fails, and the page does not reload: the logs show two `framenavigated`
events for `/login`, both the same URL.

**Why:** the message blames hydration, and the reflex is to chase the dictionary chunk
reload (`reloadOnce`). That costs a debugging round when the cause is the language.

**How to apply:** every hand-made context gets
`addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL }])` before sign-in,
in both languages. The WebKit blocks in `back-to-pro-roster`, `skip-link` and
`client-tab-bar` already do this. Related: [[french-specs-need-the-browser-locale]] covers
the config-project case.

Portal fact from the same fix: `/templates`, `/nutrition-templates` and `/challenges`
pass `null` (not `[]`) for a failed roster read. The routine picker reuses
`copy.challenges.clientsLoadError` (senior-po: no new copy). `/templates` and
`/nutrition-templates` still read only page 0 of `listClients()` (100 rows), where
`/challenges` uses `readWholeRoster` (the BUG-472 class). This was not fixed here.
