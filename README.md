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
| `npm run lint` | `next lint --dir src --dir qa --max-warnings=0` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:e2e` | Playwright smoke specs (fixture mode, boots its own server) |

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
| `INVITE_BASE_URL` | `http://localhost:3300` | The host the invite URL + QR encode. **Use the LAN IP for the demo.** |

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
| `/login` | Credentials. The only page middleware lets through. |
| `/` | Roster: capacity meter, empty state or rows (needs-attention first), invite modal. |
| `/clients/[id]` | Read-only trainee overview: four stat tiles, 8-week weight trend, red flags, revoke. |
| `POST /api/auth/login` | BFF sign-in — proxies `POST /auth/login`, sets the cookies. |
| `POST /api/auth/logout` | Clears both cookies. |

`/i/<token>` — the invite landing page ADR-0012 D5 describes — is **not built here yet**;
the invite URL is composed and QR-encoded already, so that page is the only missing
piece of the mobile hand-off.

## The session (ADR-0012 D5)

This app is a **BFF**: the browser never holds a token and never calls `b-fit-api`.

- `POST /api/auth/login` calls the api server-to-server and writes the access and
  refresh tokens into **httpOnly, SameSite=Lax, Secure-in-production** cookies
  (`evoli_pro_at` / `evoli_pro_rt`). They are not in the response body, not in
  `localStorage`, and `document.cookie` cannot see them.
- `src/middleware.ts` guards every page except `/login`, refreshes an expired access
  token through `POST /auth/refresh` (it is the only place that can write the rotated
  cookie back), and requires `COACH` in the token's `roles` claim.
- `src/lib/apiFetch.ts` attaches `Authorization: Bearer` on the server and retries once
  through `/auth/refresh` on a 401.
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

`qa/coach-smoke.spec.ts` runs in fixture mode with the empty scenario and covers the
login redirect, the roster empty state and its capacity sentence, the httpOnly cookie
(and that `localStorage` is empty), the 390 px no-horizontal-scroll requirement, and the
invite modal's link, QR, expiry sentence and disabled email control.
