import type { ReactNode } from "react";

/**
 * A card of the redesigned overview (plan §5.2): a named region with an `h2`, so a screen
 * reader can jump between « À traiter », « Activité récente », the programme and the
 * nutrition summaries, and a test can address each block as one element (the reason
 * `MonitoringBlock` is a landmark too). `aside` sits at the head's end: a status pill or
 * the count chip.
 *
 * The page's one `h1` is the trainee's name; every card title here is an `h2`.
 */
export function OverviewCard({
  id,
  title,
  aside,
  children,
}: {
  /** Unique on the page: the heading's id, which names the region. */
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="ov-card">
      <div className="ov-card-head">
        <h2 id={id} className="ov-card-title">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One sentence in place of a card's data: not shared, unavailable or empty. */
export function OverviewNote({ children }: { children: ReactNode }) {
  return <p className="ov-note">{children}</p>;
}
