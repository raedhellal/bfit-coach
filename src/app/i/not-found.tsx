import { InviteNotFoundView } from "@/components/invite/InviteNotFound";

/**
 * EV-337k — the `/i` segment's notFound() boundary. Nothing under `/i` calls `notFound()`
 * any more (QA PB-1: Next sends that render as an empty-bodied error shell); the two
 * non-invitation routes render `InviteNotFoundView` themselves under a middleware 404. This
 * boundary stays so that a future `notFound()` under `/i` still draws the trainee brand,
 * never the root 404's Evoli Pro mark (R1, edge case 4).
 */
export default function InviteNotFound() {
  return <InviteNotFoundView />;
}
