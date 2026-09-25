---
name: unicode-escapes-in-written-source
description: Writing a file with \uXXXX escapes for non-ASCII code points can land the LITERAL character; U+2028 in a regex literal then breaks tsc with "Unterminated regular expression"
metadata:
  type: feedback
---

On EV-256b, source written through the file-writing tool with ` `, ` `,
`​`, `　` … escapes came out containing the literal characters. `\u{1F957}`
(brace form) and ASCII-range escapes (`\u000B`, `\u001C`) survived. A literal U+2028
inside a regex literal is a line terminator, so `tsc` failed with "Unterminated regular
expression literal" pointing at a line that looked correct on screen.

**Why:** the damage is invisible in an editor and, in a string literal, not even an
error — a test string silently holds a real NBSP instead of the escape a reviewer reads.

**How to apply:** after writing any file that needs non-ASCII escapes, scan it:
`python3` over the text flagging `unicodedata.category` in Cc/Cf/Zl/Zp or a non-space Zs,
and rewrite each hit as `\uXXXX`. Or build such patterns with `new RegExp("\\u2028…")`
from a doubled-backslash string, which the tool leaves alone.
