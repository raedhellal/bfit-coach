---
name: tohavetext-hides-a-trim-defect-in-french
description: toHaveText collapses whitespace (U+00A0 included), so a quote of an UNtrimmed query inside « » reads the same as the trimmed one; compare textContent exactly
metadata:
  type: feedback
---

EV-337j2's no-match sentence « Aucune recette ne correspond à « {texte} ». » quotes the
search query, trimmed. Mutant M5 (quote it untrimmed) went red in English and stayed
GREEN in French: `q()` wraps the text in `«\u00a0…\u00a0»`, and `toHaveText`
normalises every whitespace run to one space, so `«\u00a0  zzz \u00a0»` and
`«\u00a0zzz\u00a0»` both read `« zzz »`. English's curly quotes have no space next to the
text, so the extra spaces survived there.

**Why:** a whitespace-shaped defect inside a French quotation is invisible to the usual
text assertion, in exactly the language the product ships by default.

**How to apply:** for any sentence that quotes user input, also assert
`el.textContent` with `toBe(...)` against a literal that spells the NBSPs as `\u00a0`
(then scan the file, [[unicode-escapes-in-written-source]]). Run the untrimmed mutant in
both languages; one red language is not a witness for the other.
