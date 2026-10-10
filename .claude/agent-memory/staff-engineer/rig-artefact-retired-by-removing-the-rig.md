---
name: rig-artefact-retired-by-removing-the-rig
description: "Rig artefact" is a claim needing a witness - remove the rig and re-run; WebKit next start needs no HTTPS proxy (de-secure the cookies), the proxy itself made the RSC "Load failed" reds
metadata:
  type: feedback
---

A red blamed on the test rig is retired by running WITHOUT the rig, not by reasoning about it.

**Why:** BUG-739 (2026-10-11). The engineer ran WebKit on `next start` through a scratch node HTTPS proxy
("WebKit cannot sign in over http, Secure cookie"), got "Failed to fetch RSC payload … TypeError: Load failed"
on every page and called it a rig artefact, and wrote into memory that WebKit *needs* an HTTPS front.
Both halves were unwitnessed. Re-adding the session cookies with `secure: false` (EV-356d's
`qa/start-build.ts` `signedInContext`) signs WebKit in over plain http. With the same AUTO prefetches firing,
the console was `[]` on every page in both engines. So the proxy made the reds, and the "cannot" was false.

**How to apply:** when a review's evidence says "artefact / flake / environment", ask for, or run, the run
without the suspected rig, and the same run on base. For "pre-existing", also count the green runs on base:
BUG-730's WebKit create-step tests were "identical on base 4/4". In fact they were intermittent on BOTH trees
(base 3 of 8 green), with an identical Navigation-API dump before the failing Back. Related:
[[echo-server-witnesses-what-a-client-sends]], [[red-on-base-at-a-precondition]].
