---
name: coach-previews-are-behind-vercel-auth
description: how to find a b-fit-coach Vercel preview URL for a pushed branch (public GitHub API) and the fact that previews 302 to Vercel SSO, so curl cannot witness them without Raed
metadata:
  type: reference
---

Pushing a `b-fit-coach` branch creates a Vercel PREVIEW (not production). The repo
`raedhellal/bfit-coach` is public, so no `gh` or token is needed to find it:

- `curl -s https://api.github.com/repos/raedhellal/bfit-coach/commits/<sha>/status` → Vercel
  context, `pending` then `success`, about 2 to 4 minutes after the push.
- `.../deployments?sha=<full sha>` → `statuses_url` → `environment_url`, e.g.
  `https://bfit-coach-<id>-raeds-projects-6b067f93.vercel.app`. Team slug `raeds-projects-6b067f93`;
  branch alias `bfit-coach-git-<branch-slug>-raeds-projects-6b067f93.vercel.app`.

**Every preview answers 302 to `vercel.com/sso-api` ("Protected by Vercel Authentication"),
including the branch alias** (witnessed 2026-10-02, BUG-678). There is no Vercel CLI on the Mac
and no bypass token in the environment. So a "verified on Vercel" criterion needs Raed: a
Protection Bypass for Automation secret (header `x-vercel-protection-bypass`), preview protection
off for the check, or him running the probe in a signed-in browser or `vercel curl`. Ask; do not
guess and do not push main (main is production, see [[coach-portal-auto-deploys-to-production]]).

Pushing: a worktree made with `worktree add -b <b> <path> origin/release/...` TRACKS the release
branch, so a bare `git push` would push to it. Always push with an explicit
`refs/heads/<b>:refs/heads/<b>` refspec and read `git ls-remote` after.
