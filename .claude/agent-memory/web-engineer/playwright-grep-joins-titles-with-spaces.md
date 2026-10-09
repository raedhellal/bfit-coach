---
name: playwright-grep-joins-titles-with-spaces
description: Playwright -g matches the title path joined by single spaces (project, file, describes, test), never the "›" the line reporter prints
metadata:
  type: reference
---

`npx playwright test -g "\(en, Chromium\) › G2.1"` finds **No tests**: the `›` is the reporter's
separator, not part of what `--grep` sees. Use `.*` between parts: `-g "\(en, Chromium\).*G2.1"`.
A mutant run whose grep matched nothing exits 1 and looks like a red mutant — read the log's
"No tests found" before counting it (EV-337g2 lost one batch of six to this).
