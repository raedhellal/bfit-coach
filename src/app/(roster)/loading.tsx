import { Card, PageHead, Skeleton } from "@/components/ui/kit";
import { copy } from "@/lib/copy";

/** Explicit loading state for the roster's server fetch (route-level Suspense). */
export default function Loading() {
  return (
    <main className="page">
      <PageHead title={copy.roster.title} sub={copy.roster.subtitle} />
      <Card style={{ marginBottom: 18 }} pad={18}>
        <Skeleton w={210} h={13} />
        <Skeleton h={6} r={99} style={{ marginTop: 10 }} />
      </Card>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton h={18} />
          <Skeleton h={18} w="80%" />
          <Skeleton h={18} w="60%" />
        </div>
      </Card>
    </main>
  );
}
