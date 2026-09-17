import { Card, Skeleton } from "@/components/ui/kit";

/** Explicit loading state for the nutrition tab's server fetch. */
export default function Loading() {
  return (
    <main className="page">
      <Skeleton w={120} h={13} style={{ marginBottom: 18 }} />
      <Skeleton w={220} h={26} style={{ marginBottom: 24 }} />
      <Card style={{ marginBottom: 18 }}>
        <Skeleton h={16} w={150} />
        <Skeleton h={44} style={{ marginTop: 14 }} />
      </Card>
      <Card>
        <Skeleton h={16} w={120} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} h={84} r={14} style={{ marginTop: 12 }} />
        ))}
      </Card>
    </main>
  );
}
