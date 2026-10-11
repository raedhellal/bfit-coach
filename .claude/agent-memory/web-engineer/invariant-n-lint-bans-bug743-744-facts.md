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
- `[value.expression.value=false]` matches the JSX `{false}`. Shorthand `prefetch` and `{null}`
  (AUTO in 14.2) do not match it.
- `[/]` inside an esquery regex parses fine.
- `next lint`'s default `--ext` also covers mjs/cjs/mts/cts. A `.mts` file goes to Babel and fails
  loudly.

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

Forms no selector can close (no data flow): a name built at runtime, for example
`"pre" + "fetch"` or `Object.values(router)`. Behind them sit tsc, next build and the runtime walk.
The spec does close the config-level bypasses: a nested `.eslintrc`, an ignore entry, an override
that switches a ban off, and an inline disable that names a ban or a blanket disable.
