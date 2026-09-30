---
name: activation-portal-facts
description: EV-278c — how a PENDING (admin-initialised) account reaches /activate and nothing else, what the api cannot tell the portal, and three test traps met building it
metadata:
  type: project
---

EV-278c (branch `feat/ev278c-coach-portal-activation`, 2026-09-28) was built against
b-fit-api `feat/ev278a-admin-initialises-coach` @ `c69c287`, vendored with `on-api-main: NO`.
**The api merged it mid-session** (origin/main `4480eba`), and `api-merge-condition.spec.ts`'s
rot detector went red in the full run exactly as designed. The branch was re-vendored from a
detached api worktree at origin/main (local api `main` lagged) and `ref: main` was hand-set.
Lesson: re-run the merge-condition spec just before pushing, not only at the start.

**Why:** the facts below are api constraints and Next/Playwright behaviour, not things the
code states, and each one would cost a rewrite or a false green to rediscover.

**How to apply:**
- **A PENDING token reaches three api routes and nothing else**: `GET /me/activation`,
  `POST /me/activate` and `/auth/email/verification/**`. **`GET /me` is 403 to it**, so the
  screen cannot show the name the admin typed. ADR-0022 D22.10e wants that name shown and
  correctable, so `fullName` is a registered deviation that java-engineer owns (it needs
  a name on `ActivationStatusResponse`). There is no `createdAt` either: the screen can say
  who set the account up and until when, but not on what day.
- **The sign-in check happens before any cookie exists.** `/api/auth/login` asks
  `GET /me/activation` with the just-minted bearer (`apiGetAs`, no refresh) and writes the
  cookie only when the answer is `pending` + `grantedRole: COACH`. A trainee's pending
  account gets `PENDING_TRAINEE`, and `ACCOUNT_NOT_INITIALISED` has its own sentence. An
  expired account IS admitted, because `/activate` is where it is told so.
- **`GET /me/activation` still says pending after expiry** (only the sweeper deletes the
  row), and only `POST /me/activate` answers 410. So the page judges `expiresAt` itself.
- **`GYM_OWNER` is not in the api's `Role` enum at c69c287.** The portal admits COACH
  only. The gym-owner branch needs EV-281a (the role) and EV-281b (a gym home).
- **The legal documents are unversioned URLs** (`evoli.fit/terms`, `/privacy`, the same
  ones the app uses). The version the person accepts is the one in the link text, and the
  api's 409 `CONSENT_VERSION_STALE` is the backstop. A versioned document URL belongs to
  landing; the portal should not invent one.
- **Next's route announcer is `role="alert"`** (`#__next-route-announcer__`, empty), so
  `page.getByRole("alert")` hits two elements. Scope it: `page.locator("form").getByRole("alert")`.
- **The kit `Input` wraps its hint inside the `<label>`**, so the accessible name is the
  label plus the hint, and "New password" vs "Repeat the new password" cannot be told apart
  by exact name. Use the `ariaLabel` + `hintId` props added in EV-278c.
- **The fixture cannot witness the live path**: it never sends a bearer, a `Retry-After`
  header or a 403 for PENDING on `/coach-portal/*`. `playwright.activation.config.ts`
  (portal :3304, `qa/activation-stub-api.mjs` :8097, `npm run test:e2e:activation`) does.
  Its legal versions are v2.3/v1.7 on purpose, and a hard-coded "v1.0" mutant survived the
  fixture suite and died only there. Fixture pending accounts are addressed by email
  (`new.coach@`, `expired.coach@`, `throttled.coach@`, `stale.coach@`, `pending.trainee@`,
  `orphan.pending@`, `expires.midway@evoli.fit`), temporary password `Temp-pass-2026`.
- **`/api/auth/*` gets no middleware, so no rotation** (staff round 2, blocking). The access
  cookie's Max-Age is the api's `expiresIn` (900 s), so a form open for 15 minutes posts with
  NO access cookie, and `apiFetch` throws on a missing token before its refresh-on-401. Any
  handler there that reads the session calls `routeAccessToken()` (`src/lib/routeSession.ts`)
  first. Witness it by `context.clearCookies({ name: "evoli_pro_at" })` before submit — a
  test that only expires the token passes on the old code, because `apiFetch`'s 401 retry
  rescues it; assert on the stub journal that `/auth/refresh` precedes `/me/activate`.
