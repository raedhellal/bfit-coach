---
name: a-card-located-by-its-text-asserts-nothing
description: Playwright's div-filtered-by-text resolves to the innermost element — the title — so assertions about a card's body silently check the title; give blocks a named landmark instead
metadata:
  type: project
---

`page.locator("div").filter({ hasText: title }).last()` does **not** find the card whose
head reads `title`. It finds the **innermost** element containing that string — the title
`<div>` itself — which contains nothing else. Every subsequent
`expect(card).toContainText(...)` then fails, or worse passes, for a reason that has
nothing to do with the product.

**Why it matters here:** this cost EV-187b's first spec run six red tests that were all
one defect in the selector, and the `not.toContainText` direction is the dangerous one —
a card located this way can never contain the forbidden string, so a negative assertion
is *always* green.

**How to apply:** render each block as `<section aria-label={title}>` (the portal's
`src/components/client/MonitoringBlock.tsx` does this) and locate it with
`page.getByRole("region", { name: title })`. It is also the right a11y answer — a coach
on a screen reader can jump between named regions instead of arrowing through figures —
so the testability is not the only reason to do it. Same family as
[[layout-assertions-need-occlusion]]: the assertion looked strong and was checking
nothing.
