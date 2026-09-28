/**
 * The published legal documents (EV-278c) — the same two URLs the app links from its
 * registration consent (`b-fit-mobile` `src/features/legal/links.ts`), on evoli-landing.
 *
 * ⚠ They are UNVERSIONED: evoli-landing publishes the current text at one address each and
 * keeps no per-version URL. So the link opens the published document, and the VERSION the
 * person accepts is the one `GET /legal/versions` returned, shown in the link's text and
 * echoed back to `POST /me/activate`. If the two ever disagree (the policy moved and the
 * api's version did not), the api's 409 CONSENT_VERSION_STALE is the backstop — a
 * versioned document URL is landing's to add, not this surface's to invent.
 */
export const LEGAL_URLS = {
  terms: "https://evoli.fit/terms",
  privacy: "https://evoli.fit/privacy",
} as const;