- **The api compares `token_version` on refresh only**, not on an access token. So after a
  lost activation reply the old PENDING access token still reads `GET /me/activation`
  (`pending: false`) and a reload shows "already finished". Copy after an unknown outcome
  must never say "not changed".
- **Origin allowlist** (`src/lib/sameOrigin.ts`) is on all three `/api/auth/*` handlers; an
  ABSENT Origin is allowed on purpose — every Playwright `page.request.post` sends none.
- **A failed `/auth/refresh` is not always the session ending** (staff round 3). The
  api's `AuthRateLimitGuard.onRefresh` throttles per CLIENT IP, and every coach's rotation
  comes from the portal server's one IP — a 429 read as "expired" logs out whoever is
  next. `src/lib/refreshOutcome.ts` is the one rule (4xx≠429 → expired; 429/5xx/throw →
  unavailable), used by `routeSession.ts` AND `middleware.ts`. Middleware answers a
  GET/HEAD with a 503 REWRITE onto `/unavailable` (cookies untouched, URL kept, reload
  button) and EVERY OTHER METHOD with a bare 503; a direct visit redirects home.
- **Never rewrite a server action to another page** (staff round 4, blocking). An action
  is a POST to the page URL with `Next-Action`; Next 14.2 finds no worker on the rewrite
  target and FORWARDS it, cookies and all, to the first page that has one
  (`action-handler.js` `createForwardedActionResponse`, no `x-action-forwarded` check) —
  which re-enters middleware: an endless internal loop, one `/auth/refresh` per lap
  (2,784–4,600 in 15 s measured), still running after the client gives up, and running
  the write once refresh recovers. A REDIRECT does not loop (undici cannot replay the
  streamed body on 307: "failed to forward action response"). Witness: capture the real
  action with `page.route` + `route.abort()`, replay via `page.request` minus `cookie`. `apiFetch`'s own
  `requestRefresh` still swallows every failure to null — out of scope then, worth a row.
  The activation stub has `/__refresh-fails?status=503|429|0` to drive it.
- **`sameOrigin.ts` compares the full origin** (`x-forwarded-proto` + `x-forwarded-host`,
  falling back to `request.url`'s scheme + `Host`), and an absent Origin is refused when
  `Sec-Fetch-Site` is `cross-site`/`same-site`. Playwright's request context may set both
  headers freely, which is how the fixture suite witnesses them.
- `qa/refresh-single-flight.spec.ts` reads `STUB_API_ORIGIN` (default :8098): moving the
  stub with `STUB_API_PORT` needs `STUB_API_ORIGIN` set to match, or override neither.
- A mutant that makes the fixture api refuse with the SAME code the handler would (M2, the
  409) survives a status-only test; assert that `/api/fixture/activations` stayed empty.

- **Password rules (BUG-381, 2026-09-28): the api's "blank" is Java's, not JS's.**
  `newPassword` is `@NotBlank @Size(8,128)`; HV 8.0.1's `NotBlankValidator` is
  `trim().length() > 0` and Java `trim()` strips only chars <= U+0020. JS `trim()` also
  strips U+00A0/U+2000../U+FEFF, which the api ACCEPTS — using it would be a stricter rule.
  The api hashes the password as sent (no trim), so edge spaces are legal. One module:
  `src/lib/password.ts` (`isApiBlank`), used by the form, the handler and the fixture.
- **The api's 400 message is `field + " " + defaultMessage` and the default message follows
  the JVM LOCALE** (French on a QA rig). Map by the field name only; the handler infers
  `@NotBlank` from "newPassword refused with a length inside @Size". The activation stub
  has `/__validation-locale?lang=fr` to witness it. Only a `{key}` message is localised:
  `@Size(..., message = "must be between 8 and 128 characters")` is a LITERAL, so a French
  JVM mixes "ne doit pas être vide" with an English size sentence — a stub must too.
- **An inferred mapping needs a test on BOTH sides of every bound it reads.** Staff round 2
  found the `<= NEW_PASSWORD_MAX` arm untested (129 chars would have read as blank); a
  mutant per bound, not one happy case. `contract-drift.spec.ts` pins the spec's
  `newPassword` min/max to `password.ts` and forbids a `pattern`.
- **BUG-380: an inline `display` on an element a media query hides beats the query.** The
  auth brand panel's layout now lives on `.login-brand` in globals.css; `qa/coach-auth-layout.spec.ts`
  pins 320/375/767 hidden + 768/1280 unchanged on /login and /activate.

See [[coach-portal-fixture-mode]], [[stories-carry-verbatim-copy]].
