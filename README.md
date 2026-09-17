# b-fit-coach — Evoli Pro

The coach back-office for Evoli Fit. Next.js 14 (App Router), React 18, TypeScript,
**port 3300**, light mode only.

Built for **EV-183** (MVE-1 demo cut) on branch `demo/evoli-pro-mve1`, to the shapes
ADR-0012 decides. Both documents live in the hub repo:

- `b-fit-mobile/docs/product/stories/EV-183-evoli-pro-demo-mve1.md`
- `b-fit-mobile/docs/architecture/adr/0012-coach-trainee-link.md`

> **This repo merges to no `main` and is deployed nowhere.** `GATE-MVE1` is closed;
> this is a demo build, local only, no production, no public URL.

---

## Run it

```sh
npm install
cp .env.example .env.local     # then edit
npm run dev                    # http://localhost:3300
```

| Script | What it does |
|---|---|
| `npm run dev` | dev server on **:3300** |
| `npm run build` | production build |
| `npm run start` | serve the build on :3300 |
| `npm run test:e2e:refresh` | the single-flight refresh spec, against `qa/stub-api.mjs` |
| `npm run lint` | `next lint --dir src --dir qa --max-warnings=0` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:e2e` | Playwright smoke specs (fixture mode, boots its own server) |
| `npm run test:e2e:roster` | the roster specs, on the **populated** fixture scenario (its own server, :3301) |

`test:e2e` and `test:e2e:roster` are **two suites, not one with a flag**:
`COACH_FIXTURE_SCENARIO` is read once per dev-server process, the main suite needs
`empty` (EV-183 AC1's empty state and the invite happy path) and the roster's
scope-filtered nulls need rows. Both are gates — there is no CI here, so this table is
the checklist.

**Demo on `npm run dev`, not `npm run start`.** A production build served over plain
http on the LAN sets `Secure` cookies (`NODE_ENV=production`), the browser drops them,
and sign-in fails silently — the form posts, the api answers 200, and the coach lands
back on `/login` with no error to explain it.

**Port 3300 is this surface's port** — `b-fit-api` is 8080, `b-fit-admin` 3100,
`evoli-landing` 3200, and nothing else may claim 3300. If you keep an editor launch
config, this is the entry (`.vscode/launch.json` / `.claude/launch.json` shape):

```json
{
  "configurations": [
    {
      "name": "Evoli Pro (b-fit-coach) :3300",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "env": { "API_BASE_URL": "http://localhost:8080", "COACH_API_MODE": "live" }
    }
  ]
}
```

## Environment

See `.env.example`. Four variables, none of them secret, none of them shipped to the
browser:

| Variable | Default | Notes |
|---|---|---|
| `API_BASE_URL` | `http://localhost:8080` | b-fit-api. Trailing slashes stripped in `src/lib/env.ts`. |
| `COACH_API_MODE` | `live` | `fixture` serves in-memory demo data instead of the api. |
| `COACH_FIXTURE_SCENARIO` | `populated` | fixture only. `empty` = zero-trainee roster. |
| `INVITE_BASE_URL` | `http://localhost:3300` | The host the invite URL + QR encode; the link is `<INVITE_BASE_URL>/i/<token>?coach=<name>`. **Set it to the Mac's LAN IP for the demo** (`ipconfig getifaddr en0`, e.g. `http://192.168.1.24:3300`) and start Next with `npm run dev -- -H 0.0.0.0`, or a phone cannot reach it. |

### The fixture switch

`COACH_API_MODE=fixture` swaps the whole api client for `src/lib/coachApi.fixture.ts`:
coach *Alex R.*, trainee *Lina M.* on the *Intermediate Muscle Building Routine*, a
4-day streak, eight weekly weigh-ins from 71.2 kg to 70.4 kg, and one red flag. Dates
are computed relative to today on every call, so the fixture never goes stale.

It exists so the screens could be built and reviewed while ADR-0012 §D4 is still under
challenge — **not** so the product can pretend to have a backend. It is server-side and
env-gated, `live` is the default, and the demo runs live. In fixture mode the login
route mints an unsigned local token so `middleware.ts` has something to read; that
token is accepted by nothing outside this process.

```sh
COACH_API_MODE=fixture COACH_FIXTURE_SCENARIO=empty npm run dev
```

## Routes

