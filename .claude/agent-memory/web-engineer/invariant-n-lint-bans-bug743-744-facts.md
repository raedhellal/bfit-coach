---
name: invariant-n-lint-bans-bug743-744-facts
description: BUG-743/744 (2026-10-11) - how ADR-0033 D33.13's next/link + prefetch lint bans are built and witnessed in b-fit-coach; ESLint/esquery facts and the forms no selector can close
metadata:
  type: project
---

The strict bans are a `src/**` override of `no-restricted-syntax` in `.eslintrc.json`; the base
rules keep the OLD narrow set and only qa/ uses them. ESLint override options REPLACE the base
options, they do not merge, so the src list must be complete on its own.
**Why:** qa/ legitimately has `prefetch` identifiers and strings (session-epoch-unit's router stub,
perf/transitions.measure's log field, the witness spec's own snippets). A global ban would flag them.
**How to apply:** a new ban for product code goes in the `src/**` override, which must stay ABOVE the
Link.tsx/IntentLink.tsx overrides (a later override wins). IntentLink turns `no-restricted-syntax`
off entirely; Link.tsx turns off only `no-restricted-imports`, so the prefetch-prop ban guards the
wrapper itself.

Witness: `qa/invariant-n-lint-bans.spec.ts` (default config; exempt in fixture-isolation; no
server). It drives the real config with `new ESLint({cwd, useEslintrc:true}).lintText(code,
{filePath})`. A filePath that does not exist works. **Check `fatal` first:** a parse error is also a
severity-2 message and would pass a "has an error" assertion. `qa/eslint.d.ts` declares the API,
because there is no @types/eslint and adding one would be a new dependency.

Verified esquery and parser facts (eslint 8.57.1, esquery 1.7.0):
- Babel's eslint-parser (`.js`) and typescript-estree both emit `ImportExpression`.
- `:not(TSLiteralType > Literal)` honours ancestry. It is how `Omit<…, "prefetch">` stays legal.
- Match the JSX prop on `[value.expression.raw='false']`, never on `value=false`. esquery compares
  `value` as a STRING, so `prefetch={"false"}` (truthy at runtime, so a FULL prefetch) matched it
  (staff N1, round 2). Shorthand `prefetch`, `{null}` (AUTO in 14.2) and `{0}` do not match `raw`.
- `[/]` inside an esquery regex parses fine.
- CORRECTED in round 2 (staff S1): `next build`, which is the Vercel lint pass, lints ONLY `.js`,
  `.jsx`, `.ts` and `.tsx` (`next/dist/lib/eslint/runLintCheck.js:137-142`). Only `next lint`'s CLI
  default adds `.mjs`, `.cjs`, `.mts` and `.cts`. So an `.mjs` in src that re-exports next/link
  passes the build unlinted. The census forbids those four extensions in src.

Staff's EV-356d R2-1 selectors (`ObjectPattern > Property[key.name]` and computed
`MemberExpression[property.value]`) close both named BUG-744 forms. They leave 9 forms open:
- a quoted or computed destructure key;
- a template key;
- a key held in a variable;
- `const go = r.prefetch`, or passing the method as a callback;
- `Reflect.get`;
- a local `prefetch`;
- a `prefetch` prop.

The fix bans the NAME instead: an Identifier, a non-type string, a template, or the JSX prop.

Forms no selector can close (no data flow), each confirmed lint-clean by staff:
- a name built at runtime: `"pre" + "fetch"`, its template version, `.join("")`,
  `Object.values(router)`;
- a computed key spread onto a Link;
- an aliased `require` called with a computed name.

Behind them sit tsc, next build and the runtime walk.

The spec also closes the config-level bypasses: a nested `.eslintrc`, an ignore entry, an override
that switches a ban off, and inline directives.

**Never regex-scan for directives.** Round 1 scanned one line at a time, and a block comment with
`eslint-disable <rule>` on its own line got past it while ESLint honoured it (staff B1). Let ESLint
judge instead: `new ESLint({ allowInlineConfig: false })` over every src file must report neither ban.

**Kill each selector with its own row.** A row that two selectors both catch (for example a template
`next/dist/client/link`, which the link regex and the dist regex both match) survives the deletion
of either one. Mutate each selector alone and look for a red (staff S2).
