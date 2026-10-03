import { Skeleton } from "@/components/ui/kit";

/**
 * Explicit loading state for the library's two server reads — one of the skeletons
 * EV-337l keeps (L4). EV-337i draws it in the list's new shape: the head, the search
 * and count line, then one card of rows (one card per row below 768 px, as the list).
 */
export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <Skeleton w="min(240px, 100%)" h={26} style={{ marginBottom: 8 }} />
      <Skeleton w="min(300px, 100%)" h={13} style={{ marginBottom: 22 }} />
      <div className="tpl-toolbar">
        <Skeleton h={44} r={11} style={{ flex: "1 1 320px" }} />
        <Skeleton w={180} h={13} />
      </div>
      <ul className="tpl-list">
        {[0, 1, 2].map((i) => (
          <li key={i} className="tpl-item">
            <div className="tpl-row">
              <div className="tpl-row-id">
                <Skeleton h={18} w={200} />
                <Skeleton h={13} w={220} style={{ marginTop: 8 }} />
              </div>
              <Skeleton h={44} w={150} r={11} />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