| Route | What |
|---|---|
| `/login` | Credentials. The only page reachable **without a session**. |
| `/` | Roster: capacity meter, empty state or rows (needs-attention first), invite modal. |
| `/clients/[id]` | Read-only trainee overview: four stat tiles, 8-week weight trend, red flags, revoke. |
| `/clients/denied` | The trainee-is-not-on-your-roster page, served with **403**. `/clients/[id]`'s layout redirects here when the api answers 403; `middleware.ts` sets the status, because a page render cannot. Carries no id and makes no api call. |
| `POST /api/auth/login` | BFF sign-in — proxies `POST /auth/login`, sets the cookies. |
| `POST /api/auth/logout` | Clears both cookies. |
| `GET /api/version` | **Public** deploy marker — the portal's `/actuator/info`. `{ commit, commitShort, buildTime, environment }`, never cached, GET/HEAD only. See below. |
| `/i/[token]` | **Public** invite landing page — the page the QR encodes. Inside the middleware matcher, let through explicitly, **GET/HEAD only** (anything else answers 405). |

### Verifying a deploy

`main` auto-deploys to Vercel, and **a 200 from the site is evidence of nothing** —
the previous build answers 200 too. After a push, poll the deploy marker until it
reports the commit you pushed, exactly as `b-fit-api` is verified by polling
`/actuator/info` for `build.commit`:

```sh
EXPECTED=$(git rev-parse HEAD)
until [ "$(curl -s https://bfit-coach-seven.vercel.app/api/version | \
  sed -n 's/.*"commit":"\([^"]*\)".*/\1/p')" = "$EXPECTED" ]; do sleep 5; done
```

The SHA comes from Vercel's system environment variable `VERCEL_GIT_COMMIT_SHA`
(with `VERCEL_ENV` for `environment`), read in `next.config.mjs` at build time and
frozen into the output, with a runtime fallback. Off Vercel — `npm run dev`, or a
`next build` on your laptop — there is no such variable and the endpoint answers
`"commit": "unknown"`, `"environment": "local"`. It never guesses from local git:
a stale SHA would confirm a deploy that never happened.

### The invite link

`src/lib/coachApi.ts` composes exactly one shape, shown in the modal and QR-encoded
byte-identically (AC2):

```
<INVITE_BASE_URL>/i/<token>?coach=<url-encoded display name>

e.g. http://192.168.1.24:3300/i/<43-char base64url token>?coach=Alex%20R.
```

The `?coach=` query is the coach's display name from `GET /coach-portal/me`, sanitised
by `src/lib/inviteName.ts` (plain text, no control or bidi characters, 60 characters).
It is there because b-fit-api has no pre-accept lookup for an invite token, so it is the
only way the app's consent screen can name the coach before the trainee accepts (AC3).
It is optional: a link without it still works and both sides say "Your coach".

`/i/[token]` is server-rendered, **public** (excluded from the middleware matcher) and
makes **no API call** — the token is opaque to this surface; b-fit-api validates it when
the app accepts. It shows the Evoli Fit wordmark, "Your coach invited you to Evoli", one
button linking to `evolifit://my-coach/invite/<token>?coach=<name>` (the query forwarded
untouched, and omitted when the link had none), and a fallback line for a phone
without the app (no store links yet — ⛔ D8 — so it says "coming soon" instead of
shipping a dead href). The token is never rendered as text, only inside that href.

It does **not** auto-redirect: iOS Safari only follows a custom scheme from a user
gesture, so it must stay a real `<a href>` the visitor taps.

#### Demoing it on a phone

A phone cannot resolve `localhost`, so both of these are required:

```sh
ipconfig getifaddr en0                 # e.g. 192.168.1.24
INVITE_BASE_URL=http://192.168.1.24:3300 npm run dev -- -H 0.0.0.0
```

`-H 0.0.0.0` makes Next listen on the LAN instead of the loopback interface; without it
the QR resolves to a host that refuses the connection. Phone and Mac must be on the same
Wi-Fi, and macOS may prompt to allow incoming connections for Node the first time.

## The session (ADR-0012 D5)

This app is a **BFF**: the browser never holds a token and never calls `b-fit-api`.

- `POST /api/auth/login` calls the api server-to-server and writes the access and
  refresh tokens into **httpOnly, SameSite=Lax, Secure-in-production** cookies
  (`evoli_pro_at` / `evoli_pro_rt`). They are not in the response body, not in
  `localStorage`, and `document.cookie` cannot see them.
- `src/middleware.ts` guards every page except `/login` and the public `/i/*` (which it
  handles first, allowing GET/HEAD and answering 405 otherwise), refreshes an expired access
  token through `POST /auth/refresh` (it is the only place that can write the rotated
  cookie back), requires `COACH` in the token's `roles` claim, and serves
  `/clients/denied` with **403** — the one non-200 status in the app.
