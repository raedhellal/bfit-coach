import { Card, Skeleton } from "@/components/ui/kit";

/**
 * Explicit loading state for the template read — one of the skeletons EV-337l keeps
 * (L4). EV-337i draws it in the editor's new shape: the back link and title, then the
 * « Avant d'enregistrer » aside and the form (two columns from 1280 px, as the editor).
 */
export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <Skeleton w={150} h={18} style={{ margin: "13px 0 13px" }} />
      <Skeleton w="min(260px, 100%)" h={26} style={{ marginBottom: 22 }} />
      <div className="layout-split tpl-editor-split">
        <div className="tpl-editor-aside">
          <Card>
            <Skeleton h={18} w={160} />
            <Skeleton h={14} w={200} style={{ marginTop: 14 }} />
            <Skeleton h={14} w={220} style={{ marginTop: 10 }} />
          </Card>
        </div>
        <div className="tpl-editor-main">
          <Card style={{ marginBottom: 16 }}>
            <Skeleton h={44} />
          </Card>
          <Card>
            <Skeleton h={132} r={14} />
          </Card>
        </div>
      </div>
    </main>
  );
}
