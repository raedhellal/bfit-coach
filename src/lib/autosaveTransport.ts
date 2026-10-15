/**
 * EV-341b (ADR-0034 D34.10 (1)) — autosave's transport: one `fetch` PUT to the portal's own
 * route handler, `PUT /api/clients/{id}/intake/{section}`, and how its answer is read.
 *
 * A `fetch` and not a server action: Next 14.2 runs a tab's actions one at a time and drops a
 * pending one on a navigation (ADR-0034 D34.10), so two sections could not save at once and a
 * blur followed by a tab click would lose a save. No request here carries `Next-Action`, and
 * nothing here calls `router.refresh()` (B3).
 *
 * `redirect: "manual"`: the middleware answers a session it cannot continue with a 307 to
 * /login, which a followed fetch would return as the login page with a 200. Manual, it is an
 * `opaqueredirect` (status 0), read as "session ended" (B15).
 *
 * Client-safe: no `server-only`, no `coachApi`. `classifySave` is pure, so the unit spec pins
 * every row of the table without a browser.
 */
import type { SaveOutcome } from "./autosave";

/**
 * The header each save carries: the account the page was rendered for (`sessionSubjectTag`,
 * server-side). The handler refuses a save whose cookies belong to another account
 * (ADR-0033 D33.14 point 4, see `src/lib/sessionSubject.ts`).
 */
export const SESSION_SUBJECT_HEADER = "x-evoli-session-subject";

/** The route handler's path for one section. The subject is the URL segment, as on every api path. */
export function intakeSectionPath(clientId: string, section: string): string {
  return `/api/clients/${encodeURIComponent(clientId)}/intake/${encodeURIComponent(section)}`;
}

/** The BFF read « Recharger » uses (`GET /api/bff/clients/{id}/intake`). */
export function intakeReadPath(clientId: string): string {
  return `/api/bff/clients/${encodeURIComponent(clientId)}/intake`;
}

function record(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/**
 * One answer, as the engine acts on it:
 *
 *   opaqueredirect / 3xx            → signedOut (the middleware's 307 to /login)
 *   2xx with `{ version, updatedAt }` → saved
 *   any other 2xx (a 204, HTML, JSON of another shape) → signedOut. B13a pins that the handler
 *                                     never answers one; were it to, saying "saved" for an
 *                                     answer that does not say so would lose the work silently.
 *   401 (incl. SESSION_CHANGED)     → signedOut
 *   403 CROSS_ORIGIN                → invalid (the handler refused the request, not the access)
 *   403                             → denied (B14)
 *   409 INTAKE_VERSION_CONFLICT     → conflict (B5)
 *   other 4xx                       → invalid, never retried (B4)
 *   5xx, status 0                   → failed, retried (B4)
 */
export function classifySave(status: number, type: string, body: unknown): SaveOutcome {
  if (type === "opaqueredirect" || (status >= 300 && status < 400)) return { kind: "signedOut" };
  const json = record(body);
  if (status >= 200 && status < 300) {
    const version = json?.version;
    const updatedAt = json?.updatedAt;
    if (typeof version === "number" && Number.isInteger(version) && version >= 1 && typeof updatedAt === "string") {
      return { kind: "saved", version, updatedAt };
    }
    return { kind: "signedOut" };
  }
  if (status === 401) return { kind: "signedOut" };
  if (status === 403) return json?.code === "CROSS_ORIGIN" ? { kind: "invalid", field: null } : { kind: "denied" };
  if (status === 409 && json?.code === "INTAKE_VERSION_CONFLICT") {
    const version = json.version;
    return { kind: "conflict", version: typeof version === "number" && Number.isInteger(version) ? version : null };
  }
  if (status >= 400 && status < 500) {
    return { kind: "invalid", field: typeof json?.field === "string" ? json.field : null };
  }
  return { kind: "failed" };
}

/** Sends one section: `{ version, values }`, the WHOLE section. Never throws. */
export async function putIntakeSection(
  clientId: string,
  section: string,
  version: number,
  values: Record<string, unknown>,
  sessionSubject: string
): Promise<SaveOutcome> {
  let res: Response;
  try {
    res = await fetch(intakeSectionPath(clientId, section), {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json", [SESSION_SUBJECT_HEADER]: sessionSubject },
      body: JSON.stringify({ version, values }),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return { kind: "failed" };
  }
  const contentType = res.headers.get("content-type") ?? "";
  const body: unknown = contentType.toLowerCase().includes("application/json") ? await res.json().catch(() => null) : null;
  return classifySave(res.status, res.type, body);
}