- The roster lives in the `(roster)` route group so that its `loading.tsx` skeleton
  belongs to `/` alone. A `loading.tsx` at the app root would flush every response
  before the render begins, and `/clients/[id]`'s layout would then be unable to
  redirect a denied read to the 403 page (it would degrade to a `<meta refresh>` served
  with 200 — BUG-139).
- `src/lib/apiFetch.ts` attaches `Authorization: Bearer` on the server and retries once
  through `/auth/refresh` on a 401. Concurrent calls from one render (the roster fetches
  `/coach-portal/me` and `/coach-portal/clients` together) share a single in-flight
  rotation keyed by the refresh token, so one 401 storm is one rotation — two would spend
  the same refresh token twice and sign the coach out.
- Nothing is cached: both pages are `force-dynamic` and every fetch is `no-store`,
  because a revoked link must be gone on the coach's very next reload (EV-183 AC6).

`b-fit-admin` does the opposite (bearer token in `localStorage`, no middleware). That
model is deliberately not copied — per ADR-0012 finding 2, this app is EV-060's pattern
source.

**Two limitations, stated rather than hidden:**

1. **Roles come from the JWT, not from `/me`.** `GET /me` (`UserResponse`) returns id,
   email, fullName, createdAt, emailVerified — and no roles. The `roles` claim in the
   access token (`JwtTokenService`) is the only place the role is visible to this
   surface, so `src/lib/jwt.ts` decodes it **without verifying the signature**. That is
   safe here because the token was obtained server-to-server by this app and never
   round-trips through a browser, and because the real authorization decision is always
   the api's (`CoachAccessGuard`). If `/me` ever exposes roles, prefer it.
2. **Sign-out is local.** `b-fit-api` has no `/auth/logout` and no refresh-token
   revocation endpoint, so signing out drops the browser's copy but cannot invalidate
   the refresh token server-side. EV-060 should add the endpoint.

**MFA:** an account with MFA gets a challenge response (`accessToken` absent). Evoli
Pro does not implement the challenge step (EV-059 is a follow-up), so login fails with
a plain sentence saying so rather than crashing on a missing token.

## The api contract

Everything this surface knows about `b-fit-api`'s coach portal lives in
**`src/lib/coachApi.ts`** — one module, ADR-0012 §D4's paths and the response types as
this app consumes them. Screens import `coachApi`, never `apiFetch`. When D4 moves under
the staff challenge, this file moves and no screen changes.

## Copy

Every user-visible string is in **`src/lib/copy.ts`**, English only. The strings marked
`AC` are verbatim acceptance-criteria text from EV-183 and QA verifies them character by
character — a "tidy-up" of one of those sentences is a story change. No invented
benefits, no tier price (⛔ D8 is open).

## Design

Tokens are copied verbatim from `b-fit-admin/src/app/globals.css` (itself the
`design_handoff_evoli/web-tokens.css` port), minus the dark block: off-white `--bg`,
white cards at `--r-2xl` (24 px) with a hairline border, the `--grad-energy`
indigo→violet primary button, pill chips. The UI kit under `src/components/ui/` is
**copied, not extracted** (ADR-0012 D5 — with two consumers a shared package is
premature; revisit at MVE-7). Do not fork the palette; re-copy from the admin.

Responsive to 390 px, with no viewport JavaScript: the wide and narrow layouts are both
server-rendered and CSS chooses (`.only-wide` / `.only-narrow` in `globals.css`).

## Tests

```sh
npx playwright install chromium   # first run only
npm run test:e2e
```

`qa/invite-landing.spec.ts` covers the public `/i/<token>` page: it renders with no
session, the `evolifit://my-coach/invite/<token>` href is the only link on it, the token
never appears as text, and the tap target survives 390 px.

`qa/coach-smoke.spec.ts` runs in fixture mode with the empty scenario and covers the
login redirect, the roster empty state and its capacity sentence, **both** session
cookies being httpOnly (and that `localStorage` is empty), the 390 px
no-horizontal-scroll requirement, and the invite modal's link, QR and expiry sentence.

`qa/refresh-single-flight.spec.ts` runs from its own config against `qa/stub-api.mjs`, a
counting stand-in for b-fit-api that rotates its refresh token and reports how many times
`/auth/refresh` was called. It is not a second fixture — no screen may be built against
it; it exists so "one render, one rotation" is an assertion instead of a claim:

```sh
npm run test:e2e:refresh
```
