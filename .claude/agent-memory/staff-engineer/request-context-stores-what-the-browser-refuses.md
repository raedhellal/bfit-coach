---
name: request-context-stores-what-the-browser-refuses
description: Playwright's context.request stores a Secure/__Host- cookie from http://localhost in WebKit even though a WebKit page navigation drops it; "WebKit never stored it" is true for one path only
metadata:
  type: feedback
---

"Engine X never stored cookie Y over http" must say WHICH writer: the browser (page navigation) or
Playwright's `context.request` (its own jar, written into the context with the Set-Cookie flags).

**Why:** coach-s3l `136b3de` (2026-10-11). The `__Host-` re-add fix's comment said "WebKit never stored
it [`__Host-evoli_pro_epoch`] over http in the first place". Probe on http://localhost: a WebKit
`page.goto` of a Set-Cookie `__Host-…; Secure` stores nothing, but `context.request.post` stores it with
`secure=true`. With the old `secure:false` re-add WebKit then SENT it (epoch present); with the fix it is
kept Secure and not sent (epoch absent, `document.cookie` empty). Chromium stores it either way and rejects a
non-Secure `__Host-` re-add ("Invalid cookie fields"). The fix was right; the sentence was false, and it hid
a behaviour change in the WebKit cells (epoch present -> absent; harmless only because no start spec reads it).

**How to apply:** any rig that signs in with `context.request` and re-adds cookies changes what the page
sends; probe both writers in both engines (a 30-line node http server is enough) before accepting a comment
about what an engine "stores". Related: [[rig-artefact-retired-by-removing-the-rig]],
[[defect-pattern-cited-seam-does-not-exist]].
