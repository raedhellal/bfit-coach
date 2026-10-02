import { notFound } from "next/navigation";

/**
 * EV-337k — `/i` alone is not an invitation. It answers 404 from the `/i` segment's own
 * not-found (`src/app/i/not-found.tsx`, the trainee mark), not from the root one, which
 * draws the Evoli Pro mark (R1, edge case 4).
 */
export const dynamic = "force-dynamic";

export default function InviteIndex() {
  notFound();
}
