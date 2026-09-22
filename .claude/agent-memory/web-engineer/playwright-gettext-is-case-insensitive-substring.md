---
name: playwright-gettext-is-case-insensitive-substring
description: getByText("Saved.") matches "…Nothing was saved." — the default is a case-insensitive substring match, so success/failure assertions need exact:true
metadata:
  type: project
---

Playwright's `getByText("X")` is a **case-insensitive substring** match by default.
`getByText("Saved.")` therefore matches the error sentence *"A milestone weight must be
between 25 and 300 kg. Nothing was saved."* — so `expect(getByText("Saved.")).toHaveCount(0)`
fails while the product is behaving correctly, and the mirror-image assertion passes
while it is not.

**How to apply:** any locator for a short notice whose words also appear inside a longer
message — "Saved.", "Published.", "Done" — takes `{ exact: true }`. It costs nothing and
the failure it prevents reads as a product bug for a good ten minutes. Same family as
[[a-card-located-by-its-text-asserts-nothing]]: the locator, not the product, was the
thing under test.

A second collision from the same round: adding a metric row labelled `Weight` to the
trainee page broke `coach-overview.spec.ts`'s
`getByText("Weight", { exact: true }).locator("..")` on strict mode. The fix is to scope
the helper to the block it means (`.stat-grid`), **never** `.first()` — a `.first()`
there would let the tile and the row swap silently and the file's assertions would
quietly move to the wrong element.
