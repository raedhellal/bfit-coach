import { Card, Skeleton } from "@/components/ui/kit";

/** Explicit loading state for the overview's server fetch. */
export default function Loading() {
  return (
    <main className="page">
      <Skeleton w={120} h={13} style={{ marginBottom: 18 }} />
      <Skeleton w={220} h={26} style={{ marginBottom: 18 }} />
      <div className="stat-grid" style={{ marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} pad={16}>
            <Skeleton h={34} w={34} r={11} />
            <Skeleton h={22} style={{ marginTop: 12 }} />
          </Card>
        ))}
      </div>
      <Card>
        <Skeleton h={132} r={14} />
      </Card>
    </main>
  );
}
