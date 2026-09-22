import type { ReactNode } from "react";
import { Card, CardHead } from "@/components/ui/kit";

/**
 * One EV-187b monitoring block: the card, its head, and a LANDMARK around it.
 *
 * `<section aria-label>` is a named region, which buys two things at once:
 *
 *   · a coach using a screen reader can jump between "Adherence, last 8 weeks",
 *     "Recent sessions" and "Red flags" instead of arrowing through a wall of figures;
 *   · every state of a block — its data, its "not shared" sentence, its empty state and
 *     its load error — is addressable as ONE element. Without it, a spec asking "does
 *     the adherence card say 'not shared'" has to guess at a div, and the guess lands on
 *     the innermost element containing the title, which contains only the title. That
 *     is not a detail: it is a test that passes while asserting nothing.
 *
 * The four states are rendered by the CALLER rather than switched on here, because the
 * decision between them is a consent decision (`scopes`) and belongs on the page where
 * `scopes` is read, not inside a presentational wrapper.
 */
export function MonitoringBlock({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} style={{ display: "block", marginBottom: 18 }}>
      <Card>
        <CardHead title={title} icon={icon} />
        {children}
      </Card>
    </section>
  );
}

/** The one-sentence body every non-data state of a block uses. */
export function BlockNote({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-3)" }}>{children}</p>;
}
