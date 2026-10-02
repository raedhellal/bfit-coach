import { notFound } from "next/navigation";

/**
 * EV-337k — `/i/<token>/<anything>` (a mangled or extended invite link) is not an
 * invitation. It answers 404 from the `/i` segment's own not-found (the trainee mark), not
 * from the root one, which draws the Evoli Pro mark (R1, edge case 4). The token is never
 * printed: this route renders nothing of the URL.
 */
export const dynamic = "force-dynamic";

export default function InviteSubpath() {
  notFound();
}
